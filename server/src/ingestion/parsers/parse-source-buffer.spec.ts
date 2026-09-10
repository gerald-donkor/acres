import * as fs from 'node:fs';
import * as path from 'node:path';
import { CsvSourceParser } from './csv-source.parser';
import { ChildProcessParserExecutor } from './child-process-parser.executor';
import {
  PARSER_EXCEPTION_MESSAGE,
  parseSourceBuffer,
} from './parse-source-buffer';
import type { ParserLimits } from './parser.types';

jest.mock('./csv-source.parser', () => ({
  CsvSourceParser: jest.fn(),
}));

const MockCsvSourceParser = CsvSourceParser as unknown as jest.Mock;

const limits: ParserLimits = {
  maxRows: 10,
  maxColumns: 5,
  maxCellChars: 40,
  maxSampleRows: 3,
  maxGeojsonFeatures: 3,
  maxGeojsonCoordinates: 20,
};

describe('parseSourceBuffer parser_exception sanitization', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    MockCsvSourceParser.mockReset();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('maps an unexpected parser throw to a fixed safe message', async () => {
    MockCsvSourceParser.mockImplementation(() => ({
      inspect: () => {
        throw new Error('unexpected token "crop_yield_secret" at cell B12');
      },
    }));

    const summary = await parseSourceBuffer(
      Buffer.from('region,value\n'),
      'text/csv',
      limits,
    );

    expect(summary.issues).toHaveLength(1);
    expect(summary.issues[0]).toEqual({
      severity: 'error',
      code: 'parser_exception',
      message: PARSER_EXCEPTION_MESSAGE,
    });
    expect(summary.issues[0]?.message).toBe('Parser failed unexpectedly.');
    expect(summary.issues[0]?.message).not.toContain('crop_yield_secret');
    expect(summary.issues[0]?.message).not.toContain('unexpected token');
    // The original error is logged server-side only, never persisted.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'parseSourceBuffer parser_exception:',
      expect.stringContaining('crop_yield_secret'),
    );
  });

  it('maps a non-Error rejection to the same fixed message', async () => {
    MockCsvSourceParser.mockImplementation(() => ({
      inspect: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'boom';
      },
    }));

    const summary = await parseSourceBuffer(
      Buffer.from('region,value\n'),
      'text/csv',
      limits,
    );

    expect(summary.issues).toHaveLength(1);
    expect(summary.issues[0]).toEqual({
      severity: 'error',
      code: 'parser_exception',
      message: PARSER_EXCEPTION_MESSAGE,
    });
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('returns the fixed message through the forked child entrypoint', async () => {
    const entrypointPath = path.resolve(
      __dirname,
      '../../../dist/ingestion/parsers/parser-child.entry.js',
    );
    if (!fs.existsSync(entrypointPath)) {
      throw new Error(
        `Compiled artifact not found at ${entrypointPath}. Run "npm run build" first.`,
      );
    }
    const executor = new ChildProcessParserExecutor({
      timeoutMs: 10000,
      maxOldSpaceMb: 192,
      nodeEnv: 'test',
      entrypointPath,
    });
    try {
      // Ragged second row makes csv-parse throw inside parseSourceBuffer in
      // the child; the fixed issue crosses the IPC boundary unchanged.
      const summary = await executor.execute(
        Buffer.from('region,value\nUS-CA\n'),
        'text/csv',
        limits,
      );

      const parserIssue = summary.issues.find(
        (issue) => issue.code === 'parser_exception',
      );
      expect(parserIssue?.severity).toBe('error');
      expect(parserIssue?.message).toBe(PARSER_EXCEPTION_MESSAGE);
      expect(parserIssue?.message ?? '').not.toContain('Invalid Record Length');
    } finally {
      executor.onApplicationShutdown();
    }
  });
});
