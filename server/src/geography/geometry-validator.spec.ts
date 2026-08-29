import { validateGeometryInput } from './geometry-validator';
import { GeometryError } from './geometry.errors';
import type {
  GeoJsonLineString,
  GeoJsonMultiLineString,
  GeoJsonMultiPoint,
  GeoJsonMultiPolygon,
  GeoJsonPoint,
  GeoJsonPolygon,
  WriteRegionGeometryInput,
} from './geography.types';

describe('validateGeometryInput', () => {
  const validRegionId = '01918e95-7140-7000-8000-000000000001';
  const validSourceId = '01918e95-7140-7000-8000-000000000002';

  describe('valid geometries', () => {
    it('accepts a valid 2D Point', () => {
      const geometry: GeoJsonPoint = {
        type: 'Point',
        coordinates: [-122.4194, 37.7749],
      };
      const result = validateGeometryInput({
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry,
      });

      expect(result.geometryType).toBe('Point');
      expect(result.coordinateCount).toBe(1);
      expect(JSON.parse(result.geoJsonString)).toEqual(geometry);
    });

    it('accepts a valid MultiPoint', () => {
      const geometry: GeoJsonMultiPoint = {
        type: 'MultiPoint',
        coordinates: [
          [-122.4194, 37.7749],
          [-122.4195, 37.775],
        ],
      };
      const result = validateGeometryInput({
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry,
      });

      expect(result.geometryType).toBe('MultiPoint');
      expect(result.coordinateCount).toBe(2);
    });

    it('accepts a valid LineString', () => {
      const geometry: GeoJsonLineString = {
        type: 'LineString',
        coordinates: [
          [-122.4194, 37.7749],
          [-122.4195, 37.775],
          [-122.4196, 37.7751],
        ],
      };
      const result = validateGeometryInput({
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry,
      });

      expect(result.geometryType).toBe('LineString');
      expect(result.coordinateCount).toBe(3);
    });

    it('accepts a valid MultiLineString', () => {
      const geometry: GeoJsonMultiLineString = {
        type: 'MultiLineString',
        coordinates: [
          [
            [-122.4194, 37.7749],
            [-122.4195, 37.775],
          ],
          [
            [-122.5, 37.8],
            [-122.6, 37.9],
          ],
        ],
      };
      const result = validateGeometryInput({
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry,
      });

      expect(result.geometryType).toBe('MultiLineString');
      expect(result.coordinateCount).toBe(4);
    });

    it('accepts a valid closed Polygon', () => {
      const geometry: GeoJsonPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 10],
            [10, 10],
            [10, 0],
            [0, 0],
          ],
        ],
      };
      const result = validateGeometryInput({
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry,
      });

      expect(result.geometryType).toBe('Polygon');
      expect(result.coordinateCount).toBe(5);
    });

    it('accepts a Polygon with an interior ring (hole)', () => {
      const geometry: GeoJsonPolygon = {
        type: 'Polygon',
        coordinates: [
          // Exterior ring
          [
            [0, 0],
            [0, 10],
            [10, 10],
            [10, 0],
            [0, 0],
          ],
          // Interior hole
          [
            [2, 2],
            [2, 8],
            [8, 8],
            [8, 2],
            [2, 2],
          ],
        ],
      };
      const result = validateGeometryInput({
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry,
      });

      expect(result.geometryType).toBe('Polygon');
      expect(result.coordinateCount).toBe(10);
    });

    it('accepts a valid MultiPolygon', () => {
      const geometry: GeoJsonMultiPolygon = {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [0, 0],
              [0, 5],
              [5, 5],
              [5, 0],
              [0, 0],
            ],
          ],
          [
            [
              [10, 10],
              [10, 15],
              [15, 15],
              [15, 10],
              [10, 10],
            ],
          ],
        ],
      };
      const result = validateGeometryInput({
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry,
      });

      expect(result.geometryType).toBe('MultiPolygon');
      expect(result.coordinateCount).toBe(10);
    });

    it('accepts valid optional sourcePrecision and metadata', () => {
      const geometry: GeoJsonPoint = {
        type: 'Point',
        coordinates: [-73.9857, 40.7484],
      };
      const result = validateGeometryInput({
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry,
        sourcePrecision: '10m',
        metadata: { provider: 'us_census', fips: '36061' },
      });

      expect(result.geometryType).toBe('Point');
    });
  });

  describe('rejections and edge cases', () => {
    it('rejects null or non-object input', () => {
      expect(() =>
        validateGeometryInput(null as unknown as WriteRegionGeometryInput),
      ).toThrow(GeometryError);
      expect(() =>
        validateGeometryInput(undefined as unknown as WriteRegionGeometryInput),
      ).toThrow(GeometryError);
    });

    it('rejects invalid regionId or sourceId', () => {
      const geometry: GeoJsonPoint = { type: 'Point', coordinates: [0, 0] };

      expect(() =>
        validateGeometryInput({
          regionId: '',
          sourceId: validSourceId,
          geometry,
        }),
      ).toThrow(/Invalid regionId/);

      expect(() =>
        validateGeometryInput({
          regionId: '   ',
          sourceId: validSourceId,
          geometry,
        }),
      ).toThrow(/Invalid regionId/);

      expect(() =>
        validateGeometryInput({
          regionId: 'a'.repeat(200),
          sourceId: validSourceId,
          geometry,
        }),
      ).toThrow(/Invalid regionId/);

      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: '',
          geometry,
        }),
      ).toThrow(/Invalid sourceId/);
    });

    it('rejects Feature wrapper', () => {
      const input = {
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [0, 0] },
        } as unknown as GeoJsonPoint,
      };

      expect(() => validateGeometryInput(input)).toThrow(
        /Feature and FeatureCollection wrappers are rejected/,
      );
    });

    it('rejects FeatureCollection wrapper', () => {
      const input = {
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry: {
          type: 'FeatureCollection',
          features: [],
        } as unknown as GeoJsonPoint,
      };

      expect(() => validateGeometryInput(input)).toThrow(
        /Feature and FeatureCollection wrappers are rejected/,
      );
    });

    it('rejects unsupported geometry types', () => {
      const input = {
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry: {
          type: 'GeometryCollection',
          geometries: [],
        } as unknown as GeoJsonPoint,
      };

      expect(() => validateGeometryInput(input)).toThrow(
        /Unsupported geometry type "GeometryCollection"/,
      );
    });

    it('rejects 3D coordinates (Z ordinates)', () => {
      const input = {
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry: {
          type: 'Point',
          coordinates: [0, 0, 100],
        } as unknown as GeoJsonPoint,
      };

      expect(() => validateGeometryInput(input)).toThrow(
        /Point coordinates must be a 2D position/,
      );
    });

    it('rejects 4D coordinates (Z/M ordinates)', () => {
      const input = {
        regionId: validRegionId,
        sourceId: validSourceId,
        geometry: {
          type: 'Point',
          coordinates: [0, 0, 100, 50],
        } as unknown as GeoJsonPoint,
      };

      expect(() => validateGeometryInput(input)).toThrow(
        /Point coordinates must be a 2D position/,
      );
    });

    it('rejects out of bounds longitude (> 180 or < -180)', () => {
      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: { type: 'Point', coordinates: [180.1, 0] },
        }),
      ).toThrow(GeometryError);

      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: { type: 'Point', coordinates: [-180.1, 0] },
        }),
      ).toThrow(GeometryError);
    });

    it('rejects out of bounds latitude (> 90 or < -90)', () => {
      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: { type: 'Point', coordinates: [0, 90.1] },
        }),
      ).toThrow(GeometryError);

      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: { type: 'Point', coordinates: [0, -90.1] },
        }),
      ).toThrow(GeometryError);
    });

    it('rejects non-finite coordinate values (NaN, Infinity, string)', () => {
      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: {
            type: 'Point',
            coordinates: [NaN, 0] as unknown as [number, number],
          },
        }),
      ).toThrow(GeometryError);

      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: {
            type: 'Point',
            coordinates: [0, Infinity] as unknown as [number, number],
          },
        }),
      ).toThrow(GeometryError);

      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: {
            type: 'Point',
            coordinates: ['0', '0'] as unknown as [number, number],
          },
        }),
      ).toThrow(GeometryError);
    });

    it('rejects LineString with fewer than 2 positions', () => {
      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: { type: 'LineString', coordinates: [[0, 0]] },
        }),
      ).toThrow(/LineString coordinates must contain at least 2 positions/);
    });

    it('rejects unclosed Polygon LinearRing', () => {
      const geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 10],
            [10, 10],
            [10, 0],
            [0, 1], // not equal to [0, 0]
          ],
        ],
      };

      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: geometry as unknown as GeoJsonPolygon,
        }),
      ).toThrow(/Polygon LinearRing must be closed/);
    });

    it('rejects Polygon LinearRing with fewer than 4 positions', () => {
      const geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [10, 10],
            [0, 0],
          ],
        ],
      };

      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: geometry as unknown as GeoJsonPolygon,
        }),
      ).toThrow(/Polygon LinearRing must contain at least 4 positions/);
    });

    it('rejects excessive metadata size (> 64 KB)', () => {
      const hugeMetadata: Record<string, string> = {};
      for (let i = 0; i < 2000; i++) {
        hugeMetadata[`key_${i}`] = 'value_'.repeat(20);
      }

      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: { type: 'Point', coordinates: [0, 0] },
          metadata: hugeMetadata,
        }),
      ).toThrow(/Metadata size exceeds maximum limit/);
    });

    it('rejects control characters in sourcePrecision', () => {
      expect(() =>
        validateGeometryInput({
          regionId: validRegionId,
          sourceId: validSourceId,
          geometry: { type: 'Point', coordinates: [0, 0] },
          sourcePrecision: '10m\u0000bad',
        }),
      ).toThrow(/Invalid sourcePrecision/);
    });
  });
});
