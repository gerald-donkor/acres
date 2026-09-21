import { Test, type TestingModule } from '@nestjs/testing';
import type { RegionSummary } from '@acres/shared';
import { RegionsController } from './regions.controller';
import { RegionsService } from './regions.service';
import { ApiException } from '../common/api-exception';

describe('RegionsController', () => {
  let controller: RegionsController;
  let mockRegionsService: {
    list: jest.Mock;
    findBySlug: jest.Mock;
  };

  const sampleMetrics = [
    {
      id: 'met_01j9x0a0b1c2d3e4f5g6h7j8m1',
      regionId: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k9',
      key: 'efficiency-improvement',
      label: 'Efficiency Improvement',
      value: 14.2,
      unit: '%',
      periodStart: '2025-01-01T00:00:00.000Z',
      periodEnd: '2025-12-31T23:59:59.999Z',
      source: 'USDA Regional Survey',
    },
    {
      id: 'met_01j9x0a0b1c2d3e4f5g6h7j8m2',
      regionId: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k9',
      key: 'water-footprint-reduction',
      label: 'Water Footprint Reduction',
      value: 8.7,
      unit: 'ML',
      periodStart: '2025-01-01T00:00:00.000Z',
      periodEnd: '2025-12-31T23:59:59.999Z',
      source: 'Regional Water Authority',
    },
  ];

  const sampleRegions: RegionSummary[] = [
    {
      id: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k9',
      slug: 'great-lakes',
      name: 'Great Lakes Region',
      countryCode: 'US',
      summary:
        'Water management and agricultural metrics for the Great Lakes basin.',
      metrics: sampleMetrics,
    },
    {
      id: 'reg_02j9x0a0b1c2d3e4f5g6h7j8k0',
      slug: 'pacific-northwest',
      name: 'Pacific Northwest',
      countryCode: 'US',
      summary: null,
      metrics: [],
    },
  ];

  beforeEach(async () => {
    mockRegionsService = {
      list: jest.fn(),
      findBySlug: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegionsController],
      providers: [
        {
          provide: RegionsService,
          useValue: mockRegionsService,
        },
      ],
    }).compile();

    controller = module.get<RegionsController>(RegionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('can be resolved and instantiated via NestJS TestingModule', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(RegionsController);
  });

  it('can be instantiated directly via constructor injection', () => {
    const directInstance = new RegionsController(
      mockRegionsService as unknown as RegionsService,
    );
    expect(directInstance).toBeDefined();
    expect(directInstance).toBeInstanceOf(RegionsController);
  });

  describe('list', () => {
    it('calls regions.list() and returns the list of RegionSummary objects', async () => {
      mockRegionsService.list.mockResolvedValue(sampleRegions);

      const result = await controller.list();

      expect(mockRegionsService.list).toHaveBeenCalledTimes(1);
      expect(mockRegionsService.list).toHaveBeenCalledWith();
      expect(result).toEqual(sampleRegions);
      expect(result).toHaveLength(2);
      expect(result[0].slug).toBe('great-lakes');
      expect(result[0].metrics).toHaveLength(2);
      expect(result[1].slug).toBe('pacific-northwest');
      expect(result[1].metrics).toHaveLength(0);
    });

    it('returns an empty array when regions.list() finds no regions', async () => {
      mockRegionsService.list.mockResolvedValue([]);

      const result = await controller.list();

      expect(mockRegionsService.list).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    });

    it('handles errors when regions.list() throws an unexpected Error', async () => {
      const dbError = new Error('Database query connection timeout');
      mockRegionsService.list.mockRejectedValue(dbError);

      await expect(controller.list()).rejects.toThrow(
        'Database query connection timeout',
      );
      expect(mockRegionsService.list).toHaveBeenCalledTimes(1);
    });

    it('handles errors when regions.list() throws an ApiException', async () => {
      const notReadyException = ApiException.notReady();
      mockRegionsService.list.mockRejectedValue(notReadyException);

      await expect(controller.list()).rejects.toThrow(ApiException);

      let caughtError: unknown;
      try {
        await controller.list();
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBe(notReadyException);
      expect((caughtError as ApiException).code).toBe('NOT_READY');
      expect((caughtError as ApiException).getStatus()).toBe(503);
    });
  });

  describe('findOne', () => {
    it('calls regions.findBySlug(slug) with slug and returns the RegionSummary', async () => {
      const targetSlug = 'great-lakes';
      mockRegionsService.findBySlug.mockResolvedValue(sampleRegions[0]);

      const result = await controller.findOne(targetSlug);

      expect(mockRegionsService.findBySlug).toHaveBeenCalledTimes(1);
      expect(mockRegionsService.findBySlug).toHaveBeenCalledWith(targetSlug);
      expect(result).toEqual(sampleRegions[0]);
      expect(result.id).toBe('reg_01j9x0a0b1c2d3e4f5g6h7j8k9');
      expect(result.slug).toBe(targetSlug);
      expect(result.name).toBe('Great Lakes Region');
    });

    it('handles errors when slug is not found and service throws ApiException.notFound', async () => {
      const nonExistentSlug = 'unknown-region';
      const notFoundException = ApiException.notFound(
        `No region matches "${nonExistentSlug}".`,
      );
      mockRegionsService.findBySlug.mockRejectedValue(notFoundException);

      await expect(controller.findOne(nonExistentSlug)).rejects.toThrow(
        ApiException,
      );

      let caughtError: unknown;
      try {
        await controller.findOne(nonExistentSlug);
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBe(notFoundException);
      const apiException = caughtError as ApiException;
      expect(apiException.code).toBe('NOT_FOUND');
      expect(apiException.getStatus()).toBe(404);
      expect(apiException.getResponse()).toEqual({
        code: 'NOT_FOUND',
        message: 'No region matches "unknown-region".',
        details: undefined,
      });
      expect(mockRegionsService.findBySlug).toHaveBeenCalledWith(
        nonExistentSlug,
      );
    });

    it('handles errors when service throws a generic Error', async () => {
      const internalError = new Error('PostgreSQL connection terminated');
      mockRegionsService.findBySlug.mockRejectedValue(internalError);

      await expect(controller.findOne('great-lakes')).rejects.toThrow(
        'PostgreSQL connection terminated',
      );
      expect(mockRegionsService.findBySlug).toHaveBeenCalledWith('great-lakes');
    });

    it('handles errors when service throws other ApiExceptions (e.g. cursorInvalid or notReady)', async () => {
      const notReadyException = ApiException.notReady();
      mockRegionsService.findBySlug.mockRejectedValue(notReadyException);

      await expect(controller.findOne('pacific-northwest')).rejects.toThrow(
        ApiException,
      );
    });

    test.each([
      ['standard slug', 'great-lakes'],
      ['scoped slug', 'us-midwest-plains'],
      ['slug with digits', 'district-09'],
      ['short code slug', 'ca-on'],
    ])('calls findBySlug with %s ("%s")', async (_desc, slug) => {
      const mockResult: RegionSummary = {
        id: `reg_${slug}`,
        slug,
        name: `Region ${slug}`,
        countryCode: 'US',
        summary: null,
        metrics: [],
      };
      mockRegionsService.findBySlug.mockResolvedValue(mockResult);

      const result = await controller.findOne(slug);

      expect(mockRegionsService.findBySlug).toHaveBeenCalledWith(slug);
      expect(result).toEqual(mockResult);
    });
  });
});
