import { buildAnalyticsPlanQueries, redactUrl } from './check-analytics-plans';
import type { SeedSummary } from './analytics-scale-seed.types';

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
});
