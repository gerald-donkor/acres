import {
  HealthService,
  HEALTH_STATUS_OK,
  HEALTH_SERVICE_NAME,
} from './health.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ObjectStoragePort } from '../storage/storage.port';

describe('HealthService', () => {
  let service: HealthService;
  let prismaMock: { $queryRaw: jest.Mock };
  let storageMock: { readiness: jest.Mock };

  beforeEach(() => {
    prismaMock = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    storageMock = {
      readiness: jest.fn().mockResolvedValue(true),
    };
    service = new HealthService(
      prismaMock as unknown as PrismaService,
      storageMock as unknown as ObjectStoragePort,
    );
  });

  describe('check', () => {
    it('returns status ok, service name, version string or null, and uptime seconds', () => {
      const result = service.check();
      expect(result).toEqual({
        status: HEALTH_STATUS_OK,
        service: HEALTH_SERVICE_NAME,
        version:
          result.version === null ? null : (expect.any(String) as unknown),
        uptimeSeconds: expect.any(Number) as unknown,
      });
      expect(result.status).toBe('ok');
      expect(result.service).toBe('acres-api');
      expect(typeof result.uptimeSeconds).toBe('number');
      expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(
        typeof result.version === 'string' || result.version === null,
      ).toBe(true);
    });

    it('reports version from process.env.npm_package_version when set', () => {
      const prevVersion = process.env.npm_package_version;
      try {
        process.env.npm_package_version = '1.2.3';
        const result = service.check();
        expect(result.version).toBe('1.2.3');
      } finally {
        if (prevVersion === undefined) {
          delete process.env.npm_package_version;
        } else {
          process.env.npm_package_version = prevVersion;
        }
      }
    });

    it('reports null version when npm_package_version is undefined', () => {
      const prevVersion = process.env.npm_package_version;
      try {
        delete process.env.npm_package_version;
        const result = service.check();
        expect(result.version).toBeNull();
      } finally {
        if (prevVersion === undefined) {
          delete process.env.npm_package_version;
        } else {
          process.env.npm_package_version = prevVersion;
        }
      }
    });
  });

  describe('readiness', () => {
    it('calls prisma.$queryRaw and storage.readiness() and returns ok status when both succeed', async () => {
      const result = await service.readiness();
      expect(result).toEqual({
        status: 'ok',
        database: 'ok',
        storage: 'ok',
      });
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      expect(storageMock.readiness).toHaveBeenCalledTimes(1);
    });

    it('throws error if storage.readiness() resolves to false', async () => {
      storageMock.readiness.mockResolvedValueOnce(false);
      await expect(service.readiness()).rejects.toThrow(
        'Object storage is not ready',
      );
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      expect(storageMock.readiness).toHaveBeenCalledTimes(1);
    });

    it('throws error if prisma.$queryRaw rejects', async () => {
      const dbError = new Error('Database connection failed');
      prismaMock.$queryRaw.mockRejectedValueOnce(dbError);
      await expect(service.readiness()).rejects.toThrow(dbError);
      expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
      expect(storageMock.readiness).not.toHaveBeenCalled();
    });
  });
});
