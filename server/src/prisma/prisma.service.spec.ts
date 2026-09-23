import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolClient } from 'pg';
import { PrismaService } from './prisma.service';
import type { AcresConfigService } from '../config/acres-config.service';

jest.mock('@prisma/adapter-pg', () => {
  return {
    PrismaPg: jest.fn().mockImplementation((options: unknown) => ({
      provider: 'postgres',
      adapterName: '@prisma/adapter-pg',
      ...(typeof options === 'object' && options !== null ? options : {}),
    })),
  };
});

interface PrismaServiceInternals {
  logger: {
    warn: (message: string) => void;
  };
  disconnect: () => Promise<void>;
  pool: Pool;
  notifyAcquisition: (durationSeconds: number) => void;
}

function getInternals(service: PrismaService): PrismaServiceInternals {
  return service as unknown as PrismaServiceInternals;
}

describe('PrismaService', () => {
  const mockConfig = {
    databaseUrl: 'postgresql://postgres:secret@localhost:5432/acres_test',
  } as AcresConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('shares one lazy pool with PrismaPg and exposes its driver counts', () => {
      const service = new PrismaService(mockConfig);
      const pool = getInternals(service).pool;
      expect(PrismaPg).toHaveBeenCalledWith(pool);
      expect(pool.options.connectionString).toBe(mockConfig.databaseUrl);
      expect(pool.options.connectionTimeoutMillis).toBe(5000);
      expect(service.getPoolSnapshot()).toEqual({
        total: 0,
        idle: 0,
        waiting: 0,
        max: pool.options.max,
      });
      expect(pool.totalCount).toBe(0);
    });

    it('reads live pool counts without exposing connection settings', () => {
      const service = new PrismaService(mockConfig);
      const pool = getInternals(service).pool;
      jest.spyOn(pool, 'totalCount', 'get').mockReturnValue(4);
      jest.spyOn(pool, 'idleCount', 'get').mockReturnValue(1);
      jest.spyOn(pool, 'waitingCount', 'get').mockReturnValue(2);
      expect(service.getPoolSnapshot()).toEqual({
        total: 4,
        idle: 1,
        waiting: 2,
        max: pool.options.max,
      });
      expect(JSON.stringify(service.getPoolSnapshot())).not.toContain('secret');
    });
  });

  describe('lifecycle hooks', () => {
    it('calls disconnect() on onModuleDestroy()', async () => {
      const service = new PrismaService(mockConfig);
      const internals = getInternals(service);
      const disconnectSpy = jest
        .spyOn(internals, 'disconnect')
        .mockResolvedValue(undefined);

      await service.onModuleDestroy();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });

    it('calls disconnect() on onApplicationShutdown()', async () => {
      const service = new PrismaService(mockConfig);
      const internals = getInternals(service);
      const disconnectSpy = jest
        .spyOn(internals, 'disconnect')
        .mockResolvedValue(undefined);

      await service.onApplicationShutdown();

      expect(disconnectSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('closes the externally owned pool once across both hooks', async () => {
      const service = new PrismaService(mockConfig);
      const pool = getInternals(service).pool;
      const endSpy = jest.spyOn(pool, 'end');
      jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

      await service.onModuleDestroy();
      await service.onApplicationShutdown();

      expect(endSpy).toHaveBeenCalledTimes(1);
      expect(pool.ended).toBe(true);
    });
    it('catches any error thrown by $disconnect() and logs a warning via logger.warn without rethrowing', async () => {
      const service = new PrismaService(mockConfig);
      const internals = getInternals(service);
      const warnSpy = jest
        .spyOn(internals.logger, 'warn')
        .mockImplementation(() => {});
      const error = new Error('Database connection lost during shutdown');
      jest.spyOn(service, '$disconnect').mockRejectedValue(error);

      await expect(internals.disconnect()).resolves.not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        'Prisma disconnect failed: Database connection lost during shutdown',
      );
    });

    it('handles non-Error thrown objects during disconnect gracefully', async () => {
      const service = new PrismaService(mockConfig);
      const internals = getInternals(service);
      const warnSpy = jest
        .spyOn(internals.logger, 'warn')
        .mockImplementation(() => {});
      jest
        .spyOn(service, '$disconnect')
        .mockRejectedValue('Fatal network drop');

      await expect(internals.disconnect()).resolves.not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        'Prisma disconnect failed: Fatal network drop',
      );
    });

    it('does not log warning when $disconnect() succeeds', async () => {
      const service = new PrismaService(mockConfig);
      const internals = getInternals(service);
      const warnSpy = jest
        .spyOn(internals.logger, 'warn')
        .mockImplementation(() => {});
      jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

      await internals.disconnect();

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('acquisition duration tracking', () => {
    it('notifies registered listeners with elapsed duration on callback-based connect', (done) => {
      const durations: number[] = [];
      const fakeClient = { query: jest.fn() };
      const fakeRelease = jest.fn();

      const mockConnect = jest.fn(
        (
          cb?: (err?: Error, client?: PoolClient, release?: () => void) => void,
        ) => {
          if (cb) {
            setTimeout(() => {
              cb(undefined, fakeClient as unknown as PoolClient, fakeRelease);
            }, 10);
          }
        },
      );
      jest
        .spyOn(Pool.prototype, 'connect')
        .mockImplementation(mockConnect as never);

      const wrappedService = new PrismaService(mockConfig);
      const unsubscribe = wrappedService.onAcquisition((d) =>
        durations.push(d),
      );
      const wrappedPool = getInternals(wrappedService).pool;

      wrappedPool.connect((err, client, release) => {
        expect(err).toBeUndefined();
        expect(client).toBe(fakeClient);
        expect(release).toBe(fakeRelease);
        expect(durations.length).toBe(1);
        expect(durations[0]).toBeGreaterThan(0.005);
        unsubscribe();
        done();
      });
    });

    it('notifies registered listeners on promise-based connect resolution and rejection', async () => {
      const durations: number[] = [];
      const fakeClient = { query: jest.fn() };
      const mockSuccess = jest.fn(() => {
        return new Promise<PoolClient>((resolve) => {
          setTimeout(() => {
            resolve(fakeClient as unknown as PoolClient);
          }, 10);
        });
      });
      jest
        .spyOn(Pool.prototype, 'connect')
        .mockImplementation(mockSuccess as never);

      const wrappedService = new PrismaService(mockConfig);
      wrappedService.onAcquisition((d) => durations.push(d));
      const wrappedPool = getInternals(wrappedService).pool;

      const client = await wrappedPool.connect();
      expect(client).toBe(fakeClient);
      expect(durations.length).toBe(1);
      expect(durations[0]).toBeGreaterThan(0.005);

      // Test rejection
      const mockFail = jest.fn(() => {
        return new Promise<PoolClient>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10);
        });
      });
      jest
        .spyOn(Pool.prototype, 'connect')
        .mockImplementation(mockFail as never);

      const failService = new PrismaService(mockConfig);
      const failDurations: number[] = [];
      failService.onAcquisition((d) => failDurations.push(d));
      const failPool = getInternals(failService).pool;

      await expect(failPool.connect()).rejects.toThrow('Connection timeout');
      expect(failDurations.length).toBe(1);
      expect(failDurations[0]).toBeGreaterThan(0.005);
    });

    it('logs warning and does not interrupt connection checkout if listener throws', (done) => {
      const fakeClient = { query: jest.fn() };
      const fakeRelease = jest.fn();

      const mockThrowing = jest.fn(
        (
          cb?: (err?: Error, client?: PoolClient, release?: () => void) => void,
        ) => {
          if (cb) {
            setImmediate(() => {
              cb(undefined, fakeClient as unknown as PoolClient, fakeRelease);
            });
          }
        },
      );
      jest
        .spyOn(Pool.prototype, 'connect')
        .mockImplementation(mockThrowing as never);

      const wrappedService = new PrismaService(mockConfig);
      const wrappedInternals = getInternals(wrappedService);
      jest.spyOn(wrappedInternals.logger, 'warn').mockImplementation(() => {});
      wrappedService.onAcquisition(() => {
        throw new Error('Listener crash');
      });

      const wrappedPool = wrappedInternals.pool;

      wrappedPool.connect((err, client) => {
        expect(err).toBeUndefined();
        expect(client).toBe(fakeClient);
        done();
      });
    });

    it('unsubscribes listener when unsubscribe function is called', () => {
      const service = new PrismaService(mockConfig);
      const durations: number[] = [];
      const unsub = service.onAcquisition((d) => durations.push(d));
      unsub();
      getInternals(service).notifyAcquisition(0.05);
      expect(durations.length).toBe(0);
    });
  });
});
