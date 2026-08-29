import {
  GEOMETRY_MAX_COORDINATES,
  GEOMETRY_MAX_DEPTH,
  GEOMETRY_MAX_JSON_BYTES,
  GEOMETRY_MAX_METADATA_BYTES,
  GEOMETRY_MAX_SOURCE_PRECISION_CHARS,
  type GeoJsonGeometry,
  type Position2D,
  type SupportedGeometryType,
  type ValidatedGeometry,
  type WriteRegionGeometryInput,
} from './geography.types';
import { GeometryError } from './geometry.errors';

const SUPPORTED_TYPES: ReadonlySet<string> = new Set<SupportedGeometryType>([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
]);

export const ID_REGEX = /^[0-9a-zA-Z_-]{1,128}$/;

function hasControlChars(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

/**
 * Validates a 2D position `[longitude, latitude]`.
 * Rejects non-finite numbers, out-of-range bounds, and 3D/4D (Z/M) ordinates.
 */
function isValidPosition(pos: unknown): pos is Position2D {
  if (!Array.isArray(pos) || pos.length !== 2) {
    return false;
  }
  const lon: unknown = pos[0];
  const lat: unknown = pos[1];
  if (
    typeof lon !== 'number' ||
    typeof lat !== 'number' ||
    !Number.isFinite(lon) ||
    !Number.isFinite(lat)
  ) {
    return false;
  }
  return lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
}

function positionsEqual(a: Position2D, b: Position2D): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * Recursively checks array depth to prevent stack overflow or deeply nested attacks.
 */
function checkArrayDepth(value: unknown, currentDepth = 0): void {
  if (currentDepth > GEOMETRY_MAX_DEPTH) {
    throw GeometryError.invalid(
      `Geometry exceeds maximum nesting depth of ${GEOMETRY_MAX_DEPTH}.`,
    );
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      checkArrayDepth(item, currentDepth + 1);
    }
  }
}

/**
 * Authoritative pre-validator for region geometry input.
 *
 * Verifies geometry type, 2D coordinates, nesting bounds, size bounds, and
 * returns the normalized geometry and serialized JSON string ready for SQL
 * binding.
 */
