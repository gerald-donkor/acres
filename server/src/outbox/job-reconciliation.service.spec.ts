import type { AcresConfigService } from '../config/acres-config.service';
import type {
  TenantTransactionClient,
  TenantTransactionService,
} from '../prisma/tenant-transaction.service';
import { JobReconciliationService } from './job-reconciliation.service';

describe('JobReconciliationService operation boundary', () => {
  const config = {
    queueProvider: 'vercel',
    vercelQueueRetentionSeconds: 604800,
    jobLeaseMs: 3600000,
    outboxClaimBatchSize: 25,
  } as AcresConfigService;
  it('does no database work for the reference provider', async () => {
    const workerScoped = jest.fn();
    const service = new JobReconciliationService(
      { workerScoped } as unknown as TenantTransactionService,
      { ...config, queueProvider: 'bullmq' } as AcresConfigService,
    );
    expect(await service.reconcileOnce()).toEqual({
      enabled: false,
      examined: 0,
      rearmed: 0,
      repaired: 0,
      exhausted: 0,
      rejected: 0,
    });
    expect(workerScoped).not.toHaveBeenCalled();
  });
  it('awaits persistence and propagates failure without returning counts', async () => {
    const workerScoped = jest
      .fn()
      .mockRejectedValue(new Error('database unavailable'));
    await expect(
      new JobReconciliationService(
        { workerScoped } as unknown as TenantTransactionService,
        config,
      ).reconcileOnce(),
    ).rejects.toThrow('database unavailable');
  });
  it('uses safe maximum arithmetic and bounds an empty selection', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [{ values: unknown[] }]>()
      .mockResolvedValue([]);
    const tenants = {
      workerScoped: (
        callback: (tx: TenantTransactionClient) => Promise<unknown>,
      ) => callback({ $queryRaw: query } as unknown as TenantTransactionClient),
    } as TenantTransactionService;
    const result = await new JobReconciliationService(
      tenants,
      config,
    ).reconcileOnce();
    expect(result).toMatchObject({ enabled: true, examined: 0 });
    expect(query.mock.calls[0][0].values).toEqual([608460000, 25]);
  });
});
