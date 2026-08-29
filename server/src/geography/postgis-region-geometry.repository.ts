import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { uuidV7 } from '../common/ids';
import {
  DEFAULT_SPATIAL_SEARCH_LIMIT,
  MAX_SPATIAL_SEARCH_LIMIT,
  type PointIntersectionQuery,
  type RegionGeometryRecord,
  type WriteRegionGeometryInput,
} from './geography.types';
import { GeometryError } from './geometry.errors';
import { ID_REGEX, validateGeometryInput } from './geometry-validator';

interface RegionGeometryRow {
  id: string;
  regionId: string;
  sourceId: string;
  srid: number;
  geometryType: string;
  isValid: boolean;
  sourcePrecision: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toRegionGeometryRecord(row: RegionGeometryRow): RegionGeometryRecord {
  let parsedMetadata: Record<string, unknown> | null = null;
  if (
    row.metadata &&
    typeof row.metadata === 'object' &&
    !Array.isArray(row.metadata)
  ) {
    parsedMetadata = row.metadata as Record<string, unknown>;
  } else if (typeof row.metadata === 'string') {
    try {
      const parsed: unknown = JSON.parse(row.metadata);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedMetadata = parsed as Record<string, unknown>;
      }
    } catch {
      parsedMetadata = null;
    }
  }

  return {
    id: row.id,
    regionId: row.regionId,
    sourceId: row.sourceId,
    srid: row.srid,
    geometryType: row.geometryType,
    isValid: Boolean(row.isValid),
    sourcePrecision: row.sourcePrecision,
    metadata: parsedMetadata,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
  };
}

function isForeignKeyError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    if ('code' in error && (error as { code?: string }).code === 'P2003') {
      return true;
    }
    if ('code' in error && (error as { code?: string }).code === '23503') {
      return true;
    }
    const message = (error as { message?: string }).message;
    if (
      typeof message === 'string' &&
      /foreign key constraint|violates foreign key/i.test(message)
    ) {
      return true;
    }
  }
  return false;
}

export type DbClient = PrismaService | PrismaClient | Prisma.TransactionClient;

