import { isParserLimits, isParserChildRequest } from './parser-child.entry';
import type { ParserLimits } from './parser.types';

describe('parser-child.entry type guards', () => {
  const validLimits: ParserLimits = {
    maxRows: 100,
    maxColumns: 20,
    maxCellChars: 200,
    maxSampleRows: 5,
    maxGeojsonFeatures: 50,
    maxGeojsonCoordinates: 500,
  };

  describe('isParserLimits', () => {
    it('accepts valid ParserLimits object', () => {
      expect(isParserLimits(validLimits)).toBe(true);
    });

    it('accepts maxSampleRows of 0', () => {
      expect(isParserLimits({ ...validLimits, maxSampleRows: 0 })).toBe(true);
    });

    it('rejects null, undefined, primitives, and arrays', () => {
      expect(isParserLimits(null)).toBe(false);
      expect(isParserLimits(undefined)).toBe(false);
      expect(isParserLimits(123)).toBe(false);
      expect(isParserLimits('limits')).toBe(false);
      expect(isParserLimits(true)).toBe(false);
      expect(isParserLimits([])).toBe(false);
    });

    it('rejects empty object or objects missing required fields', () => {
      expect(isParserLimits({})).toBe(false);
      expect(isParserLimits({ maxRows: 100 })).toBe(false);

      const fields: (keyof ParserLimits)[] = [
        'maxRows',
        'maxColumns',
        'maxCellChars',
        'maxSampleRows',
        'maxGeojsonFeatures',
        'maxGeojsonCoordinates',
      ];
      for (const field of fields) {
        const copy: Partial<ParserLimits> = { ...validLimits };
        delete copy[field];
        expect(isParserLimits(copy)).toBe(false);
      }
    });

    it('rejects non-integer limits', () => {
      expect(isParserLimits({ ...validLimits, maxRows: 10.5 })).toBe(false);
      expect(isParserLimits({ ...validLimits, maxColumns: 5.2 })).toBe(false);
      expect(isParserLimits({ ...validLimits, maxCellChars: 100.1 })).toBe(
        false,
      );
      expect(isParserLimits({ ...validLimits, maxSampleRows: 2.5 })).toBe(
        false,
      );
      expect(isParserLimits({ ...validLimits, maxGeojsonFeatures: 12.3 })).toBe(
        false,
      );
      expect(
        isParserLimits({ ...validLimits, maxGeojsonCoordinates: 99.9 }),
      ).toBe(false);
    });

    it('rejects zero or negative limits for fields requiring positive integers', () => {
      expect(isParserLimits({ ...validLimits, maxRows: 0 })).toBe(false);
      expect(isParserLimits({ ...validLimits, maxRows: -1 })).toBe(false);

      expect(isParserLimits({ ...validLimits, maxColumns: 0 })).toBe(false);
      expect(isParserLimits({ ...validLimits, maxColumns: -1 })).toBe(false);

      expect(isParserLimits({ ...validLimits, maxCellChars: 0 })).toBe(false);
      expect(isParserLimits({ ...validLimits, maxCellChars: -1 })).toBe(false);

      expect(isParserLimits({ ...validLimits, maxGeojsonFeatures: 0 })).toBe(
        false,
      );
      expect(isParserLimits({ ...validLimits, maxGeojsonFeatures: -1 })).toBe(
        false,
      );

      expect(isParserLimits({ ...validLimits, maxGeojsonCoordinates: 0 })).toBe(
        false,
      );
      expect(
        isParserLimits({ ...validLimits, maxGeojsonCoordinates: -1 }),
      ).toBe(false);
    });

    it('rejects negative maxSampleRows', () => {
      expect(isParserLimits({ ...validLimits, maxSampleRows: -1 })).toBe(false);
    });

    it('rejects non-number limit types', () => {
      expect(isParserLimits({ ...validLimits, maxRows: '100' })).toBe(false);
      expect(isParserLimits({ ...validLimits, maxColumns: null })).toBe(false);
      expect(isParserLimits({ ...validLimits, maxCellChars: undefined })).toBe(
        false,
      );
    });
  });

  describe('isParserChildRequest', () => {
    it('accepts valid request with Buffer', () => {
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-1',
          buffer: Buffer.from('hello'),
          mediaType: 'text/csv',
          limits: validLimits,
        }),
      ).toBe(true);
    });

    it('accepts valid request with Uint8Array', () => {
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-2',
          buffer: new Uint8Array([1, 2, 3]),
          mediaType: 'application/geo+json',
          limits: validLimits,
        }),
      ).toBe(true);
    });

    it('rejects null, undefined, primitives, and arrays', () => {
      expect(isParserChildRequest(null)).toBe(false);
      expect(isParserChildRequest(undefined)).toBe(false);
      expect(isParserChildRequest(123)).toBe(false);
      expect(isParserChildRequest('string')).toBe(false);
      expect(isParserChildRequest([])).toBe(false);
    });

    it('rejects wrong request type', () => {
      expect(
        isParserChildRequest({
          type: 'execute',
          id: 'req-1',
          buffer: Buffer.from('hello'),
          mediaType: 'text/csv',
          limits: validLimits,
        }),
      ).toBe(false);
      expect(
        isParserChildRequest({
          type: 'error',
          id: 'req-1',
          buffer: Buffer.from('hello'),
          mediaType: 'text/csv',
          limits: validLimits,
        }),
      ).toBe(false);
    });

    it('rejects non-string, empty, or whitespace-only id', () => {
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 123,
          buffer: Buffer.from('hello'),
          mediaType: 'text/csv',
          limits: validLimits,
        }),
      ).toBe(false);
      expect(
        isParserChildRequest({
          type: 'parse',
          id: '',
          buffer: Buffer.from('hello'),
          mediaType: 'text/csv',
          limits: validLimits,
        }),
      ).toBe(false);
      expect(
        isParserChildRequest({
          type: 'parse',
          id: '   ',
          buffer: Buffer.from('hello'),
          mediaType: 'text/csv',
          limits: validLimits,
        }),
      ).toBe(false);
    });

    it('rejects non-buffer buffer property', () => {
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-1',
          buffer: 'not-a-buffer',
          mediaType: 'text/csv',
          limits: validLimits,
        }),
      ).toBe(false);
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-1',
          buffer: { some: 'object' },
          mediaType: 'text/csv',
          limits: validLimits,
        }),
      ).toBe(false);
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-1',
          buffer: null,
          mediaType: 'text/csv',
          limits: validLimits,
        }),
      ).toBe(false);
    });

    it('rejects non-string, empty, or whitespace-only mediaType', () => {
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-1',
          buffer: Buffer.from('hello'),
          mediaType: 123,
          limits: validLimits,
        }),
      ).toBe(false);
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-1',
          buffer: Buffer.from('hello'),
          mediaType: '',
          limits: validLimits,
        }),
      ).toBe(false);
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-1',
          buffer: Buffer.from('hello'),
          mediaType: '   ',
          limits: validLimits,
        }),
      ).toBe(false);
    });

    it('rejects invalid or missing limits', () => {
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-1',
          buffer: Buffer.from('hello'),
          mediaType: 'text/csv',
          limits: null,
        }),
      ).toBe(false);
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-1',
          buffer: Buffer.from('hello'),
          mediaType: 'text/csv',
          limits: {},
        }),
      ).toBe(false);
      expect(
        isParserChildRequest({
          type: 'parse',
          id: 'req-1',
          buffer: Buffer.from('hello'),
          mediaType: 'text/csv',
          limits: { ...validLimits, maxRows: -5 },
        }),
      ).toBe(false);
    });
  });
});
