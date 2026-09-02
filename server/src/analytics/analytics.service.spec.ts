import { Test, type TestingModule } from '@nestjs/testing';
import { ApiException } from '../common/api-exception';
import { Prisma } from '../generated/prisma/client';
import type { OrganizationContext } from '../organizations/organization-context';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsTx } from './analytics.types';
import type { AnalyticsAggregateQueryDto } from './dto/analytics-aggregate-query.dto';
import type { AnalyticsObservationQueryDto } from './dto/analytics-observation-query.dto';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockAnalyticsRepo: Partial<AnalyticsRepository>;

  const mockTx = {} as AnalyticsTx;

  const now = new Date('2026-02-01T12:00:00.000Z');
  const periodStart = new Date('2026-01-01T00:00:00.000Z');
  const periodEnd = new Date('2026-03-31T23:59:59.999Z');

  const orgContext: OrganizationContext = {
    organizationId: '018f7611-89ab-7abc-9234-111111111111',
    accountId: '018f7611-89ab-7abc-9234-222222222222',
    membershipId: '018f7611-89ab-7abc-9234-333333333333',
    role: 'owner',
  };

  const foreignOrgContext: OrganizationContext = {
    organizationId: '018f7611-89ab-7abc-9234-999999999999',
    accountId: '018f7611-89ab-7abc-9234-888888888888',
    membershipId: '018f7611-89ab-7abc-9234-777777777777',
    role: 'admin',
  };

  const sampleMetricDefinition = {
    id: '018f7611-89ab-7abc-9234-ffff1111ffff',
    organizationId: orgContext.organizationId,
    datasetId: '018f7611-89ab-7abc-9234-d00011110000',
    key: 'crop_yield_per_acre',
    label: 'Crop Yield per Acre',
    description: 'Metric tonnes harvested per acre of cultivable land.',
    valueType: 'numeric',
    canonicalUnit: 'tonnes/acre',
    allowedAggregation: 'avg',
    calculationVersion: 'analytics-v1',
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const sampleObservation = {
    id: '018f7611-89ab-7abc-9234-oooo1111oooo',
    organizationId: orgContext.organizationId,
    datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
    regionId: '018f7611-89ab-7abc-9234-rrrr1111rrrr',
    metricDefinitionId: sampleMetricDefinition.id,
    metricDefinition: sampleMetricDefinition,
    periodStart,
    periodEnd,
    periodLabel: '2026-Q1',
    numericValue: new Prisma.Decimal('4.850000'),
    textValue: null,
    booleanValue: null,
    unit: 'tonnes/acre',
    dimensionHash:
      '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    dimensions: { crop: 'wheat', soil: 'loam' },
    sourceRowNumber: 42,
    qualities: [
      {
        severity: 'info',
        state: 'valid',
        code: 'verified_source',
        message: 'Source row passed structural validation.',
      },
    ],
    createdAt: now,
  };

  const sampleAggregate = {
    id: '018f7611-89ab-7abc-9234-eeee1111eeee',
    organizationId: orgContext.organizationId,
    datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
    regionId: '018f7611-89ab-7abc-9234-rrrr1111rrrr',
    metricDefinitionId: sampleMetricDefinition.id,
    metricDefinition: sampleMetricDefinition,
    aggregateType: 'avg',
    periodStart,
    periodEnd,
    numericValue: new Prisma.Decimal('4.850000'),
    textValue: null,
    booleanValue: null,
    unit: 'tonnes/acre',
    dimensionHash:
      '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    dimensions: { crop: 'wheat' },
    observationCount: 36,
    qualitySummary: { valid: 36, warning: 0, error: 0 },
    datasetVersionIds: ['018f7611-89ab-7abc-9234-000011110000'],
    createdAt: now,
  };

  const sampleLineageItem = {
    id: '018f7611-89ab-7abc-9234-llll1111llll',
    organizationId: orgContext.organizationId,
    aggregateId: sampleAggregate.id,
    observationId: sampleObservation.id,
    datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
    datasetVersion: {
      id: '018f7611-89ab-7abc-9234-000011110000',
      versionNumber: 1,
      publishedAt: now,
    },
    observation: sampleObservation,
    createdAt: now,
  };

  beforeEach(async () => {
    mockAnalyticsRepo = {
      organizationScoped: jest
        .fn()
        .mockImplementation(
          <T>(
            _org: OrganizationContext,
            callback: (tx: AnalyticsTx) => Promise<T>,
          ): Promise<T> => callback(mockTx),
        ),
      findMetrics: jest.fn().mockResolvedValue([sampleMetricDefinition]),
      findMetric: jest.fn().mockResolvedValue(sampleMetricDefinition),
      findObservations: jest.fn().mockResolvedValue([sampleObservation]),
      findAggregates: jest.fn().mockResolvedValue([sampleAggregate]),
      findAggregate: jest.fn().mockResolvedValue(sampleAggregate),
      findAggregateEvidence: jest.fn().mockResolvedValue([sampleLineageItem]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: AnalyticsRepository, useValue: mockAnalyticsRepo },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('listMetrics', () => {
    it('executes within organization transaction boundary and returns mapped metric definitions', async () => {
      const metrics = await service.listMetrics(orgContext);

      expect(mockAnalyticsRepo.organizationScoped).toHaveBeenCalledWith(
        orgContext,
        expect.any(Function),
      );
      expect(mockAnalyticsRepo.findMetrics).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
      );
      expect(metrics).toEqual([
        {
          id: sampleMetricDefinition.id,
          key: 'crop_yield_per_acre',
          label: 'Crop Yield per Acre',
          description: 'Metric tonnes harvested per acre of cultivable land.',
          valueType: 'numeric',
          canonicalUnit: 'tonnes/acre',
          allowedAggregation: 'avg',
          calculationVersion: 'analytics-v1',
          status: 'active',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ]);
    });

    it('returns empty array when no metric definitions exist for organization', async () => {
      (mockAnalyticsRepo.findMetrics as jest.Mock).mockResolvedValueOnce([]);

      const metrics = await service.listMetrics(orgContext);

      expect(metrics).toEqual([]);
    });

    it('handles metric definition with null description', async () => {
      (mockAnalyticsRepo.findMetrics as jest.Mock).mockResolvedValueOnce([
        {
          ...sampleMetricDefinition,
          description: null,
        },
      ]);

      const metrics = await service.listMetrics(orgContext);

      expect(metrics[0].description).toBeNull();
    });
  });

  describe('getMetric', () => {
    it('returns single mapped metric definition when found in calling organization scope', async () => {
      const metric = await service.getMetric(
        orgContext,
        sampleMetricDefinition.id,
      );

      expect(mockAnalyticsRepo.organizationScoped).toHaveBeenCalledWith(
        orgContext,
        expect.any(Function),
      );
      expect(mockAnalyticsRepo.findMetric).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        sampleMetricDefinition.id,
      );
      expect(metric).toEqual({
        id: sampleMetricDefinition.id,
        key: 'crop_yield_per_acre',
        label: 'Crop Yield per Acre',
        description: 'Metric tonnes harvested per acre of cultivable land.',
        valueType: 'numeric',
        canonicalUnit: 'tonnes/acre',
        allowedAggregation: 'avg',
        calculationVersion: 'analytics-v1',
        status: 'active',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    });

    it('throws ApiException.notFound when metric does not exist or belongs to foreign tenant', async () => {
      (mockAnalyticsRepo.findMetric as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.getMetric(orgContext, '018f7611-89ab-7abc-9234-nonexistent1'),
      ).rejects.toThrow(ApiException);

      (mockAnalyticsRepo.findMetric as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        service.getMetric(foreignOrgContext, sampleMetricDefinition.id),
      ).rejects.toMatchObject({
        response: {
          code: 'NOT_FOUND',
          message: 'Metric not found.',
        },
      });
    });
  });

  describe('listObservations', () => {
    it('propagates query parameters to repository and normalizes numeric observations', async () => {
      const query: AnalyticsObservationQueryDto = {
        metricId: sampleMetricDefinition.id,
        regionId: '018f7611-89ab-7abc-9234-rrrr1111rrrr',
        datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
        dimensionHash:
          '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-03-31T23:59:59.999Z',
        limit: 25,
      };

      const observations = await service.listObservations(orgContext, query);

      expect(mockAnalyticsRepo.organizationScoped).toHaveBeenCalledWith(
        orgContext,
        expect.any(Function),
      );
      expect(mockAnalyticsRepo.findObservations).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        query,
      );
      expect(observations).toEqual([
        {
          id: sampleObservation.id,
          datasetVersionId: sampleObservation.datasetVersionId,
          regionId: sampleObservation.regionId,
          metric: {
            id: sampleMetricDefinition.id,
            key: 'crop_yield_per_acre',
            label: 'Crop Yield per Acre',
            description: 'Metric tonnes harvested per acre of cultivable land.',
            valueType: 'numeric',
            canonicalUnit: 'tonnes/acre',
            allowedAggregation: 'avg',
            calculationVersion: 'analytics-v1',
            status: 'active',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          periodLabel: '2026-Q1',
          value: { type: 'numeric', value: '4.85' },
          unit: 'tonnes/acre',
          dimensionHash: sampleObservation.dimensionHash,
          dimensions: { crop: 'wheat', soil: 'loam' },
          sourceRowNumber: 42,
          quality: [
            {
              severity: 'info',
              state: 'valid',
              code: 'verified_source',
              message: 'Source row passed structural validation.',
            },
          ],
          createdAt: now.toISOString(),
        },
      ]);
    });

    it('normalizes text and boolean observation values', async () => {
      (mockAnalyticsRepo.findObservations as jest.Mock).mockResolvedValueOnce([
        {
          ...sampleObservation,
          id: 'obs-text',
          numericValue: null,
          textValue: 'High Grade Loam',
          booleanValue: null,
        },
        {
          ...sampleObservation,
          id: 'obs-bool-true',
          numericValue: null,
          textValue: null,
          booleanValue: true,
        },
        {
          ...sampleObservation,
          id: 'obs-bool-false',
          numericValue: null,
          textValue: null,
          booleanValue: false,
        },
      ]);

      const observations = await service.listObservations(orgContext, {});

      expect(observations[0].value).toEqual({
        type: 'text',
        value: 'High Grade Loam',
      });
      expect(observations[1].value).toEqual({
        type: 'boolean',
        value: true,
      });
      expect(observations[2].value).toEqual({
        type: 'boolean',
        value: false,
      });
    });

    it('handles nullable periodLabel and sourceRowNumber in observations', async () => {
      (mockAnalyticsRepo.findObservations as jest.Mock).mockResolvedValueOnce([
        {
          ...sampleObservation,
          periodLabel: null,
          sourceRowNumber: null,
          qualities: [],
        },
      ]);

      const observations = await service.listObservations(orgContext, {});

      expect(observations[0].periodLabel).toBeNull();
      expect(observations[0].sourceRowNumber).toBeNull();
      expect(observations[0].quality).toEqual([]);
    });

    it('returns empty array when query yields no observations', async () => {
      (mockAnalyticsRepo.findObservations as jest.Mock).mockResolvedValueOnce(
        [],
      );

      const observations = await service.listObservations(orgContext, {});

      expect(observations).toEqual([]);
    });
  });

  describe('listAggregates', () => {
    it('propagates query parameters and maps aggregate read models with normalized values', async () => {
      const query: AnalyticsAggregateQueryDto = {
        metricId: sampleMetricDefinition.id,
        regionId: '018f7611-89ab-7abc-9234-rrrr1111rrrr',
        limit: 10,
      };

      const aggregates = await service.listAggregates(orgContext, query);

      expect(mockAnalyticsRepo.organizationScoped).toHaveBeenCalledWith(
        orgContext,
        expect.any(Function),
      );
      expect(mockAnalyticsRepo.findAggregates).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        query,
      );
      expect(aggregates).toEqual([
        {
          id: sampleAggregate.id,
          datasetVersionId: sampleAggregate.datasetVersionId,
          regionId: sampleAggregate.regionId,
          metric: {
            id: sampleMetricDefinition.id,
            key: 'crop_yield_per_acre',
            label: 'Crop Yield per Acre',
            description: 'Metric tonnes harvested per acre of cultivable land.',
            valueType: 'numeric',
            canonicalUnit: 'tonnes/acre',
            allowedAggregation: 'avg',
            calculationVersion: 'analytics-v1',
            status: 'active',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          aggregateType: 'avg',
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          value: { type: 'numeric', value: '4.85' },
          unit: 'tonnes/acre',
          dimensionHash: sampleAggregate.dimensionHash,
          dimensions: { crop: 'wheat' },
          observationCount: 36,
          qualitySummary: { valid: 36, warning: 0, error: 0 },
          datasetVersionIds: ['018f7611-89ab-7abc-9234-000011110000'],
          createdAt: now.toISOString(),
        },
      ]);
    });

    it('normalizes aggregate values of text and boolean types', async () => {
      (mockAnalyticsRepo.findAggregates as jest.Mock).mockResolvedValueOnce([
        {
          ...sampleAggregate,
          id: 'agg-text',
          numericValue: null,
          textValue: 'dominant_cluster',
          booleanValue: null,
        },
        {
          ...sampleAggregate,
          id: 'agg-bool',
          numericValue: null,
          textValue: null,
          booleanValue: false,
        },
      ]);

      const aggregates = await service.listAggregates(orgContext, {});

      expect(aggregates[0].value).toEqual({
        type: 'text',
        value: 'dominant_cluster',
      });
      expect(aggregates[1].value).toEqual({
        type: 'boolean',
        value: false,
      });
    });

    it('returns empty array when query returns no aggregates', async () => {
      (mockAnalyticsRepo.findAggregates as jest.Mock).mockResolvedValueOnce([]);

      const aggregates = await service.listAggregates(orgContext, {});

      expect(aggregates).toEqual([]);
    });
  });

  describe('getAggregateEvidence', () => {
    it('returns full traceable provenance including base aggregate and lineage items', async () => {
      const result = await service.getAggregateEvidence(
        orgContext,
        sampleAggregate.id,
      );

      expect(mockAnalyticsRepo.organizationScoped).toHaveBeenCalledWith(
        orgContext,
        expect.any(Function),
      );
      expect(mockAnalyticsRepo.findAggregate).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        sampleAggregate.id,
      );
      expect(mockAnalyticsRepo.findAggregateEvidence).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        sampleAggregate.id,
      );
      expect(result.aggregate).toEqual({
        id: sampleAggregate.id,
        datasetVersionId: sampleAggregate.datasetVersionId,
        regionId: sampleAggregate.regionId,
        metric: {
          id: sampleMetricDefinition.id,
          key: 'crop_yield_per_acre',
          label: 'Crop Yield per Acre',
          description: 'Metric tonnes harvested per acre of cultivable land.',
          valueType: 'numeric',
          canonicalUnit: 'tonnes/acre',
          allowedAggregation: 'avg',
          calculationVersion: 'analytics-v1',
          status: 'active',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        aggregateType: 'avg',
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        value: { type: 'numeric', value: '4.85' },
        unit: 'tonnes/acre',
        dimensionHash: sampleAggregate.dimensionHash,
        dimensions: { crop: 'wheat' },
        observationCount: 36,
        qualitySummary: { valid: 36, warning: 0, error: 0 },
        datasetVersionIds: ['018f7611-89ab-7abc-9234-000011110000'],
        createdAt: now.toISOString(),
      });

      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0]).toEqual({
        observationId: sampleObservation.id,
        datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
        datasetVersion: {
          id: '018f7611-89ab-7abc-9234-000011110000',
          versionNumber: 1,
          publishedAt: now.toISOString(),
        },
        observation: {
          id: sampleObservation.id,
          datasetVersionId: sampleObservation.datasetVersionId,
          regionId: sampleObservation.regionId,
          metric: {
            id: sampleMetricDefinition.id,
            key: 'crop_yield_per_acre',
            label: 'Crop Yield per Acre',
            description: 'Metric tonnes harvested per acre of cultivable land.',
            valueType: 'numeric',
            canonicalUnit: 'tonnes/acre',
            allowedAggregation: 'avg',
            calculationVersion: 'analytics-v1',
            status: 'active',
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
          },
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          periodLabel: '2026-Q1',
          value: { type: 'numeric', value: '4.85' },
          unit: 'tonnes/acre',
          dimensionHash: sampleObservation.dimensionHash,
          dimensions: { crop: 'wheat', soil: 'loam' },
          sourceRowNumber: 42,
          quality: [
            {
              severity: 'info',
              state: 'valid',
              code: 'verified_source',
              message: 'Source row passed structural validation.',
            },
          ],
          createdAt: now.toISOString(),
        },
      });
    });

    it('throws ApiException.notFound when target aggregate does not exist', async () => {
      (mockAnalyticsRepo.findAggregate as jest.Mock).mockResolvedValueOnce(
        null,
      );

      await expect(
        service.getAggregateEvidence(
          orgContext,
          '018f7611-89ab-7abc-9234-nonexistent1',
        ),
      ).rejects.toThrow(ApiException);

      (mockAnalyticsRepo.findAggregate as jest.Mock).mockResolvedValueOnce(
        null,
      );

      await expect(
        service.getAggregateEvidence(foreignOrgContext, sampleAggregate.id),
      ).rejects.toMatchObject({
        response: {
          code: 'NOT_FOUND',
          message: 'Aggregate not found.',
        },
      });

      expect(mockAnalyticsRepo.findAggregateEvidence).not.toHaveBeenCalled();
    });

    it('handles empty evidence lineage list when aggregate has no linked observations', async () => {
      (
        mockAnalyticsRepo.findAggregateEvidence as jest.Mock
      ).mockResolvedValueOnce([]);

      const result = await service.getAggregateEvidence(
        orgContext,
        sampleAggregate.id,
      );

      expect(result.evidence).toEqual([]);
    });
  });

  describe('numeric serialization and valueOf edge cases', () => {
    it('serializes string decimals directly without modification', async () => {
      (mockAnalyticsRepo.findObservations as jest.Mock).mockResolvedValueOnce([
        {
          ...sampleObservation,
          numericValue: '9007199254740993.123456',
        },
      ]);

      const observations = await service.listObservations(orgContext, {});

      expect(observations[0].value).toEqual({
        type: 'numeric',
        value: '9007199254740993.123456',
      });
    });

    it('serializes JavaScript numbers via toString()', async () => {
      (mockAnalyticsRepo.findObservations as jest.Mock).mockResolvedValueOnce([
        {
          ...sampleObservation,
          numericValue: 42.125,
        },
      ]);

      const observations = await service.listObservations(orgContext, {});

      expect(observations[0].value).toEqual({
        type: 'numeric',
        value: '42.125',
      });
    });

    it('serializes Prisma.Decimal instances via toString()', async () => {
      (mockAnalyticsRepo.findObservations as jest.Mock).mockResolvedValueOnce([
        {
          ...sampleObservation,
          numericValue: new Prisma.Decimal('1234567890123456.789012'),
        },
      ]);

      const observations = await service.listObservations(orgContext, {});

      expect(observations[0].value).toEqual({
        type: 'numeric',
        value: '1234567890123456.789012',
      });
    });

    it('throws Error when numericValue is an unexpected object shape', async () => {
      (mockAnalyticsRepo.findObservations as jest.Mock).mockResolvedValueOnce([
        {
          ...sampleObservation,
          numericValue: { unexpected: true },
        },
      ]);

      await expect(service.listObservations(orgContext, {})).rejects.toThrow(
        'Unexpected numeric metric value shape.',
      );
    });
  });
});
