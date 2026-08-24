import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { AcresConfigService } from '../config/acres-config.service';
import type { QueuePort, QueueJobPayload } from './work-queue.port';

@Injectable()
export class BullmqQueueAdapter implements QueuePort, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue<QueueJobPayload>;

  constructor(private readonly config: AcresConfigService) {}

  async enqueue(input: {
    deterministicKey: string;
    jobName: string;
    payload: QueueJobPayload;
    delayMs?: number;
  }): Promise<void> {
    await this.getQueue().add(input.jobName, input.payload, {
      jobId: input.deterministicKey,
      delay: input.delayMs ?? 0,
    });
  }

  async readiness(): Promise<boolean> {
    try {
      await this.getQueue().getJobCounts('waiting');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.queue?.close();
    this.connection?.disconnect();
  }

  private getQueue(): Queue<QueueJobPayload> {
    if (this.queue !== undefined) return this.queue;
    this.connection = new IORedis(this.config.valkeyUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.queue = new Queue<QueueJobPayload>(this.config.queueName, {
      connection: this.connection,
      prefix: this.config.queuePrefix,
      defaultJobOptions: {
        attempts: this.config.queueDefaultAttempts,
        backoff: { type: 'exponential', delay: this.config.queueBackoffMs },
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    });
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
