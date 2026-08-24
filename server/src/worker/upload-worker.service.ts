import { Inject, Injectable, Logger } from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AcresConfigService } from '../config/acres-config.service';
import { OutboxService } from '../outbox/outbox.service';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import {
  MALWARE_SCANNER,
  type MalwareScannerPort,
} from '../scanner/scanner.port';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../storage/storage.port';
import { WORK_QUEUE, type QueuePort } from '../queue/work-queue.port';

interface UploadJobData {
  readonly uploadId?: string;
  readonly outboxEventId?: string;
}

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
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScannerPort,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
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
            await tx.durableJob.upsert({
              where: {
                deterministicKey,
              },
              update: {
                state: 'queued',
                organizationId: event.organizationId,
                uploadId: event.aggregateId,
                jobType: event.eventType,
                maxAttempts: this.config.queueDefaultAttempts,
                lastErrorCode: null,
                lastErrorMessage: null,
              },
              create: {
                deterministicKey,
                organizationId: event.organizationId,
                uploadId: event.aggregateId,
                jobType: event.eventType,
                state: 'queued',
                maxAttempts: this.config.queueDefaultAttempts,
              },
            });
          });
          await this.queue.enqueue({
            deterministicKey,
            jobName: event.eventType,
            payload: { uploadId: event.aggregateId, outboxEventId: event.id },
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
    if (this.stopping || data.uploadId === undefined) return;
    const upload = await this.tenants.workerScoped((tx) => {
      return tx.upload.findUnique({
        where: { id: data.uploadId },
        include: { storedObject: true },
      });
    });
    if (upload === null || upload.organizationId === null) return;
    const deterministicKey = `upload.completed:${upload.id}`;
    const durableJob = await this.tenants.workerScoped((tx) =>
      tx.durableJob.upsert({
        where: { deterministicKey },
        update: {
          state: 'running',
          attempts: { increment: 1 },
          startedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        create: {
          deterministicKey,
          organizationId: upload.organizationId,
          uploadId: upload.id,
          jobType: 'upload.completed',
          state: 'running',
          attempts: 1,
          maxAttempts: this.config.queueDefaultAttempts,
          startedAt: new Date(),
        },
      }),
    );
    try {
      await this.tenants.organizationScoped(
        upload.actorAccountId,
        upload.organizationId,
        async (tx) => {
          const fresh = await tx.upload.findFirst({
            where: { id: upload.id, organizationId: upload.organizationId },
          });
          if (fresh === null || fresh.state !== 'completed') return;
          await tx.upload.update({
            where: { id: upload.id },
            data: {
              state: 'scanning',
              progressStage: 'scanning',
              progressPercent: 50,
            },
          });
          await tx.jobProgressEvent.create({
            data: {
              organizationId: upload.organizationId,
              uploadId: upload.id,
              durableJobId: durableJob.id,
              stage: 'scanning',
              percent: 50,
            },
          });
        },
      );

      const bytes = await this.storage.getBuffer(upload.storedObject.objectKey);
      const scan =
        bytes === null
          ? ({ status: 'failed', errorCode: 'object_missing' } as const)
          : await this.scanner.scanBuffer(bytes);
      const terminalState = await this.tenants.organizationScoped(
        upload.actorAccountId,
        upload.organizationId,
        async (tx) => {
          const fresh = await tx.upload.findFirst({
            where: { id: upload.id, organizationId: upload.organizationId },
          });
          if (fresh === null) return 'missing' as const;
          if (fresh.state === 'cancelled') return 'cancelled' as const;
          if (scan.status === 'clean') {
            await tx.upload.update({
              where: { id: upload.id },
              data: {
                state: 'accepted',
                scanStatus: 'clean',
                scanResult: 'clean',
                progressStage: 'accepted',
                progressPercent: 100,
                acceptedAt: new Date(),
              },
            });
            await tx.storedObject.update({
              where: { id: upload.storedObjectId },
              data: { state: 'accepted' },
            });
          } else {
            await tx.upload.update({
              where: { id: upload.id },
              data: {
                state: 'rejected',
                scanStatus: scan.status,
                scanResult: scan.signature ?? scan.errorCode ?? scan.status,
                failureCode: scan.errorCode ?? scan.status,
                failureMessage: 'Upload did not pass malware scanning.',
                progressStage: 'rejected',
                progressPercent: 100,
              },
            });
            await tx.storedObject.update({
              where: { id: upload.storedObjectId },
              data: { state: 'rejected' },
            });
          }
          await tx.jobProgressEvent.create({
            data: {
              organizationId: upload.organizationId,
              uploadId: upload.id,
              durableJobId: durableJob.id,
              stage: scan.status === 'clean' ? 'accepted' : 'rejected',
              percent: 100,
            },
          });
          return scan.status === 'clean'
            ? ('succeeded' as const)
            : ('failed' as const);
        },
      );
      await this.tenants.workerScoped(async (tx) => {
        await tx.durableJob.update({
          where: { id: durableJob.id },
          data: {
            state:
              terminalState === 'cancelled'
                ? 'cancelled'
                : scan.status === 'clean'
                  ? 'succeeded'
                  : 'failed',
            finishedAt: new Date(),
            lastErrorCode:
              terminalState === 'cancelled'
                ? null
                : scan.status === 'clean'
                  ? null
                  : (scan.errorCode ?? scan.status),
            lastErrorMessage:
              terminalState === 'cancelled' || scan.status === 'clean'
                ? null
                : 'Upload did not pass malware scanning.',
          },
        });
        if (terminalState !== 'cancelled' && scan.status !== 'clean') {
          await tx.jobDeadLetter.create({
            data: {
              organizationId: upload.organizationId,
              durableJobId: durableJob.id,
              reasonCode: scan.errorCode ?? scan.status,
              reasonMessage: 'Upload did not pass malware scanning.',
              payload: { uploadId: upload.id },
            },
          });
        }
      });
    } catch (error) {
      await this.finalizeException(
        durableJob.id,
        upload.organizationId,
        upload.id,
        error,
      );
      throw error;
    }
  }

  private async finalizeException(
    durableJobId: string,
    organizationId: string,
    uploadId: string,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.tenants.workerScoped(async (tx) => {
      await tx.durableJob.update({
        where: { id: durableJobId },
        data: {
          state: 'failed',
          finishedAt: new Date(),
          lastErrorCode: 'worker_exception',
          lastErrorMessage: message.slice(0, 500),
        },
      });
      await tx.jobDeadLetter.create({
        data: {
          organizationId,
          durableJobId,
          reasonCode: 'worker_exception',
          reasonMessage: message.slice(0, 500),
          payload: { uploadId },
        },
      });
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.outboxTimer !== undefined) clearInterval(this.outboxTimer);
    await this.worker?.close();
    this.connection?.disconnect();
    await this.queue.close();
  }
}
