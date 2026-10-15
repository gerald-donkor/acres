import type { INestApplicationContext } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { ManagedDispatchRunnerService } from '../outbox/managed-dispatch-runner.service';
import type { DispatchRuntime } from './dispatch-handler';

export function createDispatchRuntimeResolver(
  createContext: () => Promise<INestApplicationContext>,
): () => Promise<DispatchRuntime> {
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
      throw new Error(
        'The dispatch function requires QUEUE_PROVIDER="vercel".',
      );
    }
    const runner = app.get(ManagedDispatchRunnerService);
    return {
      sweep: () => runner.sweep(),
    };
  };
}