@Injectable()
export class PostgisRegionGeometryRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists validated SRID-4326 geometry with database-enforced topological validity.
   *
   * Rejects invalid/self-intersecting geometries without modifying or snapping coordinates.
   * Atomic: failed validation writes zero rows and alters no related entities.
   */
  async writeGeometry(
    input: WriteRegionGeometryInput,
    txClient?: Prisma.TransactionClient | PrismaService,
  ): Promise<RegionGeometryRecord> {
    // 1. Authoritative prevalidation before any SQL execution
    const validated = validateGeometryInput(input);

    const client = txClient ?? this.prisma;
    const rowId = uuidV7();
    const metadataJson =
      input.metadata !== undefined && input.metadata !== null
        ? JSON.stringify(input.metadata)
        : null;

    try {
      const rows = await client.$queryRaw<RegionGeometryRow[]>`
        WITH validated AS (
          SELECT
            ST_SetSRID(ST_GeomFromGeoJSON(CAST(${validated.geoJsonString} AS json)), 4326) AS geom
        ),
        evaluated AS (
          SELECT
            v.geom,
            ST_IsValid(v.geom) AS is_valid,
            ST_IsEmpty(v.geom) AS is_empty,
            ST_GeometryType(v.geom) AS geom_type,
            ST_SRID(v.geom) AS srid
          FROM validated v
        )
        INSERT INTO "RegionGeometry" (
          "id",
          "regionId",
          "sourceId",
          "srid",
          "geometryType",
          "geometry",
          "isValid",
          "sourcePrecision",
          "metadata",
          "createdAt",
          "updatedAt"
        )
        SELECT
          ${rowId},
          ${input.regionId},
          ${input.sourceId},
          4326,
          ${validated.geometryType},
          e.geom,
          e.is_valid,
          ${input.sourcePrecision ?? null},
          CAST(${metadataJson} AS jsonb),
          now(),
          now()
        FROM evaluated e
        WHERE e.is_valid = true
          AND e.is_empty = false
          AND e.srid = 4326
          AND UPPER(e.geom_type) = UPPER(${'ST_' + validated.geometryType})
        ON CONFLICT ("regionId", "sourceId") DO UPDATE SET
          "geometryType" = EXCLUDED."geometryType",
          "geometry" = EXCLUDED."geometry",
          "isValid" = EXCLUDED."isValid",
          "sourcePrecision" = EXCLUDED."sourcePrecision",
          "metadata" = EXCLUDED."metadata",
          "updatedAt" = now()
        RETURNING
          "id",
          "regionId",
          "sourceId",
          "srid",
          "geometryType",
          "isValid",
          "sourcePrecision",
          "metadata",
          "createdAt",
          "updatedAt";
      `;

      const firstRow = rows?.[0];
      if (!firstRow) {
        throw GeometryError.invalid(
          'Geometry was rejected by PostGIS topological validity checks (e.g. self-intersecting polygon, empty geometry, or type mismatch).',
        );
      }

      return toRegionGeometryRecord(firstRow);
    } catch (error) {
      if (error instanceof GeometryError) {
        throw error;
      }
      if (isForeignKeyError(error)) {
        throw GeometryError.referenceNotFound(
          'Referenced region or region source does not exist.',
        );
      }
      throw error;
    }
  }

  /**
   * Internal bounded spatial point-in-region lookup using the GiST index.
   *
   * Edge-boundary semantics: ST_Intersects includes both interior points and
   * boundary/edge points of the geometry.
   */
  async findRegionsContainingPoint(
    query: PointIntersectionQuery,
    txClient?: Prisma.TransactionClient | PrismaService,
  ): Promise<RegionGeometryRecord[]> {
    if (
      typeof query.longitude !== 'number' ||
      !Number.isFinite(query.longitude) ||
      query.longitude < -180 ||
      query.longitude > 180
    ) {
      throw GeometryError.invalid(
        'Longitude must be a finite number between -180 and 180.',
      );
    }
    if (
      typeof query.latitude !== 'number' ||
      !Number.isFinite(query.latitude) ||
      query.latitude < -90 ||
      query.latitude > 90
    ) {
      throw GeometryError.invalid(
        'Latitude must be a finite number between -90 and 90.',
      );
    }

    const limit = Math.max(
      1,
      Math.min(
        MAX_SPATIAL_SEARCH_LIMIT,
        Math.floor(query.limit ?? DEFAULT_SPATIAL_SEARCH_LIMIT),
      ),
    );

    const client = txClient ?? this.prisma;

    const rows = await client.$queryRaw<RegionGeometryRow[]>`
      WITH pt AS (
        SELECT ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326) AS geom
      )
      SELECT
        rg."id",
        rg."regionId",
        rg."sourceId",
        rg."srid",
        rg."geometryType",
        rg."isValid",
        rg."sourcePrecision",
        rg."metadata",
        rg."createdAt",
        rg."updatedAt"
      FROM "RegionGeometry" rg, pt
      WHERE rg."geometry" && pt.geom
        AND ST_Intersects(rg."geometry", pt.geom)
      ORDER BY rg."id" ASC
      LIMIT ${limit};
    `;

    return rows.map(toRegionGeometryRecord);
  }

  /**
   * Reads a geometry record by (regionId, sourceId).
   */
  async findByRegionAndSource(
    regionId: string,
    sourceId: string,
    txClient?: Prisma.TransactionClient | PrismaService,
  ): Promise<RegionGeometryRecord | null> {
    if (
      !regionId ||
      !sourceId ||
      !ID_REGEX.test(regionId) ||
      !ID_REGEX.test(sourceId)
    ) {
      return null;
    }

    const client = txClient ?? this.prisma;

    const rows = await client.$queryRaw<RegionGeometryRow[]>`
      SELECT
        rg."id",
        rg."regionId",
        rg."sourceId",
        rg."srid",
        rg."geometryType",
        rg."isValid",
        rg."sourcePrecision",
        rg."metadata",
        rg."createdAt",
        rg."updatedAt"
      FROM "RegionGeometry" rg
      WHERE rg."regionId" = ${regionId}
        AND rg."sourceId" = ${sourceId}
      LIMIT 1;
    `;

    const firstRow = rows[0];
    return firstRow ? toRegionGeometryRecord(firstRow) : null;
  }

  /**
   * Deletes a geometry record by (regionId, sourceId).
   */
  async deleteByRegionAndSource(
    regionId: string,
    sourceId: string,
    txClient?: Prisma.TransactionClient | PrismaService,
  ): Promise<boolean> {
    if (
      !regionId ||
      !sourceId ||
      !ID_REGEX.test(regionId) ||
      !ID_REGEX.test(sourceId)
    ) {
      return false;
    }

    const client = txClient ?? this.prisma;

    const count = await client.$executeRaw`
      DELETE FROM "RegionGeometry"
      WHERE "regionId" = ${regionId}
        AND "sourceId" = ${sourceId};
    `;

    return count > 0;
  }
}
