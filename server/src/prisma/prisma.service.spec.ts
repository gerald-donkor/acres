import { PrismaPg } from '@prisma/adapter-pg';
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
    it('builds PrismaPg adapter with config.databaseUrl and 5000 timeout', () => {
      new PrismaService(mockConfig);

      expect(PrismaPg).toHaveBeenCalledWith({
        connectionString:
          'postgresql://postgres:secret@localhost:5432/acres_test',
        connectionTimeoutMillis: 5000,
      });
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
