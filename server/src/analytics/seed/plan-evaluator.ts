export interface PlanEvaluationThresholds {
  readonly maxExecutionTimeMs: number;
  readonly maxPlanningTimeMs: number;
  readonly disallowSeqScanOnTables: ReadonlyArray<string>;
}

export const DEFAULT_PLAN_THRESHOLDS: PlanEvaluationThresholds = {
  maxExecutionTimeMs: 150,
  maxPlanningTimeMs: 50,
  disallowSeqScanOnTables: [
    'MetricAggregate',
    'MetricObservation',
    'MetricAggregateLineage',
  ],
};

export interface PlanNodeInfo {
  readonly nodeType: string;
  readonly relationName?: string;
  readonly indexName?: string;
  readonly actualRows?: number;
  readonly totalCost?: number;
  readonly sharedHitBlocks?: number;
  readonly sharedReadBlocks?: number;
}

export interface QueryPlanResult {
  readonly queryName: string;
  readonly sql: string;
  readonly params: unknown[];
  readonly executionTimeMs: number;
  readonly planningTimeMs: number;
  readonly totalCost: number;
  readonly actualRows: number;
  readonly nodeTypes: string[];
  readonly indexesUsed: string[];
  readonly buffers: {
    readonly sharedHit: number;
    readonly sharedRead: number;
    readonly sharedWritten: number;
  };
  readonly passed: boolean;
  readonly reasons: string[];
  readonly rawPlan?: unknown;
}

export function extractPlanNodes(rawPlan: unknown): {
  readonly nodes: PlanNodeInfo[];
  readonly planningTimeMs: number;
  readonly executionTimeMs: number;
  readonly totalCost: number;
  readonly actualRows: number;
  readonly buffers: {
    sharedHit: number;
    sharedRead: number;
    sharedWritten: number;
  };
} {
  const planArray = Array.isArray(rawPlan) ? rawPlan : [rawPlan];
  const rootObj = (planArray[0] ?? {}) as Record<string, unknown>;
  const planRoot = (rootObj.Plan ?? rootObj) as Record<string, unknown>;

  const planningTimeMs =
    typeof rootObj['Planning Time'] === 'number' ? rootObj['Planning Time'] : 0;
  const executionTimeMs =
    typeof rootObj['Execution Time'] === 'number'
      ? rootObj['Execution Time']
      : typeof planRoot['Actual Total Time'] === 'number'
        ? planRoot['Actual Total Time']
        : 0;

  const totalCost =
    typeof planRoot['Total Cost'] === 'number' ? planRoot['Total Cost'] : 0;
  const actualRows =
    typeof planRoot['Actual Rows'] === 'number' ? planRoot['Actual Rows'] : 0;

  const nodes: PlanNodeInfo[] = [];
  let sharedHit = 0;
  let sharedRead = 0;
  let sharedWritten = 0;

  function traverse(node: unknown) {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;

    const nodeType =
      typeof n['Node Type'] === 'string' ? n['Node Type'] : 'Unknown';
    const relationName =
      typeof n['Relation Name'] === 'string' ? n['Relation Name'] : undefined;
    const indexName =
      typeof n['Index Name'] === 'string' ? n['Index Name'] : undefined;
    const nodeRows =
      typeof n['Actual Rows'] === 'number' ? n['Actual Rows'] : undefined;
    const cost =
      typeof n['Total Cost'] === 'number' ? n['Total Cost'] : undefined;

    const hit =
      typeof n['Shared Hit Blocks'] === 'number' ? n['Shared Hit Blocks'] : 0;
    const read =
      typeof n['Shared Read Blocks'] === 'number' ? n['Shared Read Blocks'] : 0;
    const written =
      typeof n['Shared Written Blocks'] === 'number'
        ? n['Shared Written Blocks']
        : 0;

    sharedHit += hit;
    sharedRead += read;
    sharedWritten += written;

    nodes.push({
      nodeType,
      relationName,
      indexName,
      actualRows: nodeRows,
      totalCost: cost,
      sharedHitBlocks: hit,
      sharedReadBlocks: read,
    });

    if (Array.isArray(n.Plans)) {
      for (const child of n.Plans) {
        traverse(child);
      }
    }
  }

  traverse(planRoot);

  return {
    nodes,
    planningTimeMs,
    executionTimeMs,
    totalCost,
    actualRows,
    buffers: {
      sharedHit,
      sharedRead,
      sharedWritten,
    },
  };
}

