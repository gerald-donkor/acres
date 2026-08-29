import { Injectable } from '@nestjs/common';
import { readSheet } from 'read-excel-file/node';
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
import { inspectXlsxContainer } from './xlsx-container-inspector';

@Injectable()
export class XlsxSourceParser implements SourceParser {
  constructor(private readonly limits: ParserLimits) {}

  async inspect(buffer: Buffer): Promise<ParsedSourceSummary> {
    const issues: ParserIssue[] = [];
    if (buffer.length > PARSER_MAX_BUFFER_BYTES) {
      return this.emptySummary([
        {
          severity: 'error',
          code: 'file_size_limit_exceeded',
          message: 'Workbook size exceeds the temporary parser limit.',
        },
      ]);
    }

    const containerCheck = await inspectXlsxContainer(buffer);
    if (!containerCheck.ok) {
      return this.emptySummary([containerCheck.issue]);
    }

    let rows: unknown[][];
    try {
      rows = await readSheet(buffer);
    } catch {
      return this.emptySummary([
        {
          severity: 'error',
          code: 'invalid_xlsx_container',
          message: 'Workbook container is invalid or unreadable.',
        },
      ]);
    }

    if (rows.length === 0) {
      return this.emptySummary([
        {
          severity: 'error',
          code: 'empty_workbook',
          message: 'Workbook has no rows.',
        },
      ]);
    }

    if (rows.length - 1 > this.limits.maxRows) {
      issues.push({
        severity: 'error',
        code: 'row_limit_exceeded',
        message: 'Workbook row count exceeds the temporary development limit.',
      });
    }

    const header = rows[0].map((value, index) => {
      const text =
        value === null || value === undefined ? '' : scalarText(value);
      return normalizeKey(text || `column_${index + 1}`);
    });
    if (header.length > this.limits.maxColumns) {
      issues.push({
        severity: 'error',
        code: 'column_limit_exceeded',
        message:
          'Workbook column count exceeds the temporary development limit.',
      });
    }

    const validationRows = rows
      .slice(1, 1 + this.limits.maxRows)
      .map((row, rowIndex) => {
        const sample: Record<string, string | number | boolean | null> = {};
        header.forEach((columnKey, columnIndex) => {
          const value = row[columnIndex];
          if (scalarText(value).length > this.limits.maxCellChars) {
            issues.push({
              severity: 'error',
              code: 'cell_limit_exceeded',
              message: 'Workbook cell exceeds the temporary development limit.',
              rowNumber: rowIndex + 2,
              columnKey,
            });
          }
          if (isFormulaLike(value))
            issues.push(formulaIssue(rowIndex + 2, columnKey));
          sample[columnKey] = safeCell(value, this.limits.maxCellChars);
        });
        return { rowNumber: rowIndex + 2, values: sample };
      });
    const sampleRows = validationRows
      .slice(0, this.limits.maxSampleRows)
      .map((row) => row.values);

    return {
      sourceKind: 'xlsx',
      rowCount: Math.max(rows.length - 1, 0),
      columnCount: header.length,
      columnKeys: header,
      sampleRows,
      validationRows,
      issues,
      metadata: {
        sheetSelection: 'first sheet',
        formulaRule: 'formula-looking values are treated as text',
      },
    };
  }

  private emptySummary(issues: ParserIssue[]): ParsedSourceSummary {
    return {
      sourceKind: 'xlsx',
      rowCount: 0,
      columnCount: 0,
      columnKeys: [],
      sampleRows: [],
      validationRows: [],
      issues,
      metadata: { sheetSelection: 'first sheet' },
    };
  }
}
