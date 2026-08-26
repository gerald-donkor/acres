import { normalizeRouteGroup, statusClass } from './route-normalizer';

describe('route-normalizer', () => {
  describe('normalizeRouteGroup', () => {
    it('normalizes health endpoints to /health', () => {
      expect(normalizeRouteGroup('/health')).toBe('/health');
      expect(normalizeRouteGroup('/health/ready')).toBe('/health');
    });

    it('normalizes metrics and graphql endpoints', () => {
      expect(normalizeRouteGroup('/metrics')).toBe('/metrics');
      expect(normalizeRouteGroup('/graphql')).toBe('/graphql');
    });

    it('redacts dynamic path parameters and query strings', () => {
      expect(
        normalizeRouteGroup(
          '/api/v1/organizations/01953580-9276-7bf0-bcf5-998877665544/members?page=1',
        ),
      ).toBe('/api/v1/organizations');
      expect(
        normalizeRouteGroup(
          '/api/v1/reports/01953580-1234/revisions/1/publish',
        ),
      ).toBe('/api/v1/reports');
      expect(
        normalizeRouteGroup('/api/v1/datasets/01953580-5678/mappings?limit=10'),
      ).toBe('/api/v1/datasets');
      expect(
        normalizeRouteGroup('/api/v1/exports/01953580-9999/download'),
      ).toBe('/api/v1/exports');
      expect(
        normalizeRouteGroup('/api/v1/ingestion-runs/01953580-0000/issues'),
      ).toBe('/api/v1/ingestion-runs');
    });

    it('returns other for unknown paths or root', () => {
      expect(normalizeRouteGroup('/')).toBe('other');
      expect(normalizeRouteGroup('/unknown-route')).toBe('other');
      expect(normalizeRouteGroup('/api/v2/unsupported')).toBe('other');
    });
  });

  describe('statusClass', () => {
    it('categorizes HTTP status codes into status classes', () => {
      expect(statusClass(200)).toBe('2xx');
      expect(statusClass(201)).toBe('2xx');
      expect(statusClass(204)).toBe('2xx');
      expect(statusClass(301)).toBe('3xx');
      expect(statusClass(304)).toBe('3xx');
      expect(statusClass(400)).toBe('4xx');
      expect(statusClass(401)).toBe('4xx');
      expect(statusClass(403)).toBe('4xx');
      expect(statusClass(404)).toBe('4xx');
      expect(statusClass(409)).toBe('4xx');
      expect(statusClass(500)).toBe('5xx');
      expect(statusClass(502)).toBe('5xx');
      expect(statusClass(503)).toBe('5xx');
      expect(statusClass(100)).toBe('other');
    });
  });
});
