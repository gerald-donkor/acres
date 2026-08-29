import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import {
  ChildProcessParserExecutor,
  validateUntrustedSummary,
} from './child-process-parser.executor';
import type {
  ParserChildRequest,
  ParserChildResponse,
} from './parser-ipc.types';
import type { ParsedSourceSummary, ParserLimits } from './parser.types';

class FakeChildProcess extends EventEmitter {
  public connected = true;
  public exitCode: number | null = null;
  public signalCode: NodeJS.Signals | null = null;
  public sentMessages: unknown[] = [];
  public killed = false;
  public killSignal: string | null = null;

  send(message: unknown, callback?: (err?: Error) => void): boolean {
    this.sentMessages.push(message);
    if (callback) callback();
    return true;
  }

  disconnect(): void {
    this.connected = false;
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.killSignal = typeof signal === 'string' ? signal : 'SIGKILL';
    this.exitCode = 1;
    return true;
  }
}

const defaultLimits: ParserLimits = {
  maxRows: 10,
  maxColumns: 5,
  maxCellChars: 50,
  maxSampleRows: 3,
  maxGeojsonFeatures: 5,
  maxGeojsonCoordinates: 50,
};

describe('ChildProcessParserExecutor', () => {
  let fakeChild: FakeChildProcess;
  let lastForkCall: {
    modulePath: string;
    args: readonly string[] | undefined;
    options: unknown;
  } | null = null;

  const fakeFork = (
    modulePath: string,
    args?: readonly string[],
    options?: unknown,
  ) => {
    lastForkCall = { modulePath, args, options };
    return fakeChild as unknown as ChildProcess;
  };

  beforeEach(() => {
    fakeChild = new FakeChildProcess();
    lastForkCall = null;
  });

  it('spawns child with fixed options, execArgv heap ceiling, and isolated env', async () => {
    const executor = new ChildProcessParserExecutor({
      timeoutMs: 5000,
      maxOldSpaceMb: 192,
      nodeEnv: 'production',
      entrypointPath: '/path/to/parser-child.entry.js',
      forkFn: fakeFork as unknown as typeof import('node:child_process').fork,
    });

    const buffer = Buffer.from('region,val\nA1,10\n');
    const executePromise = executor.execute(buffer, 'text/csv', defaultLimits);

    expect(lastForkCall).not.toBeNull();
    expect(lastForkCall?.modulePath).toBe('/path/to/parser-child.entry.js');
    expect(lastForkCall?.args).toEqual([]);
    expect(lastForkCall?.options).toMatchObject({
      execPath: process.execPath,
      execArgv: ['--max-old-space-size=192'],
      env: {
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      serialization: 'advanced',
    });

    expect(fakeChild.sentMessages).toHaveLength(1);
    const sentReq = fakeChild.sentMessages[0] as ParserChildRequest;
    expect(sentReq).toMatchObject({
      type: 'parse',
      mediaType: 'text/csv',
      limits: defaultLimits,
    });

    const successResponse: ParserChildResponse = {
      type: 'success',
      id: sentReq.id,
      summary: {
        sourceKind: 'csv',
        rowCount: 1,
        columnCount: 2,
        columnKeys: ['region', 'val'],
        sampleRows: [{ region: 'A1', val: '10' }],
        validationRows: [{ rowNumber: 2, values: { region: 'A1', val: '10' } }],
        issues: [],
        metadata: { encoding: 'utf8' },
      },
    };
    fakeChild.emit('message', successResponse);

    const result = await executePromise;
    expect(result.sourceKind).toBe('csv');
    expect(result.rowCount).toBe(1);
    expect(result.issues).toEqual([]);
    expect(fakeChild.connected).toBe(false);
  });

  it('handles child watchdog timeout by killing child and returning parser_execution_timed_out', async () => {
    const executor = new ChildProcessParserExecutor({
      timeoutMs: 50,
      maxOldSpaceMb: 128,
      nodeEnv: 'test',
      forkFn: fakeFork as unknown as typeof import('node:child_process').fork,
    });

    const buffer = Buffer.from('dummy');
    const result = await executor.execute(buffer, 'text/csv', defaultLimits);

    expect(result.sourceKind).toBe('csv');
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'parser_execution_timed_out',
        message: 'Parser execution timed out.',
      },
    ]);
    expect(fakeChild.killed).toBe(true);
    expect(fakeChild.killSignal).toBe('SIGKILL');
  });

  it('handles child error event by returning parser_execution_failed without raw error leakage', async () => {
    const executor = new ChildProcessParserExecutor({
      timeoutMs: 5000,
      maxOldSpaceMb: 128,
      nodeEnv: 'test',
      forkFn: fakeFork as unknown as typeof import('node:child_process').fork,
    });

    const executePromise = executor.execute(
      Buffer.from('data'),
      'text/csv',
      defaultLimits,
    );
    fakeChild.emit('error', new Error('Sensitive stack trace: /secret/path'));

    const result = await executePromise;
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'parser_execution_failed',
        message: 'Parser execution failed.',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('/secret/path');
  });

  it('handles child early exit before response by returning parser_execution_failed', async () => {
    const executor = new ChildProcessParserExecutor({
      timeoutMs: 5000,
      maxOldSpaceMb: 128,
      nodeEnv: 'test',
      forkFn: fakeFork as unknown as typeof import('node:child_process').fork,
    });

    const executePromise = executor.execute(
      Buffer.from('data'),
      'text/csv',
      defaultLimits,
    );
    fakeChild.emit('exit', 137, 'SIGKILL');

    const result = await executePromise;
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'parser_execution_failed',
        message: 'Parser execution failed.',
      },
    ]);
  });

  it('rejects malformed and mismatched IPC responses from child', async () => {
    const executor = new ChildProcessParserExecutor({
      timeoutMs: 5000,
      maxOldSpaceMb: 128,
      nodeEnv: 'test',
      forkFn: fakeFork as unknown as typeof import('node:child_process').fork,
    });

    const executePromise = executor.execute(
      Buffer.from('data'),
      'text/csv',
      defaultLimits,
    );

    // Wrong ID
    fakeChild.emit('message', {
      type: 'success',
      id: 'wrong-id',
      summary: { sourceKind: 'csv', rowCount: 1 },
    });

    const result = await executePromise;
    expect(result.issues[0].code).toBe('parser_execution_failed');
  });

  it('terminates active children on onApplicationShutdown', () => {
    const executor = new ChildProcessParserExecutor({
      timeoutMs: 5000,
      maxOldSpaceMb: 128,
      nodeEnv: 'test',
      forkFn: fakeFork as unknown as typeof import('node:child_process').fork,
    });

    void executor.execute(Buffer.from('data'), 'text/csv', defaultLimits);
    expect(fakeChild.killed).toBe(false);

    executor.onApplicationShutdown();
    expect(fakeChild.killed).toBe(true);
    expect(fakeChild.connected).toBe(false);
  });
});

