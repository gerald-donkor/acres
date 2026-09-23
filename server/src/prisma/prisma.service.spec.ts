import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
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
});
