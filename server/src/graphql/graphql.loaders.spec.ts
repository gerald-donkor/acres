import DataLoader from 'dataloader';
import type { RegionSummary } from '@acres/shared';
import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/api-exception';
import type { RegionsService } from '../regions/regions.service';
import { createGraphqlLoaders } from './graphql.loaders';

describe('graphql.loaders', () => {
  let mockRegionsService: {
    findBySlugs: jest.Mock;
  };
  const DEFAULT_TIMEOUT_MS = 5000;

  const mockRegion1: RegionSummary = {
    id: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k1',
    slug: 'midwest',
    name: 'Midwest Region',
    countryCode: 'US',
    summary: 'Midwest agricultural basin.',
    metrics: [],
  };

  const mockRegion2: RegionSummary = {
    id: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k2',
    slug: 'great-lakes',
    name: 'Great Lakes Region',
    countryCode: 'US',
    summary: 'Great Lakes water management.',
    metrics: [],
  };

  const mockRegion3: RegionSummary = {
    id: 'reg_01j9x0a0b1c2d3e4f5g6h7j8k3',
    slug: 'pacific-northwest',
    name: 'Pacific Northwest',
    countryCode: 'US',
    summary: 'Pacific Northwest forestry and basin.',
    metrics: [],
  };

  const loadCatchingError = async (
    loader: DataLoader<string, RegionSummary>,
    slug: string,
  ): Promise<RegionSummary | ApiException> => {
    try {
      return await loader.load(slug);
    } catch (error: unknown) {
      if (error instanceof ApiException) {
        return error;
      }
      throw error;
    }
  };

  beforeEach(() => {
    mockRegionsService = {
      findBySlugs: jest.fn(),
    };
  });

  describe('createGraphqlLoaders', () => {
    it('returns an object containing a regionBySlug DataLoader instance', () => {
      const loaders = createGraphqlLoaders(
        mockRegionsService as unknown as RegionsService,
        DEFAULT_TIMEOUT_MS,
      );

      expect(loaders).toBeDefined();
      expect(loaders.regionBySlug).toBeInstanceOf(DataLoader);
    });
  });

  describe('regionBySlug.load', () => {
    it('batches multiple concurrent .load(slug) requests into a single call to regionsService.findBySlugs', async () => {
      mockRegionsService.findBySlugs.mockResolvedValue(
        new Map([
          ['midwest', mockRegion1],
          ['great-lakes', mockRegion2],
        ]),
      );

      const loaders = createGraphqlLoaders(
        mockRegionsService as unknown as RegionsService,
        DEFAULT_TIMEOUT_MS,
      );

      const [res1, res2] = await Promise.all([
        loaders.regionBySlug.load('midwest'),
        loaders.regionBySlug.load('great-lakes'),
      ]);

      expect(mockRegionsService.findBySlugs).toHaveBeenCalledTimes(1);
      expect(mockRegionsService.findBySlugs).toHaveBeenCalledWith(
        ['midwest', 'great-lakes'],
        DEFAULT_TIMEOUT_MS,
      );
      expect(res1).toEqual(mockRegion1);
      expect(res2).toEqual(mockRegion2);
    });

    it('returns the mapped RegionSummary for found regions', async () => {
      mockRegionsService.findBySlugs.mockResolvedValue(
        new Map([['midwest', mockRegion1]]),
      );

      const loaders = createGraphqlLoaders(
        mockRegionsService as unknown as RegionsService,
        DEFAULT_TIMEOUT_MS,
      );

      const result = await loaders.regionBySlug.load('midwest');
      expect(result).toEqual(mockRegion1);
    });

    it('returns ApiException.notFound("No region matches \\"...\\"") for missing slugs', async () => {
      mockRegionsService.findBySlugs.mockResolvedValue(new Map());

      const loaders = createGraphqlLoaders(
        mockRegionsService as unknown as RegionsService,
        DEFAULT_TIMEOUT_MS,
      );

      await expect(loaders.regionBySlug.load('non-existent')).rejects.toThrow(
        ApiException,
      );

      const freshLoaders = createGraphqlLoaders(
        mockRegionsService as unknown as RegionsService,
        DEFAULT_TIMEOUT_MS,
      );

      try {
        await freshLoaders.regionBySlug.load('non-existent');
        fail('Expected load to reject');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(ApiException);
        const apiError = error as ApiException;
        expect(apiError.code).toBe('NOT_FOUND');
        expect(apiError.getStatus()).toBe(HttpStatus.NOT_FOUND);
        expect(apiError.message).toBe('No region matches "non-existent".');
      }
    });

    it('handles individual missing slugs in a batch without failing found regions', async () => {
      mockRegionsService.findBySlugs.mockResolvedValue(
        new Map([
          ['midwest', mockRegion1],
          ['pacific-northwest', mockRegion3],
        ]),
      );

      const loaders = createGraphqlLoaders(
        mockRegionsService as unknown as RegionsService,
        DEFAULT_TIMEOUT_MS,
      );

      const midwestPromise = loaders.regionBySlug.load('midwest');
      const missingPromise = loadCatchingError(
        loaders.regionBySlug,
        'unknown-region',
      );
      const pnwPromise = loaders.regionBySlug.load('pacific-northwest');

      const [midwestRes, missingErr, pnwRes] = await Promise.all([
        midwestPromise,
        missingPromise,
        pnwPromise,
      ]);

      expect(mockRegionsService.findBySlugs).toHaveBeenCalledTimes(1);
      expect(midwestRes).toEqual(mockRegion1);
      expect(pnwRes).toEqual(mockRegion3);
      expect(missingErr).toBeInstanceOf(ApiException);
      const apiError = missingErr as ApiException;
      expect(apiError.code).toBe('NOT_FOUND');
      expect(apiError.message).toBe('No region matches "unknown-region".');
    });

    it('preserves the exact order of requested slugs even if the returned Map is in a different order or missing entries', async () => {
      const unorderedMap = new Map<string, RegionSummary>([
        ['pacific-northwest', mockRegion3],
        ['great-lakes', mockRegion2],
        ['midwest', mockRegion1],
      ]);
      mockRegionsService.findBySlugs.mockResolvedValue(unorderedMap);

      const loaders = createGraphqlLoaders(
        mockRegionsService as unknown as RegionsService,
        DEFAULT_TIMEOUT_MS,
      );

      const requestedSlugs = [
        'midwest',
        'unknown',
        'great-lakes',
        'pacific-northwest',
      ];
      const results = await Promise.all(
        requestedSlugs.map((slug) =>
          loadCatchingError(loaders.regionBySlug, slug),
        ),
      );

      expect(mockRegionsService.findBySlugs).toHaveBeenCalledWith(
        requestedSlugs,
        DEFAULT_TIMEOUT_MS,
      );
      expect(results[0]).toEqual(mockRegion1);
      expect(results[1]).toBeInstanceOf(ApiException);
      expect((results[1] as ApiException).message).toBe(
        'No region matches "unknown".',
      );
      expect(results[2]).toEqual(mockRegion2);
      expect(results[3]).toEqual(mockRegion3);
    });

    it('forwards statementTimeoutMs accurately to regionsService.findBySlugs', async () => {
      const customTimeoutMs = 12345;
      mockRegionsService.findBySlugs.mockResolvedValue(new Map());

      const loaders = createGraphqlLoaders(
        mockRegionsService as unknown as RegionsService,
        customTimeoutMs,
      );

      try {
        await loaders.regionBySlug.load('any-slug');
      } catch {
        // Expected not found rejection
      }

      expect(mockRegionsService.findBySlugs).toHaveBeenCalledWith(
        ['any-slug'],
        customTimeoutMs,
      );
    });

    it('caches calls for the same slug within the same loader instance', async () => {
      mockRegionsService.findBySlugs.mockResolvedValue(
        new Map([['midwest', mockRegion1]]),
      );

      const loaders = createGraphqlLoaders(
        mockRegionsService as unknown as RegionsService,
        DEFAULT_TIMEOUT_MS,
      );

      const first = await loaders.regionBySlug.load('midwest');
      const second = await loaders.regionBySlug.load('midwest');

      expect(first).toEqual(mockRegion1);
      expect(second).toEqual(mockRegion1);
      expect(mockRegionsService.findBySlugs).toHaveBeenCalledTimes(1);
    });
  });
});
