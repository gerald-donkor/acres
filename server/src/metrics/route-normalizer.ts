export const ROUTE_GROUPS = [
  '/health',
  '/metrics',
  '/graphql',
  '/api/v1/auth',
  '/api/v1/account',
  '/api/v1/organizations',
  '/api/v1/invitations',
  '/api/v1/uploads',
  '/api/v1/datasets',
  '/api/v1/ingestion-runs',
  '/api/v1/analytics',
  '/api/v1/dashboards',
  '/api/v1/reports',
  '/api/v1/exports',
  '/api/v1/regions',
  '/api/v1/forms',
  '/api/v1/jobs',
  'other',
] as const;

export type RouteGroup = (typeof ROUTE_GROUPS)[number];

const ROUTE_GROUP_MATCHERS: readonly [RegExp, RouteGroup][] = [
  [/^\/health(\/ready)?(\/.*)?$/, '/health'],
  [/^\/metrics(\/.*)?$/, '/metrics'],
  [/^\/graphql(\/.*)?$/, '/graphql'],
  [/^\/api\/v1\/auth(\/.*)?$/, '/api/v1/auth'],
  [/^\/api\/v1\/account(\/.*)?$/, '/api/v1/account'],
  [/^\/api\/v1\/organizations(\/.*)?$/, '/api/v1/organizations'],
  [/^\/api\/v1\/invitations(\/.*)?$/, '/api/v1/invitations'],
  [/^\/api\/v1\/uploads(\/.*)?$/, '/api/v1/uploads'],
  [/^\/api\/v1\/datasets(\/.*)?$/, '/api/v1/datasets'],
  [/^\/api\/v1\/ingestion-runs(\/.*)?$/, '/api/v1/ingestion-runs'],
  [/^\/api\/v1\/analytics(\/.*)?$/, '/api/v1/analytics'],
  [/^\/api\/v1\/dashboards(\/.*)?$/, '/api/v1/dashboards'],
  [/^\/api\/v1\/reports(\/.*)?$/, '/api/v1/reports'],
  [/^\/api\/v1\/exports(\/.*)?$/, '/api/v1/exports'],
  [/^\/api\/v1\/regions(\/.*)?$/, '/api/v1/regions'],
  [/^\/api\/v1\/forms(\/.*)?$/, '/api/v1/forms'],
  [/^\/api\/v1\/jobs(\/.*)?$/, '/api/v1/jobs'],
];

/**
 * Normalizes an arbitrary request path into a bounded, low-cardinality route group.
 * Strictly prevents UUIDs, IDs, tokens, or query strings from polluting Prometheus labels.
 */
export function normalizeRouteGroup(rawPath: string): RouteGroup {
  if (!rawPath) return 'other';
  // Strip query string and trailing slash (except root '/')
  const cleanPath = rawPath.split('?')[0].replace(/\/+$/, '') || '/';

  for (const [pattern, group] of ROUTE_GROUP_MATCHERS) {
    if (pattern.test(cleanPath)) {
      return group;
    }
  }

  return 'other';
}

export type StatusClass = '2xx' | '3xx' | '4xx' | '5xx' | 'other';

/**
 * Maps an HTTP response status code to its high-level status class.
 */
export function statusClass(statusCode: number): StatusClass {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 300 && statusCode < 400) return '3xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  if (statusCode >= 500 && statusCode < 600) return '5xx';
  return 'other';
}
