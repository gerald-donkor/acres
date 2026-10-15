import type { AcresConfigService } from '../config/acres-config.service';
import type {
  JobReconciliationResult,
  JobReconciliationService,
} from './job-reconciliation.service';
import {
  ManagedDispatchRunnerService,
  SWEEP_BUDGET_MS,
  SWEEP_MAX_PASSES,
} from './managed-dispatch-runner.service';
import type {
  OutboxDispatcherService,
  OutboxDispatchResult,
} from './outbox-dispatcher.service';

describe('ManagedDispatchRunnerService', () => {
  let mockConfig: {
    queueProvider: string;
    outboxClaimBatchSize: number;
  };
  let mockReconciler: {
    reconcileOnce: jest.Mock;
  };
  let mockDispatcher: {
    dispatchOnce: jest.Mock;
  };
  let currentTime: number;
  let mockClock: jest.Mock;

  const emptyReconcileResult: JobReconciliationResult = {
    enabled: true,
    examined: 0,
    rearmed: 0,
    repaired: 0,
    exhausted: 0,
    rejected: 0,
  };

  const emptyDispatchResult: OutboxDispatchResult = {
    claimed: 0,
    dispatched: 0,
    retried: 0,
    exhausted: 0,
    rejected: 0,
    lostClaims: 0,
  };

  beforeEach(() => {
    mockConfig = {
      queueProvider: 'vercel',
      outboxClaimBatchSize: 25,
    };
    mockReconciler = {
      reconcileOnce: jest.fn().mockResolvedValue(emptyReconcileResult),
    };
    mockDispatcher = {
      dispatchOnce: jest.fn().mockResolvedValue(emptyDispatchResult),
    };
    currentTime = 1_000_000;
    mockClock = jest.fn(() => currentTime);
  });

  function createService(): ManagedDispatchRunnerService {
    return new ManagedDispatchRunnerService(
      mockConfig as unknown as AcresConfigService,
      mockReconciler as unknown as JobReconciliationService,
      mockDispatcher as unknown as OutboxDispatcherService,
      mockClock,
    );
  }

  it('is disabled outside Vercel and makes no calls', async () => {
    mockConfig.queueProvider = 'bullmq';
    const service = createService();

    const result = await service.sweep();

    expect(result).toEqual({
      enabled: false,
      passes: 0,
      stoppedBy: 'disabled',
      reconciliation: {
        examined: 0,
        rearmed: 0,
        repaired: 0,
        exhausted: 0,
        rejected: 0,
      },
      dispatch: {
        claimed: 0,
        dispatched: 0,
        retried: 0,
        exhausted: 0,
        rejected: 0,
        lostClaims: 0,
      },
    });
    expect(mockReconciler.reconcileOnce).not.toHaveBeenCalled();
    expect(mockDispatcher.dispatchOnce).not.toHaveBeenCalled();
  });

  it('executes reconcile then dispatch in that exact order within a pass', async () => {
    const callOrder: string[] = [];
    mockReconciler.reconcileOnce.mockImplementation(() => {
      callOrder.push('reconcile');
      return Promise.resolve({ ...emptyReconcileResult, examined: 0 });
    });
    mockDispatcher.dispatchOnce.mockImplementation(() => {
      callOrder.push('dispatch');
      return Promise.resolve({ ...emptyDispatchResult, claimed: 0 });
    });

    const service = createService();
    const result = await service.sweep();

    expect(callOrder).toEqual(['reconcile', 'dispatch']);
    expect(result.passes).toBe(1);
    expect(result.stoppedBy).toBe('drained');
  });

  it('drains after a short batch when claimed < batchSize and reconciliation was not full', async () => {
    mockReconciler.reconcileOnce.mockResolvedValueOnce({
      ...emptyReconcileResult,
      examined: 5,
      rearmed: 5,
    });
    mockDispatcher.dispatchOnce.mockResolvedValueOnce({
      ...emptyDispatchResult,
      claimed: 5,
      dispatched: 5,
    });

    const service = createService();
    const result = await service.sweep();

    expect(result.passes).toBe(1);
    expect(result.stoppedBy).toBe('drained');
    expect(result.reconciliation.rearmed).toBe(5);
    expect(result.dispatch.dispatched).toBe(5);
  });

  it('continues passes while dispatch batches are full', async () => {
    mockReconciler.reconcileOnce.mockResolvedValueOnce({
      ...emptyReconcileResult,
      examined: 0,
    });
    // Pass 1: 25 claimed (full batch)
    mockDispatcher.dispatchOnce.mockResolvedValueOnce({
      ...emptyDispatchResult,
      claimed: 25,
      dispatched: 25,
    });
    // Pass 2: 25 claimed (full batch)
    mockDispatcher.dispatchOnce.mockResolvedValueOnce({
      ...emptyDispatchResult,
      claimed: 25,
      dispatched: 25,
    });
    // Pass 3: 10 claimed (partial batch) -> drains
    mockDispatcher.dispatchOnce.mockResolvedValueOnce({
      ...emptyDispatchResult,
      claimed: 10,
      dispatched: 10,
    });

    const service = createService();
    const result = await service.sweep();

    expect(result.passes).toBe(3);
    expect(result.stoppedBy).toBe('drained');
    expect(result.dispatch.claimed).toBe(60);
    expect(result.dispatch.dispatched).toBe(60);
    // Reconciliation only ran on pass 1 because examined was 0 (< batchSize 25)
    expect(mockReconciler.reconcileOnce).toHaveBeenCalledTimes(1);
    expect(mockDispatcher.dispatchOnce).toHaveBeenCalledTimes(3);
  });

  it('reruns reconciliation only when previous pass had a full reconciliation batch', async () => {
    // Pass 1: full reconciliation batch (examined: 25)
    mockReconciler.reconcileOnce.mockResolvedValueOnce({
      ...emptyReconcileResult,
      examined: 25,
      rearmed: 25,
    });
    mockDispatcher.dispatchOnce.mockResolvedValueOnce({
      ...emptyDispatchResult,
      claimed: 25,
      dispatched: 25,
    });

    // Pass 2: since pass 1 had examined: 25, reconciler runs again! Returns partial (examined: 3)
    mockReconciler.reconcileOnce.mockResolvedValueOnce({
      ...emptyReconcileResult,
      examined: 3,
      rearmed: 3,
    });
    mockDispatcher.dispatchOnce.mockResolvedValueOnce({
      ...emptyDispatchResult,
      claimed: 25,
      dispatched: 25,
    });

    // Pass 3: reconciler should NOT run (examined was 3 < 25)
    mockDispatcher.dispatchOnce.mockResolvedValueOnce({
      ...emptyDispatchResult,
      claimed: 5,
      dispatched: 5,
    });

    const service = createService();
    const result = await service.sweep();

    expect(result.passes).toBe(3);
    expect(result.stoppedBy).toBe('drained');
    expect(mockReconciler.reconcileOnce).toHaveBeenCalledTimes(2);
    expect(mockDispatcher.dispatchOnce).toHaveBeenCalledTimes(3);
    expect(result.reconciliation.rearmed).toBe(28);
    expect(result.dispatch.dispatched).toBe(55);
  });

  it('stops at SWEEP_MAX_PASSES when backlog persists', async () => {
    mockReconciler.reconcileOnce.mockResolvedValue({
      ...emptyReconcileResult,
      examined: 0,
    });
    mockDispatcher.dispatchOnce.mockResolvedValue({
      ...emptyDispatchResult,
      claimed: 25,
      dispatched: 25,
    });

    const service = createService();
    const result = await service.sweep();

    expect(result.passes).toBe(SWEEP_MAX_PASSES);
    expect(result.stoppedBy).toBe('pass_cap');
    expect(mockDispatcher.dispatchOnce).toHaveBeenCalledTimes(SWEEP_MAX_PASSES);
    expect(result.dispatch.claimed).toBe(SWEEP_MAX_PASSES * 25);
  });

  it('stops by budget checked between passes using injected clock', async () => {
    mockReconciler.reconcileOnce.mockResolvedValue({
      ...emptyReconcileResult,
      examined: 0,
    });
    mockDispatcher.dispatchOnce.mockImplementation(() => {
      // Simulate time passing during pass 1
      currentTime += SWEEP_BUDGET_MS + 1000;
      return Promise.resolve({
        ...emptyDispatchResult,
        claimed: 25,
        dispatched: 25,
      });
    });

    const service = createService();
    const result = await service.sweep();

    expect(result.passes).toBe(1);
    expect(result.stoppedBy).toBe('budget');
    expect(result.dispatch.claimed).toBe(25);
    expect(mockDispatcher.dispatchOnce).toHaveBeenCalledTimes(1);
  });

  it('sums all reconciliation and dispatch counts exactly', async () => {
    mockReconciler.reconcileOnce.mockResolvedValueOnce({
      enabled: true,
      examined: 25,
      rearmed: 10,
      repaired: 5,
      exhausted: 2,
      rejected: 1,
    });
    mockDispatcher.dispatchOnce.mockResolvedValueOnce({
      claimed: 25,
      dispatched: 20,
      retried: 3,
      exhausted: 1,
      rejected: 1,
      lostClaims: 0,
    });

    mockReconciler.reconcileOnce.mockResolvedValueOnce({
      enabled: true,
      examined: 5,
      rearmed: 3,
      repaired: 1,
      exhausted: 0,
      rejected: 0,
    });
    mockDispatcher.dispatchOnce.mockResolvedValueOnce({
      claimed: 10,
      dispatched: 8,
      retried: 1,
      exhausted: 0,
      rejected: 0,
      lostClaims: 1,
    });

    const service = createService();
    const result = await service.sweep();

    expect(result.passes).toBe(2);
    expect(result.stoppedBy).toBe('drained');
    expect(result.reconciliation).toEqual({
      examined: 30,
      rearmed: 13,
      repaired: 6,
      exhausted: 2,
      rejected: 1,
    });
    expect(result.dispatch).toEqual({
      claimed: 35,
      dispatched: 28,
      retried: 4,
      exhausted: 1,
      rejected: 1,
      lostClaims: 1,
    });
  });

  it('propagates rejection from reconciler without converting to partial success', async () => {
    mockReconciler.reconcileOnce.mockRejectedValueOnce(
      new Error('reconciler database connection failure'),
    );

    const service = createService();
    await expect(service.sweep()).rejects.toThrow(
      'reconciler database connection failure',
    );
    expect(mockDispatcher.dispatchOnce).not.toHaveBeenCalled();
  });

  it('propagates rejection from dispatcher without converting to partial success', async () => {
    mockReconciler.reconcileOnce.mockResolvedValueOnce({
      ...emptyReconcileResult,
      examined: 0,
    });
    mockDispatcher.dispatchOnce.mockRejectedValueOnce(
      new Error('dispatcher error'),
    );

    const service = createService();
    await expect(service.sweep()).rejects.toThrow('dispatcher error');
  });
});
