import type { INestApplicationContext } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { ManagedDispatchRunnerService } from '../outbox/managed-dispatch-runner.service';
import { createDispatchRuntimeResolver } from './dispatch-runtime';

function mockContext(queueProvider: 'vercel' | 'bullmq') {
  const sweep = jest.fn().mockResolvedValue({
    enabled: true,
    passes: 1,
    stoppedBy: 'drained',
  });
  const app = {
    get: jest.fn((token: unknown) =>
      token === AcresConfigService
        ? { queueProvider }
        : token === ManagedDispatchRunnerService
          ? { sweep }
          : undefined,
    ),
  } as unknown as INestApplicationContext;
  return { app, sweep };
}

describe('createDispatchRuntimeResolver', () => {
  it('boots once and reuses the context across calls', async () => {
    const { app, sweep } = mockContext('vercel');
    const create = jest.fn().mockResolvedValue(app);
    const resolve = createDispatchRuntimeResolver(create);

    const first = await resolve();
    const second = await resolve();

    expect(create).toHaveBeenCalledTimes(1);
    await first.sweep();
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(second).toBeDefined();
  });

  it('resets context and retries boot on the next call after a rejection', async () => {
    const { app } = mockContext('vercel');
    const create = jest
      .fn()
      .mockRejectedValueOnce(new Error('boot failed'))
      .mockResolvedValueOnce(app);
    const resolve = createDispatchRuntimeResolver(create);

    await expect(resolve()).rejects.toThrow('boot failed');
    await expect(resolve()).resolves.toBeDefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('throws for a non-Vercel queue provider', async () => {
    const { app } = mockContext('bullmq');
    const resolve = createDispatchRuntimeResolver(() => Promise.resolve(app));

    await expect(resolve()).rejects.toThrow(
      'The dispatch function requires QUEUE_PROVIDER="vercel".',
    );
  });
});
