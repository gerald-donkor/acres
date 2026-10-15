import { Inject, Injectable } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import { toJobPayload, toQueueMessage } from '../queue/queue-message';
import { WORK_QUEUE, type QueuePort } from '../queue/work-queue.port';
import {
  OutboxService,
  type ClaimedOutboxEvent,
  type OutboxFailureCode,
} from './outbox.service';

export interface OutboxDispatchResult {
  claimed: number;
  dispatched: number;
  retried: number;
  exhausted: number;
  rejected: number;
  lostClaims: number;
}

class InvalidOutboxIdentity extends Error {
  constructor(readonly code: OutboxFailureCode) {
    super(code);
  }
}

function messageFor(event: ClaimedOutboxEvent) {
  const id = event.aggregateId;
  try {
    switch (event.eventType) {
      case 'upload.completed':
        if (event.aggregateType === 'Upload')
          return toQueueMessage(event.eventType, {
            uploadId: id,
            outboxEventId: event.id,
          });
        break;
      case 'export.requested':
        if (event.aggregateType === 'ExportRequest')
          return toQueueMessage(event.eventType, {
            exportRequestId: id,
            outboxEventId: event.id,
          });
        break;
      case 'ingestion.run':
        if (event.aggregateType === 'IngestionRun')
          return toQueueMessage(event.eventType, {
            ingestionRunId: id,
            outboxEventId: event.id,
          });
        break;
    }
  } catch {
    throw new InvalidOutboxIdentity('outbox_event_invalid');
  }
  throw new InvalidOutboxIdentity('outbox_event_invalid');
}

/** A bounded, awaited operation. No listener, timer, or boot-time publication. */
@Injectable()
export class OutboxDispatcherService {
  constructor(
    private readonly config: AcresConfigService,
    private readonly tenants: TenantTransactionService,
    private readonly outbox: OutboxService,
    @Inject(WORK_QUEUE) private readonly queue: QueuePort,
  ) {}

  async dispatchOnce(): Promise<OutboxDispatchResult> {
    const result: OutboxDispatchResult = {
      claimed: 0,
      dispatched: 0,
      retried: 0,
      exhausted: await this.outbox.recoverExhausted(),
      rejected: 0,
      lostClaims: 0,
    };
    const events = await this.outbox.claimReady();
    result.claimed = events.length;
    for (const event of events) {
      let message: ReturnType<typeof messageFor>;
      try {
        message = messageFor(event);
        await this.prepareLedger(event);
      } catch (error) {
        if (!(error instanceof InvalidOutboxIdentity)) throw error;
        if (await this.outbox.markDeadLetter(event, error.code))
          result.rejected++;
        else result.lostClaims++;
        continue;
      }
      // Sequential work can outlive a batch lease. Never knowingly publish stale work.
      if (!(await this.outbox.ownsClaim(event))) {
        result.lostClaims++;
        continue;
      }
      try {
        // Transport calls are outside ALL SQL transactions.
        await this.queue.enqueue({
          deterministicKey: `${message.jobName}:${message.id}`,
          jobName: message.jobName,
          payload: toJobPayload(message),
        });
      } catch {
        if (event.attempts >= event.maxAttempts) {
          if (await this.outbox.markDeadLetter(event)) result.exhausted++;
          else result.lostClaims++;
        } else {
          if (await this.outbox.markRetry(event)) result.retried++;
          else result.lostClaims++;
        }
        continue;
      }
      // A ledger failure must reject the invocation, not become a provider failure
      // or successful acknowledgement. Expiry then permits at-least-once recovery.
      if (await this.outbox.markDispatched(event)) result.dispatched++;
      else result.lostClaims++;
    }
    return result;
  }

  private prepareLedger(event: ClaimedOutboxEvent): Promise<void> {
    return this.tenants.workerScoped(async (tx) => {
      let uploadId: string | null =
        event.eventType === 'upload.completed' ? event.aggregateId : null;
      if (event.eventType === 'ingestion.run') {
        const run = await tx.ingestionRun.findUnique({
          where: { id: event.aggregateId },
          select: { uploadId: true, organizationId: true },
        });
        if (run === null || run.organizationId !== event.organizationId)
          throw new InvalidOutboxIdentity('outbox_job_mismatch');
        uploadId = run.uploadId;
      }
      const deterministicKey = `${event.eventType}:${event.aggregateId}`;
      // INSERT ... ON CONFLICT DO NOTHING: no state, budget, history or execution
      // lease on an existing job is ever changed, including by a concurrent claim.
      await tx.durableJob.createMany({
        data: [
          {
            deterministicKey,
            organizationId: event.organizationId,
            uploadId,
            jobType: event.eventType,
            state: 'queued',
            maxAttempts: this.config.queueDefaultAttempts,
          },
        ],
        skipDuplicates: true,
      });
      const job = await tx.durableJob.findUniqueOrThrow({
        where: { deterministicKey },
      });
      if (
        job.organizationId !== event.organizationId ||
        job.jobType !== event.eventType ||
        job.uploadId !== uploadId
      )
        throw new InvalidOutboxIdentity('outbox_job_mismatch');
    });
  }
}
