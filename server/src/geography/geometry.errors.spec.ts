import {
  GEOMETRY_ERROR_CODES,
  GeometryError,
  isGeometryErrorCode,
} from './geometry.errors';

describe('GeometryError and GEOMETRY_ERROR_CODES', () => {
  describe('GEOMETRY_ERROR_CODES', () => {
    it('contains all expected canonical error codes in order', () => {
      expect(GEOMETRY_ERROR_CODES).toEqual([
        'INVALID_GEOMETRY',
        'REFERENCE_NOT_FOUND',
        'PERSISTENCE_FAILED',
      ]);
    });
  });

  describe('isGeometryErrorCode', () => {
    it('returns true for every valid geometry error code', () => {
      for (const code of GEOMETRY_ERROR_CODES) {
        expect(isGeometryErrorCode(code)).toBe(true);
      }
    });

    it('returns false for invalid codes, casing variations, or non-strings', () => {
      expect(isGeometryErrorCode('invalid_geometry')).toBe(false);
      expect(isGeometryErrorCode('REFERENCE_NOT_EXIST')).toBe(false);
      expect(isGeometryErrorCode('')).toBe(false);
      expect(isGeometryErrorCode('UNKNOWN')).toBe(false);
      expect(isGeometryErrorCode(null as unknown as string)).toBe(false);
      expect(isGeometryErrorCode(undefined as unknown as string)).toBe(false);
      expect(isGeometryErrorCode(123 as unknown as string)).toBe(false);
    });
  });

  describe('GeometryError', () => {
    it('constructs an instance with expected properties and prototype', () => {
      const err = new GeometryError('INVALID_GEOMETRY', 'Test error');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(GeometryError);
      expect(err.name).toBe('GeometryError');
      expect(err.code).toBe('INVALID_GEOMETRY');
      expect(err.message).toBe('Test error');
      expect(Object.getPrototypeOf(err)).toBe(GeometryError.prototype);
    });

    describe('static factory methods', () => {
      it('creates invalid geometry error with default message', () => {
        const err = GeometryError.invalid();
        expect(err.code).toBe('INVALID_GEOMETRY');
        expect(err.message).toBe('Geometry input is invalid or unsupported.');
      });

      it('creates invalid geometry error with custom message', () => {
        const err = GeometryError.invalid('Custom polygon error.');
        expect(err.code).toBe('INVALID_GEOMETRY');
        expect(err.message).toBe('Custom polygon error.');
      });

      it('creates referenceNotFound error with default message', () => {
        const err = GeometryError.referenceNotFound();
        expect(err.code).toBe('REFERENCE_NOT_FOUND');
        expect(err.message).toBe(
          'Referenced region or region source does not exist.',
        );
      });

      it('creates referenceNotFound error with custom message', () => {
        const err = GeometryError.referenceNotFound('Missing source s1.');
        expect(err.code).toBe('REFERENCE_NOT_FOUND');
        expect(err.message).toBe('Missing source s1.');
      });

      it('creates persistenceFailed error with default message', () => {
        const err = GeometryError.persistenceFailed();
        expect(err.code).toBe('PERSISTENCE_FAILED');
        expect(err.message).toBe('Failed to persist geometry record.');
      });

      it('creates persistenceFailed error with custom message', () => {
        const err = GeometryError.persistenceFailed('Insert failed.');
        expect(err.code).toBe('PERSISTENCE_FAILED');
        expect(err.message).toBe('Insert failed.');
      });
    });
  });
});
