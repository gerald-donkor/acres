import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AcresConfigService } from '../config/acres-config.service';
import { MetricsService } from '../metrics/metrics.service';
import { OutboxDispatcherService } from '../outbox/outbox-dispatcher.service';
import {
  WORK_QUEUE,
  type QueueJobPayload,
  type QueuePort,
} from '../queue/work-queue.port';
import { JobProcessorService } from './job-processor.service';

type UploadJobData = QueueJobPayload;

export {
  WORKER_EXCEPTION_MESSAGE,
  REJECTED_SCAN_MESSAGE,
} from './job-processor.service';

@Injectable()
export class UploadWorkerService {
  private readonly logger = new Logger(UploadWorkerService.name);
  private worker?: Worker<UploadJobData>;
  private connection?: IORedis;
  private outboxTimer?: NodeJS.Timeout;
  private dispatching = false;
  private activeDispatch?: Promise<unknown>;
  private stopping = false;

  constructor(
    private readonly config: AcresConfigService,
    private readonly dispatcher: OutboxDispatcherService,
    @Inject(WORK_QUEUE) private readonly queue: QueuePort,
    private readonly processor: JobProcessorService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  async start(): Promise<void> {
    this.connection = new IORedis(this.config.valkeyUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.worker = new Worker<UploadJobData>(
      this.config.queueName,
      (job) => this.process(job.data),
      {
        connection: this.connection,
        prefix: this.config.queuePrefix,
        concurrency: 2,
      },
    );
    this.worker.on('completed', () => {
      this.metrics?.recordQueueJob(this.config.queueName, 'completed');
    });
    this.worker.on('failed', () => {
      this.metrics?.recordQueueJob(this.config.queueName, 'failed');
    });
    await this.dispatchOutboxOnce();
    this.outboxTimer = setInterval(
      () =>
        void this.dispatchOutboxOnce().catch(() => {
          this.logger.error(
            'Outbox dispatch failed; durable intent remains recoverable.',
          );
        }),
      this.config.uploadCleanupIntervalMs,
    );
    this.outboxTimer.unref();
  }

  async dispatchOutboxOnce(): Promise<void> {
    if (this.stopping || this.dispatching) return;
    this.dispatching = true;
    try {
      this.activeDispatch = this.dispatcher.dispatchOnce();
      await this.activeDispatch;
    } finally {
      this.activeDispatch = undefined;
      this.dispatching = false;
    }
  }

  async process(data: UploadJobData): Promise<void> {
    if (this.stopping) return;
    await this.processor.process(data);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.outboxTimer !== undefined) clearInterval(this.outboxTimer);
    // Stop publishing before closing its transport, even on a recording failure.
    await this.activeDispatch?.catch(() => undefined);
    await this.worker?.close();
    this.connection?.disconnect();
    await this.queue.close();
  }
}
