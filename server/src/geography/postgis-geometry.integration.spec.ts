import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { PostgisRegionGeometryRepository } from './postgis-region-geometry.repository';
import { GeometryError } from './geometry.errors';
import type {
  GeoJsonMultiPolygon,
  GeoJsonPoint,
  GeoJsonPolygon,
} from './geography.types';

const TEST_DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://acres_test:acres_test_dev_password@localhost:5432/acres_test?schema=public';

describe('PostGIS Region Geometry — real database integration', () => {
  let prisma: PrismaClient | undefined;
  let repository: PostgisRegionGeometryRepository;
  let isDbAvailable = false;

  const testSource = {
    provider: 'acres_integration_test',
    codeSystem: 'postgis_proof',
    sourceVersion: 'v1',
    name: 'PostGIS Integration Test Source',
  };

  let sourceId = '';
  let region1Id = '';
  let region2Id = '';

  beforeAll(async () => {
    try {
      prisma = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: TEST_DB_URL,
          connectionTimeoutMillis: 1000,
        }),
      });

      await prisma.$queryRaw`SELECT 1`;
      isDbAvailable = true;
      repository = new PostgisRegionGeometryRepository(
        prisma as unknown as PrismaService,
      );

      // Create test source and regions
      const source = await prisma.regionSource.upsert({
        where: {
          provider_codeSystem_sourceVersion: {
            provider: testSource.provider,
            codeSystem: testSource.codeSystem,
            sourceVersion: testSource.sourceVersion,
          },
        },
        create: testSource,
        update: {},
      });
      sourceId = source.id;

      const r1 = await prisma.region.upsert({
        where: { slug: 'postgis-int-reg-1' },
        create: {
          slug: 'postgis-int-reg-1',
          name: 'PostGIS Test Region 1',
          countryCode: 'US',
        },
        update: {},
      });
      region1Id = r1.id;

      const r2 = await prisma.region.upsert({
        where: { slug: 'postgis-int-reg-2' },
        create: {
          slug: 'postgis-int-reg-2',
          name: 'PostGIS Test Region 2',
          countryCode: 'US',
        },
        update: {},
      });
      region2Id = r2.id;
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma && sourceId) {
      try {
        await prisma.$executeRaw`
          DELETE FROM "RegionGeometry"
          WHERE "sourceId" = ${sourceId};
        `;
        await prisma.region.deleteMany({
          where: { id: { in: [region1Id, region2Id] } },
        });
        await prisma.regionSource.deleteMany({
          where: { id: sourceId },
        });
      } catch {
        // Cleanup best-effort
      }
      await prisma.$disconnect();
    }
  });

  const conditionalIt = (name: string, fn: () => Promise<void>) => {
    it(name, async () => {
      if (!isDbAvailable) {
        console.warn(
          `Skipping real PostGIS integration test "${name}": acres_test database not available.`,
        );
        return;
      }
      await fn();
    });
  };

  conditionalIt(
    'persists valid SRID-4326 Polygon and verifies isValid=true',
    async () => {
      const polygon: GeoJsonPolygon = {
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

      const record = await repository.writeGeometry({
        regionId: region1Id,
        sourceId,
        geometry: polygon,
        sourcePrecision: '10m',
        metadata: { classification: 'test_poly' },
      });

      expect(record.id).toBeDefined();
      expect(record.regionId).toBe(region1Id);
      expect(record.sourceId).toBe(sourceId);
      expect(record.srid).toBe(4326);
      expect(record.geometryType).toBe('Polygon');
      expect(record.isValid).toBe(true);
      expect(record.metadata).toEqual({ classification: 'test_poly' });

      // Verify persisted record in DB
      const fetched = await repository.findByRegionAndSource(
        region1Id,
        sourceId,
      );
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(record.id);
      expect(fetched?.isValid).toBe(true);
    },
  );

  conditionalIt('persists valid Point and MultiPolygon', async () => {
    const point: GeoJsonPoint = {
      type: 'Point',
      coordinates: [-122.4194, 37.7749],
    };

    const ptRecord = await repository.writeGeometry({
      regionId: region2Id,
      sourceId,
      geometry: point,
    });

    expect(ptRecord.geometryType).toBe('Point');
    expect(ptRecord.isValid).toBe(true);

    const multiPoly: GeoJsonMultiPolygon = {
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

    // Upsert into region2Id
    const mpRecord = await repository.writeGeometry({
      regionId: region2Id,
      sourceId,
      geometry: multiPoly,
    });

    expect(mpRecord.geometryType).toBe('MultiPolygon');
    expect(mpRecord.isValid).toBe(true);
  });

  conditionalIt(
    'rejects bow-tie self-intersecting polygon in PostGIS and writes zero rows',
    async () => {
      // A bow-tie polygon passes structural closed-ring prevalidation, but fails PostGIS ST_IsValid
      const bowTie: GeoJsonPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 2],
            [2, 0],
            [0, 2],
            [0, 0],
          ],
        ],
      };

      const countBefore = await prisma!.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "RegionGeometry" WHERE "regionId" = ${region1Id} AND "sourceId" = ${sourceId};
    `;

      await expect(
        repository.writeGeometry({
          regionId: region1Id,
          sourceId,
          geometry: bowTie,
        }),
      ).rejects.toThrow(GeometryError);

      // Assert zero rows were modified or created
      const countAfter = await prisma!.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "RegionGeometry" WHERE "regionId" = ${region1Id} AND "sourceId" = ${sourceId};
    `;

      expect(countAfter[0]?.count).toEqual(countBefore[0]?.count);
    },
  );

  conditionalIt(
    'rejects write with non-existent foreign keys and maps to REFERENCE_NOT_FOUND',
    async () => {
      const polygon: GeoJsonPolygon = {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ],
        ],
      };

      await expect(
        repository.writeGeometry({
          regionId: '01918e95-7140-7000-8000-000000000999', // non-existent region
          sourceId,
          geometry: polygon,
        }),
      ).rejects.toMatchObject({
        code: 'REFERENCE_NOT_FOUND',
      });
    },
  );

  conditionalIt(
    'proves inside, edge, and outside point-in-region lookup semantics',
    async () => {
      // Write a defined 0..10 polygon for region 1
      await repository.writeGeometry({
        regionId: region1Id,
        sourceId,
        geometry: {
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
        },
      });

      // 1. Strictly inside: (5, 5) -> must find region1
      const inside = await repository.findRegionsContainingPoint({
        longitude: 5,
        latitude: 5,
      });
      expect(inside.some((r) => r.regionId === region1Id)).toBe(true);

      // 2. On edge/boundary: (0, 5) -> must find region1 (ST_Intersects semantics)
      const onEdge = await repository.findRegionsContainingPoint({
        longitude: 0,
        latitude: 5,
      });
      expect(onEdge.some((r) => r.regionId === region1Id)).toBe(true);

      // 3. Strictly outside: (15, 15) -> must NOT find region1
      const outside = await repository.findRegionsContainingPoint({
        longitude: 15,
        latitude: 15,
      });
      expect(outside.some((r) => r.regionId === region1Id)).toBe(false);
    },
  );
});
