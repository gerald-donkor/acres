import {
  FORMULA_AS_DATA_MESSAGE,
  PARSER_MAX_BUFFER_BYTES,
  formulaIssue,
  isFormulaAsDataMessage,
  isFormulaLike,
  normalizeKey,
  safeCell,
  scalarText,
} from './parser-utils';
import {
  PARSER_EXECUTION_STATUSES,
  isParserExecutionStatus,
} from './parser.types';

describe('parser-utils', () => {
  describe('constants', () => {
    it('defines PARSER_MAX_BUFFER_BYTES as 25MB', () => {
      expect(PARSER_MAX_BUFFER_BYTES).toBe(25 * 1024 * 1024);
    });

    it('defines FORMULA_AS_DATA_MESSAGE', () => {
      expect(FORMULA_AS_DATA_MESSAGE).toBe(
        'Formula-looking cell was treated as text.',
      );
    });
  });

  describe('isFormulaAsDataMessage', () => {
    it('returns true for the exact formula message', () => {
      expect(
        isFormulaAsDataMessage('Formula-looking cell was treated as text.'),
      ).toBe(true);
    });

    it('returns false for mismatched strings', () => {
      expect(isFormulaAsDataMessage('Different message')).toBe(false);
      expect(isFormulaAsDataMessage('')).toBe(false);
      expect(isFormulaAsDataMessage(null as unknown as string)).toBe(false);
    });
  });

  describe('isParserExecutionStatus', () => {
    it('returns true for all PARSER_EXECUTION_STATUSES', () => {
      for (const status of PARSER_EXECUTION_STATUSES) {
        expect(isParserExecutionStatus(status)).toBe(true);
      }
    });

    it('returns false for unknown or invalid statuses', () => {
      expect(isParserExecutionStatus('SUCCESS')).toBe(false);
      expect(isParserExecutionStatus('pending')).toBe(false);
      expect(isParserExecutionStatus('')).toBe(false);
      expect(isParserExecutionStatus(123 as unknown as string)).toBe(false);
    });
  });

  describe('normalizeKey', () => {
    it('lowercases and trims inputs', () => {
      expect(normalizeKey('  Country Name  ')).toBe('country_name');
    });

    it('replaces non-alphanumeric characters with underscores', () => {
      expect(normalizeKey('Total (USD) / Year!')).toBe('total_usd_year');
      expect(normalizeKey('Header-With-Dashes')).toBe('header_with_dashes');
      expect(normalizeKey('col.subcol')).toBe('col_subcol');
    });

    it('strips leading and trailing underscores', () => {
      expect(normalizeKey('___alpha_beta___')).toBe('alpha_beta');
      expect(normalizeKey(' _a_b_ ')).toBe('a_b');
    });

    it('handles empty and special strings', () => {
      expect(normalizeKey('')).toBe('');
      expect(normalizeKey('###')).toBe('');
      expect(normalizeKey('123_456')).toBe('123_456');
    });
  });

  describe('safeCell', () => {
    it('returns null for null or undefined', () => {
      expect(safeCell(null, 100)).toBeNull();
      expect(safeCell(undefined, 100)).toBeNull();
    });

    it('preserves numbers and booleans as primitives', () => {
      expect(safeCell(42, 10)).toBe(42);
      expect(safeCell(0, 10)).toBe(0);
      expect(safeCell(-3.14, 10)).toBe(-3.14);
      expect(safeCell(true, 10)).toBe(true);
      expect(safeCell(false, 10)).toBe(false);
    });

    it('returns string within maxChars limit', () => {
      expect(safeCell('hello world', 20)).toBe('hello world');
    });

    it('truncates string exceeding maxChars limit', () => {
      expect(safeCell('abcdefghij', 5)).toBe('abcde');
    });

    it('converts Date and BigInt values to string representation', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      expect(safeCell(now, 50)).toBe(now.toISOString());
      expect(safeCell(BigInt(9007199254740991), 50)).toBe('9007199254740991');
    });

    it('stringifies object values', () => {
      expect(safeCell({ key: 'value' }, 50)).toBe('{"key":"value"}');
    });
  });

  describe('scalarText', () => {
    it('returns empty string for null and undefined', () => {
      expect(scalarText(null)).toBe('');
      expect(scalarText(undefined)).toBe('');
    });

    it('returns string as-is', () => {
      expect(scalarText('sample text')).toBe('sample text');
    });

    it('returns ISO string for Date instance', () => {
      const d = new Date('2026-06-15T12:00:00.000Z');
      expect(scalarText(d)).toBe('2026-06-15T12:00:00.000Z');
    });

    it('returns string representation of BigInt', () => {
      expect(scalarText(BigInt(123456789))).toBe('123456789');
    });

    it('serializes objects via JSON.stringify', () => {
      expect(scalarText({ a: 1 })).toBe('{"a":1}');
      expect(scalarText([1, 2, 3])).toBe('[1,2,3]');
    });
  });

  describe('formulaIssue', () => {
    it('produces a valid parser issue with warning severity', () => {
      const issue = formulaIssue(42, 'revenue_estimate');
      expect(issue).toEqual({
        severity: 'warning',
        code: 'formula_as_data',
        message: FORMULA_AS_DATA_MESSAGE,
        rowNumber: 42,
        columnKey: 'revenue_estimate',
      });
    });
  });

  describe('isFormulaLike', () => {
    it('detects formula-starting characters: =, +, -, @', () => {
      expect(isFormulaLike('=SUM(A1:A10)')).toBe(true);
      expect(isFormulaLike('+123.45')).toBe(true);
      expect(isFormulaLike('-500')).toBe(true);
      expect(isFormulaLike('@AVERAGE(B1:B5)')).toBe(true);
    });

    it('ignores leading whitespace when detecting formula prefix', () => {
      expect(isFormulaLike('   =1+1')).toBe(true);
      expect(isFormulaLike('\t+42')).toBe(true);
      expect(isFormulaLike('  @SUM()')).toBe(true);
    });

    it('returns false for normal strings and text', () => {
      expect(isFormulaLike('Normal Text')).toBe(false);
      expect(isFormulaLike('12345')).toBe(false);
      expect(isFormulaLike('')).toBe(false);
      expect(isFormulaLike('   ')).toBe(false);
    });

    it('returns false for non-string types', () => {
      expect(isFormulaLike(null)).toBe(false);
      expect(isFormulaLike(undefined)).toBe(false);
      expect(isFormulaLike(123)).toBe(false);
      expect(isFormulaLike(-123)).toBe(false);
      expect(isFormulaLike(true)).toBe(false);
      expect(isFormulaLike({})).toBe(false);
    });
  });
});
