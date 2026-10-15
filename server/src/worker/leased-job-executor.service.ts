import { Injectable, Logger } from '@nestjs/common';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import {
  deterministicKeyFor,
  toJobPayload,
  type QueueMessage,
} from '../queue/queue-message';
import { JobLeaseService, type JobLease } from './job-lease.service';
import { JobProcessorService } from './job-processor.service';

/** Durable-safe message for unexpected executor exceptions. */
export const JOB_EXCEPTION_MESSAGE = 'Job processing failed unexpectedly.';

/** Another live executor holds this job; retry once its lease can expire. */
export class JobLeaseBusyError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('Job execution lease is held by another executor.');
    this.name = 'JobLeaseBusyError';
  }
}

/**
 * The named aggregate is not visible (yet). A producer may publish before its
 * transaction commits, so this is retried before the message is given up.
 */
export class AggregateNotVisibleError extends Error {
  constructor() {
    super('Queue message names an aggregate that is not visible.');
    this.name = 'AggregateNotVisibleError';
  }
}

/**
 * The attempt budget in `DurableJob` is spent and the ledger now holds the
 * dead letter. Only this failure may be acknowledged to the queue.
 */
export class JobAttemptsExhaustedError extends Error {
  constructor(readonly durableJobId: string) {
    super('Job attempts exhausted and dead-lettered.');
    this.name = 'JobAttemptsExhaustedError';
  }
}

export type ExecutionOutcome = 'processed' | 'already_terminal';

type Owner = { organizationId: string; uploadId: string | null };
type LedgerState = 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * Runs one at-least-once delivery under a database execution lease. The
 * message only names the job; tenant ownership comes from PostgreSQL, and the
 * request-independent `JobProcessorService` owns every business effect.
 * Attempts are counted in `DurableJob` (work actually started), never from
 * the provider's delivery count, so busy-lease redeliveries spend no budget.
 */
@Injectable()
export class LeasedJobExecutorService {
  private readonly logger = new Logger(LeasedJobExecutorService.name);

  constructor(
    private readonly tenants: TenantTransactionService,
    private readonly leases: JobLeaseService,
    private readonly processor: JobProcessorService,
  ) {}

  async execute(message: QueueMessage): Promise<ExecutionOutcome> {
    const owner = await this.resolveOwner(message);
    if (owner === null) throw new AggregateNotVisibleError();
    const deterministicKey = deterministicKeyFor(message);
    const lease = await this.leases.acquire({
      deterministicKey,
      jobType: message.jobName,
      organizationId: owner.organizationId,
      uploadId: owner.uploadId,
    });
    if (lease === null) {
      throw new JobLeaseBusyError(
        await this.leases.remainingMs(deterministicKey),
      );
    }
    try {
      const job = await this.tenants.workerScoped((tx) =>
        tx.durableJob.findUniqueOrThrow({
          where: { id: lease.durableJobId },
          select: { state: true, attempts: true, maxAttempts: true },
        }),
      );
      if (
        job.state === 'dead_lettered' ||
        job.state === 'succeeded' ||
        job.state === 'cancelled'
      )
        return 'already_terminal';
      // Aggregate publication may have committed before ledger completion failed.
      // Honor that terminal state before deciding whether the budget is exhausted.
      const before = await this.aggregateLedgerState(message);
      if (before !== 'running') {
        await this.syncTerminal(lease, before);
        return 'already_terminal';
      }
      if (job.attempts >= job.maxAttempts) {
        // A crash may have spent the last execution attempt without recording its
        // exhaustion. Record it durably without starting or incrementing work.
        const recorded = await this.recordFailure(
          lease,
          owner.organizationId,
          message,
          false,
        );
        if (!recorded)
          throw new Error('Job budget exhaustion could not be recorded.');
        throw new JobAttemptsExhaustedError(lease.durableJobId);
      }
      return await this.processClaimed(message, owner, lease);
    } finally {
      try {
        await this.leases.release(lease);
      } catch {
        // The lease then expires on its own; never mask the job outcome.
        this.logger.warn(`Lease release failed for job ${lease.durableJobId}`);
      }
    }
  }

  private async processClaimed(
    message: QueueMessage,
    owner: Owner,
    lease: JobLease,
  ): Promise<ExecutionOutcome> {
    // Upload processing owns its ledger writes; ingestion/export mirror outcomes.
    const mirrorsLedger = message.jobName !== 'upload.completed';
    try {
      if (mirrorsLedger) await this.markStarted(lease);
      await this.processor.process(toJobPayload(message), {
        resumeInterrupted: true,
      });
      if (mirrorsLedger) {
        const after = await this.aggregateLedgerState(message);
        if (after !== 'running') await this.syncTerminal(lease, after);
      }
      return 'processed';
    } catch (error) {
      // Server logs only; durable columns carry the fixed safe message.
      this.logger.error(
        `Job ${lease.durableJobId} (${message.jobName}) threw: ${
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error)
        }`,
      );
      const exhausted = await this.recordFailure(
        lease,
        owner.organizationId,
        message,
        mirrorsLedger,
      );
      if (exhausted) throw new JobAttemptsExhaustedError(lease.durableJobId);
      throw error;
    }
  }