export function validateGeometryInput(
  input: WriteRegionGeometryInput,
): ValidatedGeometry {
  if (!input || typeof input !== 'object') {
    throw GeometryError.invalid('Geometry input must be a valid object.');
  }

  // 1. Validate Region ID and Source ID
  if (typeof input.regionId !== 'string' || !ID_REGEX.test(input.regionId)) {
    throw GeometryError.invalid(
      'Invalid regionId: must be a non-empty string up to 128 characters.',
    );
  }
  if (typeof input.sourceId !== 'string' || !ID_REGEX.test(input.sourceId)) {
    throw GeometryError.invalid(
      'Invalid sourceId: must be a non-empty string up to 128 characters.',
    );
  }

  // 2. Validate optional sourcePrecision
  if (input.sourcePrecision !== undefined && input.sourcePrecision !== null) {
    if (
      typeof input.sourcePrecision !== 'string' ||
      input.sourcePrecision.length > GEOMETRY_MAX_SOURCE_PRECISION_CHARS ||
      hasControlChars(input.sourcePrecision)
    ) {
      throw GeometryError.invalid(
        `Invalid sourcePrecision: must be a string up to ${GEOMETRY_MAX_SOURCE_PRECISION_CHARS} characters without control characters.`,
      );
    }
  }

  // 3. Validate optional metadata
  if (input.metadata !== undefined && input.metadata !== null) {
    if (typeof input.metadata !== 'object' || Array.isArray(input.metadata)) {
      throw GeometryError.invalid(
        'Invalid metadata: must be a plain JSON object.',
      );
    }
    let metadataJson: string;
    try {
      metadataJson = JSON.stringify(input.metadata);
    } catch {
      throw GeometryError.invalid('Invalid metadata: not JSON serializable.');
    }
    if (Buffer.byteLength(metadataJson, 'utf8') > GEOMETRY_MAX_METADATA_BYTES) {
      throw GeometryError.invalid(
        `Metadata size exceeds maximum limit of ${GEOMETRY_MAX_METADATA_BYTES} bytes.`,
      );
    }
  }

  // 4. Validate geometry object
  const rawGeom = input.geometry as unknown;
  if (!rawGeom || typeof rawGeom !== 'object' || Array.isArray(rawGeom)) {
    throw GeometryError.invalid(
      'Geometry must be a valid GeoJSON Geometry object.',
    );
  }

  const geomObj = rawGeom as Record<string, unknown>;

  // Reject Feature / FeatureCollection wrappers explicitly
  if (geomObj.type === 'Feature' || geomObj.type === 'FeatureCollection') {
    throw GeometryError.invalid(
      `Feature and FeatureCollection wrappers are rejected. Provide a pure GeoJSON Geometry object.`,
    );
  }

  if (typeof geomObj.type !== 'string' || !SUPPORTED_TYPES.has(geomObj.type)) {
    throw GeometryError.invalid(
      `Unsupported geometry type "${String(geomObj.type)}". Supported types are Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon.`,
    );
  }

  const geometryType = geomObj.type as SupportedGeometryType;

  if (!('coordinates' in geomObj) || !Array.isArray(geomObj.coordinates)) {
    throw GeometryError.invalid(
      'Geometry must contain a valid coordinates array.',
    );
  }

  // Depth guard
  checkArrayDepth(geomObj.coordinates, 0);

  let coordinateCount = 0;

  // Type-specific structural validation
  switch (geometryType) {
    case 'Point': {
      if (!isValidPosition(geomObj.coordinates)) {
        throw GeometryError.invalid(
          'Point coordinates must be a 2D position [longitude, latitude] with longitude in [-180, 180] and latitude in [-90, 90].',
        );
      }
      coordinateCount = 1;
      break;
    }

    case 'MultiPoint': {
      const coords = geomObj.coordinates;
      if (!Array.isArray(coords) || coords.length === 0) {
        throw GeometryError.invalid(
          'MultiPoint coordinates must contain at least one position.',
        );
      }
      for (const pos of coords) {
        if (!isValidPosition(pos)) {
          throw GeometryError.invalid(
            'MultiPoint contains an invalid coordinate. Positions must be [longitude, latitude] with longitude in [-180, 180] and latitude in [-90, 90].',
          );
        }
      }
      coordinateCount = coords.length;
      break;
    }

    case 'LineString': {
      const coords = geomObj.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) {
        throw GeometryError.invalid(
          'LineString coordinates must contain at least 2 positions.',
        );
      }
      for (const pos of coords) {
        if (!isValidPosition(pos)) {
          throw GeometryError.invalid(
            'LineString contains an invalid coordinate. Positions must be [longitude, latitude] with longitude in [-180, 180] and latitude in [-90, 90].',
          );
        }
      }
      coordinateCount = coords.length;
      break;
    }

    case 'MultiLineString': {
      const lines = geomObj.coordinates;
      if (!Array.isArray(lines) || lines.length === 0) {
        throw GeometryError.invalid(
          'MultiLineString coordinates must contain at least one LineString array.',
        );
      }
      for (const line of lines) {
        if (!Array.isArray(line) || line.length < 2) {
          throw GeometryError.invalid(
            'MultiLineString lines must each contain at least 2 positions.',
          );
        }
        for (const pos of line) {
          if (!isValidPosition(pos)) {
            throw GeometryError.invalid(
              'MultiLineString contains an invalid coordinate.',
            );
          }
          coordinateCount++;
        }
      }
      break;
    }

    case 'Polygon': {
      const rings = geomObj.coordinates;
      if (!Array.isArray(rings) || rings.length === 0) {
        throw GeometryError.invalid(
          'Polygon coordinates must contain at least one LinearRing array.',
        );
      }
      for (const ring of rings) {
        if (!Array.isArray(ring) || ring.length < 4) {
          throw GeometryError.invalid(
            'Polygon LinearRing must contain at least 4 positions.',
          );
        }
        for (const pos of ring) {
          if (!isValidPosition(pos)) {
            throw GeometryError.invalid(
              'Polygon LinearRing contains an invalid coordinate.',
            );
          }
          coordinateCount++;
        }
        const first = ring[0] as Position2D;
        const last = ring[ring.length - 1] as Position2D;
        if (!positionsEqual(first, last)) {
          throw GeometryError.invalid(
            'Polygon LinearRing must be closed (first and last positions must be identical).',
          );
        }
      }
      break;
    }

    case 'MultiPolygon': {
      const polygons = geomObj.coordinates;
      if (!Array.isArray(polygons) || polygons.length === 0) {
        throw GeometryError.invalid(
          'MultiPolygon coordinates must contain at least one Polygon array.',
        );
      }
      for (const polygon of polygons) {
        if (!Array.isArray(polygon) || polygon.length === 0) {
          throw GeometryError.invalid(
            'MultiPolygon element must contain at least one LinearRing.',
          );
        }
        for (const ring of polygon) {
          if (!Array.isArray(ring) || ring.length < 4) {
            throw GeometryError.invalid(
              'MultiPolygon LinearRing must contain at least 4 positions.',
            );
          }
          for (const pos of ring) {
            if (!isValidPosition(pos)) {
              throw GeometryError.invalid(
                'MultiPolygon LinearRing contains an invalid coordinate.',
              );
            }
            coordinateCount++;
          }
          const first = ring[0] as Position2D;
          const last = ring[ring.length - 1] as Position2D;
          if (!positionsEqual(first, last)) {
            throw GeometryError.invalid(
              'MultiPolygon LinearRing must be closed (first and last positions must be identical).',
            );
          }
        }
      }
      break;
    }
  }

  // Coordinate count guard
  if (coordinateCount > GEOMETRY_MAX_COORDINATES) {
    throw GeometryError.invalid(
      `Coordinate count (${coordinateCount}) exceeds maximum safety ceiling of ${GEOMETRY_MAX_COORDINATES}.`,
    );
  }

  const normalizedGeometry: GeoJsonGeometry = {
    type: geometryType,
    coordinates: geomObj.coordinates,
  } as GeoJsonGeometry;

  let geoJsonString: string;
  try {
    geoJsonString = JSON.stringify(normalizedGeometry);
  } catch {
    throw GeometryError.invalid('Failed to serialize geometry to JSON.');
  }

  if (Buffer.byteLength(geoJsonString, 'utf8') > GEOMETRY_MAX_JSON_BYTES) {
    throw GeometryError.invalid(
      `Serialized geometry size exceeds safety limit of ${GEOMETRY_MAX_JSON_BYTES} bytes.`,
    );
  }

  return {
    geometryType,
    coordinateCount,
    geoJsonString,
    normalizedGeometry,
  };
}
