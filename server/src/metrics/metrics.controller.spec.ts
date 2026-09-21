import { Test, type TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockMetricsService: {
    contentType: string;
    getMetrics: jest.Mock;
  };
  let mockResponse: {
    setHeader: jest.Mock;
    send: jest.Mock;
  };

  const samplePrometheusOutput = [
    '# HELP acres_http_requests_total Total number of HTTP requests processed by Acres API',
    '# TYPE acres_http_requests_total counter',
    'acres_http_requests_total{method="GET",route_group="/api/v1/regions",status_class="2xx"} 42',
    '# HELP acres_http_active_requests Current number of in-flight HTTP requests',
    '# TYPE acres_http_active_requests gauge',
    'acres_http_active_requests 3',
  ].join('\n');

  beforeEach(async () => {
    mockMetricsService = {
      contentType: 'text/plain; version=0.0.4; charset=utf-8',
      getMetrics: jest.fn(),
    };

    mockResponse = {
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('can be resolved and instantiated via NestJS TestingModule', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(MetricsController);
  });

  it('can be instantiated directly via constructor injection', () => {
    const directInstance = new MetricsController(
      mockMetricsService as unknown as MetricsService,
    );
    expect(directInstance).toBeDefined();
    expect(directInstance).toBeInstanceOf(MetricsController);
  });

  describe('getMetrics', () => {
    it('fetches metrics, sets Content-Type header with metrics.contentType, and sends output', async () => {
      mockMetricsService.getMetrics.mockResolvedValue(samplePrometheusOutput);

      await controller.getMetrics(mockResponse as unknown as Response);

      expect(mockMetricsService.getMetrics).toHaveBeenCalledTimes(1);
      expect(mockResponse.setHeader).toHaveBeenCalledTimes(1);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; version=0.0.4; charset=utf-8',
      );
      expect(mockResponse.send).toHaveBeenCalledTimes(1);
      expect(mockResponse.send).toHaveBeenCalledWith(samplePrometheusOutput);
    });

    it('ensures setHeader and send are called in order after getMetrics resolves', async () => {
      const callSequence: string[] = [];

      mockMetricsService.getMetrics.mockImplementation(() => {
        callSequence.push('getMetrics');
        return Promise.resolve(samplePrometheusOutput);
      });

      mockResponse.setHeader.mockImplementation(() => {
        callSequence.push('setHeader');
        return mockResponse;
      });

      mockResponse.send.mockImplementation(() => {
        callSequence.push('send');
        return mockResponse;
      });

      await controller.getMetrics(mockResponse as unknown as Response);

      expect(callSequence).toEqual(['getMetrics', 'setHeader', 'send']);
    });

    it('uses the dynamic contentType provided by the MetricsService instance', async () => {
      const customContentType =
        'application/openmetrics-text; version=1.0.0; charset=utf-8';
      mockMetricsService.contentType = customContentType;
      mockMetricsService.getMetrics.mockResolvedValue(samplePrometheusOutput);

      await controller.getMetrics(mockResponse as unknown as Response);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        customContentType,
      );
      expect(mockResponse.send).toHaveBeenCalledWith(samplePrometheusOutput);
    });

    it('handles promise rejection from metrics.getMetrics() without sending a response', async () => {
      const scrapeError = new Error(
        'Prometheus registry scrape failed: timeout',
      );
      mockMetricsService.getMetrics.mockRejectedValue(scrapeError);

      await expect(
        controller.getMetrics(mockResponse as unknown as Response),
      ).rejects.toThrow('Prometheus registry scrape failed: timeout');

      expect(mockMetricsService.getMetrics).toHaveBeenCalledTimes(1);
      expect(mockResponse.setHeader).not.toHaveBeenCalled();
      expect(mockResponse.send).not.toHaveBeenCalled();
    });

    it('handles unexpected non-Error rejection from metrics.getMetrics()', async () => {
      const stringError = 'Unexpected registry failure string';
      mockMetricsService.getMetrics.mockRejectedValue(stringError);

      await expect(
        controller.getMetrics(mockResponse as unknown as Response),
      ).rejects.toBe(stringError);

      expect(mockMetricsService.getMetrics).toHaveBeenCalledTimes(1);
      expect(mockResponse.setHeader).not.toHaveBeenCalled();
      expect(mockResponse.send).not.toHaveBeenCalled();
    });

    it('propagates errors if response.setHeader throws', async () => {
      mockMetricsService.getMetrics.mockResolvedValue(samplePrometheusOutput);
      mockResponse.setHeader.mockImplementation(() => {
        throw new Error('Cannot set headers after they are sent to the client');
      });

      await expect(
        controller.getMetrics(mockResponse as unknown as Response),
      ).rejects.toThrow('Cannot set headers after they are sent to the client');

      expect(mockResponse.send).not.toHaveBeenCalled();
    });
  });
});
