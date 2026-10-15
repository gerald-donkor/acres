import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AcresConfigService } from '../config/acres-config.service';
import { MetricsService } from '../metrics/metrics.service';
import { OutboxService } from '../outbox/outbox.service';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
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
  private stopping = false;

  constructor(
    private readonly config: AcresConfigService,
    private readonly tenants: TenantTransactionService,
    private readonly outbox: OutboxService,
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
      () => void this.dispatchOutboxOnce(),
      this.config.uploadCleanupIntervalMs,
    );
    this.outboxTimer.unref();
  }

  async dispatchOutboxOnce(): Promise<void> {
    if (this.stopping || this.dispatching) return;
    this.dispatching = true;
    try {
      const events = await this.outbox.claimReady();
      for (const event of events) {
        try {
          const deterministicKey = `${event.eventType}:${event.aggregateId}`;
          await this.tenants.workerScoped(async (tx) => {
            const uploadId =
              event.eventType === 'upload.completed' ? event.aggregateId : null;
            await tx.durableJob.upsert({
              where: {
                deterministicKey,
              },
              update: {
                state: 'queued',
                organizationId: event.organizationId,
                uploadId,
                jobType: event.eventType,
                maxAttempts: this.config.queueDefaultAttempts,
                lastErrorCode: null,
                lastErrorMessage: null,
              },
              create: {
                deterministicKey,
                organizationId: event.organizationId,
                uploadId,
                jobType: event.eventType,
                state: 'queued',
                maxAttempts: this.config.queueDefaultAttempts,
              },
            });
          });
          await this.queue.enqueue({
            deterministicKey,
            jobName: event.eventType,
            payload:
              event.eventType === 'export.requested'
                ? {
                    exportRequestId: event.aggregateId,
                    outboxEventId: event.id,
                  }
                : { uploadId: event.aggregateId, outboxEventId: event.id },
          });
          await this.outbox.markDispatched(event.id);
        } catch (error) {
          this.logger.warn(`Outbox dispatch failed: ${String(error)}`);
          if (event.attempts >= event.maxAttempts) {
            await this.outbox.markDeadLetter(event.id, {
              organizationId: event.organizationId,
              reasonCode: 'queue_unavailable',
              reasonMessage: 'Outbox dispatch attempts exhausted.',
              payload: event.payload,
            });
          } else {
            await this.outbox.markRetry(event.id, 'queue_unavailable');
          }
        }
      }
    } finally {
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
    await this.worker?.close();
    this.connection?.disconnect();
    await this.queue.close();
  }
}
