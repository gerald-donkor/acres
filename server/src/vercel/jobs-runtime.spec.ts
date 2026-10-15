import type { INestApplicationContext } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { LeasedJobExecutorService } from '../worker/leased-job-executor.service';
import { createRuntimeResolver } from './jobs-runtime';

function context(queueProvider: 'vercel' | 'bullmq') {
  const execute = jest.fn().mockResolvedValue('processed');
  const app = {
    get: jest.fn((token: unknown) =>
      token === AcresConfigService
        ? { queueProvider, queueBackoffMs: 7000 }
        : token === LeasedJobExecutorService
          ? { execute }
          : undefined,
    ),
  } as unknown as INestApplicationContext;
  return { app, execute };
}

describe('createRuntimeResolver', () => {
  it('boots once and reuses the context across deliveries', async () => {
    const { app, execute } = context('vercel');
    const create = jest.fn().mockResolvedValue(app);
    const resolve = createRuntimeResolver(create);
    const first = await resolve();
    await resolve();
    expect(create).toHaveBeenCalledTimes(1);
    expect(first.backoffMs).toBe(7000);
    await first.execute({ v: 1, jobName: 'ingestion.run', id: 'x' });
    expect(execute).toHaveBeenCalledWith({
      v: 1,
      jobName: 'ingestion.run',
      id: 'x',
    });
  });

  it('retries boot on the next delivery after a failed boot', async () => {
    const { app } = context('vercel');
    const create = jest
      .fn()
      .mockRejectedValueOnce(new Error('env invalid'))
      .mockResolvedValueOnce(app);
    const resolve = createRuntimeResolver(create);
    await expect(resolve()).rejects.toThrow('env invalid');
    await expect(resolve()).resolves.toBeDefined();
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('refuses to consume under a non-Vercel queue profile', async () => {
    const { app } = context('bullmq');
    const resolve = createRuntimeResolver(() => Promise.resolve(app));
    await expect(resolve()).rejects.toThrow(
      'The jobs function requires QUEUE_PROVIDER="vercel".',
    );
  });
});
