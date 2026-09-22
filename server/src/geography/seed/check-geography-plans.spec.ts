import type { QueryPlanResult } from '../../analytics/seed/plan-evaluator';
import * as checkGeoPlans from './check-geography-plans';
import type { PrismaClient } from '../../generated/prisma/client';
import {
  buildGeographyPlanQueries,
  redactUrl,
  requireExpectedIndex,
} from './check-geography-plans';
import * as geoScaleSeed from './geography-scale-seed';
import type { GeographySeedSummary } from './geography-scale-seed.types';

const summary: GeographySeedSummary = {
  sourceCount: 1,
  regionCount: 413,
  geometryCount: 100,
  hierarchyRegionCount: 313,
  hierarchyParentId: '01918e95-7140-7000-8000-000000000001',
  sourceId: '01918e95-7140-7000-8000-000000000002',
  testPoint: { longitude: 5.5, latitude: 5.5 },
  fixtureRegionIds: [],
};

function result(indexesUsed: string[]): QueryPlanResult {
  return {
    queryName: 'synthetic plan',
    sql: 'SELECT 1',
    params: [],
    executionTimeMs: 1,
    planningTimeMs: 1,
    totalCost: 1,
    actualRows: 1,
    nodeTypes: ['Index Scan'],
    indexesUsed,
    buffers: { sharedHit: 1, sharedRead: 0, sharedWritten: 0 },
    passed: true,
    reasons: [],
  };
}

