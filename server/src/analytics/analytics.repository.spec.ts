import { Test, type TestingModule } from '@nestjs/testing';
import type { OrganizationContext } from '../organizations/organization-context';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import { AnalyticsRepository } from './analytics.repository';
import type { AnalyticsTx } from './analytics.types';
import type { AnalyticsAggregateQueryDto } from './dto/analytics-aggregate-query.dto';
import type { AnalyticsObservationQueryDto } from './dto/analytics-observation-query.dto';

interface MockTx {
  metricDefinition: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  metricObservation: {
    findMany: jest.Mock;
  };
  metricAggregate: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
  metricAggregateLineage: {
    findMany: jest.Mock;
  };
}

interface MockTenantTransactionService {
  organizationScoped: jest.Mock;
}

describe('AnalyticsRepository', () => {
  let repository: AnalyticsRepository;
  let mockTenants: MockTenantTransactionService;
  let mockTx: MockTx;

  const orgContext: OrganizationContext = {
    organizationId: '018f7611-89ab-7abc-9234-111111111111',
    accountId: '018f7611-89ab-7abc-9234-222222222222',
    membershipId: '018f7611-89ab-7abc-9234-333333333333',
    role: 'owner',
    statementTimeoutMs: 5000,
  };

  const organizationId = orgContext.organizationId;
  const metricId = '018f7611-89ab-7abc-9234-ffff1111ffff';
  const aggregateId = '018f7611-89ab-7abc-9234-eeee1111eeee';
  const regionId = '018f7611-89ab-7abc-9234-rrrr1111rrrr';
  const datasetVersionId = '018f7611-89ab-7abc-9234-000011110000';
  const dimensionHash =
    '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';

  const createMockTx = (): MockTx => ({
    metricDefinition: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    metricObservation: {
      findMany: jest.fn(),
    },
    metricAggregate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    metricAggregateLineage: {
      findMany: jest.fn(),
    },
  });

  beforeEach(async () => {
    mockTx = createMockTx();
    mockTenants = {
      organizationScoped: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsRepository,
        {
          provide: TenantTransactionService,
          useValue: mockTenants,
        },
      ],
    }).compile();

    repository = module.get<AnalyticsRepository>(AnalyticsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('instantiation', () => {
    it('can be resolved and instantiated via NestJS TestingModule', () => {
      expect(repository).toBeDefined();
      expect(repository).toBeInstanceOf(AnalyticsRepository);
    });

    it('can be instantiated directly with constructor injection', () => {
      const directRepo = new AnalyticsRepository(
        mockTenants as unknown as TenantTransactionService,
      );
      expect(directRepo).toBeDefined();
      expect(directRepo).toBeInstanceOf(AnalyticsRepository);
    });
  });

  describe('organizationScoped', () => {
    it('calls this.tenants.organizationScoped with accountId, organizationId, callback, and statementTimeoutMs: 5000', async () => {
      const callback = jest.fn().mockResolvedValue('test-result');
      mockTenants.organizationScoped.mockImplementation(
        async (
          _accountId: string,
          _orgId: string,
          cb: (tx: AnalyticsTx) => Promise<unknown>,
        ) => cb(mockTx as unknown as AnalyticsTx),
      );

      const result = await repository.organizationScoped(orgContext, callback);

      expect(mockTenants.organizationScoped).toHaveBeenCalledTimes(1);
      expect(mockTenants.organizationScoped).toHaveBeenCalledWith(
        orgContext.accountId,
        orgContext.organizationId,
        callback,
        { statementTimeoutMs: 5000 },
      );
      expect(callback).toHaveBeenCalledWith(mockTx);
      expect(result).toBe('test-result');
    });

    it('returns the result resolved by tenants.organizationScoped directly', async () => {
      const expectedOutput = { data: [1, 2, 3] };
      mockTenants.organizationScoped.mockResolvedValue(expectedOutput);

      const callback = jest.fn();
      const result = await repository.organizationScoped(orgContext, callback);

      expect(result).toBe(expectedOutput);
      expect(mockTenants.organizationScoped).toHaveBeenCalledWith(
        orgContext.accountId,
        orgContext.organizationId,
        callback,
        { statementTimeoutMs: 5000 },
      );
    });

    it('propagates errors when tenants.organizationScoped rejects', async () => {
      const error = new Error('Database transaction timeout');
      mockTenants.organizationScoped.mockRejectedValue(error);

      const callback = jest.fn();

      await expect(
        repository.organizationScoped(orgContext, callback),
      ).rejects.toThrow('Database transaction timeout');
    });
  });

  describe('findMetrics', () => {
    it('calls tx.metricDefinition.findMany with active status, key ascending ordering, and take: 100', async () => {
      const mockMetrics = [
        { id: metricId, key: 'crop_yield', status: 'active', organizationId },
        {
          id: 'metric-2',
          key: 'soil_moisture',
          status: 'active',
          organizationId,
        },
      ];
      mockTx.metricDefinition.findMany.mockResolvedValue(mockMetrics);

      const result = await repository.findMetrics(
        mockTx as unknown as AnalyticsTx,
        organizationId,
      );

      expect(mockTx.metricDefinition.findMany).toHaveBeenCalledTimes(1);
      expect(mockTx.metricDefinition.findMany).toHaveBeenCalledWith({
        where: { organizationId, status: 'active' },
        orderBy: { key: 'asc' },
        take: 100,
      });
      expect(result).toBe(mockMetrics);
    });

    it('returns empty array when no active metrics exist', async () => {
      mockTx.metricDefinition.findMany.mockResolvedValue([]);

      const result = await repository.findMetrics(
        mockTx as unknown as AnalyticsTx,
        organizationId,
      );

      expect(result).toEqual([]);
    });

    it('propagates errors thrown by tx.metricDefinition.findMany', async () => {
      mockTx.metricDefinition.findMany.mockRejectedValue(
        new Error('Failed to fetch metrics'),
      );

      await expect(
        repository.findMetrics(
          mockTx as unknown as AnalyticsTx,
          organizationId,
        ),
      ).rejects.toThrow('Failed to fetch metrics');
    });
  });

  describe('findMetric', () => {
    it('calls tx.metricDefinition.findFirst with id and organizationId', async () => {
      const mockMetric = {
        id: metricId,
        key: 'crop_yield',
        status: 'active',
        organizationId,
      };
      mockTx.metricDefinition.findFirst.mockResolvedValue(mockMetric);

      const result = await repository.findMetric(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        metricId,
      );

      expect(mockTx.metricDefinition.findFirst).toHaveBeenCalledTimes(1);
      expect(mockTx.metricDefinition.findFirst).toHaveBeenCalledWith({
        where: { id: metricId, organizationId },
      });
      expect(result).toBe(mockMetric);
    });

    it('returns null when metric does not exist or does not belong to organization', async () => {
      mockTx.metricDefinition.findFirst.mockResolvedValue(null);

      const result = await repository.findMetric(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        'non-existent-id',
      );

      expect(result).toBeNull();
    });

    it('propagates errors thrown by tx.metricDefinition.findFirst', async () => {
      mockTx.metricDefinition.findFirst.mockRejectedValue(
        new Error('Query execution failed'),
      );

      await expect(
        repository.findMetric(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          metricId,
        ),
      ).rejects.toThrow('Query execution failed');
    });
  });

  describe('findObservations', () => {
    const periodStartIso = '2026-01-01T00:00:00.000Z';
    const periodEndIso = '2026-03-31T23:59:59.999Z';

    it('uses default limit of 50 when query.limit is undefined', async () => {
      const query: AnalyticsObservationQueryDto = {};
      mockTx.metricObservation.findMany.mockResolvedValue([]);

      await repository.findObservations(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        query,
      );

      expect(mockTx.metricObservation.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          metricDefinitionId: undefined,
          regionId: undefined,
          datasetVersionId: undefined,
          dimensionHash: undefined,
          periodStart: undefined,
          periodEnd: undefined,
        },
        orderBy: [{ periodStart: 'asc' }, { createdAt: 'asc' }],
        include: { metricDefinition: true, qualities: true },
        take: 50,
      });
    });

    it('uses explicit limit when specified in query', async () => {
      const query: AnalyticsObservationQueryDto = { limit: 25 };
      mockTx.metricObservation.findMany.mockResolvedValue([]);

      await repository.findObservations(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        query,
      );

      expect(mockTx.metricObservation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });

    it('applies all filter permutations when all query fields are provided', async () => {
      const query: AnalyticsObservationQueryDto = {
        metricId,
        regionId,
        datasetVersionId,
        dimensionHash,
        periodStart: periodStartIso,
        periodEnd: periodEndIso,
        limit: 15,
      };
      const mockObservations = [{ id: 'obs-1', organizationId }];
      mockTx.metricObservation.findMany.mockResolvedValue(mockObservations);

      const result = await repository.findObservations(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        query,
      );

      expect(mockTx.metricObservation.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          metricDefinitionId: metricId,
          regionId,
          datasetVersionId,
          dimensionHash,
          periodStart: { gte: new Date(periodStartIso) },
          periodEnd: { lte: new Date(periodEndIso) },
        },
        orderBy: [{ periodStart: 'asc' }, { createdAt: 'asc' }],
        include: { metricDefinition: true, qualities: true },
        take: 15,
      });
      expect(result).toBe(mockObservations);
    });

    describe('filter mapping permutations', () => {
      it('maps only metricId to metricDefinitionId', async () => {
        const query: AnalyticsObservationQueryDto = { metricId };
        mockTx.metricObservation.findMany.mockResolvedValue([]);

        await repository.findObservations(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricObservation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: metricId,
              regionId: undefined,
              datasetVersionId: undefined,
              dimensionHash: undefined,
              periodStart: undefined,
              periodEnd: undefined,
            },
          }),
        );
      });

      it('maps only regionId', async () => {
        const query: AnalyticsObservationQueryDto = { regionId };
        mockTx.metricObservation.findMany.mockResolvedValue([]);

        await repository.findObservations(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricObservation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: undefined,
              regionId,
              datasetVersionId: undefined,
              dimensionHash: undefined,
              periodStart: undefined,
              periodEnd: undefined,
            },
          }),
        );
      });

      it('maps only datasetVersionId', async () => {
        const query: AnalyticsObservationQueryDto = { datasetVersionId };
        mockTx.metricObservation.findMany.mockResolvedValue([]);

        await repository.findObservations(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricObservation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: undefined,
              regionId: undefined,
              datasetVersionId,
              dimensionHash: undefined,
              periodStart: undefined,
              periodEnd: undefined,
            },
          }),
        );
      });

      it('maps only dimensionHash', async () => {
        const query: AnalyticsObservationQueryDto = { dimensionHash };
        mockTx.metricObservation.findMany.mockResolvedValue([]);

        await repository.findObservations(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricObservation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: undefined,
              regionId: undefined,
              datasetVersionId: undefined,
              dimensionHash,
              periodStart: undefined,
              periodEnd: undefined,
            },
          }),
        );
      });

      it('maps only periodStart to { gte: Date }', async () => {
        const query: AnalyticsObservationQueryDto = {
          periodStart: periodStartIso,
        };
        mockTx.metricObservation.findMany.mockResolvedValue([]);

        await repository.findObservations(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricObservation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: undefined,
              regionId: undefined,
              datasetVersionId: undefined,
              dimensionHash: undefined,
              periodStart: { gte: new Date(periodStartIso) },
              periodEnd: undefined,
            },
          }),
        );
      });

      it('maps only periodEnd to { lte: Date }', async () => {
        const query: AnalyticsObservationQueryDto = { periodEnd: periodEndIso };
        mockTx.metricObservation.findMany.mockResolvedValue([]);

        await repository.findObservations(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricObservation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: undefined,
              regionId: undefined,
              datasetVersionId: undefined,
              dimensionHash: undefined,
              periodStart: undefined,
              periodEnd: { lte: new Date(periodEndIso) },
            },
          }),
        );
      });
    });

    it('propagates errors thrown by tx.metricObservation.findMany', async () => {
      mockTx.metricObservation.findMany.mockRejectedValue(
        new Error('Failed to fetch observations'),
      );

      await expect(
        repository.findObservations(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          {},
        ),
      ).rejects.toThrow('Failed to fetch observations');
    });
  });

  describe('findAggregates', () => {
    const periodStartIso = '2026-01-01T00:00:00.000Z';
    const periodEndIso = '2026-03-31T23:59:59.999Z';

    it('uses default limit of 50 when query.limit is undefined', async () => {
      const query: AnalyticsAggregateQueryDto = {};
      mockTx.metricAggregate.findMany.mockResolvedValue([]);

      await repository.findAggregates(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        query,
      );

      expect(mockTx.metricAggregate.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          metricDefinitionId: undefined,
          regionId: undefined,
          datasetVersionId: undefined,
          dimensionHash: undefined,
          periodStart: undefined,
          periodEnd: undefined,
        },
        orderBy: [{ periodStart: 'asc' }, { createdAt: 'asc' }],
        include: { metricDefinition: true },
        take: 50,
      });
    });

    it('uses explicit limit when specified in query', async () => {
      const query: AnalyticsAggregateQueryDto = { limit: 10 };
      mockTx.metricAggregate.findMany.mockResolvedValue([]);

      await repository.findAggregates(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        query,
      );

      expect(mockTx.metricAggregate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
        }),
      );
    });

    it('applies all filter permutations when all query fields are provided', async () => {
      const query: AnalyticsAggregateQueryDto = {
        metricId,
        regionId,
        datasetVersionId,
        dimensionHash,
        periodStart: periodStartIso,
        periodEnd: periodEndIso,
        limit: 30,
      };
      const mockAggregates = [{ id: aggregateId, organizationId }];
      mockTx.metricAggregate.findMany.mockResolvedValue(mockAggregates);

      const result = await repository.findAggregates(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        query,
      );

      expect(mockTx.metricAggregate.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          metricDefinitionId: metricId,
          regionId,
          datasetVersionId,
          dimensionHash,
          periodStart: { gte: new Date(periodStartIso) },
          periodEnd: { lte: new Date(periodEndIso) },
        },
        orderBy: [{ periodStart: 'asc' }, { createdAt: 'asc' }],
        include: { metricDefinition: true },
        take: 30,
      });
      expect(result).toBe(mockAggregates);
    });

    describe('filter mapping permutations', () => {
      it('maps only metricId to metricDefinitionId', async () => {
        const query: AnalyticsAggregateQueryDto = { metricId };
        mockTx.metricAggregate.findMany.mockResolvedValue([]);

        await repository.findAggregates(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricAggregate.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: metricId,
              regionId: undefined,
              datasetVersionId: undefined,
              dimensionHash: undefined,
              periodStart: undefined,
              periodEnd: undefined,
            },
          }),
        );
      });

      it('maps only regionId', async () => {
        const query: AnalyticsAggregateQueryDto = { regionId };
        mockTx.metricAggregate.findMany.mockResolvedValue([]);

        await repository.findAggregates(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricAggregate.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: undefined,
              regionId,
              datasetVersionId: undefined,
              dimensionHash: undefined,
              periodStart: undefined,
              periodEnd: undefined,
            },
          }),
        );
      });

      it('maps only datasetVersionId', async () => {
        const query: AnalyticsAggregateQueryDto = { datasetVersionId };
        mockTx.metricAggregate.findMany.mockResolvedValue([]);

        await repository.findAggregates(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricAggregate.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: undefined,
              regionId: undefined,
              datasetVersionId,
              dimensionHash: undefined,
              periodStart: undefined,
              periodEnd: undefined,
            },
          }),
        );
      });

      it('maps only dimensionHash', async () => {
        const query: AnalyticsAggregateQueryDto = { dimensionHash };
        mockTx.metricAggregate.findMany.mockResolvedValue([]);

        await repository.findAggregates(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricAggregate.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: undefined,
              regionId: undefined,
              datasetVersionId: undefined,
              dimensionHash,
              periodStart: undefined,
              periodEnd: undefined,
            },
          }),
        );
      });

      it('maps only periodStart to { gte: Date }', async () => {
        const query: AnalyticsAggregateQueryDto = {
          periodStart: periodStartIso,
        };
        mockTx.metricAggregate.findMany.mockResolvedValue([]);

        await repository.findAggregates(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricAggregate.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: undefined,
              regionId: undefined,
              datasetVersionId: undefined,
              dimensionHash: undefined,
              periodStart: { gte: new Date(periodStartIso) },
              periodEnd: undefined,
            },
          }),
        );
      });

      it('maps only periodEnd to { lte: Date }', async () => {
        const query: AnalyticsAggregateQueryDto = { periodEnd: periodEndIso };
        mockTx.metricAggregate.findMany.mockResolvedValue([]);

        await repository.findAggregates(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          query,
        );

        expect(mockTx.metricAggregate.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              organizationId,
              metricDefinitionId: undefined,
              regionId: undefined,
              datasetVersionId: undefined,
              dimensionHash: undefined,
              periodStart: undefined,
              periodEnd: { lte: new Date(periodEndIso) },
            },
          }),
        );
      });
    });

    it('propagates errors thrown by tx.metricAggregate.findMany', async () => {
      mockTx.metricAggregate.findMany.mockRejectedValue(
        new Error('Failed to fetch aggregates'),
      );

      await expect(
        repository.findAggregates(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          {},
        ),
      ).rejects.toThrow('Failed to fetch aggregates');
    });
  });

  describe('findAggregate', () => {
    it('calls tx.metricAggregate.findFirst with id, organizationId, and metricDefinition include', async () => {
      const mockAggregate = {
        id: aggregateId,
        organizationId,
        metricDefinitionId: metricId,
        metricDefinition: { id: metricId, key: 'crop_yield' },
      };
      mockTx.metricAggregate.findFirst.mockResolvedValue(mockAggregate);

      const result = await repository.findAggregate(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        aggregateId,
      );

      expect(mockTx.metricAggregate.findFirst).toHaveBeenCalledTimes(1);
      expect(mockTx.metricAggregate.findFirst).toHaveBeenCalledWith({
        where: { id: aggregateId, organizationId },
        include: { metricDefinition: true },
      });
      expect(result).toBe(mockAggregate);
    });

    it('returns null when aggregate does not exist', async () => {
      mockTx.metricAggregate.findFirst.mockResolvedValue(null);

      const result = await repository.findAggregate(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        'non-existent-id',
      );

      expect(result).toBeNull();
    });

    it('propagates errors thrown by tx.metricAggregate.findFirst', async () => {
      mockTx.metricAggregate.findFirst.mockRejectedValue(
        new Error('Query execution failed'),
      );

      await expect(
        repository.findAggregate(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          aggregateId,
        ),
      ).rejects.toThrow('Query execution failed');
    });
  });

  describe('findAggregateEvidence', () => {
    it('calls tx.metricAggregateLineage.findMany with organizationId, aggregateId, ordering, take: 200, and nested includes', async () => {
      const mockEvidence = [
        {
          organizationId,
          aggregateId,
          observation: {
            id: 'obs-1',
            metricDefinition: { id: metricId },
            qualities: [],
          },
          datasetVersion: { id: datasetVersionId },
        },
      ];
      mockTx.metricAggregateLineage.findMany.mockResolvedValue(mockEvidence);

      const result = await repository.findAggregateEvidence(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        aggregateId,
      );

      expect(mockTx.metricAggregateLineage.findMany).toHaveBeenCalledTimes(1);
      expect(mockTx.metricAggregateLineage.findMany).toHaveBeenCalledWith({
        where: { organizationId, aggregateId },
        orderBy: { createdAt: 'asc' },
        take: 200,
        include: {
          observation: {
            include: { metricDefinition: true, qualities: true },
          },
          datasetVersion: true,
        },
      });
      expect(result).toBe(mockEvidence);
    });

    it('returns empty array when no lineage records exist', async () => {
      mockTx.metricAggregateLineage.findMany.mockResolvedValue([]);

      const result = await repository.findAggregateEvidence(
        mockTx as unknown as AnalyticsTx,
        organizationId,
        aggregateId,
      );

      expect(result).toEqual([]);
    });

    it('propagates errors thrown by tx.metricAggregateLineage.findMany', async () => {
      mockTx.metricAggregateLineage.findMany.mockRejectedValue(
        new Error('Failed to fetch aggregate evidence'),
      );

      await expect(
        repository.findAggregateEvidence(
          mockTx as unknown as AnalyticsTx,
          organizationId,
          aggregateId,
        ),
      ).rejects.toThrow('Failed to fetch aggregate evidence');
    });
  });
});
