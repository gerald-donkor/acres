import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import {
  ChildProcessParserExecutor,
  isParserChildResponse,
  validateUntrustedSummary,
} from './child-process-parser.executor';
import {
  PARSER_CHILD_EXECUTION_FAILED_CODE,
  PARSER_CHILD_EXECUTION_FAILED_MESSAGE,
  PARSER_CHILD_MALFORMED_REQUEST_MESSAGE,
  type ParserChildRequest,
  type ParserChildResponse,
} from './parser-ipc.types';
import type { ParsedSourceSummary, ParserLimits } from './parser.types';

class FakeChildProcess extends EventEmitter {
  public connected = true;
  public exitCode: number | null = null;
  public signalCode: NodeJS.Signals | null = null;
  public sentMessages: unknown[] = [];
  public killed = false;
  public killSignal: string | null = null;
  public killCalls = 0;

  send(message: unknown, callback?: (err?: Error) => void): boolean {
    this.sentMessages.push(message);
    if (callback) callback();
    return true;
  }

  disconnect(): void {
    this.connected = false;
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killCalls += 1;
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

function createValidSummary(
  metadata: Record<string, unknown> = {},
): ParsedSourceSummary {
  return {
    sourceKind: 'csv',
    rowCount: 1,
    columnCount: 1,
    columnKeys: ['region'],
    sampleRows: [{ region: 'A1' }],
    validationRows: [{ rowNumber: 2, values: { region: 'A1' } }],
    issues: [],
    metadata,
  };
}

function createNumberMetadata(entryCount: number): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (let index = 0; index < entryCount; index += 1) {
    metadata[`key_${index}`] = index;
  }
  return metadata;
}

function createScalarRow(entryCount: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: entryCount }, (_, index) => [
      `column_${index}`,
      `value_${index}`,
    ]),
  );
}

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

  it('handles child error IPC response by returning parser_execution_failed', async () => {
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

    const sent = fakeChild.sentMessages[0] as ParserChildRequest;
    const errorResponse: ParserChildResponse = {
      type: 'error',
      id: sent.id,
      code: 'parser_execution_failed',
      message: 'Parser execution failed.',
    };
    fakeChild.emit('message', errorResponse);

    const result = await executePromise;
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'parser_execution_failed',
        message: 'Parser execution failed.',
      },
    ]);
  });

  it('handles child error IPC response with malformed request message by returning parser_execution_failed', async () => {
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

    const sent = fakeChild.sentMessages[0] as ParserChildRequest;
    const errorResponse: ParserChildResponse = {
      type: 'error',
      id: sent.id,
      code: PARSER_CHILD_EXECUTION_FAILED_CODE,
      message: PARSER_CHILD_MALFORMED_REQUEST_MESSAGE,
    };
    fakeChild.emit('message', errorResponse);

    const result = await executePromise;
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'parser_execution_failed',
        message: 'Parser execution failed.',
      },
    ]);
  });

  it('rejects child error response with invalid code', async () => {
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

    const sent = fakeChild.sentMessages[0] as ParserChildRequest;
    fakeChild.emit('message', {
      type: 'error',
      id: sent.id,
      code: 'unknown_code',
      message: PARSER_CHILD_EXECUTION_FAILED_MESSAGE,
    });

    const result = await executePromise;
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'parser_execution_failed',
        message: 'Parser execution failed.',
      },
    ]);
  });

  it('rejects child error response with invalid message', async () => {
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

    const sent = fakeChild.sentMessages[0] as ParserChildRequest;
    fakeChild.emit('message', {
      type: 'error',
      id: sent.id,
      code: PARSER_CHILD_EXECUTION_FAILED_CODE,
      message: 'arbitrary error message',
    });

    const result = await executePromise;
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'parser_execution_failed',
        message: 'Parser execution failed.',
      },
    ]);
  });

  it('rejects child error response with missing code or message', async () => {
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

    const sent = fakeChild.sentMessages[0] as ParserChildRequest;
    fakeChild.emit('message', {
      type: 'error',
      id: sent.id,
    });

    const result = await executePromise;
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'parser_execution_failed',
        message: 'Parser execution failed.',
      },
    ]);
  });

  it('rejects child success response with missing or non-object summary', async () => {
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

    const sent = fakeChild.sentMessages[0] as ParserChildRequest;
    fakeChild.emit('message', {
      type: 'success',
      id: sent.id,
      summary: null,
    });

    const result = await executePromise;
    expect(result.issues).toEqual([
      {
        severity: 'error',
        code: 'parser_execution_failed',
        message: 'Parser execution failed.',
      },
    ]);
  });

  it('rejects invalid child metadata without leaking it and cleans up the child', async () => {
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
    const sent = fakeChild.sentMessages[0] as ParserChildRequest;
    fakeChild.emit('message', {
      type: 'success',
      id: sent.id,
      summary: createValidSummary({
        encoding: 'utf8',
        rejected: { secret: 'do-not-leak' },
      }),
    });

    const result = await executePromise;
    expect(result).toEqual({
      sourceKind: 'csv',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
      issues: [
        {
          severity: 'error',
          code: 'parser_execution_failed',
          message: 'Parser execution failed.',
        },
      ],
      metadata: {},
    });
    expect(JSON.stringify(result)).not.toContain('do-not-leak');
    expect(fakeChild.connected).toBe(false);
    expect(fakeChild.killed).toBe(true);
  });

  it('rejects a child success summary with a non-finite scalar and cleans up the child', async () => {
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
    const sent = fakeChild.sentMessages[0] as ParserChildRequest;
    fakeChild.emit('message', {
      type: 'success',
      id: sent.id,
      summary: {
        ...createValidSummary(),
        sampleRows: [{ region: Number.NaN }],
      },
    });

    await expect(executePromise).resolves.toEqual({
      sourceKind: 'csv',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
      issues: [
        {
          severity: 'error',
          code: 'parser_execution_failed',
          message: 'Parser execution failed.',
        },
      ],
      metadata: {},
    });
    expect(fakeChild.connected).toBe(false);
    expect(fakeChild.killed).toBe(true);
    expect(fakeChild.eventNames()).toEqual([]);
  });

  it('rejects a child success summary with an over-width row map and cleans up the child', async () => {
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
    const sent = fakeChild.sentMessages[0] as ParserChildRequest;
    const oversizedRow = createScalarRow(defaultLimits.maxColumns + 2);
    fakeChild.emit('message', {
      type: 'success',
      id: sent.id,
      summary: {
        ...createValidSummary(),
        sampleRows: [oversizedRow],
      },
    });

    await expect(executePromise).resolves.toEqual({
      sourceKind: 'csv',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
      issues: [
        {
          severity: 'error',
          code: 'parser_execution_failed',
          message: 'Parser execution failed.',
        },
      ],
      metadata: {},
    });
    expect(JSON.stringify(await executePromise)).not.toContain('column_6');
    expect(fakeChild.connected).toBe(false);
    expect(fakeChild.killed).toBe(true);
    expect(fakeChild.eventNames()).toEqual([]);
    expect(fakeChild.killCalls).toBe(1);

    fakeChild.exitCode = null;
    fakeChild.signalCode = null;
    executor.onApplicationShutdown();
    expect(fakeChild.killCalls).toBe(1);
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
    expect(validated?.metadata).toEqual({ delimiter: ',' });
  });

  it('accepts and preserves metadata at the entry and string boundaries', () => {
    const boundaryKey = 'k'.repeat(200);
    const boundaryValue = 'v'.repeat(200);
    const metadata = createNumberMetadata(18);
    metadata[boundaryKey] = boundaryValue;
    Object.defineProperty(metadata, '__proto__', {
      value: 'literal metadata key',
      enumerable: true,
      configurable: true,
      writable: true,
    });

    const validated = validateUntrustedSummary(
      createValidSummary(metadata),
      'csv',
      defaultLimits,
    );

    expect(validated?.metadata).toEqual(metadata);
    expect(Object.keys(validated?.metadata ?? {})).toHaveLength(20);
    expect(Object.hasOwn(validated?.metadata ?? {}, '__proto__')).toBe(true);
    expect(validated?.metadata.__proto__).toBe('literal metadata key');
  });

  it.each([
    ['sampleRows / NaN', Number.NaN, 'sampleRows'],
    ['sampleRows / Infinity', Number.POSITIVE_INFINITY, 'sampleRows'],
    ['sampleRows / -Infinity', Number.NEGATIVE_INFINITY, 'sampleRows'],
    ['validationRows / NaN', Number.NaN, 'validationRows'],
    ['validationRows / Infinity', Number.POSITIVE_INFINITY, 'validationRows'],
    ['validationRows / -Infinity', Number.NEGATIVE_INFINITY, 'validationRows'],
    ['issue details / NaN', Number.NaN, 'issueDetails'],
    ['issue details / Infinity', Number.POSITIVE_INFINITY, 'issueDetails'],
    ['issue details / -Infinity', Number.NEGATIVE_INFINITY, 'issueDetails'],
    ['metadata / NaN', Number.NaN, 'metadata'],
    ['metadata / Infinity', Number.POSITIVE_INFINITY, 'metadata'],
    ['metadata / -Infinity', Number.NEGATIVE_INFINITY, 'metadata'],
  ] as const)(
    'rejects a non-finite scalar in %s',
    (_label, value, location) => {
      const base = createValidSummary();
      const raw =
        location === 'sampleRows'
          ? { ...base, sampleRows: [{ region: value }] }
          : location === 'validationRows'
            ? {
                ...base,
                validationRows: [{ rowNumber: 2, values: { region: value } }],
              }
            : location === 'issueDetails'
              ? {
                  ...base,
                  issues: [
                    {
                      severity: 'warning' as const,
                      code: 'invalid_value',
                      message: 'Invalid value.',
                      details: { value },
                    },
                  ],
                }
              : { ...base, metadata: { value } };

      expect(validateUntrustedSummary(raw, 'csv', defaultLimits)).toBeNull();
    },
  );

  it('accepts and preserves finite scalar numbers across all containers', () => {
    const raw: ParsedSourceSummary = {
      ...createValidSummary({ value: -0 }),
      sampleRows: [{ region: Number.MAX_VALUE }],
      validationRows: [{ rowNumber: 2, values: { region: Number.MIN_VALUE } }],
      issues: [
        {
          severity: 'warning',
          code: 'finite_number',
          message: 'Finite number.',
          details: { value: -12.5 },
        },
      ],
    };

    const validated = validateUntrustedSummary(raw, 'csv', defaultLimits);

    expect(validated?.sampleRows[0]?.region).toBe(Number.MAX_VALUE);
    expect(validated?.validationRows[0]?.values.region).toBe(Number.MIN_VALUE);
    expect(validated?.issues[0]?.details?.value).toBe(-12.5);
    expect(Object.is(validated?.metadata.value, -0)).toBe(true);
  });

  it.each(['sampleRows', 'validationRows'] as const)(
    'rejects an over-width row map in %s',
    (location) => {
      const oversizedRow = createScalarRow(defaultLimits.maxColumns + 2);
      const base = createValidSummary();
      const raw =
        location === 'sampleRows'
          ? { ...base, sampleRows: [oversizedRow] }
          : {
              ...base,
              validationRows: [{ rowNumber: 2, values: oversizedRow }],
            };

      expect(validateUntrustedSummary(raw, 'csv', defaultLimits)).toBeNull();
    },
  );

  it.each(['sampleRows', 'validationRows'] as const)(
    'accepts and preserves an exact-boundary row map in %s',
    (location) => {
      const boundaryRow = createScalarRow(defaultLimits.maxColumns + 1);
      const columnKeys = Object.keys(boundaryRow);
      const base: ParsedSourceSummary = {
        ...createValidSummary(),
        columnCount: columnKeys.length,
        columnKeys,
      };
      const raw: ParsedSourceSummary =
        location === 'sampleRows'
          ? { ...base, sampleRows: [boundaryRow] }
          : {
              ...base,
              validationRows: [{ rowNumber: 2, values: boundaryRow }],
            };

      const validated = validateUntrustedSummary(raw, 'csv', defaultLimits);
      const validatedRow =
        location === 'sampleRows'
          ? validated?.sampleRows[0]
          : validated?.validationRows[0]?.values;

      expect(validated).not.toBeNull();
      expect(validatedRow).toEqual(boundaryRow);
      expect(Object.keys(validatedRow ?? {})).toHaveLength(
        defaultLimits.maxColumns + 1,
      );
    },
  );

  it('rejects a missing metadata container', () => {
    const raw = {
      sourceKind: 'csv',
      rowCount: 1,
      columnCount: 1,
      columnKeys: ['region'],
      sampleRows: [{ region: 'A1' }],
      validationRows: [{ rowNumber: 2, values: { region: 'A1' } }],
      issues: [],
    };

    expect(validateUntrustedSummary(raw, 'csv', defaultLimits)).toBeNull();
  });

  it.each([
    ['undefined', { metadata: undefined }],
    ['null', { metadata: null }],
    ['primitive', { metadata: 'utf8' }],
    ['array', { metadata: ['utf8'] }],
  ])('rejects a %s metadata container', (_label, override) => {
    const raw = { ...createValidSummary(), ...override };

    expect(validateUntrustedSummary(raw, 'csv', defaultLimits)).toBeNull();
  });

  it.each([
    ['more than 20 entries', createNumberMetadata(21)],
    ['a 201-character key', { ['k'.repeat(201)]: 'value' }],
    ['a 201-character string value', { key: 'v'.repeat(201) }],
    ['a nested object value', { key: { nested: true } }],
    ['an array value', { key: ['value'] }],
    [
      'one invalid entry mixed with valid entries',
      { encoding: 'utf8', header: true, invalid: { nested: true } },
    ],
  ])('rejects metadata with %s', (_label, metadata) => {
    expect(
      validateUntrustedSummary(
        createValidSummary(metadata),
        'csv',
        defaultLimits,
      ),
    ).toBeNull();
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

describe('isParserChildResponse', () => {
  it('accepts valid success response', () => {
    expect(
      isParserChildResponse({
        type: 'success',
        id: 'req-1',
        summary: { sourceKind: 'csv', rowCount: 1 },
      }),
    ).toBe(true);
  });

  it('accepts valid error response with execution failed message', () => {
    expect(
      isParserChildResponse({
        type: 'error',
        id: 'req-1',
        code: PARSER_CHILD_EXECUTION_FAILED_CODE,
        message: PARSER_CHILD_EXECUTION_FAILED_MESSAGE,
      }),
    ).toBe(true);
  });

  it('accepts valid error response with malformed request message', () => {
    expect(
      isParserChildResponse({
        type: 'error',
        id: 'req-1',
        code: PARSER_CHILD_EXECUTION_FAILED_CODE,
        message: PARSER_CHILD_MALFORMED_REQUEST_MESSAGE,
      }),
    ).toBe(true);
  });

  it('rejects error response with unknown code', () => {
    expect(
      isParserChildResponse({
        type: 'error',
        id: 'req-1',
        code: 'unknown_code',
        message: PARSER_CHILD_EXECUTION_FAILED_MESSAGE,
      }),
    ).toBe(false);
  });

  it('rejects error response with arbitrary message', () => {
    expect(
      isParserChildResponse({
        type: 'error',
        id: 'req-1',
        code: PARSER_CHILD_EXECUTION_FAILED_CODE,
        message: 'arbitrary error message',
      }),
    ).toBe(false);
  });

  it('rejects error response with missing code or message', () => {
    expect(
      isParserChildResponse({
        type: 'error',
        id: 'req-1',
      }),
    ).toBe(false);
  });

  it('rejects error response with non-string id', () => {
    expect(
      isParserChildResponse({
        type: 'error',
        id: 123,
        code: PARSER_CHILD_EXECUTION_FAILED_CODE,
        message: PARSER_CHILD_EXECUTION_FAILED_MESSAGE,
      }),
    ).toBe(false);
  });

  it('rejects success response with empty id', () => {
    expect(
      isParserChildResponse({
        type: 'success',
        id: '',
        summary: { sourceKind: 'csv', rowCount: 1 },
      }),
    ).toBe(false);
  });

  it('rejects success response with whitespace-only id', () => {
    expect(
      isParserChildResponse({
        type: 'success',
        id: '   ',
        summary: { sourceKind: 'csv', rowCount: 1 },
      }),
    ).toBe(false);
  });

  it('rejects error response with empty id', () => {
    expect(
      isParserChildResponse({
        type: 'error',
        id: '',
        code: PARSER_CHILD_EXECUTION_FAILED_CODE,
        message: PARSER_CHILD_EXECUTION_FAILED_MESSAGE,
      }),
    ).toBe(false);
  });

  it('rejects error response with whitespace-only id', () => {
    expect(
      isParserChildResponse({
        type: 'error',
        id: '   ',
        code: PARSER_CHILD_EXECUTION_FAILED_CODE,
        message: PARSER_CHILD_MALFORMED_REQUEST_MESSAGE,
      }),
    ).toBe(false);
  });

  it('rejects success response with missing or non-object summary', () => {
    expect(
      isParserChildResponse({
        type: 'success',
        id: 'req-1',
        summary: null,
      }),
    ).toBe(false);
    expect(
      isParserChildResponse({
        type: 'success',
        id: 'req-1',
        summary: 'not an object',
      }),
    ).toBe(false);
    expect(
      isParserChildResponse({
        type: 'success',
        id: 'req-1',
        summary: [],
      }),
    ).toBe(false);
  });

  it('rejects non-object, null, array, or unexpected type payloads', () => {
    expect(isParserChildResponse(null)).toBe(false);
    expect(isParserChildResponse(undefined)).toBe(false);
    expect(isParserChildResponse('string')).toBe(false);
    expect(isParserChildResponse([])).toBe(false);
    expect(
      isParserChildResponse({
        type: 'other',
        id: 'req-1',
      }),
    ).toBe(false);
  });
});
