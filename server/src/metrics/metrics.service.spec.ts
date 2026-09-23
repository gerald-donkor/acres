import { MetricsService } from './metrics.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('initializes and exports Prometheus metrics', async () => {
    const text = await service.getMetrics();
    expect(text).toContain('# TYPE acres_http_requests_total counter');
    expect(text).toContain('# TYPE acres_http_429_responses_total counter');
    expect(text).toContain(
      '# TYPE acres_http_request_duration_seconds histogram',
    );
    expect(text).toContain('# TYPE acres_http_active_requests gauge');
    expect(text).toContain('# TYPE acres_outbox_pending_events gauge');
    expect(text).toContain('# TYPE acres_queue_jobs_total counter');
    expect(text).toContain('# TYPE acres_scheduled_job_runs_total counter');
    expect(text).toContain('# TYPE acres_parser_executions_total counter');
    expect(text).toContain(
      '# TYPE acres_parser_execution_duration_seconds histogram',
    );
  });

  it('exports fresh, unlabeled API pool counts on every scrape', async () => {
    const snapshot = { total: 0, idle: 0, waiting: 0, max: 10 };
    const getPoolSnapshot = jest.fn(() => ({ ...snapshot }));
    const prisma = {
      getPoolSnapshot,
    } as unknown as PrismaService;
    const metrics = new MetricsService(prisma);
    try {
      const first = await metrics.getMetrics();
      expect(first).toContain('acres_postgres_pool_connections_total 0');
      expect(first).toContain('acres_postgres_pool_connections_idle 0');
      expect(first).toContain('acres_postgres_pool_requests_waiting 0');
      expect(first).toContain('acres_postgres_pool_connections_max 10');
      snapshot.total = 10;
      snapshot.idle = 2;
      snapshot.waiting = 3;
      const second = await metrics.getMetrics();
      expect(second).toContain('acres_postgres_pool_connections_total 10');
      expect(second).toContain('acres_postgres_pool_connections_idle 2');
      expect(second).toContain('acres_postgres_pool_requests_waiting 3');
      expect(second).not.toMatch(
        /acres_postgres_pool_(connections|requests)_[^\n]*\{/,
      );
      expect(getPoolSnapshot).toHaveBeenCalledTimes(2);
    } finally {
      metrics.onModuleDestroy();
    }
  });

  it('observes pool acquisition durations when prisma emits acquisition events', async () => {
    let capturedListener: ((duration: number) => void) | undefined;
    const unsubscribe = jest.fn();
    const onAcquisition = jest.fn((listener: (d: number) => void) => {
      capturedListener = listener;
      return unsubscribe;
    });
    const prisma = {
      getPoolSnapshot: jest.fn(() => ({
        total: 1,
        idle: 1,
        waiting: 0,
        max: 10,
      })),
      onAcquisition,
    } as unknown as PrismaService;
    const metrics = new MetricsService(prisma);
    try {
      expect(onAcquisition).toHaveBeenCalledTimes(1);
      expect(capturedListener).toBeDefined();

      capturedListener!(0.003); // 3ms -> falls into le="0.005"
      capturedListener!(0.045); // 45ms -> falls into le="0.05"

      const text = await metrics.getMetrics();
      expect(text).toContain(
        'acres_postgres_pool_acquisition_duration_seconds_count 2',
      );
      expect(text).toContain(
        'acres_postgres_pool_acquisition_duration_seconds_bucket{le="0.005"} 1',
      );
      expect(text).toContain(
        'acres_postgres_pool_acquisition_duration_seconds_bucket{le="0.05"} 2',
      );
    } finally {
      metrics.onModuleDestroy();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
  });

  it('fails a scrape when the pool snapshot cannot be read', async () => {
    const prisma = {
      getPoolSnapshot: jest.fn(() => {
        throw new Error('pool unavailable');
      }),
    } as unknown as PrismaService;
    const metrics = new MetricsService(prisma);
    try {
      await expect(metrics.getMetrics()).rejects.toThrow('pool unavailable');
    } finally {
      metrics.onModuleDestroy();
    }
  });

  it('counts only 429 responses without changing the total request labels', async () => {
    service.recordHttpRequest('POST', '/api/v1/auth/login', 401, 0.1);
    service.recordHttpRequest('POST', '/api/v1/auth/login', 403, 0.1);
    service.recordHttpRequest('POST', '/api/v1/auth/login', 429, 0.1);
    service.recordHttpRequest('POST', '/api/v1/auth/login', 429, 0.1);
    service.recordHttpRequest('POST', '/api/v1/auth/login', 500, 0.1);

    const text = await service.getMetrics();
    const lines = text.split('\n');
    expect(lines).toContain('acres_http_429_responses_total 2');
    expect(lines).toContain(
      'acres_http_requests_total{method="POST",route_group="/api/v1/auth",status_class="4xx"} 4',
    );
    expect(lines).toContain(
      'acres_http_requests_total{method="POST",route_group="/api/v1/auth",status_class="5xx"} 1',
    );
  });

  it('records http request metrics with sanitized labels', async () => {
    service.recordHttpRequest(
      'GET',
      '/api/v1/reports/123/revisions',
      200,
      0.05,
    );
    service.recordHttpRequest('POST', '/api/v1/auth/login', 401, 0.12);

    const text = await service.getMetrics();
    expect(text).toContain(
      'acres_http_requests_total{method="GET",route_group="/api/v1/reports",status_class="2xx"} 1',
    );
    expect(text).toContain(
      'acres_http_requests_total{method="POST",route_group="/api/v1/auth",status_class="4xx"} 1',
    );
  });

  it('records scheduled job, queue, and parser metrics', async () => {
    service.recordJobRun('sessions.purge-expired', 'succeeded');
    service.recordQueueJob('acres-work', 'completed');
    service.recordParserExecution('csv', 'success', 0.045);
    service.recordParserExecution('xlsx', 'timeout', 15.0);

    const text = await service.getMetrics();
    expect(text).toContain(
      'acres_scheduled_job_runs_total{job_name="sessions.purge-expired",status="succeeded"} 1',
    );
    expect(text).toContain(
      'acres_queue_jobs_total{queue_name="acres-work",status="completed"} 1',
    );
    expect(text).toContain(
      'acres_parser_executions_total{source_kind="csv",status="success"} 1',
    );
    expect(text).toContain(
      'acres_parser_executions_total{source_kind="xlsx",status="timeout"} 1',
    );
  });
});
