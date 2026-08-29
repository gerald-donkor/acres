import type { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { PostgisRegionGeometryRepository } from '../postgis-region-geometry.repository';
import type { GeographySeedSummary } from './geography-scale-seed.types';

export const FIXTURE_SOURCE_PROVIDER = 'acres_synthetic_test';
export const FIXTURE_SOURCE_CODE_SYSTEM = 'grid_proof';
export const FIXTURE_SOURCE_VERSION = '2026.1';

/**
 * Seeds deterministic synthetic non-provider geography fixtures through the
 * production `PostgisRegionGeometryRepository` and updates statistics.
 */
export async function seedGeographyScale(
  prisma: PrismaClient,
  gridDimension = 10,
): Promise<GeographySeedSummary> {
  const repo = new PostgisRegionGeometryRepository(
    prisma as unknown as PrismaService,
  );

  // 1. Create or retrieve fixture RegionSource
  const source = await prisma.regionSource.upsert({
    where: {
      provider_codeSystem_sourceVersion: {
        provider: FIXTURE_SOURCE_PROVIDER,
        codeSystem: FIXTURE_SOURCE_CODE_SYSTEM,
        sourceVersion: FIXTURE_SOURCE_VERSION,
      },
    },
    create: {
      name: 'Synthetic Plan Test Grid',
      provider: FIXTURE_SOURCE_PROVIDER,
      codeSystem: FIXTURE_SOURCE_CODE_SYSTEM,
      sourceVersion: FIXTURE_SOURCE_VERSION,
      license: 'CC0-1.0',
      provenanceUrl: 'https://fixtures.local/acres/test-grid',
      redistributionNotes:
        'Synthetic deterministic spatial test fixtures only.',
    },
    update: {},
  });

  const fixtureRegionIds: string[] = [];
  let geometryCount = 0;

  // 2. Create a grid of regions and polygons
  for (let x = 0; x < gridDimension; x++) {
    for (let y = 0; y < gridDimension; y++) {
      const slug = `geo-plan-grid-${x}-${y}`;
      const region = await prisma.region.upsert({
        where: { slug },
        create: {
          slug,
          name: `Grid Region (${x}, ${y})`,
          countryCode: 'US',
          level: 'test_cell',
          regionType: 'synthetic_grid',
        },
        update: {},
      });

      fixtureRegionIds.push(region.id);

      // Create a 1x1 degree polygon cell: [x, y] to [x+1, y+1]
      const polygon = {
        type: 'Polygon' as const,
        coordinates: [
          [
            [x, y] as [number, number],
            [x + 1, y] as [number, number],
            [x + 1, y + 1] as [number, number],
            [x, y + 1] as [number, number],
            [x, y] as [number, number],
          ],
        ],
      };

      await repo.writeGeometry({
        regionId: region.id,
        sourceId: source.id,
        geometry: polygon,
        sourcePrecision: '100m',
        metadata: { gridX: x, gridY: y, cellType: 'synthetic' },
      });

      geometryCount++;
    }
  }

  // 3. Update PostgreSQL statistics
  await prisma.$executeRawUnsafe('ANALYZE "RegionSource";');
  await prisma.$executeRawUnsafe('ANALYZE "Region";');
  await prisma.$executeRawUnsafe('ANALYZE "RegionGeometry";');

  return {
    sourceCount: 1,
    regionCount: fixtureRegionIds.length,
    geometryCount,
    sourceId: source.id,
    testPoint: { longitude: 5.5, latitude: 5.5 },
    fixtureRegionIds,
  };
}

/**
 * Cleans up only the synthetic test fixtures created for plan checks.
 */
export async function cleanupGeographyScale(
  prisma: PrismaClient,
  sourceId: string,
  regionIds: readonly string[],
): Promise<void> {
  if (regionIds.length > 0) {
    // Delete geometries first (or cascading via region delete)
    await prisma.$executeRaw`
      DELETE FROM "RegionGeometry"
      WHERE "sourceId" = ${sourceId};
    `;

    await prisma.region.deleteMany({
      where: {
        id: { in: [...regionIds] },
      },
    });
  }

  await prisma.regionSource.deleteMany({
    where: {
      id: sourceId,
    },
  });
}
