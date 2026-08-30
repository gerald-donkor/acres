import {
  GEOBOUNDARIES_MAX_FEATURES,
  type GeoBoundariesFeature,
  type GeoBoundariesLayerManifest,
  type NormalizedGeoBoundariesLayer,
} from './geoboundaries.types';
import type { GeoJsonMultiPolygon, GeoJsonPolygon } from './geography.types';

export class GeoBoundariesNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeoBoundariesNormalizationError';
  }
}

function readText(value: unknown, name: string, max = 512): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    // eslint-disable-next-line no-control-regex -- reject untrusted control characters.
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new GeoBoundariesNormalizationError(`${name} is invalid.`);
  return value;
}

function geometry(value: unknown): GeoJsonPolygon | GeoJsonMultiPolygon {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GeoBoundariesNormalizationError('Feature geometry is missing.');
  const candidate = value as Record<string, unknown>;
  if (
    (candidate.type !== 'Polygon' && candidate.type !== 'MultiPolygon') ||
    !Array.isArray(candidate.coordinates)
  )
    throw new GeoBoundariesNormalizationError(
      'Only Polygon and MultiPolygon features are supported.',
    );
  return candidate as unknown as GeoJsonPolygon | GeoJsonMultiPolygon;
}

/** Normalizes only the stable geoBoundaries feature identity; it never derives a parent from geometry or names. */
export function normalizeGeoBoundariesLayer(
  layer: GeoBoundariesLayerManifest,
  source: unknown,
): NormalizedGeoBoundariesLayer {
  if (!source || typeof source !== 'object' || Array.isArray(source))
    throw new GeoBoundariesNormalizationError('GeoJSON must be an object.');
  const collection = source as Record<string, unknown>;
  if (
    collection.type !== 'FeatureCollection' ||
    !Array.isArray(collection.features) ||
    collection.features.length === 0 ||
    collection.features.length > GEOBOUNDARIES_MAX_FEATURES
  )
    throw new GeoBoundariesNormalizationError(
      'GeoJSON must be a bounded non-empty FeatureCollection.',
    );
  if (collection.features.length !== layer.featureCount)
    throw new GeoBoundariesNormalizationError(
      'GeoJSON feature count differs from its manifest.',
    );
  const seen = new Set<string>();
  const features: GeoBoundariesFeature[] = collection.features.map(
    (raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new GeoBoundariesNormalizationError(
          `Feature ${index} is invalid.`,
        );
      const feature = raw as Record<string, unknown>;
      if (
        feature.type !== 'Feature' ||
        !feature.properties ||
        typeof feature.properties !== 'object' ||
        Array.isArray(feature.properties)
      )
        throw new GeoBoundariesNormalizationError(
          `Feature ${index} has invalid properties.`,
        );
      const properties = feature.properties as Record<string, unknown>;
      const shapeId = readText(properties.shapeID, 'shapeID');
      if (seen.has(shapeId))
        throw new GeoBoundariesNormalizationError(
          `Duplicate provider shapeID ${shapeId}.`,
        );
      seen.add(shapeId);
      const shapeGroup = readText(properties.shapeGroup, 'shapeGroup');
      const shapeType = readText(properties.shapeType, 'shapeType', 4);
      const shapeIso =
        properties.shapeISO === undefined || properties.shapeISO === ''
          ? undefined
          : readText(properties.shapeISO, 'shapeISO', 3);
      if (
        shapeGroup !== layer.countryCode ||
        shapeType !== layer.level ||
        (shapeIso && shapeIso !== layer.countryCode)
      )
        throw new GeoBoundariesNormalizationError(
          `Feature ${shapeId} does not match manifest country/level.`,
        );
      return {
        shapeId,
        shapeName: readText(properties.shapeName, 'shapeName'),
        shapeGroup,
        shapeType: layer.level,
        ...(shapeIso ? { shapeIso } : {}),
        geometry: geometry(feature.geometry),
      };
    },
  );
  return { layer, features };
}
