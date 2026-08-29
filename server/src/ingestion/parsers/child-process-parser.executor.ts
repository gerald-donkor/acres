import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import type { ParserExecutorPort } from './parser-executor.port';
import type {
  ParserChildRequest,
  ParserChildResponse,
} from './parser-ipc.types';
import type {
  ParsedSourceSummary,
  ParserIssue,
  ParserLimits,
  SourceKind,
} from './parser.types';

export interface ChildProcessParserExecutorOptions {
  readonly timeoutMs: number;
  readonly maxOldSpaceMb: number;
  readonly nodeEnv: string;
  readonly entrypointPath?: string;
  readonly forkFn?: typeof fork;
}

const ISSUE_CODE_REGEX = /^[a-z0-9_]{1,64}$/;
const MAX_ISSUES_COUNT = 500;
const MAX_STRING_LENGTH = 200;

@Injectable()
export class ChildProcessParserExecutor
  implements ParserExecutorPort, OnApplicationShutdown
{
  private readonly activeChildren = new Set<ChildProcess>();
  private readonly entrypointPath: string;
  private readonly timeoutMs: number;
  private readonly maxOldSpaceMb: number;
  private readonly nodeEnv: string;
  private readonly forkFn: typeof fork;

  constructor(options: ChildProcessParserExecutorOptions) {
    this.timeoutMs = options.timeoutMs;
    this.maxOldSpaceMb = options.maxOldSpaceMb;
    this.nodeEnv = options.nodeEnv;
    this.forkFn = options.forkFn ?? fork;
    this.entrypointPath =
      options.entrypointPath ??
      path.resolve(__dirname, 'parser-child.entry.js');
  }

  async execute(
    buffer: Buffer,
    mediaType: string,
    limits: ParserLimits,
  ): Promise<ParsedSourceSummary> {
    const sourceKind = getExpectedSourceKind(mediaType);
    const requestId = randomUUID();

    return new Promise<ParsedSourceSummary>((resolve) => {
      let settled = false;
      let child: ChildProcess;

      try {
        child = this.forkFn(this.entrypointPath, [], {
          execPath: process.execPath,
          execArgv: [`--max-old-space-size=${this.maxOldSpaceMb}`],
          env: {
            NODE_ENV: this.nodeEnv,
          },
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          serialization: 'advanced',
        });
      } catch {
        resolve(
          createSafeErrorSummary(
            sourceKind,
            'parser_execution_failed',
            'Parser execution failed.',
          ),
        );
        return;
      }

      this.activeChildren.add(child);

      const cleanup = () => {
        clearTimeout(watchdogTimer);
        this.activeChildren.delete(child);
        child.removeAllListeners();
        if (child.connected) {
          try {
            child.disconnect();
          } catch {
            // Ignore disconnect failure
          }
        }
        if (child.exitCode === null && child.signalCode === null) {
          try {
            child.kill('SIGKILL');
          } catch {
            // Ignore kill failure
          }
        }
      };

      const settle = (summary: ParsedSourceSummary) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(summary);
      };

      const watchdogTimer = setTimeout(() => {
        settle(
          createSafeErrorSummary(
            sourceKind,
            'parser_execution_timed_out',
            'Parser execution timed out.',
          ),
        );
      }, this.timeoutMs);
      watchdogTimer.unref();

      child.once('error', () => {
        settle(
          createSafeErrorSummary(
            sourceKind,
            'parser_execution_failed',
            'Parser execution failed.',
          ),
        );
      });

      child.once('exit', () => {
        settle(
          createSafeErrorSummary(
            sourceKind,
            'parser_execution_failed',
            'Parser execution failed.',
          ),
        );
      });

      child.on('message', (rawMessage: unknown) => {
        if (!isParserChildResponse(rawMessage) || rawMessage.id !== requestId) {
          settle(
            createSafeErrorSummary(
              sourceKind,
              'parser_execution_failed',
              'Parser execution failed.',
            ),
          );
          return;
        }

        if (rawMessage.type === 'error') {
          settle(
            createSafeErrorSummary(
              sourceKind,
              rawMessage.code || 'parser_execution_failed',
              'Parser execution failed.',
            ),
          );
          return;
        }

        const validatedSummary = validateUntrustedSummary(
          rawMessage.summary,
          sourceKind,
          limits,
        );
        if (validatedSummary === null) {
          settle(
            createSafeErrorSummary(
              sourceKind,
              'parser_execution_failed',
              'Parser execution failed.',
            ),
          );
          return;
        }

        settle(validatedSummary);
      });

      const request: ParserChildRequest = {
        type: 'parse',
        id: requestId,
        buffer,
        mediaType,
        limits,
      };

      try {
        child.send(request, (sendError) => {
          if (sendError) {
            settle(
              createSafeErrorSummary(
                sourceKind,
                'parser_execution_failed',
                'Parser execution failed.',
              ),
            );
          }
        });
      } catch {
        settle(
          createSafeErrorSummary(
            sourceKind,
            'parser_execution_failed',
            'Parser execution failed.',
          ),
        );
      }
    });
  }

  onApplicationShutdown(): void {
    for (const child of this.activeChildren) {
      try {
        child.removeAllListeners();
        if (child.connected) {
          child.disconnect();
        }
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      } catch {
        // Ignore errors during worker shutdown
      }
    }
    this.activeChildren.clear();
  }
}

