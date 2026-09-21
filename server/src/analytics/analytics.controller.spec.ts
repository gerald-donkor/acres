import { Test, type TestingModule } from '@nestjs/testing';
import { ApiException } from '../common/api-exception';
import type { OrganizationContext } from '../organizations/organization-context';
import { OrganizationContextGuard } from '../organizations/organization-context.guard';
import { PermissionGuard } from '../organizations/permission.guard';
import { SessionGuard } from '../sessions/session.guard';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsAggregateQueryDto } from './dto/analytics-aggregate-query.dto';
import type { AnalyticsObservationQueryDto } from './dto/analytics-observation-query.dto';
import type {
  AggregateParamDto,
  MetricParamDto,
} from './dto/analytics-param.dto';

type ListMetricsResult = Awaited<ReturnType<AnalyticsService['listMetrics']>>;
type MetricResult = Awaited<ReturnType<AnalyticsService['getMetric']>>;
type ListObservationsResult = Awaited<
  ReturnType<AnalyticsService['listObservations']>
>;
type ListAggregatesResult = Awaited<
  ReturnType<AnalyticsService['listAggregates']>
>;
type AggregateEvidenceResult = Awaited<
  ReturnType<AnalyticsService['getAggregateEvidence']>
>;

interface TypedMockAnalyticsService {
  listMetrics: jest.Mock<Promise<ListMetricsResult>, [OrganizationContext]>;
  getMetric: jest.Mock<Promise<MetricResult>, [OrganizationContext, string]>;
  listObservations: jest.Mock<
    Promise<ListObservationsResult>,
    [OrganizationContext, AnalyticsObservationQueryDto]
  >;
  listAggregates: jest.Mock<
    Promise<ListAggregatesResult>,
    [OrganizationContext, AnalyticsAggregateQueryDto]
  >;
  getAggregateEvidence: jest.Mock<
    Promise<AggregateEvidenceResult>,
    [OrganizationContext, string]
  >;
}

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockAnalyticsService: TypedMockAnalyticsService;

  const mockOrg: OrganizationContext = {
    organizationId: '018f7611-89ab-7abc-9234-111111111111',
    accountId: '018f7611-89ab-7abc-9234-222222222222',
    membershipId: '018f7611-89ab-7abc-9234-333333333333',
    role: 'owner',
    statementTimeoutMs: 5000,
  };

  const sampleMetric: MetricResult = {
    id: '018f7611-89ab-7abc-9234-ffff1111ffff',
    key: 'crop_yield_per_acre',
    label: 'Crop Yield per Acre',
    description: 'Metric tonnes harvested per acre of cultivable land.',
    valueType: 'numeric',
    canonicalUnit: 'tonnes/acre',
    allowedAggregation: 'avg',
    calculationVersion: 'analytics-v1',
    status: 'active',
    createdAt: '2026-02-01T12:00:00.000Z',
    updatedAt: '2026-02-01T12:00:00.000Z',
  };

  const sampleMetric2: MetricResult = {
    id: '018f7611-89ab-7abc-9234-ffff2222ffff',
    key: 'soil_nitrogen_pct',
    label: 'Soil Nitrogen Content',
    description: null,
    valueType: 'numeric',
    canonicalUnit: 'percent',
    allowedAggregation: 'avg',
    calculationVersion: 'analytics-v1',
    status: 'active',
    createdAt: '2026-02-02T10:00:00.000Z',
    updatedAt: '2026-02-02T10:00:00.000Z',
  };

  const sampleObservation: ListObservationsResult[number] = {
    id: '018f7611-89ab-7abc-9234-oooo1111oooo',
    datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
    regionId: '018f7611-89ab-7abc-9234-rrrr1111rrrr',
    metric: sampleMetric,
    periodStart: '2026-01-01T00:00:00.000Z',
    periodEnd: '2026-03-31T23:59:59.999Z',
    periodLabel: '2026-Q1',
    value: { type: 'numeric', value: '4.850000' },
    unit: 'tonnes/acre',
    dimensionHash:
      '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
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
    createdAt: '2026-02-01T12:00:00.000Z',
  };

  const sampleAggregate: ListAggregatesResult[number] = {
    id: '018f7611-89ab-7abc-9234-eeee1111eeee',
    datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
    regionId: '018f7611-89ab-7abc-9234-rrrr1111rrrr',
    metric: sampleMetric,
    aggregateType: 'avg',
    periodStart: '2026-01-01T00:00:00.000Z',
    periodEnd: '2026-03-31T23:59:59.999Z',
    value: { type: 'numeric', value: '4.850000' },
    unit: 'tonnes/acre',
    dimensionHash:
      '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    dimensions: { crop: 'wheat' },
    observationCount: 36,
    qualitySummary: { valid: 36, warning: 0, error: 0 },
    datasetVersionIds: ['018f7611-89ab-7abc-9234-000011110000'],
    createdAt: '2026-02-01T12:00:00.000Z',
  };

  const sampleEvidence: AggregateEvidenceResult = {
    aggregate: sampleAggregate,
    evidence: [
      {
        observationId: sampleObservation.id,
        datasetVersionId: sampleObservation.datasetVersionId,
        datasetVersion: {
          id: sampleObservation.datasetVersionId,
          versionNumber: 1,
          publishedAt: '2026-01-15T08:00:00.000Z',
        },
        observation: sampleObservation,
      },
    ],
  };

  beforeEach(async () => {
    mockAnalyticsService = {
      listMetrics: jest.fn<Promise<ListMetricsResult>, [OrganizationContext]>(),
      getMetric: jest.fn<
        Promise<MetricResult>,
        [OrganizationContext, string]
      >(),
      listObservations: jest.fn<
        Promise<ListObservationsResult>,
        [OrganizationContext, AnalyticsObservationQueryDto]
      >(),
      listAggregates: jest.fn<
        Promise<ListAggregatesResult>,
        [OrganizationContext, AnalyticsAggregateQueryDto]
      >(),
      getAggregateEvidence: jest.fn<
        Promise<AggregateEvidenceResult>,
        [OrganizationContext, string]
      >(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OrganizationContextGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('can be resolved and instantiated via NestJS TestingModule', () => {
    expect(controller).toBeDefined();
    expect(controller).toBeInstanceOf(AnalyticsController);
  });

  it('can be instantiated directly with constructor injection', () => {
    const directInstance = new AnalyticsController(
      mockAnalyticsService as unknown as AnalyticsService,
    );
    expect(directInstance).toBeDefined();
    expect(directInstance).toBeInstanceOf(AnalyticsController);
  });

  describe('listMetrics', () => {
    it('calls analytics.listMetrics(organization) and returns list of MetricDefinition', async () => {
      const metrics: ListMetricsResult = [sampleMetric, sampleMetric2];
      mockAnalyticsService.listMetrics.mockResolvedValue(metrics);

      const result = await controller.listMetrics(mockOrg);

      expect(mockAnalyticsService.listMetrics).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.listMetrics).toHaveBeenCalledWith(mockOrg);
      expect(result).toEqual(metrics);
    });

    it('returns empty array when no metric definitions exist for organization', async () => {
      mockAnalyticsService.listMetrics.mockResolvedValue([]);

      const result = await controller.listMetrics(mockOrg);

      expect(mockAnalyticsService.listMetrics).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.listMetrics).toHaveBeenCalledWith(mockOrg);
      expect(result).toEqual([]);
    });

    it('propagates errors thrown by analytics.listMetrics', async () => {
      const error = ApiException.forbidden(
        'Permission denied to read metrics.',
      );
      mockAnalyticsService.listMetrics.mockRejectedValue(error);

      await expect(controller.listMetrics(mockOrg)).rejects.toThrow(error);
      expect(mockAnalyticsService.listMetrics).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.listMetrics).toHaveBeenCalledWith(mockOrg);
    });
  });

  describe('getMetric', () => {
    const params: MetricParamDto = {
      metricId: sampleMetric.id,
    };

    it('calls analytics.getMetric(organization, params.metricId) and returns MetricDefinition', async () => {
      mockAnalyticsService.getMetric.mockResolvedValue(sampleMetric);

      const result = await controller.getMetric(mockOrg, params);

      expect(mockAnalyticsService.getMetric).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.getMetric).toHaveBeenCalledWith(
        mockOrg,
        params.metricId,
      );
      expect(result).toEqual(sampleMetric);
    });

    it('propagates ApiException.notFound when metric does not exist', async () => {
      const notFoundError = ApiException.notFound('Metric not found.');
      mockAnalyticsService.getMetric.mockRejectedValue(notFoundError);

      await expect(controller.getMetric(mockOrg, params)).rejects.toThrow(
        notFoundError,
      );
      expect(mockAnalyticsService.getMetric).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.getMetric).toHaveBeenCalledWith(
        mockOrg,
        params.metricId,
      );
    });

    it('propagates generic unexpected errors thrown by analytics.getMetric', async () => {
      const genericError = new Error('Database connection failed.');
      mockAnalyticsService.getMetric.mockRejectedValue(genericError);

      await expect(controller.getMetric(mockOrg, params)).rejects.toThrow(
        genericError,
      );
      expect(mockAnalyticsService.getMetric).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.getMetric).toHaveBeenCalledWith(
        mockOrg,
        params.metricId,
      );
    });
  });

  describe('listObservations', () => {
    it('calls analytics.listObservations(organization, query) and returns observations array', async () => {
      const query: AnalyticsObservationQueryDto = {
        metricId: sampleMetric.id,
        regionId: '018f7611-89ab-7abc-9234-rrrr1111rrrr',
        datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
        dimensionHash:
          '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-03-31T23:59:59.999Z',
        limit: 25,
      };
      const observations: ListObservationsResult = [sampleObservation];
      mockAnalyticsService.listObservations.mockResolvedValue(observations);

      const result = await controller.listObservations(mockOrg, query);

      expect(mockAnalyticsService.listObservations).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.listObservations).toHaveBeenCalledWith(
        mockOrg,
        query,
      );
      expect(result).toEqual(observations);
    });

    it('returns empty array when query returns no matching observations', async () => {
      const query: AnalyticsObservationQueryDto = {
        metricId: sampleMetric.id,
      };
      mockAnalyticsService.listObservations.mockResolvedValue([]);

      const result = await controller.listObservations(mockOrg, query);

      expect(mockAnalyticsService.listObservations).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.listObservations).toHaveBeenCalledWith(
        mockOrg,
        query,
      );
      expect(result).toEqual([]);
    });

    it('delegates with empty query object and returns observations', async () => {
      const query: AnalyticsObservationQueryDto = {};
      const observations: ListObservationsResult = [sampleObservation];
      mockAnalyticsService.listObservations.mockResolvedValue(observations);

      const result = await controller.listObservations(mockOrg, query);

      expect(mockAnalyticsService.listObservations).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.listObservations).toHaveBeenCalledWith(
        mockOrg,
        query,
      );
      expect(result).toEqual(observations);
    });

    it('propagates errors thrown by analytics.listObservations', async () => {
      const query: AnalyticsObservationQueryDto = { limit: 10 };
      const error = ApiException.validationFailed([
        'Invalid observation query.',
      ]);
      mockAnalyticsService.listObservations.mockRejectedValue(error);

      await expect(controller.listObservations(mockOrg, query)).rejects.toThrow(
        error,
      );
      expect(mockAnalyticsService.listObservations).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.listObservations).toHaveBeenCalledWith(
        mockOrg,
        query,
      );
    });
  });

  describe('listAggregates', () => {
    it('calls analytics.listAggregates(organization, query) and returns aggregates array', async () => {
      const query: AnalyticsAggregateQueryDto = {
        metricId: sampleMetric.id,
        regionId: '018f7611-89ab-7abc-9234-rrrr1111rrrr',
        datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
        limit: 50,
      };
      const aggregates: ListAggregatesResult = [sampleAggregate];
      mockAnalyticsService.listAggregates.mockResolvedValue(aggregates);

      const result = await controller.listAggregates(mockOrg, query);

      expect(mockAnalyticsService.listAggregates).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.listAggregates).toHaveBeenCalledWith(
        mockOrg,
        query,
      );
      expect(result).toEqual(aggregates);
    });

    it('returns empty array when query returns no matching aggregates', async () => {
      const query: AnalyticsAggregateQueryDto = {};
      mockAnalyticsService.listAggregates.mockResolvedValue([]);

      const result = await controller.listAggregates(mockOrg, query);

      expect(mockAnalyticsService.listAggregates).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.listAggregates).toHaveBeenCalledWith(
        mockOrg,
        query,
      );
      expect(result).toEqual([]);
    });

    it('propagates errors thrown by analytics.listAggregates', async () => {
      const query: AnalyticsAggregateQueryDto = { limit: 5 };
      const error = new Error('Query execution timeout.');
      mockAnalyticsService.listAggregates.mockRejectedValue(error);

      await expect(controller.listAggregates(mockOrg, query)).rejects.toThrow(
        error,
      );
      expect(mockAnalyticsService.listAggregates).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsService.listAggregates).toHaveBeenCalledWith(
        mockOrg,
        query,
      );
    });
  });

  describe('getAggregateEvidence', () => {
    const params: AggregateParamDto = {
      aggregateId: sampleAggregate.id,
    };

    it('calls analytics.getAggregateEvidence(organization, params.aggregateId) and returns evidence object', async () => {
      mockAnalyticsService.getAggregateEvidence.mockResolvedValue(
        sampleEvidence,
      );

      const result = await controller.getAggregateEvidence(mockOrg, params);

      expect(mockAnalyticsService.getAggregateEvidence).toHaveBeenCalledTimes(
        1,
      );
      expect(mockAnalyticsService.getAggregateEvidence).toHaveBeenCalledWith(
        mockOrg,
        params.aggregateId,
      );
      expect(result).toEqual(sampleEvidence);
    });

    it('returns evidence object with empty evidence array when no linked observations exist', async () => {
      const emptyEvidence: AggregateEvidenceResult = {
        aggregate: sampleAggregate,
        evidence: [],
      };
      mockAnalyticsService.getAggregateEvidence.mockResolvedValue(
        emptyEvidence,
      );

      const result = await controller.getAggregateEvidence(mockOrg, params);

      expect(mockAnalyticsService.getAggregateEvidence).toHaveBeenCalledTimes(
        1,
      );
      expect(mockAnalyticsService.getAggregateEvidence).toHaveBeenCalledWith(
        mockOrg,
        params.aggregateId,
      );
      expect(result).toEqual(emptyEvidence);
      expect(result.evidence).toHaveLength(0);
    });

    it('propagates ApiException.notFound when aggregate is not found', async () => {
      const notFoundError = ApiException.notFound('Aggregate not found.');
      mockAnalyticsService.getAggregateEvidence.mockRejectedValue(
        notFoundError,
      );

      await expect(
        controller.getAggregateEvidence(mockOrg, params),
      ).rejects.toThrow(notFoundError);
      expect(mockAnalyticsService.getAggregateEvidence).toHaveBeenCalledTimes(
        1,
      );
      expect(mockAnalyticsService.getAggregateEvidence).toHaveBeenCalledWith(
        mockOrg,
        params.aggregateId,
      );
    });

    it('propagates generic errors thrown by analytics.getAggregateEvidence', async () => {
      const genericError = new Error('Failed to load evidence lineage.');
      mockAnalyticsService.getAggregateEvidence.mockRejectedValue(genericError);

      await expect(
        controller.getAggregateEvidence(mockOrg, params),
      ).rejects.toThrow(genericError);
      expect(mockAnalyticsService.getAggregateEvidence).toHaveBeenCalledTimes(
        1,
      );
      expect(mockAnalyticsService.getAggregateEvidence).toHaveBeenCalledWith(
        mockOrg,
        params.aggregateId,
      );
    });
  });

  describe('Exception propagation across all methods', () => {
    const apiError = ApiException.validationFailed([
      'Client validation failed.',
    ]);
    const runtimeError = new Error('Unexpected service failure.');

    it.each<[string, () => Promise<unknown>]>([
      ['listMetrics', () => controller.listMetrics(mockOrg)],
      [
        'getMetric',
        () => controller.getMetric(mockOrg, { metricId: sampleMetric.id }),
      ],
      ['listObservations', () => controller.listObservations(mockOrg, {})],
      ['listAggregates', () => controller.listAggregates(mockOrg, {})],
      [
        'getAggregateEvidence',
        () =>
          controller.getAggregateEvidence(mockOrg, {
            aggregateId: sampleAggregate.id,
          }),
      ],
    ])(
      'propagates ApiException without alteration on %s',
      async (_name, methodCall) => {
        mockAnalyticsService.listMetrics.mockRejectedValue(apiError);
        mockAnalyticsService.getMetric.mockRejectedValue(apiError);
        mockAnalyticsService.listObservations.mockRejectedValue(apiError);
        mockAnalyticsService.listAggregates.mockRejectedValue(apiError);
        mockAnalyticsService.getAggregateEvidence.mockRejectedValue(apiError);

        await expect(methodCall()).rejects.toThrow(apiError);
      },
    );

    it.each<[string, () => Promise<unknown>]>([
      ['listMetrics', () => controller.listMetrics(mockOrg)],
      [
        'getMetric',
        () => controller.getMetric(mockOrg, { metricId: sampleMetric.id }),
      ],
      ['listObservations', () => controller.listObservations(mockOrg, {})],
      ['listAggregates', () => controller.listAggregates(mockOrg, {})],
      [
        'getAggregateEvidence',
        () =>
          controller.getAggregateEvidence(mockOrg, {
            aggregateId: sampleAggregate.id,
          }),
      ],
    ])(
      'propagates generic Error without alteration on %s',
      async (_name, methodCall) => {
        mockAnalyticsService.listMetrics.mockRejectedValue(runtimeError);
        mockAnalyticsService.getMetric.mockRejectedValue(runtimeError);
        mockAnalyticsService.listObservations.mockRejectedValue(runtimeError);
        mockAnalyticsService.listAggregates.mockRejectedValue(runtimeError);
        mockAnalyticsService.getAggregateEvidence.mockRejectedValue(
          runtimeError,
        );

        await expect(methodCall()).rejects.toThrow(runtimeError);
      },
    );
  });
});
