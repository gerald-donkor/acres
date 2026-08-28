import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import {
  buildDeterministicSeedPlan,
  seedAnalyticsScale,
} from './analytics-scale-seed';
import type {
  DeterministicSeedPlan,
  SeedSummary,
} from './analytics-scale-seed.types';
import {
  evaluateQueryPlan,
  formatPlanReport,
  type PlanEvaluationThresholds,
  type QueryPlanResult,
} from './plan-evaluator';

export interface PlanCheckOptions {
  readonly connectionString?: string;
  readonly plan?: DeterministicSeedPlan;
  readonly thresholds?: Partial<PlanEvaluationThresholds>;
}

export interface PlanCheckOutcome {
  readonly summary: SeedSummary;
  readonly results: QueryPlanResult[];
  readonly passed: boolean;
  readonly report: string;
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return url.replace(/:[^:@]+@/, ':***@');
  }
}

export async function runAnalyticsPlanChecks(
  options: PlanCheckOptions = {},
): Promise<PlanCheckOutcome> {
  const connectionString =
    options.connectionString ?? process.env.DATABASE_URL ?? '';

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 5000,
    }),
  });

  try {
    // 1. Probe database reachability
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new Error(
        `Database is not reachable at ${redactUrl(connectionString)}. ` +
          'Ensure PostgreSQL is running (e.g. "npm run db:up") and accessible before running plan checks. ' +
          `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 2. Verify analytics tables are present
    try {
      await prisma.$queryRaw`SELECT 1 FROM "MetricAggregate" LIMIT 1`;
    } catch (error) {
      throw new Error(
        `Analytics tables missing or unmigrated at ${redactUrl(connectionString)}. ` +
          'Run "npm run prisma:migrate:deploy --workspace=@acres/server" before running plan checks. ' +
          `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 3. Seed or refresh deterministic scale data
    const plan = options.plan ?? buildDeterministicSeedPlan();
    const summary = await seedAnalyticsScale(prisma, plan);

    const orgId = summary.sampleIds.primaryOrgId;
    const metricId = summary.sampleIds.metricId;
    const regionId = summary.sampleIds.regionId;
    const datasetVersionId = summary.sampleIds.datasetVersionId;
    const dimensionHash = summary.sampleIds.dimensionHash;
    const periodStart = summary.sampleIds.periodStart;
    const periodEnd = summary.sampleIds.periodEnd;
    const aggregateId = summary.sampleIds.aggregateId;

    // 4. Query definitions to benchmark
    const queries: Array<{
      name: string;
      sql: string;
      params: unknown[];
      thresholds?: Partial<PlanEvaluationThresholds>;
    }> = [
      {
        name: 'findMetrics',
        sql: `SELECT "id", "organizationId", "datasetId", "key", "label", "description", "valueType", "canonicalUnit", "allowedAggregation", "calculationVersion", "status", "createdAt", "updatedAt" FROM "MetricDefinition" WHERE "organizationId" = $1 AND "status" = 'active'::"MetricDefinitionStatus" ORDER BY "key" ASC LIMIT 100`,
        params: [orgId],
      },
      {
        name: 'findAggregates (filtered)',
        sql: `SELECT "id", "organizationId", "datasetVersionId", "metricDefinitionId", "regionId", "periodStart", "periodEnd", "dimensionHash", "dimensions", "aggregateType", "numericValue", "textValue", "booleanValue", "unit", "calculationVersion", "observationCount", "qualitySummary", "datasetVersionIds", "createdAt" FROM "MetricAggregate" WHERE "organizationId" = $1 AND "metricDefinitionId" = $2 AND "regionId" = $3 AND "datasetVersionId" = $4 AND "dimensionHash" = $5 AND "periodStart" >= $6 AND "periodEnd" <= $7 ORDER BY "periodStart" ASC, "createdAt" ASC LIMIT 50`,
        params: [
          orgId,
          metricId,
          regionId,
          datasetVersionId,
          dimensionHash,
          periodStart,
          periodEnd,
        ],
      },
      {
        name: 'findObservations (filtered)',
        sql: `SELECT "id", "organizationId", "datasetVersionId", "regionId", "metricDefinitionId", "periodStart", "periodEnd", "periodLabel", "numericValue", "textValue", "booleanValue", "unit", "dimensionHash", "dimensions", "sourceRowNumber", "sourceReference", "createdAt" FROM "MetricObservation" WHERE "organizationId" = $1 AND "metricDefinitionId" = $2 AND "regionId" = $3 AND "datasetVersionId" = $4 AND "dimensionHash" = $5 AND "periodStart" >= $6 AND "periodEnd" <= $7 ORDER BY "periodStart" ASC, "createdAt" ASC LIMIT 50`,
        params: [
          orgId,
          metricId,
          regionId,
          datasetVersionId,
          dimensionHash,
          periodStart,
          periodEnd,
        ],
      },
      {
        name: 'findAggregateEvidence (lineage)',
        sql: `SELECT "id", "organizationId", "aggregateId", "observationId", "datasetVersionId", "createdAt" FROM "MetricAggregateLineage" WHERE "organizationId" = $1 AND "aggregateId" = $2 ORDER BY "createdAt" ASC LIMIT 200`,
        params: [orgId, aggregateId],
      },
      {
        name: 'listDashboardViews',
        sql: `SELECT "id", "organizationId", "ownerAccountId", "name", "description", "filters", "presentation", "status", "createdAt", "updatedAt" FROM "DashboardView" WHERE "organizationId" = $1 AND "status" = 'active'::"DashboardViewStatus" ORDER BY "updatedAt" DESC LIMIT 50`,
        params: [orgId],
      },
      {
        name: 'dashboardSummary (aggregates)',
        sql: `SELECT "id", "organizationId", "datasetVersionId", "metricDefinitionId", "regionId", "periodStart", "periodEnd", "dimensionHash", "dimensions", "aggregateType", "numericValue", "textValue", "booleanValue", "unit", "calculationVersion", "observationCount", "qualitySummary", "datasetVersionIds", "createdAt" FROM "MetricAggregate" WHERE "organizationId" = $1 ORDER BY "periodStart" ASC, "createdAt" ASC LIMIT 24`,
        params: [orgId],
        thresholds: { disallowSeqScanOnTables: [] },
      },
    ];

    // Benchmark queries inside an interactive transaction with active tenant RLS context
    const results: QueryPlanResult[] = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('acres.organization_id', ${orgId}, true),
            set_config('acres.worker_access', '', true)
        `;

        const queryResults: QueryPlanResult[] = [];
        for (const q of queries) {
          const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${q.sql}`;
          const raw = await tx.$queryRawUnsafe<
            Array<{ 'QUERY PLAN': unknown }>
          >(explainQuery, ...q.params);

          const rawPlanField = raw[0]?.['QUERY PLAN'];
          const planJson: unknown =
            typeof rawPlanField === 'string'
              ? (JSON.parse(rawPlanField) as unknown)
              : rawPlanField;

          const mergedThresholds: Partial<PlanEvaluationThresholds> = {
            ...options.thresholds,
            ...(q.thresholds ?? {}),
          };

          const evalResult = evaluateQueryPlan(
            q.name,
            q.sql,
            q.params,
            planJson,
            mergedThresholds,
          );
          queryResults.push(evalResult);
        }
        return queryResults;
      },
      { timeout: 30000 },
    );

    const header = `Acres Analytics Query Plan Evidence Report (Target DB: ${redactUrl(connectionString)})
Seeded Rows: ${summary.observationCount} observations, ${summary.aggregateCount} aggregates, ${summary.aggregateLineageCount} lineages, ${summary.regionCount} regions across ${summary.organizationCount} orgs`;

    const report = formatPlanReport(results, header);
    const passed = results.every((r) => r.passed);

    return {
      summary,
      results,
      passed,
      report,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const isTestEnv =
    process.env.NODE_ENV === 'test' ||
    process.env.ACRES_ALLOW_TEST_SEED === '1';

  const dbUrl = process.env.DATABASE_URL || '';

  const isTestDb =
    dbUrl.includes('acres_test') || process.env.ACRES_ALLOW_TEST_SEED === '1';

  if (!isTestEnv || !isTestDb) {
    console.error(
      'Error: check-analytics-plans must be run in test mode (NODE_ENV=test or ACRES_ALLOW_TEST_SEED=1) against a test database (DATABASE_URL targeting acres_test).',
    );
    process.exit(1);
  }

  console.log('Running deterministic analytics scale seed & plan check...');
  try {
    const outcome = await runAnalyticsPlanChecks();
    console.log(outcome.report);

    if (!outcome.passed) {
      console.error('\nQuery plan check failed regression guards.');
      process.exit(1);
    }
  } catch (error) {
    console.error(
      '\nPlan check encountered error:',
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].includes('check-analytics-plans')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
