import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import {
  cleanupGeographyScale,
  seedGeographyScale,
} from './geography-scale-seed';
import type { GeographySeedSummary } from './geography-scale-seed.types';
import {
  evaluateQueryPlan,
  formatPlanReport,
  type PlanEvaluationThresholds,
  type QueryPlanResult,
} from '../../analytics/seed/plan-evaluator';

export interface GeographyPlanCheckOptions {
  readonly connectionString?: string;
  readonly gridDimension?: number;
  readonly thresholds?: Partial<PlanEvaluationThresholds>;
}

export interface GeographyPlanCheckOutcome {
  readonly summary: GeographySeedSummary;
  readonly results: QueryPlanResult[];
  readonly passed: boolean;
  readonly report: string;
}

interface GeographyPlanQuery {
  readonly name: string;
  readonly sql: string;
  readonly params: unknown[];
  readonly thresholds: Partial<PlanEvaluationThresholds>;
  readonly expectedIndex: string;
  readonly missingIndexReason: string;
}

export function redactUrl(url: string): string {
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

export function buildGeographyPlanQueries(
  summary: GeographySeedSummary,
): readonly [GeographyPlanQuery, GeographyPlanQuery] {
  return [
    {
      name: 'spatialPointIntersection (GiST index)',
      sql: `WITH pt AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom) SELECT rg."id", rg."regionId", rg."sourceId", rg."geometryType", rg."srid", rg."isValid", rg."sourcePrecision", rg."metadata", rg."createdAt", rg."updatedAt" FROM "RegionGeometry" rg, pt WHERE rg."geometry" && pt.geom AND ST_Intersects(rg."geometry", pt.geom) ORDER BY rg."id" ASC LIMIT 10`,
      params: [summary.testPoint.longitude, summary.testPoint.latitude],
      thresholds: {
        disallowSeqScanOnTables: ['RegionGeometry'],
        maxExecutionTimeMs: 100,
        maxPlanningTimeMs: 50,
      },
      expectedIndex: 'RegionGeometry_geometry_gist_idx',
      missingIndexReason:
        'Expected RegionGeometry_geometry_gist_idx to participate in spatial point intersection query.',
    },
    {
      name: 'hierarchyChildren (parentId, level index)',
      sql: 'SELECT "id", "name", "level" FROM "Region" WHERE "parentId" = $1 AND "level" = $2 ORDER BY "id" ASC LIMIT 25',
      params: [summary.hierarchyParentId, 'ADM2'],
      thresholds: {
        disallowSeqScanOnTables: ['Region'],
        maxExecutionTimeMs: 100,
        maxPlanningTimeMs: 50,
      },
      expectedIndex: 'Region_parentId_level_idx',
      missingIndexReason:
        'Expected Region_parentId_level_idx to participate in bounded hierarchy lookup.',
    },
  ];
}

export function requireExpectedIndex(
  result: QueryPlanResult,
  query: GeographyPlanQuery,
): QueryPlanResult {
  const reasons = [...result.reasons];
  if (!result.indexesUsed.includes(query.expectedIndex)) {
    reasons.push(query.missingIndexReason);
  }
  return { ...result, passed: reasons.length === 0, reasons };
}

export async function runGeographyPlanChecks(
  options: GeographyPlanCheckOptions = {},
): Promise<GeographyPlanCheckOutcome> {
  const connectionString =
    options.connectionString ?? process.env.DATABASE_URL ?? '';

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      connectionTimeoutMillis: 5000,
    }),
  });

  let summary: GeographySeedSummary | undefined;
  let outcome: GeographyPlanCheckOutcome | undefined;
  let operationError: Error | undefined;

  try {
    // 1. Probe database reachability
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new Error(
        `Database is not reachable at ${redactUrl(connectionString)}. ` +
          'Ensure PostgreSQL is running and accessible before running plan checks.',
      );
    }

    // 2. Verify geography tables are present
    try {
      await prisma.$queryRaw`SELECT 1 FROM "RegionGeometry" LIMIT 1`;
    } catch {
      throw new Error(
        `RegionGeometry table missing or unmigrated at ${redactUrl(connectionString)}. ` +
          'Run "npm run prisma:migrate:deploy --workspace=@acres/server" before running plan checks.',
      );
    }

    // 3. Seed deterministic scale fixtures
    const gridDim = options.gridDimension ?? 10;
    summary = await seedGeographyScale(prisma, gridDim);

    const queries = buildGeographyPlanQueries(summary);
    const results: QueryPlanResult[] = [];
    for (const query of queries) {
      const raw = await prisma.$queryRawUnsafe<
        Array<{ 'QUERY PLAN': unknown }>
      >(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`,
        ...query.params,
      );
      const rawPlan = raw[0]?.['QUERY PLAN'];
      const evaluated = evaluateQueryPlan(
        query.name,
        query.sql,
        query.params,
        typeof rawPlan === 'string' ? JSON.parse(rawPlan) : rawPlan,
        { ...query.thresholds, ...options.thresholds },
      );
      results.push(requireExpectedIndex(evaluated, query));
    }
    const header = `Acres PostGIS Geography Query Plan Evidence Report (Target DB: ${redactUrl(connectionString)})
Seeded Rows: ${summary.geometryCount} geometries across ${summary.regionCount} regions from source ${summary.sourceId}`;

    const report = formatPlanReport(results, header);
    const passed = results.every((result) => result.passed);

    outcome = {
      summary,
      results,
      passed,
      report,
    };
  } catch (error) {
    operationError = error instanceof Error ? error : new Error(String(error));
  }

  const cleanupErrors: unknown[] = [];
  try {
    if (summary) {
      await cleanupGeographyScale(
        prisma,
        summary.sourceId,
        summary.fixtureRegionIds,
      );
    }
  } catch (error) {
    cleanupErrors.push(error);
  }
  try {
    await prisma.$disconnect();
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      operationError === undefined
        ? cleanupErrors
        : [operationError, ...cleanupErrors],
      'Geography plan evidence cleanup or database disconnect failed.',
    );
  }
  if (operationError !== undefined) throw operationError;
  if (!outcome)
    throw new Error('Geography plan evidence completed without an outcome.');
  return outcome;
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
      'Error: check-geography-plans must be run in test mode (NODE_ENV=test or ACRES_ALLOW_TEST_SEED=1) against a test database (DATABASE_URL targeting acres_test).',
    );
    process.exit(1);
  }

  console.log(
    'Running deterministic geography scale seed & PostGIS plan check...',
  );
  try {
    const outcome = await runGeographyPlanChecks();
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

if (process.argv[1] && process.argv[1].includes('check-geography-plans')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
