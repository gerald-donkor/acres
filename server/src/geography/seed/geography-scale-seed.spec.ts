import type { PrismaClient } from '../../generated/prisma/client';
import {
  FIXTURE_SOURCE_CODE_SYSTEM,
  FIXTURE_SOURCE_PROVIDER,
  FIXTURE_SOURCE_VERSION,
  cleanupGeographyScale,
  seedGeographyScale,
} from './geography-scale-seed';

describe('seedGeographyScale and cleanupGeographyScale', () => {
  it('seeds grid regions and geometries through the repository seam and cleans up', async () => {
    const mockRegionSourceUpsert = jest.fn().mockResolvedValue({
      id: 'src-grid-1',
      provider: FIXTURE_SOURCE_PROVIDER,
      codeSystem: FIXTURE_SOURCE_CODE_SYSTEM,
      sourceVersion: FIXTURE_SOURCE_VERSION,
    });
    const mockRegionSourceDeleteMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });

    const mockRegionUpsert = jest
      .fn()
      .mockImplementation((args: { where: { slug: string } }) =>
        Promise.resolve({
          id: `reg-${args.where.slug}`,
          slug: args.where.slug,
          name: args.where.slug,
        }),
      );
    const mockRegionDeleteMany = jest.fn().mockResolvedValue({ count: 4 });

    const mockQueryRaw = jest.fn().mockResolvedValue([
      {
        id: 'geom-1',
        regionId: 'reg-geo-plan-grid-0-0',
        sourceId: 'src-grid-1',
        srid: 4326,
        geometryType: 'Polygon',
        isValid: true,
        sourcePrecision: '100m',
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const mockExecuteRawUnsafe = jest.fn().mockResolvedValue(0);
    const mockExecuteRaw = jest.fn().mockResolvedValue(4);

    const mockPrisma = {
      regionSource: {
        upsert: mockRegionSourceUpsert,
        deleteMany: mockRegionSourceDeleteMany,
      },
      region: {
        upsert: mockRegionUpsert,
        deleteMany: mockRegionDeleteMany,
      },
      $queryRaw: mockQueryRaw,
      $executeRawUnsafe: mockExecuteRawUnsafe,
      $executeRaw: mockExecuteRaw,
    } as unknown as PrismaClient;

    const summary = await seedGeographyScale(mockPrisma, 2); // 2x2 = 4 cells

    expect(summary.sourceCount).toBe(1);
    expect(summary.regionCount).toBe(4);
    expect(summary.geometryCount).toBe(4);
    expect(summary.sourceId).toBe('src-grid-1');
    expect(mockExecuteRawUnsafe).toHaveBeenCalledWith(
      'ANALYZE "RegionGeometry";',
    );

    // Cleanup
    await cleanupGeographyScale(
      mockPrisma,
      summary.sourceId,
      summary.fixtureRegionIds,
    );

    expect(mockRegionDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: summary.fixtureRegionIds } },
    });
    expect(mockRegionSourceDeleteMany).toHaveBeenCalledWith({
      where: { id: summary.sourceId },
    });
  });
});
