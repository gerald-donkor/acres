import type { INestApplicationContext } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { LeasedJobExecutorService } from '../worker/leased-job-executor.service';
import type { ConsumerRuntime } from './queue-consumer';

/**
 * Creates the Nest application context once per instance (reused by Fluid
 * compute) and lets a failed boot be retried by the next delivery.
 */
export function createRuntimeResolver(
  createContext: () => Promise<INestApplicationContext>,
): () => Promise<ConsumerRuntime> {
  let context: Promise<INestApplicationContext> | undefined;
  return async () => {
    context ??= createContext();
    let app: INestApplicationContext;
    try {
      app = await context;
    } catch (error) {
      context = undefined;
      throw error;
    }
    const config = app.get(AcresConfigService);
    if (config.queueProvider !== 'vercel') {
      throw new Error('The jobs function requires QUEUE_PROVIDER="vercel".');
    }
    const executor = app.get(LeasedJobExecutorService);
    return {
      execute: (message) => executor.execute(message),
      backoffMs: config.queueBackoffMs,
    };
  };
}
