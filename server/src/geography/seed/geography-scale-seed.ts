import type { PrismaClient } from '../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { uuidV7 } from '../../common/ids';
import { PostgisRegionGeometryRepository } from '../postgis-region-geometry.repository';
import type { GeographySeedSummary } from './geography-scale-seed.types';

export const FIXTURE_SOURCE_PROVIDER = 'acres_synthetic_test';
export const FIXTURE_SOURCE_CODE_SYSTEM = 'grid_proof';
export const FIXTURE_SOURCE_VERSION_PREFIX = '2026.1';

/**
 * Seeds deterministic synthetic non-provider geography fixtures through the
 * production `PostgisRegionGeometryRepository` for measured plan checks.
 */
export async function seedGeographyScale(
  prisma: PrismaClient,
  gridDimension = 10,
): Promise<GeographySeedSummary> {
  const repo = new PostgisRegionGeometryRepository(
    prisma as unknown as PrismaService,
  );

  const sourceId = uuidV7();
  const runSlug = sourceId.replaceAll('-', '');
  const fixtureRegionIds: string[] = [];

  const source = await prisma.regionSource.create({
    data: {
      id: sourceId,
      name: 'Synthetic Plan Test Grid',
      provider: FIXTURE_SOURCE_PROVIDER,
      codeSystem: FIXTURE_SOURCE_CODE_SYSTEM,
      sourceVersion: `${FIXTURE_SOURCE_VERSION_PREFIX}-${sourceId}`,
      license: 'CC0-1.0',
      provenanceUrl: 'https://fixtures.local/acres/test-grid',
      redistributionNotes:
        'Synthetic deterministic spatial test fixtures only.',
    },
  });

  try {
    let geometryCount = 0;
    const hierarchyRoot = await prisma.region.create({
      data: {
        slug: `geo-plan-${runSlug}-hierarchy-root`,
        name: 'Synthetic hierarchy root',
        countryCode: 'ZZ',
        level: 'ADM0',
        regionType: 'synthetic',
      },
    });
    fixtureRegionIds.push(hierarchyRoot.id);
    let hierarchyParentId = '';
    let hierarchyRegionCount = 1;
    for (let parent = 0; parent < 12; parent++) {
      const parentRegion = await prisma.region.create({
        data: {
          slug: `geo-plan-${runSlug}-hierarchy-parent-${parent}`,
          name: `Synthetic hierarchy parent ${parent}`,
          countryCode: 'ZZ',
          level: 'ADM1',
          regionType: 'synthetic',
          parentId: hierarchyRoot.id,
        },
      });
      fixtureRegionIds.push(parentRegion.id);
      if (parent === 0) hierarchyParentId = parentRegion.id;
      hierarchyRegionCount++;
      for (let child = 0; child < 25; child++) {
        const childRegion = await prisma.region.create({
          data: {
            slug: `geo-plan-${runSlug}-hierarchy-child-${parent}-${child}`,
            name: `Synthetic hierarchy child ${parent}-${child}`,
            countryCode: 'ZZ',
            level: 'ADM2',
            regionType: 'synthetic',
            parentId: parentRegion.id,
          },
        });
        fixtureRegionIds.push(childRegion.id);
        hierarchyRegionCount++;
      }
    }

    // 2. Create a grid of regions and polygons
    for (let x = 0; x < gridDimension; x++) {
      for (let y = 0; y < gridDimension; y++) {
        const slug = `geo-plan-${runSlug}-grid-${x}-${y}`;
        const region = await prisma.region.create({
          data: {
            slug,
            name: `Grid Region (${x}, ${y})`,
            countryCode: 'US',
            level: 'test_cell',
            regionType: 'synthetic_grid',
          },
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

    return {
      sourceCount: 1,
      regionCount: fixtureRegionIds.length,
      geometryCount,
      hierarchyRegionCount,
      hierarchyParentId,
      sourceId: source.id,
      testPoint: { longitude: 5.5, latitude: 5.5 },
      fixtureRegionIds,
    };
  } catch (error) {
    try {
      await cleanupGeographyScale(prisma, source.id, fixtureRegionIds);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Geography scale seed failed and its captured fixtures could not be cleaned up.',
      );
    }
    throw error;
  }
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
