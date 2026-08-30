import type { GeoJsonMultiPolygon, GeoJsonPolygon } from './geography.types';

export const GEOBOUNDARIES_MANIFEST_SCHEMA_VERSION = 1;
export const GEOBOUNDARIES_MAX_LAYERS = 24;
export const GEOBOUNDARIES_MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
export const GEOBOUNDARIES_MAX_FEATURES = 50_000;

export type GeoBoundariesLevel =
  'ADM0' | 'ADM1' | 'ADM2' | 'ADM3' | 'ADM4' | 'ADM5';
export type HierarchyMode =
  'country-root' | 'explicit-parent-map' | 'unresolved';

export interface GeoBoundariesSelection {
  readonly countryCode: string;
  readonly level: GeoBoundariesLevel;
}

export interface GeoBoundariesLayerManifest {
  readonly provider: 'geoBoundaries';
  readonly releaseType: 'gbOpen';
  readonly countryCode: string;
  readonly level: GeoBoundariesLevel;
  readonly boundaryId: string;
  readonly representedYear: string;
  readonly sourceUpdateDate: string;
  readonly buildDate: string;
  readonly boundarySource: string;
  readonly boundaryLicense: string;
  readonly licenseDetail: string;
  readonly licenseSource: string;
  readonly sourceUrl: string;
  readonly artifactUrl: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly featureCount: number;
  readonly attribution: string;
  readonly modificationNote: string;
  readonly hierarchyMode: HierarchyMode;
  readonly explicitParentMap?: Readonly<Record<string, string>>;
}

export interface GeoBoundariesManifest {
  readonly schemaVersion: typeof GEOBOUNDARIES_MANIFEST_SCHEMA_VERSION;
  /** Audit-only timestamp; it is deliberately excluded from identitySha256. */
  readonly acquiredAt: string;
  readonly layers: readonly GeoBoundariesLayerManifest[];
  readonly identitySha256: string;
}

export interface GeoBoundariesFeature {
  readonly shapeId: string;
  readonly shapeName: string;
  readonly shapeGroup: string;
  readonly shapeType: GeoBoundariesLevel;
  readonly shapeIso?: string;
  readonly geometry: GeoJsonPolygon | GeoJsonMultiPolygon;
}

export interface NormalizedGeoBoundariesLayer {
  readonly layer: GeoBoundariesLayerManifest;
  readonly features: readonly GeoBoundariesFeature[];
}
