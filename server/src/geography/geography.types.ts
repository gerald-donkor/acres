/**
 * Internal geography and geometry type definitions and safety bounds.
 *
 * This boundary is administrative and internal only. It is not exposed to
 * public REST/GraphQL controllers, browser clients, or external callers.
 */

export const GEOMETRY_MAX_COORDINATES = 100_000;
export const GEOMETRY_MAX_DEPTH = 6;
export const GEOMETRY_MAX_METADATA_BYTES = 65_536; // 64 KB
export const GEOMETRY_MAX_SOURCE_PRECISION_CHARS = 100;
export const GEOMETRY_MAX_JSON_BYTES = 10 * 1024 * 1024; // 10 MB

export const DEFAULT_SPATIAL_SEARCH_LIMIT = 10;
export const MAX_SPATIAL_SEARCH_LIMIT = 50;

export type SupportedGeometryType =
  | 'Point'
  | 'MultiPoint'
  | 'LineString'
  | 'MultiLineString'
  | 'Polygon'
  | 'MultiPolygon';

export type Position2D = readonly [longitude: number, latitude: number];

export interface GeoJsonPoint {
  readonly type: 'Point';
  readonly coordinates: Position2D;
}

export interface GeoJsonMultiPoint {
  readonly type: 'MultiPoint';
  readonly coordinates: readonly Position2D[];
}

export interface GeoJsonLineString {
  readonly type: 'LineString';
  readonly coordinates: readonly Position2D[];
}

export interface GeoJsonMultiLineString {
  readonly type: 'MultiLineString';
  readonly coordinates: readonly (readonly Position2D[])[];
}

export interface GeoJsonPolygon {
  readonly type: 'Polygon';
  readonly coordinates: readonly (readonly Position2D[])[];
}

export interface GeoJsonMultiPolygon {
  readonly type: 'MultiPolygon';
  readonly coordinates: readonly (readonly (readonly Position2D[])[])[];
}

export type GeoJsonGeometry =
  | GeoJsonPoint
  | GeoJsonMultiPoint
  | GeoJsonLineString
  | GeoJsonMultiLineString
  | GeoJsonPolygon
  | GeoJsonMultiPolygon;

export interface WriteRegionGeometryInput {
  readonly regionId: string;
  readonly sourceId: string;
  readonly geometry: GeoJsonGeometry;
  readonly sourcePrecision?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface PointIntersectionQuery {
  readonly longitude: number;
  readonly latitude: number;
  readonly limit?: number;
}

export interface RegionGeometryRecord {
  readonly id: string;
  readonly regionId: string;
  readonly sourceId: string;
  readonly srid: number;
  readonly geometryType: string;
  readonly isValid: boolean;
  readonly sourcePrecision: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ValidatedGeometry {
  readonly geometryType: SupportedGeometryType;
  readonly coordinateCount: number;
  readonly geoJsonString: string;
  readonly normalizedGeometry: GeoJsonGeometry;
}
