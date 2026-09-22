import * as checkAnalyticsPlans from './check-analytics-plans';
import { buildAnalyticsPlanQueries, redactUrl } from './check-analytics-plans';
import * as analyticsScaleSeed from './analytics-scale-seed';
import type { SeedSummary } from './analytics-scale-seed.types';
import type { PrismaClient } from '../../generated/prisma/client';

const sampleIds: SeedSummary['sampleIds'] = {
  primaryOrgId: '01918e95-7140-7000-8000-000000000001',
  secondaryOrgId: '01918e95-7140-7000-8000-000000000002',
  primaryAccountId: '01918e95-7140-7000-8000-000000000003',
  secondaryAccountId: '01918e95-7140-7000-8000-000000000004',
  metricId: '01918e95-7140-7000-8000-000000000005',
  regionId: '01918e95-7140-7000-8000-000000000006',
  datasetVersionId: '01918e95-7140-7000-8000-000000000007',
  dimensionHash:
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  periodStart: new Date('2026-01-01T00:00:00.000Z'),
  periodEnd: new Date('2026-03-31T23:59:59.999Z'),
  aggregateId: '01918e95-7140-7000-8000-000000000008',
  viewId: '01918e95-7140-7000-8000-000000000009',
};

describe('check-analytics-plans', () => {
  describe('redactUrl', () => {
    it('redacts password from a standard database connection URI', () => {
      const url =
        'postgresql://acres_user:super_secret_password@db.example.com:5432/acres_prod?sslmode=require';
      const redacted = redactUrl(url);
      expect(redacted).not.toContain('super_secret_password');
      expect(redacted).toContain('acres_user:***@');
    });

    it('leaves URIs without credentials unchanged', () => {
      const url = 'postgresql://localhost:5432/acres_test';
      expect(redactUrl(url)).toBe('postgresql://localhost:5432/acres_test');
    });

    it('falls back to regex redaction when URL parsing throws', () => {
      const malformed = 'not-a-valid-url://user:secret@host:invalid-port';
      const redacted = redactUrl(malformed);
      expect(redacted).not.toContain('secret');
      expect(redacted).toContain('user:***@');
    });
  });

  describe('buildAnalyticsPlanQueries', () => {
    it('builds exactly the 6 canonical benchmark queries', () => {
      const queries = buildAnalyticsPlanQueries(sampleIds);
      expect(queries).toHaveLength(6);
      expect(queries.map((q) => q.name)).toEqual([
        'findMetrics',
        'findAggregates (filtered)',
        'findObservations (filtered)',
        'findAggregateEvidence (lineage)',
        'listDashboardViews',
        'dashboardSummary (aggregates)',
      ]);
    });

    it('configures bounded findMetrics query with organization parameter', () => {
      const queries = buildAnalyticsPlanQueries(sampleIds);
      const metricsQuery = queries.find((q) => q.name === 'findMetrics')!;

      expect(metricsQuery.params).toEqual([sampleIds.primaryOrgId]);
      expect(metricsQuery.sql).toContain('FROM "MetricDefinition"');
      expect(metricsQuery.sql).toContain('WHERE "organizationId" = $1');
      expect(metricsQuery.sql).toContain("status\" = 'active'");
      expect(metricsQuery.sql).toContain('LIMIT 100');
    });

    it('configures filtered aggregate and observation queries with composite index parameters', () => {
      const queries = buildAnalyticsPlanQueries(sampleIds);
      const aggregateQuery = queries.find(
        (q) => q.name === 'findAggregates (filtered)',
      )!;
      const observationQuery = queries.find(
        (q) => q.name === 'findObservations (filtered)',
      )!;

      const expectedParams = [
        sampleIds.primaryOrgId,
        sampleIds.metricId,
        sampleIds.regionId,
        sampleIds.datasetVersionId,
        sampleIds.dimensionHash,
        sampleIds.periodStart,
        sampleIds.periodEnd,
      ];

      expect(aggregateQuery.params).toEqual(expectedParams);
      expect(aggregateQuery.sql).toContain('FROM "MetricAggregate"');
      expect(aggregateQuery.sql).toContain('LIMIT 50');

      expect(observationQuery.params).toEqual(expectedParams);
      expect(observationQuery.sql).toContain('FROM "MetricObservation"');
      expect(observationQuery.sql).toContain('LIMIT 50');
    });

    it('configures lineage, dashboard views, and dashboard summary queries', () => {
      const queries = buildAnalyticsPlanQueries(sampleIds);
      const lineageQuery = queries.find(
        (q) => q.name === 'findAggregateEvidence (lineage)',
      )!;
      const viewsQuery = queries.find((q) => q.name === 'listDashboardViews')!;
      const summaryQuery = queries.find(
        (q) => q.name === 'dashboardSummary (aggregates)',
      )!;

      expect(lineageQuery.params).toEqual([
        sampleIds.primaryOrgId,
        sampleIds.aggregateId,
      ]);
      expect(lineageQuery.sql).toContain('FROM "MetricAggregateLineage"');
      expect(lineageQuery.sql).toContain('LIMIT 200');

      expect(viewsQuery.params).toEqual([sampleIds.primaryOrgId]);
      expect(viewsQuery.sql).toContain('FROM "DashboardView"');
      expect(viewsQuery.sql).toContain('LIMIT 50');

      expect(summaryQuery.params).toEqual([sampleIds.primaryOrgId]);
      expect(summaryQuery.sql).toContain('FROM "MetricAggregate"');
      expect(summaryQuery.sql).toContain('LIMIT 24');
      expect(summaryQuery.thresholds).toEqual({
        disallowSeqScanOnTables: [],
      });
    });
  });

  describe('runAnalyticsPlanChecks', () => {
    it('throws descriptive error when database is not reachable', async () => {
      const mockPrisma = {
        $queryRaw: jest.fn().mockRejectedValue(new Error('Connection refused')),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        checkAnalyticsPlans.runAnalyticsPlanChecks({
          prisma: mockPrisma as unknown as PrismaClient,
          connectionString:
            'postgresql://acres_test:secret@localhost:5432/acres_test',
        }),
      ).rejects.toThrow(
        /Database is not reachable at postgresql:\/\/acres_test:\*\*\*@localhost:5432\/acres_test/,
      );
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });

    it('throws descriptive error when MetricAggregate table is missing', async () => {
      let callCount = 0;
      const mockPrisma = {
        $queryRaw: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve([{ '?column?': 1 }]);
          throw new Error('relation "MetricAggregate" does not exist');
        }),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };

      await expect(
        checkAnalyticsPlans.runAnalyticsPlanChecks({
          prisma: mockPrisma as unknown as PrismaClient,
          connectionString:
            'postgresql://acres_test:secret@localhost:5432/acres_test',
        }),
      ).rejects.toThrow(/Analytics tables missing or unmigrated at/);
      expect(mockPrisma.$disconnect).toHaveBeenCalled();
    });

    it('seeds scale data, analyzes tables, benchmarks plans inside transaction, and formats report', async () => {
      const mockTx = {
        $executeRaw: jest.fn().mockResolvedValue(0),
        $queryRawUnsafe: jest.fn().mockResolvedValue([
          {
            'QUERY PLAN': [
              {
                Plan: {
                  'Node Type': 'Index Scan',
                  'Index Name': 'MetricAggregate_org_metric_idx',
                  'Actual Rows': 5,
                  'Total Cost': 12.0,
                  'Shared Hit Blocks': 4,
                  'Shared Read Blocks': 0,
                  'Shared Written Blocks': 0,
                },
                Planning: { 'Planning Time': 0.8 },
                Execution: { 'Execution Time': 1.5 },
              },
            ],
          },
        ]),
      };

      const mockPrisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
        $transaction: jest
          .fn()
          .mockImplementation(
            (callback: (tx: typeof mockTx) => Promise<unknown>) =>
              callback(mockTx),
          ),
        $disconnect: jest.fn().mockResolvedValue(undefined),
      };

      const mockSummary: SeedSummary = {
        organizationCount: 2,
        accountCount: 2,
        regionCount: 10,
        metricDefinitionCount: 5,
        datasetCount: 2,
        datasetVersionCount: 2,
        observationCount: 1000,
        observationQualityCount: 50,
        aggregateCount: 200,
        aggregateLineageCount: 400,
        dashboardViewCount: 2,
        sampleIds,
      };

      const seedSpy = jest
        .spyOn(analyticsScaleSeed, 'seedAnalyticsScale')
        .mockResolvedValue(mockSummary);

      const outcome = await checkAnalyticsPlans.runAnalyticsPlanChecks({
        prisma: mockPrisma as unknown as PrismaClient,
        connectionString:
          'postgresql://acres_test:pass@localhost:5432/acres_test',
      });

      expect(outcome.passed).toBe(true);
      expect(outcome.results).toHaveLength(6);
      expect(outcome.report).toContain(
        'Acres Analytics Query Plan Evidence Report',
      );
      expect(seedSpy).toHaveBeenCalledWith(mockPrisma, expect.anything());
      expect(mockPrisma.$executeRawUnsafe.mock.calls).toEqual([
        ['ANALYZE "MetricAggregate"'],
        ['ANALYZE "MetricObservation"'],
        ['ANALYZE "MetricDefinition"'],
        ['ANALYZE "MetricAggregateLineage"'],
        ['ANALYZE "DashboardView"'],
      ]);
      const contextCalls = mockTx.$executeRaw.mock.calls as unknown as Array<
        [TemplateStringsArray, ...unknown[]]
      >;
      expect(contextCalls[0][0].join(' ')).toContain(
        "set_config('acres.organization_id'",
      );
      expect(contextCalls[0].slice(1)).toEqual([sampleIds.primaryOrgId]);
      const explainCalls = mockTx.$queryRawUnsafe.mock
        .calls as unknown as Array<[string, ...unknown[]]>;
      expect(explainCalls).toEqual(
        buildAnalyticsPlanQueries(sampleIds).map((query) => [
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
        'postgresql://user:pass@localhost:5432/prod_db';
      delete process.env.ACRES_ALLOW_TEST_SEED;

      await expect(checkAnalyticsPlans.main()).rejects.toThrow(
        'process.exit called',
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'check-analytics-plans must be run in test mode',
        ),
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('logs report when plan checks pass', async () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/acres_test';

      jest
        .spyOn(checkAnalyticsPlans.analyticsPlanRunner, 'run')
        .mockResolvedValue({
          summary: {} as SeedSummary,
          results: [],
          passed: true,
          report: 'All analytics plan checks passed',
        });

      await expect(checkAnalyticsPlans.main()).resolves.toBeUndefined();
      expect(logSpy).toHaveBeenCalledWith('All analytics plan checks passed');
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('exits with 1 when plan checks fail regression guards', async () => {
      process.env.NODE_ENV = 'test';
      process.env.DATABASE_URL =
        'postgresql://user:pass@localhost:5432/acres_test';

      jest
        .spyOn(checkAnalyticsPlans.analyticsPlanRunner, 'run')
        .mockResolvedValue({
          summary: {} as SeedSummary,
          results: [],
          passed: false,
          report: 'Plan check failed',
        });

      await expect(checkAnalyticsPlans.main()).rejects.toThrow(
        'process.exit called',
      );
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
        .spyOn(checkAnalyticsPlans.analyticsPlanRunner, 'run')
        .mockRejectedValue(new Error('Unexpected plan check failure'));

      await expect(checkAnalyticsPlans.main()).rejects.toThrow(
        'process.exit called',
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Plan check encountered error:'),
        'Unexpected plan check failure',
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
