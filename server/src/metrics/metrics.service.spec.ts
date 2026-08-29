import { MetricsService } from './metrics.service';

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
