import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { AcresConfigService } from '../config/acres-config.service';
import type { QueuePort, QueueJobPayload } from './work-queue.port';

@Injectable()
export class BullmqQueueAdapter implements QueuePort, OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly queue: Queue<QueueJobPayload>;

  constructor(private readonly config: AcresConfigService) {
    this.connection = new IORedis(config.valkeyUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    this.queue = new Queue<QueueJobPayload>(config.queueName, {
      connection: this.connection,
      prefix: config.queuePrefix,
      defaultJobOptions: {
        attempts: config.queueDefaultAttempts,
        backoff: { type: 'exponential', delay: config.queueBackoffMs },
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 7 * 24 * 60 * 60 },
      },
    });
  }

  async enqueue(input: {
    deterministicKey: string;
    jobName: string;
    payload: QueueJobPayload;
    delayMs?: number;
  }): Promise<void> {
    await this.queue.add(input.jobName, input.payload, {
      jobId: input.deterministicKey,
      delay: input.delayMs ?? 0,
    });
  }

  async readiness(): Promise<boolean> {
    try {
      await this.queue.getJobCounts('waiting');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }
}