  private resolveOwner(message: QueueMessage): Promise<Owner | null> {
    return this.tenants.workerScoped(async (tx) => {
      switch (message.jobName) {
        case 'upload.completed': {
          const upload = await tx.upload.findUnique({
            where: { id: message.id },
            select: { organizationId: true },
          });
          return upload?.organizationId
            ? { organizationId: upload.organizationId, uploadId: message.id }
            : null;
        }
        case 'ingestion.run': {
          const run = await tx.ingestionRun.findUnique({
            where: { id: message.id },
            select: { organizationId: true, uploadId: true },
          });
          return run === null
            ? null
            : { organizationId: run.organizationId, uploadId: run.uploadId };
        }
        case 'export.requested': {
          const request = await tx.exportRequest.findUnique({
            where: { id: message.id },
            select: { organizationId: true },
          });
          return request === null
            ? null
            : { organizationId: request.organizationId, uploadId: null };
        }
      }
    });
  }

  /** Ledger state implied by the authoritative aggregate's own state. */
  private aggregateLedgerState(message: QueueMessage): Promise<LedgerState> {
    return this.tenants.workerScoped(async (tx): Promise<LedgerState> => {
      if (message.jobName === 'upload.completed') {
        const upload = await tx.upload.findUnique({
          where: { id: message.id },
          select: { state: true },
        });
        switch (upload?.state) {
          case 'accepted':
            return 'succeeded';
          case 'rejected':
            return 'failed';
          case 'cancelled':
          case 'expired':
            return 'cancelled';
          default:
            return 'running';
        }
      }
      if (message.jobName === 'ingestion.run') {
        const run = await tx.ingestionRun.findUnique({
          where: { id: message.id },
          select: { state: true },
        });
        switch (run?.state) {
          case 'published':
            return 'succeeded';
          case 'failed':
          case 'validation_failed':
            return 'failed';
          case 'cancelled':
            return 'cancelled';
          default:
            return 'running';
        }
      }
      const request = await tx.exportRequest.findUnique({
        where: { id: message.id },
        select: { status: true },
      });
      switch (request?.status) {
        case 'succeeded':
        case 'failed':
        case 'cancelled':
          return request.status;
        default:
          return 'running';
      }
    });
  }

  private async markStarted(lease: JobLease): Promise<void> {
    await this.tenants.workerScoped((tx) =>
      tx.durableJob.update({
        where: { id: lease.durableJobId },
        data: {
          state: 'running',
          attempts: { increment: 1 },
          startedAt: new Date(),
          finishedAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      }),
    );
  }

  /**
   * Idempotent: an already-matching row keeps its original `finishedAt`, and a
   * dead-lettered row is never downgraded by a later duplicate.
   */
  private async syncTerminal(
    lease: JobLease,
    state: Exclude<LedgerState, 'running'>,
  ): Promise<void> {
    await this.tenants.workerScoped((tx) =>
      tx.durableJob.updateMany({
        where: {
          id: lease.durableJobId,
          state: { notIn: [state, 'dead_lettered'] },
        },
        data: { state, finishedAt: new Date() },
      }),
    );
  }

  /**
   * Records the failed attempt and reports whether the budget is spent with
   * the dead letter durably written. Any ledger failure reports `false`, so
   * the message is retried rather than acknowledged unrecorded.
   */
  private async recordFailure(
    lease: JobLease,
    organizationId: string,
    message: QueueMessage,
    mirrorsLedger: boolean,
  ): Promise<boolean> {
    try {
      return await this.tenants.workerScoped(async (tx) => {
        const job = await tx.durableJob.findUniqueOrThrow({
          where: { id: lease.durableJobId },
          select: { attempts: true, maxAttempts: true },
        });
        const exhausted = job.attempts >= job.maxAttempts;
        if (!exhausted) {
          // The upload processor already recorded its own failed attempt.
          if (mirrorsLedger) {
            await tx.durableJob.update({
              where: { id: lease.durableJobId },
              data: {
                state: 'failed',
                finishedAt: new Date(),
                lastErrorCode: 'worker_exception',
                lastErrorMessage: JOB_EXCEPTION_MESSAGE,
              },
            });
          }
          return false;
        }
        await tx.durableJob.update({
          where: { id: lease.durableJobId },
          data: {
            state: 'dead_lettered',
            finishedAt: new Date(),
            lastErrorCode: 'worker_exception',
            lastErrorMessage: JOB_EXCEPTION_MESSAGE,
          },
        });
        const existing = await tx.jobDeadLetter.count({
          where: { durableJobId: lease.durableJobId },
        });
        if (existing === 0) {
          await tx.jobDeadLetter.create({
            data: {
              organizationId,
              durableJobId: lease.durableJobId,
              reasonCode: 'worker_exception',
              reasonMessage: JOB_EXCEPTION_MESSAGE,
              payload: { jobName: message.jobName, id: message.id },
            },
          });
        }
        return true;
      });
    } catch {
      this.logger.warn(`Ledger update failed for job ${lease.durableJobId}`);
      return false;
    }
  }
}
