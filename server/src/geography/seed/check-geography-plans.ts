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

  try {
    // 1. Probe database reachability
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      throw new Error(
        `Database is not reachable at ${redactUrl(connectionString)}. ` +
          'Ensure PostgreSQL is running and accessible before running plan checks. ' +
          `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 2. Verify geography tables are present
    try {
      await prisma.$queryRaw`SELECT 1 FROM "RegionGeometry" LIMIT 1`;
    } catch (error) {
      throw new Error(
        `RegionGeometry table missing or unmigrated at ${redactUrl(connectionString)}. ` +
          'Run "npm run prisma:migrate:deploy --workspace=@acres/server" before running plan checks. ' +
          `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // 3. Seed deterministic scale fixtures
    const gridDim = options.gridDimension ?? 10;
    summary = await seedGeographyScale(prisma, gridDim);

    const testLon = summary.testPoint.longitude;
    const testLat = summary.testPoint.latitude;

    // 4. Query definition to benchmark
    const spatialQuery = {
      name: 'spatialPointIntersection (GiST index)',
      sql: `WITH pt AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS geom) SELECT rg."id", rg."regionId", rg."sourceId", rg."geometryType", rg."srid", rg."isValid", rg."sourcePrecision", rg."metadata", rg."createdAt", rg."updatedAt" FROM "RegionGeometry" rg, pt WHERE rg."geometry" && pt.geom AND ST_Intersects(rg."geometry", pt.geom) ORDER BY rg."id" ASC LIMIT 10`,
      params: [testLon, testLat],
      thresholds: {
        disallowSeqScanOnTables: ['RegionGeometry'],
        maxExecutionTimeMs: 100,
        maxPlanningTimeMs: 50,
      },
    };

    const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${spatialQuery.sql}`;
    const raw = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': unknown }>>(
      explainQuery,
      ...spatialQuery.params,
    );

    const rawPlanField = raw[0]?.['QUERY PLAN'];
    const planJson: unknown =
      typeof rawPlanField === 'string'
        ? (JSON.parse(rawPlanField) as unknown)
        : rawPlanField;

    const mergedThresholds: Partial<PlanEvaluationThresholds> = {
      ...spatialQuery.thresholds,
      ...options.thresholds,
    };

    const evalResult = evaluateQueryPlan(
      spatialQuery.name,
      spatialQuery.sql,
      spatialQuery.params,
      planJson,
      mergedThresholds,
    );

    // Verify that the GiST index was consulted
    const gistIndexFound = evalResult.indexesUsed.some((idx) =>
      idx.toLowerCase().includes('gist'),
    );

    const reasons = [...evalResult.reasons];
    if (!gistIndexFound && evalResult.nodeTypes.includes('Seq Scan')) {
      reasons.push(
        'Expected RegionGeometry_geometry_gist_idx to participate in spatial point intersection query.',
      );
    }

    const finalResult: QueryPlanResult = {
      ...evalResult,
      passed: reasons.length === 0,
      reasons,
    };

    const header = `Acres PostGIS Geography Query Plan Evidence Report (Target DB: ${redactUrl(connectionString)})
Seeded Rows: ${summary.geometryCount} geometries across ${summary.regionCount} regions from source ${summary.sourceId}`;

    const report = formatPlanReport([finalResult], header);
    const passed = finalResult.passed;

    return {
      summary,
      results: [finalResult],
      passed,
      report,
    };
  } finally {
    if (summary) {
      try {
        await cleanupGeographyScale(
          prisma,
          summary.sourceId,
          summary.fixtureRegionIds,
        );
      } catch {
        // Suppress secondary cleanup error in finally
      }
    }
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
