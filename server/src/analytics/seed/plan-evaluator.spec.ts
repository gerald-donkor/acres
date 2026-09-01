import {
  evaluateQueryPlan,
  extractPlanNodes,
  formatPlanReport,
  redactParams,
} from './plan-evaluator';

describe('plan-evaluator', () => {
  const sampleIndexScanPlan = [
    {
      Plan: {
        'Node Type': 'Index Scan',
        'Relation Name': 'MetricAggregate',
        'Index Name': 'MetricAggregate_main_read_idx',
        'Total Cost': 8.35,
        'Actual Total Time': 0.12,
        'Actual Rows': 12,
        'Shared Hit Blocks': 4,
        'Shared Read Blocks': 0,
      },
      'Planning Time': 0.1,
      'Execution Time': 0.25,
    },
  ];

  const sampleSeqScanPlan = [
    {
      Plan: {
        'Node Type': 'Seq Scan',
        'Relation Name': 'MetricAggregate',
        'Total Cost': 150.0,
        'Actual Total Time': 12.5,
        'Actual Rows': 1728,
        'Shared Hit Blocks': 42,
        'Shared Read Blocks': 10,
      },
      'Planning Time': 0.08,
      'Execution Time': 12.6,
    },
  ];

  const sampleNestedBitmapPlan = [
    {
      Plan: {
        'Node Type': 'Bitmap Heap Scan',
        'Relation Name': 'MetricObservation',
        'Total Cost': 24.5,
        'Actual Total Time': 0.8,
        'Actual Rows': 36,
        'Shared Hit Blocks': 8,
        'Shared Read Blocks': 0,
        Plans: [
          {
            'Node Type': 'Bitmap Index Scan',
            'Index Name': 'MetricObservation_main_read_idx',
            'Total Cost': 4.3,
            'Actual Rows': 36,
          },
        ],
      },
      'Planning Time': 0.15,
      'Execution Time': 0.95,
    },
  ];

  describe('extractPlanNodes', () => {
    it('extracts top-level and nested plan nodes, metrics, and timings', () => {
      const extracted = extractPlanNodes(sampleNestedBitmapPlan);

      expect(extracted.executionTimeMs).toBe(0.95);
      expect(extracted.planningTimeMs).toBe(0.15);
      expect(extracted.nodes).toHaveLength(2);
      expect(extracted.nodes[0].nodeType).toBe('Bitmap Heap Scan');
      expect(extracted.nodes[0].relationName).toBe('MetricObservation');
      expect(extracted.nodes[1].nodeType).toBe('Bitmap Index Scan');
      expect(extracted.nodes[1].indexName).toBe(
        'MetricObservation_main_read_idx',
      );
    });
  });

  describe('evaluateQueryPlan', () => {
    it('passes for efficient index scans within timing thresholds', () => {
      const result = evaluateQueryPlan(
        'testIndexQuery',
        'SELECT * FROM "MetricAggregate" ...',
        ['org-1', 'metric-1'],
        sampleIndexScanPlan,
      );

      expect(result.passed).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.indexesUsed).toContain('MetricAggregate_main_read_idx');
      expect(result.nodeTypes).toContain('Index Scan');
    });

    it('fails when a sequential scan occurs on a large protected table', () => {
      const result = evaluateQueryPlan(
        'testSeqScanQuery',
        'SELECT * FROM "MetricAggregate" ...',
        ['org-1'],
        sampleSeqScanPlan,
      );

      expect(result.passed).toBe(false);
      expect(result.reasons[0]).toMatch(
        /Unindexed Sequential Scan on table 'MetricAggregate'/,
      );
    });

    it('fails when execution time exceeds the regression guard threshold', () => {
      const result = evaluateQueryPlan(
        'slowQuery',
        'SELECT * FROM ...',
        [],
        sampleIndexScanPlan,
        { maxExecutionTimeMs: 0.1 },
      );

      expect(result.passed).toBe(false);
      expect(result.reasons[0]).toMatch(/exceeded regression guard threshold/);
    });

    it('fails when planning time exceeds the regression guard threshold', () => {
      const result = evaluateQueryPlan(
        'slowPlan',
        'SELECT 1',
        [],
        sampleIndexScanPlan,
        { maxPlanningTimeMs: 0.01 },
      );
      expect(result.passed).toBe(false);
      expect(result.reasons[0]).toMatch(/Planning time/);
    });
  });

  describe('redactParams', () => {
    it('redacts long parameter strings and formats dates', () => {
      const longStr = 'a'.repeat(80);
      const date = new Date('2026-08-27T00:00:00.000Z');
      const params = [longStr, date, 123];

      const redacted = redactParams(params);
      expect(redacted[0]).toBe('aaaaaaaa...aaaaaaaa');
      expect(redacted[1]).toBe('2026-08-27T00:00:00.000Z');
      expect(redacted[2]).toBe(123);
    });
  });

  describe('formatPlanReport', () => {
    it('formats a tabular ASCII summary report', () => {
      const result = evaluateQueryPlan(
        'findAggregates',
        'SELECT * FROM ...',
        ['org-1'],
        sampleIndexScanPlan,
      );

      const report = formatPlanReport([result], 'Benchmark Test Header');
      expect(report).toContain('Benchmark Test Header');
      expect(report).toContain('findAggregates');
      expect(report).toContain('PASS');
      expect(report).toContain('ALL PLANS PASSED');
    });
  });
});
