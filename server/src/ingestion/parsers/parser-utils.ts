import type { ParserIssue } from './parser.types';

export const PARSER_MAX_BUFFER_BYTES = 25 * 1024 * 1024;

export function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function safeCell(
  value: unknown,
  maxChars: number,
): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = scalarText(value);
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

export function scalarText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  return JSON.stringify(value) ?? '';
}

export function formulaIssue(
  rowNumber: number,
  columnKey: string,
): ParserIssue {
  return {
    severity: 'warning',
    code: 'formula_as_data',
    message: 'Formula-looking cell was treated as text.',
    rowNumber,
    columnKey,
  };
}

export function isFormulaLike(value: unknown): boolean {
  return typeof value === 'string' && /^[=+\-@]/.test(value.trim());
}
