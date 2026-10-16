import { Inject, Injectable, Optional } from '@nestjs/common';
import { PostgresThrottlerStorage } from '../security/postgres-throttler.storage';
import { AcresConfigService } from '../config/acres-config.service';
import {
  JobReconciliationService,
  type JobReconciliationResult,
} from './job-reconciliation.service';
import {
  OutboxDispatcherService,
  type OutboxDispatchResult,
} from './outbox-dispatcher.service';

export interface ManagedSweepResult {
  enabled: boolean;
  passes: number;
  stoppedBy: 'drained' | 'pass_cap' | 'budget' | 'disabled';
  reconciliation: Omit<JobReconciliationResult, 'enabled'>;
  dispatch: OutboxDispatchResult;
  throttleCleanup: { deleted: number; failed: boolean };
}

export const SWEEP_MAX_PASSES = 8;
export const SWEEP_BUDGET_MS = 120_000;
export const SWEEP_CLOCK = Symbol('SWEEP_CLOCK');

@Injectable()
export class ManagedDispatchRunnerService {
  private readonly now: () => number;

  constructor(
    private readonly config: AcresConfigService,
    private readonly reconciler: JobReconciliationService,
    private readonly dispatcher: OutboxDispatcherService,
    private readonly throttleStorage: PostgresThrottlerStorage,
    @Optional() @Inject(SWEEP_CLOCK) sweepClock?: () => number,
  ) {
    this.now = sweepClock ?? (() => Date.now());
  }

  async sweep(): Promise<ManagedSweepResult> {
    const reconciliation: Omit<JobReconciliationResult, 'enabled'> = {
      examined: 0,
      rearmed: 0,
      repaired: 0,
      exhausted: 0,
      rejected: 0,
    };
    const dispatch: OutboxDispatchResult = {
      claimed: 0,
      dispatched: 0,
      retried: 0,
      exhausted: 0,
      rejected: 0,
      lostClaims: 0,
    };

    const throttleCleanup = { deleted: 0, failed: false };

    if (this.config.queueProvider !== 'vercel') {
      return {
        enabled: false,
        passes: 0,
        stoppedBy: 'disabled',
        reconciliation,
        dispatch,
        throttleCleanup,
      };
    }

    // One capped batch per invocation; cleanup failure never blocks dispatch.
    try {
      throttleCleanup.deleted = await this.throttleStorage.cleanupOnce();
    } catch {
      throttleCleanup.failed = true;
    }

    const batchSize = this.config.outboxClaimBatchSize;
    const deadline = this.now() + SWEEP_BUDGET_MS;
    let passes = 0;
    let stoppedBy: ManagedSweepResult['stoppedBy'] = 'pass_cap';
    let lastReconciliationFull = false;

    while (passes < SWEEP_MAX_PASSES) {
      if (passes > 0 && this.now() >= deadline) {
        stoppedBy = 'budget';
        break;
      }

      const shouldReconcile = passes === 0 || lastReconciliationFull;
      if (shouldReconcile) {
        const r = await this.reconciler.reconcileOnce();
        reconciliation.examined += r.examined;
        reconciliation.rearmed += r.rearmed;
        reconciliation.repaired += r.repaired;
        reconciliation.exhausted += r.exhausted;
        reconciliation.rejected += r.rejected;
        lastReconciliationFull = r.examined === batchSize;
      }

      const d = await this.dispatcher.dispatchOnce();
      dispatch.claimed += d.claimed;
      dispatch.dispatched += d.dispatched;
      dispatch.retried += d.retried;
      dispatch.exhausted += d.exhausted;
      dispatch.rejected += d.rejected;
      dispatch.lostClaims += d.lostClaims;

      passes++;

      const reconciliationNotFull = !shouldReconcile || !lastReconciliationFull;
      if (d.claimed < batchSize && reconciliationNotFull) {
        stoppedBy = 'drained';
        break;
      }
    }

    return {
      enabled: true,
      passes,
      stoppedBy,
      reconciliation,
      dispatch,
      throttleCleanup,
    };
  }
}