export function evaluateQueryPlan(
  queryName: string,
  sql: string,
  params: unknown[],
  rawPlanOutput: unknown,
  customThresholds?: Partial<PlanEvaluationThresholds>,
): QueryPlanResult {
  const thresholds: PlanEvaluationThresholds = {
    ...DEFAULT_PLAN_THRESHOLDS,
    ...customThresholds,
  };

  const parsed = extractPlanNodes(rawPlanOutput);
  const nodeTypes = [...new Set(parsed.nodes.map((n) => n.nodeType))];
  const indexesUsed = [
    ...new Set(
      parsed.nodes
        .map((n) => n.indexName)
        .filter(
          (name): name is string => typeof name === 'string' && name.length > 0,
        ),
    ),
  ];

  const reasons: string[] = [];

  // 1. Check for disallowed Seq Scan on large tables
  for (const node of parsed.nodes) {
    if (node.nodeType === 'Seq Scan' && node.relationName) {
      if (thresholds.disallowSeqScanOnTables.includes(node.relationName)) {
        reasons.push(
          `Unindexed Sequential Scan on table '${node.relationName}' in query '${queryName}'.`,
        );
      }
    }
  }

  // 2. Check execution time regression threshold
  if (parsed.executionTimeMs > thresholds.maxExecutionTimeMs) {
    reasons.push(
      `Execution time ${parsed.executionTimeMs.toFixed(2)}ms exceeded regression guard threshold ${thresholds.maxExecutionTimeMs}ms.`,
    );
  }
  if (parsed.planningTimeMs > thresholds.maxPlanningTimeMs) {
    reasons.push(
      `Planning time ${parsed.planningTimeMs.toFixed(2)}ms exceeded regression guard threshold ${thresholds.maxPlanningTimeMs}ms.`,
    );
  }

  const passed = reasons.length === 0;

  return {
    queryName,
    sql,
    params: redactParams(params),
    executionTimeMs: parsed.executionTimeMs,
    planningTimeMs: parsed.planningTimeMs,
    totalCost: parsed.totalCost,
    actualRows: parsed.actualRows,
    nodeTypes,
    indexesUsed,
    buffers: parsed.buffers,
    passed,
    reasons,
    rawPlan: rawPlanOutput,
  };
}

export function redactParams(params: unknown[]): unknown[] {
  return params.map((p) => {
    if (p instanceof Date) return p.toISOString();
    if (typeof p === 'string' && p.length > 64) {
      return p.substring(0, 8) + '...' + p.substring(p.length - 8);
    }
    return p;
  });
}

export function formatPlanReport(
  results: ReadonlyArray<QueryPlanResult>,
  summaryHeader?: string,
): string {
  const lines: string[] = [];
  if (summaryHeader) {
    lines.push(summaryHeader);
    lines.push('='.repeat(summaryHeader.length));
  }

  lines.push('');
  lines.push(
    [
      'Query Name'.padEnd(28),
      'Status'.padEnd(8),
      'Time (ms)'.padEnd(11),
      'Cost'.padEnd(10),
      'Rows'.padEnd(8),
      'Nodes & Indexes'.padEnd(35),
    ].join(' | '),
  );
  lines.push('-'.repeat(105));

  for (const r of results) {
    const statusStr = r.passed ? 'PASS' : 'FAIL';
    const indexDesc =
      r.indexesUsed.length > 0
        ? `[Idx: ${r.indexesUsed.join(', ')}]`
        : `[${r.nodeTypes.join(', ')}]`;

    lines.push(
      [
        r.queryName.padEnd(28),
        statusStr.padEnd(8),
        r.executionTimeMs.toFixed(2).padStart(9).padEnd(11),
        r.totalCost.toFixed(2).padStart(8).padEnd(10),
        String(r.actualRows).padStart(6).padEnd(8),
        indexDesc.padEnd(35),
      ].join(' | '),
    );

    if (!r.passed) {
      for (const reason of r.reasons) {
        lines.push(`  ! Failure: ${reason}`);
      }
    }
  }

  lines.push('');
  const allPassed = results.every((r) => r.passed);
  lines.push(
    `Overall result: ${allPassed ? 'ALL PLANS PASSED' : 'REGRESSION DETECTED'} (${results.filter((r) => r.passed).length}/${results.length} passed)`,
  );

  return lines.join('\n');
}