function getExpectedSourceKind(mediaType: string): SourceKind {
  if (
    mediaType ===
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return 'xlsx';
  }
  if (
    mediaType === 'application/geo+json' ||
    mediaType === 'application/json'
  ) {
    return 'geojson';
  }
  return 'csv';
}

function createSafeErrorSummary(
  sourceKind: SourceKind,
  code: string,
  message: string,
): ParsedSourceSummary {
  return {
    sourceKind,
    rowCount: 0,
    columnCount: 0,
    columnKeys: [],
    sampleRows: [],
    validationRows: [],
    issues: [
      {
        severity: 'error',
        code: ISSUE_CODE_REGEX.test(code) ? code : 'parser_execution_failed',
        message: message.slice(0, MAX_STRING_LENGTH),
      },
    ],
    metadata: {},
  };
}

function isParserChildResponse(value: unknown): value is ParserChildResponse {
  if (!value || typeof value !== 'object') return false;
  const res = value as Partial<ParserChildResponse>;
  return (
    (res.type === 'success' || res.type === 'error') &&
    typeof res.id === 'string'
  );
}

export function validateUntrustedSummary(
  raw: unknown,
  expectedKind: SourceKind,
  limits: ParserLimits,
): ParsedSourceSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const summary = raw as Partial<ParsedSourceSummary>;

  if (summary.sourceKind !== expectedKind) return null;

  const maxRowsAllowed =
    expectedKind === 'geojson'
      ? limits.maxGeojsonFeatures + 1
      : limits.maxRows + 1;
  const maxColumnsAllowed = limits.maxColumns + 1;

  if (
    typeof summary.rowCount !== 'number' ||
    !Number.isInteger(summary.rowCount) ||
    summary.rowCount < 0 ||
    summary.rowCount > maxRowsAllowed
  ) {
    return null;
  }

  if (
    typeof summary.columnCount !== 'number' ||
    !Number.isInteger(summary.columnCount) ||
    summary.columnCount < 0 ||
    summary.columnCount > maxColumnsAllowed
  ) {
    return null;
  }

  if (
    !Array.isArray(summary.columnKeys) ||
    summary.columnKeys.length > maxColumnsAllowed
  ) {
    return null;
  }
  const columnKeys: string[] = [];
  for (const key of summary.columnKeys) {
    if (typeof key !== 'string' || key.length > MAX_STRING_LENGTH) return null;
    columnKeys.push(key);
  }

  if (
    !Array.isArray(summary.sampleRows) ||
    summary.sampleRows.length > limits.maxSampleRows
  ) {
    return null;
  }
  const sampleRows: Array<Record<string, string | number | boolean | null>> =
    [];
  for (const row of summary.sampleRows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const sanitizedRow: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.length > MAX_STRING_LENGTH) return null;
      if (
        v !== null &&
        typeof v !== 'string' &&
        typeof v !== 'number' &&
        typeof v !== 'boolean'
      ) {
        return null;
      }
      if (typeof v === 'string' && v.length > limits.maxCellChars) {
        return null;
      }
      sanitizedRow[k] = v;
    }
    sampleRows.push(sanitizedRow);
  }

  if (
    !Array.isArray(summary.validationRows) ||
    summary.validationRows.length > maxRowsAllowed
  ) {
    return null;
  }
  const validationRows: Array<{
    rowNumber: number;
    values: Record<string, string | number | boolean | null>;
  }> = [];
  for (const row of summary.validationRows) {
    if (!row || typeof row !== 'object') return null;
    if (
      typeof row.rowNumber !== 'number' ||
      !Number.isInteger(row.rowNumber) ||
      row.rowNumber < 1
    ) {
      return null;
    }
    if (
      !row.values ||
      typeof row.values !== 'object' ||
      Array.isArray(row.values)
    ) {
      return null;
    }
    const sanitizedValues: Record<string, string | number | boolean | null> =
      {};
    for (const [k, v] of Object.entries(row.values)) {
      if (k.length > MAX_STRING_LENGTH) return null;
      if (
        v !== null &&
        typeof v !== 'string' &&
        typeof v !== 'number' &&
        typeof v !== 'boolean'
      ) {
        return null;
      }
      if (typeof v === 'string' && v.length > limits.maxCellChars) {
        return null;
      }
      sanitizedValues[k] = v;
    }
    validationRows.push({
      rowNumber: row.rowNumber,
      values: sanitizedValues,
    });
  }

  if (
    !Array.isArray(summary.issues) ||
    summary.issues.length > MAX_ISSUES_COUNT
  ) {
    return null;
  }
  const issues: ParserIssue[] = [];
  for (const issue of summary.issues) {
    if (!issue || typeof issue !== 'object') return null;
    if (issue.severity !== 'warning' && issue.severity !== 'error') return null;
    if (typeof issue.code !== 'string' || !ISSUE_CODE_REGEX.test(issue.code)) {
      return null;
    }
    if (
      typeof issue.message !== 'string' ||
      issue.message.length > MAX_STRING_LENGTH
    ) {
      return null;
    }
    if (
      issue.rowNumber !== undefined &&
      (typeof issue.rowNumber !== 'number' ||
        !Number.isInteger(issue.rowNumber) ||
        issue.rowNumber < 1)
    ) {
      return null;
    }
    if (
      issue.columnKey !== undefined &&
      (typeof issue.columnKey !== 'string' ||
        issue.columnKey.length > MAX_STRING_LENGTH)
    ) {
      return null;
    }

    let sanitizedDetails: Record<string, unknown> | undefined;
    if (issue.details !== undefined) {
      if (
        typeof issue.details !== 'object' ||
        issue.details === null ||
        Array.isArray(issue.details)
      ) {
        return null;
      }
      sanitizedDetails = {};
      const entries = Object.entries(issue.details);
      if (entries.length > 10) return null;
      for (const [dk, dv] of entries) {
        if (dk.length > MAX_STRING_LENGTH) return null;
        if (
          dv !== null &&
          typeof dv !== 'string' &&
          typeof dv !== 'number' &&
          typeof dv !== 'boolean'
        ) {
          return null;
        }
        if (typeof dv === 'string' && dv.length > MAX_STRING_LENGTH)
          return null;
        sanitizedDetails[dk] = dv;
      }
    }

    issues.push({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      rowNumber: issue.rowNumber,
      columnKey: issue.columnKey,
      details: sanitizedDetails,
    });
  }

  const metadata: Record<string, unknown> = {};
  if (
    summary.metadata !== undefined &&
    summary.metadata !== null &&
    typeof summary.metadata === 'object' &&
    !Array.isArray(summary.metadata)
  ) {
    const metaEntries = Object.entries(summary.metadata);
    if (metaEntries.length <= 20) {
      for (const [mk, mv] of metaEntries) {
        if (mk.length <= MAX_STRING_LENGTH) {
          if (
            mv === null ||
            typeof mv === 'string' ||
            typeof mv === 'number' ||
            typeof mv === 'boolean'
          ) {
            if (typeof mv !== 'string' || mv.length <= MAX_STRING_LENGTH) {
              metadata[mk] = mv;
            }
          }
        }
      }
    }
  }

  return {
    sourceKind: summary.sourceKind,
    rowCount: summary.rowCount,
    columnCount: summary.columnCount,
    columnKeys,
    sampleRows,
    validationRows,
    issues,
    metadata,
  };
}
