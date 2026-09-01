import type { PrismaClient } from '../../generated/prisma/client';
import {
  FIXTURE_SOURCE_CODE_SYSTEM,
  FIXTURE_SOURCE_PROVIDER,
  FIXTURE_SOURCE_VERSION_PREFIX,
  cleanupGeographyScale,
  seedGeographyScale,
} from './geography-scale-seed';

describe('seedGeographyScale and cleanupGeographyScale', () => {
  it('seeds grid regions and geometries through the repository seam and cleans up', async () => {
    const mockRegionSourceCreate = jest.fn().mockResolvedValue({
      id: 'src-grid-1',
      provider: FIXTURE_SOURCE_PROVIDER,
      codeSystem: FIXTURE_SOURCE_CODE_SYSTEM,
      sourceVersion: `${FIXTURE_SOURCE_VERSION_PREFIX}-src-grid-1`,
    });
    const mockRegionSourceDeleteMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });

    const mockRegionCreate = jest
      .fn()
      .mockImplementation((args: { data: { slug: string } }) =>
        Promise.resolve({
          id: `reg-${args.data.slug}`,
          slug: args.data.slug,
          name: args.data.slug,
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
    const mockExecuteRaw = jest.fn().mockResolvedValue(4);

    const mockPrisma = {
      regionSource: {
        create: mockRegionSourceCreate,
        deleteMany: mockRegionSourceDeleteMany,
      },
      region: {
        create: mockRegionCreate,
        deleteMany: mockRegionDeleteMany,
      },
      $queryRaw: mockQueryRaw,
      $executeRaw: mockExecuteRaw,
    } as unknown as PrismaClient;

    const summary = await seedGeographyScale(mockPrisma, 2); // 2x2 = 4 cells

    expect(summary.sourceCount).toBe(1);
    expect(summary.regionCount).toBe(317);
    expect(summary.geometryCount).toBe(4);
    expect(summary.hierarchyRegionCount).toBe(313);
    expect(summary.hierarchyParentId).toContain('hierarchy-parent-0');
    expect(summary.sourceId).toBe('src-grid-1');
    const createdRegions = mockRegionCreate.mock.calls.map(
      ([args]: [{ data: Record<string, unknown> }]) => args.data,
    );
    const root = createdRegions.find((item) => item.level === 'ADM0');
    const parents = createdRegions.filter((item) => item.level === 'ADM1');
    const children = createdRegions.filter((item) => item.level === 'ADM2');
    expect(root).toBeDefined();
    expect(parents).toHaveLength(12);
    expect(children).toHaveLength(300);
    const rootId = `reg-${String(root!.slug)}`;
    expect(parents.every((item) => item.parentId === rootId)).toBe(true);
    for (const parent of parents) {
      const parentId = `reg-${String(parent.slug)}`;
      expect(
        children.filter((item) => item.parentId === parentId),
      ).toHaveLength(25);
    }

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
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const [cleanupSql, cleanupSourceId] = mockExecuteRaw.mock.calls[0] as [
      readonly string[],
      string,
    ];
    expect(cleanupSql.join(' ').replace(/\s+/g, ' ').trim()).toContain(
      'DELETE FROM "RegionGeometry" WHERE "sourceId" = ',
    );
    expect(cleanupSourceId).toBe(summary.sourceId);
  });

  it('cleans captured fixtures when seeding fails partway through', async () => {
    const sourceDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const regionDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
    const executeRaw = jest.fn().mockResolvedValue(1);
    const regionCreate = jest
      .fn()
      .mockResolvedValueOnce({ id: 'partial-root' })
      .mockRejectedValueOnce(new Error('synthetic create failure'));
    const prisma = {
      regionSource: {
        create: jest.fn().mockResolvedValue({ id: 'partial-source' }),
        deleteMany: sourceDeleteMany,
      },
      region: { create: regionCreate, deleteMany: regionDeleteMany },
      $executeRaw: executeRaw,
    } as unknown as PrismaClient;

    await expect(seedGeographyScale(prisma, 1)).rejects.toThrow(
      'synthetic create failure',
    );
    expect(regionDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['partial-root'] } },
    });
    expect(sourceDeleteMany).toHaveBeenCalledWith({
      where: { id: 'partial-source' },
    });
    const [cleanupSql, cleanupSourceId] = executeRaw.mock.calls[0] as [
      readonly string[],
      string,
    ];
    expect(cleanupSql.join(' ')).toContain('"sourceId" = ');
    expect(cleanupSourceId).toBe('partial-source');
  });
});
