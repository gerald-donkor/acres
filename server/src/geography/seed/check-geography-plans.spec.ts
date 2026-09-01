import type { QueryPlanResult } from '../../analytics/seed/plan-evaluator';
import {
  buildGeographyPlanQueries,
  redactUrl,
  requireExpectedIndex,
} from './check-geography-plans';
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
});