describe('validateUntrustedSummary', () => {
  it('validates a conformant summary', () => {
    const raw: ParsedSourceSummary = {
      sourceKind: 'csv',
      rowCount: 2,
      columnCount: 2,
      columnKeys: ['region', 'value'],
      sampleRows: [{ region: 'A1', value: 12 }],
      validationRows: [{ rowNumber: 2, values: { region: 'A1', value: 12 } }],
      issues: [
        {
          severity: 'warning',
          code: 'formula_as_data',
          message: 'Formula-looking cell was treated as text.',
          rowNumber: 2,
          columnKey: 'value',
        },
      ],
      metadata: { delimiter: ',' },
    };

    const validated = validateUntrustedSummary(raw, 'csv', defaultLimits);
    expect(validated).not.toBeNull();
    expect(validated?.rowCount).toBe(2);
    expect(validated?.columnKeys).toEqual(['region', 'value']);
  });

  it('rejects summary with mismatched sourceKind', () => {
    const raw = {
      sourceKind: 'xlsx',
      rowCount: 1,
      columnCount: 1,
      columnKeys: ['a'],
      sampleRows: [],
      validationRows: [],
      issues: [],
      metadata: {},
    };
    expect(validateUntrustedSummary(raw, 'csv', defaultLimits)).toBeNull();
  });

  it('rejects summary exceeding row limit', () => {
    const raw = {
      sourceKind: 'csv',
      rowCount: 999999,
      columnCount: 1,
      columnKeys: ['a'],
      sampleRows: [],
      validationRows: [],
      issues: [],
      metadata: {},
    };
    expect(validateUntrustedSummary(raw, 'csv', defaultLimits)).toBeNull();
  });

  it('rejects summary with invalid issue severity or invalid code format', () => {
    const raw = {
      sourceKind: 'csv',
      rowCount: 1,
      columnCount: 1,
      columnKeys: ['a'],
      sampleRows: [],
      validationRows: [],
      issues: [
        {
          severity: 'critical', // Invalid severity
          code: 'valid_code',
          message: 'msg',
        },
      ],
      metadata: {},
    };
    expect(validateUntrustedSummary(raw, 'csv', defaultLimits)).toBeNull();

    const rawBadCode = {
      sourceKind: 'csv',
      rowCount: 1,
      columnCount: 1,
      columnKeys: ['a'],
      sampleRows: [],
      validationRows: [],
      issues: [
        {
          severity: 'error',
          code: '<script>alert(1)</script>', // Invalid code
          message: 'msg',
        },
      ],
      metadata: {},
    };
    expect(
      validateUntrustedSummary(rawBadCode, 'csv', defaultLimits),
    ).toBeNull();
  });

  it('rejects summary with oversized cell values in sampleRows', () => {
    const raw = {
      sourceKind: 'csv',
      rowCount: 1,
      columnCount: 1,
      columnKeys: ['a'],
      sampleRows: [{ a: 'x'.repeat(defaultLimits.maxCellChars + 10) }],
      validationRows: [],
      issues: [],
      metadata: {},
    };
    expect(validateUntrustedSummary(raw, 'csv', defaultLimits)).toBeNull();
  });
});
