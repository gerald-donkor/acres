import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import type {
  ParsedSourceSummary,
  ParserIssue,
  ParserLimits,
  SourceParser,
} from './parser.types';
import {
  PARSER_MAX_BUFFER_BYTES,
  formulaIssue,
  isFormulaLike,
  normalizeKey,
  safeCell,
  scalarText,
} from './parser-utils';

@Injectable()
export class CsvSourceParser implements SourceParser {
  constructor(private readonly limits: ParserLimits) {}

  inspect(buffer: Buffer): ParsedSourceSummary {
    const issues: ParserIssue[] = [];
    if (buffer.length > PARSER_MAX_BUFFER_BYTES) {
      return this.emptySummary([
        {
          severity: 'error',
          code: 'file_size_limit_exceeded',
          message: 'CSV size exceeds the temporary parser limit.',
        },
      ]);
    }
    const text = buffer.toString('utf8');
    const parsed: unknown = parse(text, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: false,
      trim: true,
      to_line: this.limits.maxRows + 2,
    });
    const records = Array.isArray(parsed) ? parsed.filter(isRecord) : [];

    const truncated = records.length > this.limits.maxRows;
    if (truncated) {
      issues.push({
        severity: 'error',
        code: 'row_limit_exceeded',
        message: 'CSV row count exceeds the temporary development limit.',
      });
    }

    const rawColumns = records.length > 0 ? Object.keys(records[0]) : [];
    const columns = rawColumns.map((column) => normalizeKey(column));
    if (columns.length > this.limits.maxColumns) {
      issues.push({
        severity: 'error',
        code: 'column_limit_exceeded',
        message: 'CSV column count exceeds the temporary development limit.',
      });
    }

    const validationRows = records
      .slice(0, this.limits.maxRows)
      .map((record, rowIndex) => {
        const sample: Record<string, string | number | boolean | null> = {};
        rawColumns.forEach((rawColumn, columnIndex) => {
          const key = columns[columnIndex] || normalizeKey(rawColumn);
          const value = record[rawColumn];
          if (scalarText(value).length > this.limits.maxCellChars) {
            issues.push({
              severity: 'error',
              code: 'cell_limit_exceeded',
              message: 'CSV cell exceeds the temporary development limit.',
              rowNumber: rowIndex + 2,
              columnKey: key,
            });
          }
          if (isFormulaLike(value)) {
            issues.push(formulaIssue(rowIndex + 2, key));
          }
          sample[key] = safeCell(value, this.limits.maxCellChars);
        });
        return { rowNumber: rowIndex + 2, values: sample };
      });
    const sampleRows = validationRows
      .slice(0, this.limits.maxSampleRows)
      .map((row) => row.values);

    return {
      sourceKind: 'csv',
      rowCount: truncated ? this.limits.maxRows + 1 : records.length,
      columnCount: columns.length,
      columnKeys: columns,
      sampleRows,
      validationRows,
      issues,
      metadata: {
        encoding: 'utf8',
        delimiter: ',',
        header: true,
        formulaRule: 'formula-looking values are treated as text',
      },
    };
  }

  private emptySummary(issues: ParserIssue[]): ParsedSourceSummary {
    return {
      sourceKind: 'csv',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
      issues,
      metadata: {
        encoding: 'utf8',
        delimiter: ',',
        header: true,
      },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
