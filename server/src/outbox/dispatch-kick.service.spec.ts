import { Logger } from '@nestjs/common';
import type { AcresConfigService } from '../config/acres-config.service';
import { DispatchKickService } from './dispatch-kick.service';
import type { OutboxDispatcherService } from './outbox-dispatcher.service';

describe('DispatchKickService', () => {
  let mockConfig: { queueProvider: string };
  let mockDispatcher: { dispatchOnce: jest.Mock };
  let mockScheduler: { waitUntil: jest.Mock<void, [Promise<unknown>]> };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockConfig = { queueProvider: 'vercel' };
    mockDispatcher = {
      dispatchOnce: jest.fn().mockResolvedValue({
        claimed: 1,
        dispatched: 1,
        retried: 0,
        exhausted: 0,
        rejected: 0,
        lostClaims: 0,
      }),
    };
    mockScheduler = {
      waitUntil: jest.fn<void, [Promise<unknown>]>(),
    };
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  function createService(): DispatchKickService {
    return new DispatchKickService(
      mockConfig as unknown as AcresConfigService,
      mockDispatcher as unknown as OutboxDispatcherService,
      mockScheduler,
    );
  }

  it('is a no-op and makes no scheduler call outside Vercel', () => {
    mockConfig.queueProvider = 'bullmq';
    const service = createService();

    service.afterCommit();

    expect(mockScheduler.waitUntil).not.toHaveBeenCalled();
    expect(mockDispatcher.dispatchOnce).not.toHaveBeenCalled();
  });

  it('runs one dispatchOnce per isolated kick and passes chain promise to waitUntil', async () => {
    const service = createService();

    service.afterCommit();

    expect(mockScheduler.waitUntil).toHaveBeenCalledTimes(1);
    const chainPromise = mockScheduler.waitUntil.mock.calls[0][0];
    expect(chainPromise).toBeInstanceOf(Promise);

    await chainPromise;

    expect(mockDispatcher.dispatchOnce).toHaveBeenCalledTimes(1);
  });

  it('coalesces N concurrent kicks during an in-flight run into exactly one extra run', async () => {
    let resolveFirstDispatch: () => void = () => {};
    const firstDispatchPromise = new Promise<void>((resolve) => {
      resolveFirstDispatch = resolve;
    });

    mockDispatcher.dispatchOnce
      .mockImplementationOnce(() => firstDispatchPromise)
      .mockResolvedValueOnce({ claimed: 0, dispatched: 0 });

    const service = createService();

    // First kick starts in-flight run
    service.afterCommit();
    expect(mockScheduler.waitUntil).toHaveBeenCalledTimes(1);
    const initialChain = mockScheduler.waitUntil.mock.calls[0][0];

    // N concurrent kicks while first run is in flight
    service.afterCommit();
    service.afterCommit();
    service.afterCommit();

    // All 4 kicks called waitUntil with the active chain promise
    expect(mockScheduler.waitUntil).toHaveBeenCalledTimes(4);
    for (let i = 1; i < 4; i++) {
      expect(mockScheduler.waitUntil.mock.calls[i][0]).toBe(initialChain);
    }

    // Only pass 1 has run so far
    expect(mockDispatcher.dispatchOnce).toHaveBeenCalledTimes(1);

    // Resolve first dispatch
    resolveFirstDispatch();
    await initialChain;

    // Coalesced second run executed exactly once
    expect(mockDispatcher.dispatchOnce).toHaveBeenCalledTimes(2);
  });

  it('catches dispatcher rejection, logs fixed error message once without detail, and chain resolves', async () => {
    mockDispatcher.dispatchOnce.mockRejectedValueOnce(
      new Error('sensitive connection error with passwords'),
    );

    const service = createService();
    service.afterCommit();

    const chainPromise = mockScheduler.waitUntil.mock.calls[0][0];
    await expect(chainPromise).resolves.toBeUndefined();

    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Outbox dispatch kick failed; durable intent remains recoverable.',
    );
    // Detail / sensitive message never logged
    expect(loggerErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('sensitive connection error'),
    );
  });

  it('clears in-flight marker in finally so a subsequent kick starts a new run', async () => {
    const service = createService();

    // Run 1
    service.afterCommit();
    const firstChain = mockScheduler.waitUntil.mock.calls[0][0];
    await firstChain;
    expect(mockDispatcher.dispatchOnce).toHaveBeenCalledTimes(1);

    // Run 2 (isolated after run 1 completed)
    service.afterCommit();
    const secondChain = mockScheduler.waitUntil.mock.calls[1][0];
    expect(secondChain).not.toBe(firstChain);

    await secondChain;
    expect(mockDispatcher.dispatchOnce).toHaveBeenCalledTimes(2);
  });
});