describe('geography plan checks', () => {
  it('defines separate bounded spatial and hierarchy queries', () => {
    const [spatial, hierarchy] = buildGeographyPlanQueries(summary);

    expect(spatial.expectedIndex).toBe('RegionGeometry_geometry_gist_idx');
    expect(spatial.params).toEqual([5.5, 5.5]);
    expect(spatial.sql).toContain('LIMIT 10');
    expect(hierarchy.expectedIndex).toBe('Region_parentId_level_idx');
    expect(hierarchy.params).toEqual([summary.hierarchyParentId, 'ADM2']);
    expect(hierarchy.sql).toContain('ORDER BY "id" ASC LIMIT 25');
    expect(hierarchy.sql).not.toContain('SELECT *');
  });

  it('fails either query when its exact expected index is absent', () => {
    for (const query of buildGeographyPlanQueries(summary)) {
      const failed = requireExpectedIndex(result([]), query);
      expect(failed.passed).toBe(false);
      expect(failed.reasons).toContain(query.missingIndexReason);

      const passed = requireExpectedIndex(result([query.expectedIndex]), query);
      expect(passed.passed).toBe(true);
      expect(passed.reasons).toEqual([]);
    }
  });

  it('redacts database passwords without hiding the target database', () => {
    const redacted = redactUrl(
      'postgresql://acres_test:do-not-print@localhost:5432/acres_test?schema=public',
    );
    expect(redacted).not.toContain('do-not-print');
    expect(redacted).toContain('acres_test');
    expect(redacted).toContain('***');
  });

  describe('runGeographyPlanChecks', () => {
    it('throws descriptive error when database is not reachable', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockRejectedValue(new Error('Connection refused')),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        checkGeoPlans.runGeographyPlanChecks({
          prisma: mockPrisma as unknown as PrismaClient,
          connectionString:
            'postgresql://acres_test:secret@localhost:5432/acres_test',
        }),
      ).rejects.toThrow(
        /Database is not reachable at postgresql:\/\/acres_test:\*\*\*@localhost:5432\/acres_test/,
      );
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });

    it('throws descriptive error when RegionGeometry table is missing', async () => {
      let callCount = 0;
      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve([{ '?column?': 1 }]);
          throw new Error('relation "RegionGeometry" does not exist');
        }),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        checkGeoPlans.runGeographyPlanChecks({
          prisma: mockPrisma as unknown as PrismaClient,
          connectionString:
            'postgresql://acres_test:secret@localhost:5432/acres_test',
        }),
      ).rejects.toThrow(/RegionGeometry table missing or unmigrated/);
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });

    it('seeds scale data, analyzes tables, evaluates query plans, and cleans up on success', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
        $queryRawUnsafe: jest.fn().mockImplementation((sql: string) => {
          const indexName = sql.includes('RegionGeometry')
            ? 'RegionGeometry_geometry_gist_idx'
            : 'Region_parentId_level_idx';
          return Promise.resolve([
            {
              'QUERY PLAN': [
                {
                  Plan: {
                    'Node Type': 'Index Scan',
                    'Index Name': indexName,
                    'Actual Rows': 5,
                    'Total Cost': 10.0,
                    'Shared Hit Blocks': 2,
                    'Shared Read Blocks': 0,
                    'Shared Written Blocks': 0,
                  },
                  Planning: { 'Planning Time': 1.0 },
                  Execution: { 'Execution Time': 2.0 },
                },
              ],
            },
          ]);
        }),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };

      const seedSpy = jest
        .spyOn(geoScaleSeed, 'seedGeographyScale')
        .mockResolvedValue(summary);
      const cleanSpy = jest
        .spyOn(geoScaleSeed, 'cleanupGeographyScale')
        .mockResolvedValue(undefined);

      const outcome = await checkGeoPlans.runGeographyPlanChecks({
        prisma: mockPrisma as unknown as PrismaClient,
        connectionString:
          'postgresql://acres_test:pass@localhost:5432/acres_test',
      });

      expect(outcome.passed).toBe(true);
      expect(outcome.results).toHaveLength(2);
      expect(outcome.report).toContain(
        'Acres PostGIS Geography Query Plan Evidence Report',
      );
      expect(seedSpy).toHaveBeenCalled();
      expect(cleanSpy).toHaveBeenCalledWith(
        mockPrisma,
        summary.sourceId,
        summary.fixtureRegionIds,
      );
      expect(mockPrisma.$executeRawUnsafe.mock.calls).toEqual([
        ['ANALYZE "RegionGeometry"'],
        ['ANALYZE "Region"'],
      ]);
      const explainCalls = mockPrisma.$queryRawUnsafe.mock
        .calls as unknown as Array<[string, ...unknown[]]>;
      expect(explainCalls).toEqual(
        checkGeoPlans
          .buildGeographyPlanQueries(summary)
          .map((query) => [
            `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
            ...query.params,
          ]),
      );
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });
  });

  describe('main', () => {
    const originalEnv = { ...process.env };
    let exitSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
      process.env = { ...originalEnv };
      exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      process.env = { ...originalEnv };
      jest.restoreAllMocks();
    });

    it('rejects execution when environment is not test mode or database is not test db', async () => {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/production_db';
      delete process.env.ACRES_ALLOW_TEST_SEED;

      await expect(checkGeoPlans.main()).rejects.toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'check-geography-plans must be run in test mode',
        ),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('logs report when plan checks pass', async () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/acres_test';

      jest.spyOn(checkGeoPlans.geographyPlanRunner, 'run').mockResolvedValue({
        summary,
        results: [],
        passed: true,
        report: 'Plan report: all checks passed',
      });

      await expect(checkGeoPlans.main()).resolves.toBeUndefined();
      expect(logSpy).toHaveBeenCalledWith('Plan report: all checks passed');
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('exits with 1 when plan checks fail regression guards', async () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/acres_test';

      jest.spyOn(checkGeoPlans.geographyPlanRunner, 'run').mockResolvedValue({
        summary,
        results: [],
        passed: false,
        report: 'Plan report: checks failed',
      });

      await expect(checkGeoPlans.main()).rejects.toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Query plan check failed regression guards.'),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('catches and logs errors thrown during check run', async () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/acres_test';

      jest
        .spyOn(checkGeoPlans.geographyPlanRunner, 'run')
        .mockRejectedValue(new Error('Database explosion'));

      await expect(checkGeoPlans.main()).rejects.toThrow('process.exit called');
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Plan check encountered error:'),
        'Database explosion',
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
