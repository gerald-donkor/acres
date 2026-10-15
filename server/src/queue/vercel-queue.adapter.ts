import { Injectable } from '@nestjs/common';
import { QueueClient } from '@vercel/queue';
import { AcresConfigService } from '../config/acres-config.service';
import { toQueueMessage } from './queue-message';
import type {
  QueueJobName,
  QueueJobPayload,
  QueuePort,
} from './work-queue.port';

/** The publishing subset of `QueueClient`, injectable for tests. */
export type QueueSender = Pick<QueueClient, 'send'>;

/**
 * Vercel Queues producer. Topics are partitioned by deployment, so a message
 * returns to the deployment that published it (preview cannot reach
 * production). Authentication is the deployment's OIDC identity, resolved by
 * the SDK; no queue credential is configured or stored.
 */
@Injectable()
export class VercelQueueAdapter implements QueuePort {
  private client?: QueueSender;

  constructor(
    private readonly config: AcresConfigService,
    client?: QueueSender,
  ) {
    this.client = client;
  }

  async enqueue(input: {
    deterministicKey: string;
    jobName: QueueJobName;
    payload: QueueJobPayload;
    delayMs?: number;
  }): Promise<void> {
    const message = toQueueMessage(input.jobName, input.payload);
    await this.getClient().send(this.config.vercelQueueTopic, message, {
      // Same semantics as the BullMQ jobId: a re-publish within the provider
      // window is dropped. The DurableJob ledger, not this key, is authority.
      idempotencyKey: input.deterministicKey,
      retentionSeconds: this.config.vercelQueueRetentionSeconds,
      ...(input.delayMs
        ? {
            // Leave at least a minute of visibility before expiry.
            delaySeconds: Math.max(
              0,
              Math.min(
                Math.ceil(input.delayMs / 1000),
                this.config.vercelQueueRetentionSeconds - 60,
              ),
            ),
          }
        : {}),
    });
  }

  /**
   * Publishing needs the deployment's OIDC identity, which exists only inside a
   * Vercel deployment. There is no side-effect-free remote probe to call.
   */
  readiness(): Promise<boolean> {
    return Promise.resolve(this.config.vercelDeploymentId !== undefined);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  private getClient(): QueueSender {
    this.client ??= new QueueClient({ region: this.config.vercelQueueRegion });
    return this.client;
  }
}
