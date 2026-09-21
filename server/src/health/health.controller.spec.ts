import { HealthController } from './health.controller';
import {
  HEALTH_SERVICE_NAME,
  HEALTH_STATUS_OK,
  type HealthService,
  type HealthStatus,
} from './health.service';
import { ApiException } from '../common/api-exception';

describe('HealthController', () => {
  let controller: HealthController;
  let healthServiceMock: {
    check: jest.Mock;
    readiness: jest.Mock;
  };

  beforeEach(() => {
    healthServiceMock = {
      check: jest.fn(),
      readiness: jest.fn(),
    };
    controller = new HealthController(
      healthServiceMock as unknown as HealthService,
    );
  });

  describe('check', () => {
    it('calls healthService.check() and returns the status object', () => {
      const mockStatus: HealthStatus = {
        status: HEALTH_STATUS_OK,
        service: HEALTH_SERVICE_NAME,
        version: '0.1.0',
        uptimeSeconds: 42,
      };
      healthServiceMock.check.mockReturnValue(mockStatus);

      const result = controller.check();

      expect(healthServiceMock.check).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockStatus);
    });
  });

  describe('ready', () => {
    it('calls healthService.readiness() and returns the readiness object on success', async () => {
      const mockReadiness = {
        status: 'ok' as const,
        database: 'ok' as const,
        storage: 'ok' as const,
      };
      healthServiceMock.readiness.mockResolvedValue(mockReadiness);

      const result = await controller.ready();

      expect(healthServiceMock.readiness).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockReadiness);
    });

    it('catches error and throws ApiException.notReady() when healthService.readiness() rejects', async () => {
      healthServiceMock.readiness.mockRejectedValue(
        new Error('Database or storage unreachable'),
      );

      await expect(controller.ready()).rejects.toThrow(ApiException);

      let thrown: unknown;
      try {
        await controller.ready();
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(ApiException);
      const apiException = thrown as ApiException;
      expect(apiException.code).toBe('NOT_READY');
      expect(apiException.getStatus()).toBe(503);
      expect(apiException.getResponse()).toEqual({
        code: 'NOT_READY',
        message: 'The database is not reachable.',
        details: undefined,
      });
    });
  });
});
