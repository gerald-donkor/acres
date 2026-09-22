import {
  contractsMarkdown,
  ensureContractEnv,
  sortValue,
  stableStringify,
} from './generate-contracts';

describe('generate-contracts', () => {
  describe('sortValue', () => {
    it('returns primitive values as-is', () => {
      expect(sortValue('hello')).toBe('hello');
      expect(sortValue(42)).toBe(42);
      expect(sortValue(true)).toBe(true);
      expect(sortValue(null)).toBeNull();
    });

    it('maps arrays while preserving item ordering', () => {
      const input = [
        { b: 2, a: 1 },
        { d: 4, c: 3 },
      ];
      const sorted = sortValue(input) as Array<Record<string, unknown>>;
      expect(sorted).toHaveLength(2);
      expect(Object.keys(sorted[0])).toEqual(['a', 'b']);
      expect(Object.keys(sorted[1])).toEqual(['c', 'd']);
    });

    it('sorts object keys alphabetically and filters out undefined values', () => {
      const input = {
        z: 'last',
        a: 'first',
        m: undefined,
        nested: {
          y: 2,
          x: 1,
          ignored: undefined,
        },
      };
      const sorted = sortValue(input) as Record<string, unknown>;
      expect(Object.keys(sorted)).toEqual(['a', 'nested', 'z']);
      expect(sorted.m).toBeUndefined();
      expect('m' in sorted).toBe(false);

      const nested = sorted.nested as Record<string, unknown>;
      expect(Object.keys(nested)).toEqual(['x', 'y']);
      expect('ignored' in nested).toBe(false);
    });
  });

  describe('stableStringify', () => {
    it('produces formatted JSON with sorted keys and 2-space indentation', () => {
      const obj1 = { b: 2, a: 1 };
      const obj2 = { a: 1, b: 2 };
      expect(stableStringify(obj1)).toBe(stableStringify(obj2));
      expect(stableStringify(obj1)).toBe('{\n  "a": 1,\n  "b": 2\n}');
    });

    it('handles nested objects and arrays deterministically', () => {
      const obj = {
        meta: { beta: 'b', alpha: 'a' },
        items: [{ k2: 'v2', k1: 'v1' }],
      };
      const expected = JSON.stringify(
        {
          items: [{ k1: 'v1', k2: 'v2' }],
          meta: { alpha: 'a', beta: 'b' },
        },
        null,
        2,
      );
      expect(stableStringify(obj)).toBe(expected);
    });
  });

  describe('ensureContractEnv', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('populates required contract environment defaults when unset', () => {
      delete process.env.NODE_ENV;
      delete process.env.GRAPHQL_MAX_BYTES;
      delete process.env.PARSER_MAX_ROWS;

      ensureContractEnv();

      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.GRAPHQL_MAX_BYTES).toBe('12000');
      expect(process.env.PARSER_MAX_ROWS).toBe('10000');
    });

    it('preserves existing environment variables', () => {
      process.env.NODE_ENV = 'production';
      process.env.GRAPHQL_MAX_BYTES = '99999';

      ensureContractEnv();

      expect(process.env.NODE_ENV).toBe('production');
      expect(process.env.GRAPHQL_MAX_BYTES).toBe('99999');
    });
  });

  describe('contractsMarkdown', () => {
    it('returns contract documentation header and REST/GraphQL sections', () => {
      const markdown = contractsMarkdown();
      expect(markdown).toContain('# Acres API contracts');
      expect(markdown).toContain('## REST');
      expect(markdown).toContain('## GraphQL');
    });
  });
});
