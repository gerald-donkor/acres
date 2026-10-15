import { Logger } from '@nestjs/common';
import {
  InvalidQueueMessageError,
  parseQueueMessage,
  type QueueMessage,
} from '../queue/queue-message';
import {
  AggregateNotVisibleError,
  JobAttemptsExhaustedError,
  JobLeaseBusyError,
  type ExecutionOutcome,
} from '../worker/leased-job-executor.service';

export interface ConsumerDelivery {
  readonly messageId: string;
  readonly deliveryCount: number;
}

export type ConsumerRetry = { afterSeconds: number } | { acknowledge: true };

export interface ConsumerRuntime {
  execute(message: QueueMessage): Promise<ExecutionOutcome>;
  readonly backoffMs: number;
}

/** Used only until the first runtime resolves (e.g. boot itself failed). */
const BOOT_FALLBACK_BACKOFF_MS = 30_000;
const MAX_RETRY_SECONDS = 900;
/** Deliveries allowed for an aggregate to become visible after publish. */
export const MISSING_AGGREGATE_DELIVERIES = 5;

/**
 * Framework-free consumer core. The SDK acknowledges when `handle` resolves and
 * consults `retry` when it throws. Forged deliveries cannot reach the function
 * (queue triggers have no public route); the strict parser and database
 * re-reads are defence in depth, not the access control.
 *
 * A failure is acknowledged only once the ledger holds its dead letter
 * (`JobAttemptsExhaustedError`). Every other failure keeps retrying until the
 * message's retention ends; the trigger's `maxDeliveries` must stay unset.
 */
export function createQueueConsumer(
  resolveRuntime: () => Promise<ConsumerRuntime>,
  logger: Pick<Logger, 'warn' | 'log'> = new Logger('QueueConsumer'),
) {
  let backoffMs = BOOT_FALLBACK_BACKOFF_MS;

  async function handle(raw: unknown, delivery: ConsumerDelivery) {
    let message: QueueMessage;
    try {
      message = parseQueueMessage(raw);
    } catch (error) {
      if (!(error instanceof InvalidQueueMessageError)) throw error;
      // A malformed message can never succeed; acknowledge it (no payload logged).
      logger.warn(`Dropped malformed queue message ${delivery.messageId}`);
      return;
    }
    const runtime = await resolveRuntime();
    backoffMs = runtime.backoffMs;
    await runtime.execute(message);
  }

  function retry(error: unknown, delivery: ConsumerDelivery): ConsumerRetry {
    if (error instanceof JobAttemptsExhaustedError)
      return { acknowledge: true };
    if (error instanceof JobLeaseBusyError) {
      // Another executor is live; never give up on its account.
      const seconds = Math.ceil(error.retryAfterMs / 1000) + 1;
      return {
        afterSeconds: Math.min(Math.max(seconds, 5), MAX_RETRY_SECONDS),
      };
    }
    if (error instanceof AggregateNotVisibleError) {
      if (delivery.deliveryCount >= MISSING_AGGREGATE_DELIVERIES) {
        logger.warn(
          `Queue message ${delivery.messageId} names an aggregate that never became visible`,
        );
        return { acknowledge: true };
      }
      return {
        afterSeconds: Math.min(5 * 2 ** (delivery.deliveryCount - 1), 60),
      };
    }
    const base = Math.max(1, Math.ceil(backoffMs / 1000));
    return {
      afterSeconds: Math.min(
        base * 2 ** Math.max(0, delivery.deliveryCount - 1),
        MAX_RETRY_SECONDS,
      ),
    };
  }

  return { handle, retry };
}
