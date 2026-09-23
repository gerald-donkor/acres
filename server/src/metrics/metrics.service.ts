import { Injectable, OnModuleDestroy, Optional } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ParserExecutionStatus,
  SourceKind,
} from '../ingestion/parsers/parser.types';
import {
  normalizeRouteGroup,
  type RouteGroup,
  statusClass,
  type StatusClass,
} from './route-normalizer';

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly registry: Registry;

  readonly httpRequestsTotal: Counter<
    'method' | 'route_group' | 'status_class'
  >;
  readonly http429ResponsesTotal: Counter<string>;
  readonly httpRequestDurationSeconds: Histogram<
    'method' | 'route_group' | 'status_class'
  >;
  readonly httpActiveRequests: Gauge<string>;
  readonly postgresPoolConnectionsTotal: Gauge<string>;
  readonly postgresPoolConnectionsIdle: Gauge<string>;
  readonly postgresPoolRequestsWaiting: Gauge<string>;
  readonly postgresPoolConnectionsMax: Gauge<string>;
  readonly postgresPoolAcquisitionDurationSeconds: Histogram<string>;
  readonly outboxPendingEvents: Gauge<string>;
  private readonly unsubscribeAcquisition?: () => void;
  readonly queueJobsTotal: Counter<'queue_name' | 'status'>;
  readonly queueActiveJobs: Gauge<'queue_name'>;
  readonly queueWaitingJobs: Gauge<'queue_name'>;
  readonly scheduledJobRunsTotal: Counter<'job_name' | 'status'>;
  readonly databaseQueryDurationSeconds: Histogram<'operation'>;
  readonly parserExecutionsTotal: Counter<'source_kind' | 'status'>;
  readonly parserExecutionDurationSeconds: Histogram<'source_kind' | 'status'>;

  constructor(@Optional() private readonly prisma?: PrismaService) {
    this.registry = new Registry();
    collectDefaultMetrics({
      prefix: 'acres_',
      register: this.registry,
    });

    this.httpRequestsTotal = new Counter({
      name: 'acres_http_requests_total',
      help: 'Total number of HTTP requests processed by Acres API',
      labelNames: ['method', 'route_group', 'status_class'],
      registers: [this.registry],
    });

    this.http429ResponsesTotal = new Counter({
      name: 'acres_http_429_responses_total',
      help: 'Total number of HTTP 429 responses processed by Acres API',
      registers: [this.registry],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'acres_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route_group', 'status_class'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpActiveRequests = new Gauge({
      name: 'acres_http_active_requests',
      help: 'Current number of in-flight HTTP requests',
      registers: [this.registry],
    });

    this.postgresPoolConnectionsTotal = new Gauge({
      name: 'acres_postgres_pool_connections_total',
      help: 'Connections in the current process pg.Pool',
      registers: [this.registry],
      collect: () => {
        if (!this.prisma) return;
        const snapshot = this.prisma.getPoolSnapshot();
        this.postgresPoolConnectionsTotal.set(snapshot.total);
        this.postgresPoolConnectionsIdle.set(snapshot.idle);
        this.postgresPoolRequestsWaiting.set(snapshot.waiting);
        this.postgresPoolConnectionsMax.set(snapshot.max);
      },
    });
    this.postgresPoolConnectionsIdle = new Gauge({
      name: 'acres_postgres_pool_connections_idle',
      help: 'Idle connections in the current process pg.Pool',
      registers: [this.registry],
    });
    this.postgresPoolRequestsWaiting = new Gauge({
      name: 'acres_postgres_pool_requests_waiting',
      help: 'Requests waiting to acquire the current process pg.Pool connection',
      registers: [this.registry],
    });
    this.postgresPoolConnectionsMax = new Gauge({
      name: 'acres_postgres_pool_connections_max',
      help: 'Configured maximum connections in the current process pg.Pool',
      registers: [this.registry],
    });

    this.postgresPoolAcquisitionDurationSeconds = new Histogram({
      name: 'acres_postgres_pool_acquisition_duration_seconds',
      help: 'Duration of PostgreSQL connection pool acquisition in seconds',
      buckets: [
        0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5,
        5,
      ],
      registers: [this.registry],
    });

    if (typeof this.prisma?.onAcquisition === 'function') {
      this.unsubscribeAcquisition = this.prisma.onAcquisition(
        (durationSeconds: number) => {
          this.postgresPoolAcquisitionDurationSeconds.observe(durationSeconds);
        },
      );
    }

    this.outboxPendingEvents = new Gauge({
      name: 'acres_outbox_pending_events',
      help: 'Current count of pending outbox events awaiting delivery',
      registers: [this.registry],
      collect: async () => {
        if (this.prisma) {
          try {
            const count = await this.prisma.outboxEvent.count({
              where: { state: 'pending' },
            });
            this.outboxPendingEvents.set(count);
          } catch {
            // Database may be offline or migrating
          }
        }
      },
    });

    this.queueJobsTotal = new Counter({
      name: 'acres_queue_jobs_total',
      help: 'Total number of background worker queue jobs executed',
      labelNames: ['queue_name', 'status'],
      registers: [this.registry],
    });

    this.queueActiveJobs = new Gauge({
      name: 'acres_queue_active_jobs',
      help: 'Current active jobs in worker queue',
      labelNames: ['queue_name'],
      registers: [this.registry],
    });

    this.queueWaitingJobs = new Gauge({
      name: 'acres_queue_waiting_jobs',
      help: 'Current waiting jobs in worker queue',
      labelNames: ['queue_name'],
      registers: [this.registry],
    });

    this.scheduledJobRunsTotal = new Counter({
      name: 'acres_scheduled_job_runs_total',
      help: 'Total runs of scheduled maintenance and sync jobs',
      labelNames: ['job_name', 'status'],
      registers: [this.registry],
    });

    this.databaseQueryDurationSeconds = new Histogram({
      name: 'acres_database_query_duration_seconds',
      help: 'Duration of database operations in seconds',
      labelNames: ['operation'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });

    this.parserExecutionsTotal = new Counter({
      name: 'acres_parser_executions_total',
      help: 'Total number of parser executions',
      labelNames: ['source_kind', 'status'],
      registers: [this.registry],
    });

    this.parserExecutionDurationSeconds = new Histogram({
      name: 'acres_parser_execution_duration_seconds',
      help: 'Duration of parser executions in seconds',
      labelNames: ['source_kind', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15],
      registers: [this.registry],
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  normalizeRouteGroup(path: string): RouteGroup {
    return normalizeRouteGroup(path);
  }

  statusClass(statusCode: number): StatusClass {
    return statusClass(statusCode);
  }

  recordHttpRequest(
    method: string,
    rawPath: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const route_group = this.normalizeRouteGroup(rawPath);
    const status_class = this.statusClass(statusCode);
    const safeMethod = (method || 'GET').toUpperCase();

    this.httpRequestsTotal.inc({
      method: safeMethod,
      route_group,
      status_class,
    });
    if (statusCode === 429) {
      this.http429ResponsesTotal.inc();
    }
    this.httpRequestDurationSeconds.observe(
      {
        method: safeMethod,
        route_group,
        status_class,
      },
      durationSeconds,
    );
  }

  recordJobRun(
    jobName: string,
    status: 'running' | 'succeeded' | 'failed',
  ): void {
    this.scheduledJobRunsTotal.inc({ job_name: jobName, status });
  }

  recordQueueJob(queueName: string, status: 'completed' | 'failed'): void {
    this.queueJobsTotal.inc({ queue_name: queueName, status });
  }

  recordParserExecution(
    sourceKind: SourceKind,
    status: ParserExecutionStatus,
    durationSeconds: number,
  ): void {
    const safeKind =
      sourceKind === 'csv' || sourceKind === 'xlsx' || sourceKind === 'geojson'
        ? sourceKind
        : 'unknown';
    this.parserExecutionsTotal.inc({ source_kind: safeKind, status });
    this.parserExecutionDurationSeconds.observe(
      { source_kind: safeKind, status },
      durationSeconds,
    );
  }

  onModuleDestroy(): void {
    this.unsubscribeAcquisition?.();
    this.registry.clear();
  }
}
