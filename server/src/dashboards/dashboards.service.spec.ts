import { Test, type TestingModule } from '@nestjs/testing';
import type {
  CreateDashboardViewInput,
  DashboardFilters,
  UpdateDashboardViewInput,
} from '@acres/shared';
import { ApiException } from '../common/api-exception';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { OrganizationContext } from '../organizations/organization-context';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  DashboardsRepository,
  type DashboardTx,
} from './dashboards.repository';
import { DashboardsService } from './dashboards.service';

describe('DashboardsService', () => {
  let service: DashboardsService;
  let mockDashboardsRepo: Partial<DashboardsRepository>;
  let mockAnalyticsService: Partial<AnalyticsService>;
  let mockIdempotencyService: Partial<IdempotencyService>;

  let mockTx: {
    dashboardView: {
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
  };

  const now = new Date('2026-02-01T12:00:00.000Z');
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

  const sampleViewRow = {
    id: '018f7611-89ab-7abc-9234-aaaa1111aaaa',
    organizationId: orgContext.organizationId,
    ownerAccountId: orgContext.accountId,
    name: 'Executive KPI Overview',
    description: 'Quarterly regional indicators and performance trends.',
    filters: {
      metricId: '018f7611-89ab-7abc-9234-ffff1111ffff',
      regionId: 'reg-west',
      periodStart: '2026-01-01T00:00:00.000Z',
      periodEnd: '2026-03-31T00:00:00.000Z',
    },
    presentation: {
      chart: 'bar',
      compareBy: 'region',
    },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  const sampleMetricSummary = {
    id: '018f7611-89ab-7abc-9234-ffff1111ffff',
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
  };

  const sampleAggregateSummary = {
    id: '018f7611-89ab-7abc-9234-eeee1111eeee',
    datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
    regionId: 'reg-west',
    metric: sampleMetricSummary,
    aggregateType: 'avg',
    periodStart: '2026-01-01T00:00:00.000Z',
    periodEnd: '2026-03-31T00:00:00.000Z',
    value: {
      type: 'numeric',
      value: '4.85',
    },
    unit: 'tonnes/acre',
    dimensionHash:
      '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    dimensions: { crop: 'wheat' },
    observationCount: 36,
    qualitySummary: { valid: 36, warning: 0, error: 0 },
    datasetVersionIds: ['018f7611-89ab-7abc-9234-000011110000'],
    createdAt: now.toISOString(),
  };

  beforeEach(async () => {
    mockTx = {
      dashboardView: {
        create: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            id: sampleViewRow.id,
            status: 'active',
            createdAt: now,
            updatedAt: now,
            ...(args.data as object),
          }),
        ),
        update: jest
          .fn()
          .mockImplementation(
            (args: { where: { id: string }; data: unknown }) =>
              Promise.resolve({
                ...sampleViewRow,
                ...(args.data as object),
                updatedAt: now,
              }),
          ),
        findFirst: jest.fn().mockResolvedValue(sampleViewRow),
        findMany: jest.fn().mockResolvedValue([sampleViewRow]),
      },
    };

    mockDashboardsRepo = {
      organizationScoped: jest
        .fn()
        .mockImplementation(
          <T>(
            _org: OrganizationContext,
            callback: (tx: DashboardTx) => Promise<T>,
          ): Promise<T> => callback(mockTx as unknown as DashboardTx),
        ),
      listViews: jest.fn().mockResolvedValue([sampleViewRow]),
      findView: jest.fn().mockResolvedValue(sampleViewRow),
    };

    mockAnalyticsService = {
      listMetrics: jest.fn().mockResolvedValue([sampleMetricSummary]),
      listAggregates: jest.fn().mockResolvedValue([sampleAggregateSummary]),
    };

    mockIdempotencyService = {
      run: jest
        .fn()
        .mockImplementation(
          <T>(
            _tx: unknown,
            _scope: unknown,
            callback: () => Promise<T>,
          ): Promise<T> => callback(),
        ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardsService,
        { provide: DashboardsRepository, useValue: mockDashboardsRepo },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
      ],
    }).compile();

    service = module.get<DashboardsService>(DashboardsService);
  });

  describe('listViews', () => {
    it('executes within organization transaction boundary and returns mapped view summaries', async () => {
      const views = await service.listViews(orgContext);

      expect(mockDashboardsRepo.organizationScoped).toHaveBeenCalledWith(
        orgContext,
        expect.any(Function),
      );
      expect(mockDashboardsRepo.listViews).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
      );
      expect(views).toHaveLength(1);
      expect(views[0]).toEqual({
        id: sampleViewRow.id,
        ownerAccountId: sampleViewRow.ownerAccountId,
        name: 'Executive KPI Overview',
        description: 'Quarterly regional indicators and performance trends.',
        filters: sampleViewRow.filters,
        presentation: sampleViewRow.presentation,
        status: 'active',
        createdAt: '2026-02-01T12:00:00.000Z',
        updatedAt: '2026-02-01T12:00:00.000Z',
      });
    });

    it('handles empty view list without error', async () => {
      (mockDashboardsRepo.listViews as jest.Mock).mockResolvedValueOnce([]);

      const views = await service.listViews(orgContext);

      expect(views).toEqual([]);
    });

    it('falls back to empty object when filters or presentation are null in database', async () => {
      (mockDashboardsRepo.listViews as jest.Mock).mockResolvedValueOnce([
        {
          ...sampleViewRow,
          filters: null,
          presentation: null,
        },
      ]);

      const views = await service.listViews(orgContext);

      expect(views[0].filters).toEqual({});
      expect(views[0].presentation).toEqual({});
    });
  });

  describe('getView', () => {
    it('returns single view mapped with ISO dates when view exists in organization', async () => {
      const view = await service.getView(orgContext, sampleViewRow.id);

      expect(mockDashboardsRepo.organizationScoped).toHaveBeenCalledWith(
        orgContext,
        expect.any(Function),
      );
      expect(mockDashboardsRepo.findView).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        sampleViewRow.id,
      );
      expect(view).toEqual({
        id: sampleViewRow.id,
        ownerAccountId: sampleViewRow.ownerAccountId,
        name: sampleViewRow.name,
        description: sampleViewRow.description,
        filters: sampleViewRow.filters,
        presentation: sampleViewRow.presentation,
        status: 'active',
        createdAt: '2026-02-01T12:00:00.000Z',
        updatedAt: '2026-02-01T12:00:00.000Z',
      });
    });

    it('throws ApiException.notFound when view is not found or foreign tenant', async () => {
      (mockDashboardsRepo.findView as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.getView(orgContext, '018f7611-89ab-7abc-9234-nonexistent1'),
      ).rejects.toThrow(ApiException);

      (mockDashboardsRepo.findView as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        service.getView(foreignOrgContext, sampleViewRow.id),
      ).rejects.toMatchObject({
        response: {
          code: 'NOT_FOUND',
          message: 'Dashboard view not found.',
        },
      });
    });
  });

  describe('createView', () => {
    it('creates view idempotently with normalized name, description, and presentation', async () => {
      const input: CreateDashboardViewInput = {
        name: '  Regional Production Summary  ',
        description: '  Detailed yield and harvest benchmarks.  ',
        filters: { regionId: 'reg-west' },
        presentation: { chart: 'bar', compareBy: 'region' },
      };

      const result = await service.createView(orgContext, input, 'idemp-key-1');

      expect(mockDashboardsRepo.organizationScoped).toHaveBeenCalledWith(
        orgContext,
        expect.any(Function),
      );
      expect(mockIdempotencyService.run).toHaveBeenCalledWith(
        mockTx,
        {
          key: 'idemp-key-1',
          accountId: orgContext.accountId,
          organizationId: orgContext.organizationId,
          operation: 'dashboardViews.create',
          requestBody: {
            name: 'Regional Production Summary',
            description: 'Detailed yield and harvest benchmarks.',
            filters: { regionId: 'reg-west' },
            presentation: { chart: 'bar', compareBy: 'region' },
          },
          responseStatus: 201,
        },
        expect.any(Function),
      );
      expect(mockTx.dashboardView.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgContext.organizationId,
          ownerAccountId: orgContext.accountId,
          name: 'Regional Production Summary',
          description: 'Detailed yield and harvest benchmarks.',
          filters: { regionId: 'reg-west' },
          presentation: { chart: 'bar', compareBy: 'region' },
        },
      });
      expect(result.name).toBe('Regional Production Summary');
      expect(result.description).toBe('Detailed yield and harvest benchmarks.');
      expect(result.status).toBe('active');
    });

    it('applies default presentation fallback when presentation is omitted', async () => {
      const input: CreateDashboardViewInput = {
        name: 'Default Presentation View',
        filters: {},
      };

      await service.createView(orgContext, input);

      expect(mockTx.dashboardView.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgContext.organizationId,
          ownerAccountId: orgContext.accountId,
          name: 'Default Presentation View',
          description: null,
          filters: {},
          presentation: { chart: 'bar', compareBy: 'region' },
        },
      });
    });

    it('normalizes empty or whitespace-only description to null', async () => {
      const inputWithEmpty: CreateDashboardViewInput = {
        name: 'Whitespace Description View',
        description: '   ',
        filters: {},
      };

      await service.createView(orgContext, inputWithEmpty);

      expect(mockTx.dashboardView.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgContext.organizationId,
          ownerAccountId: orgContext.accountId,
          name: 'Whitespace Description View',
          description: null,
          filters: {},
          presentation: { chart: 'bar', compareBy: 'region' },
        },
      });
    });
  });

  describe('updateView', () => {
    it('verifies existing view in tenant scope and updates modified fields', async () => {
      const input: UpdateDashboardViewInput = {
        name: '  Updated View Name  ',
        description: '  Updated description text.  ',
        filters: { regionId: 'reg-east' },
        presentation: { chart: 'bar', compareBy: 'region' },
      };

      const result = await service.updateView(
        orgContext,
        sampleViewRow.id,
        input,
      );

      expect(mockDashboardsRepo.findView).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        sampleViewRow.id,
      );
      expect(mockTx.dashboardView.update).toHaveBeenCalledWith({
        where: { id: sampleViewRow.id },
        data: {
          name: 'Updated View Name',
          description: 'Updated description text.',
          filters: { regionId: 'reg-east' },
          presentation: { chart: 'bar', compareBy: 'region' },
        },
      });
      expect(result.name).toBe('Updated View Name');
      expect(result.description).toBe('Updated description text.');
    });

    it('allows partial update without overwriting unspecified fields', async () => {
      const input: UpdateDashboardViewInput = {
        name: 'Only Name Changed',
      };

      await service.updateView(orgContext, sampleViewRow.id, input);

      expect(mockTx.dashboardView.update).toHaveBeenCalledWith({
        where: { id: sampleViewRow.id },
        data: {
          name: 'Only Name Changed',
          description: undefined,
          filters: undefined,
          presentation: undefined,
        },
      });
    });

    it('normalizes whitespace-only description to null on update', async () => {
      const input: UpdateDashboardViewInput = {
        description: '   ',
      };

      await service.updateView(orgContext, sampleViewRow.id, input);

      expect(mockTx.dashboardView.update).toHaveBeenCalledWith({
        where: { id: sampleViewRow.id },
        data: {
          name: undefined,
          description: null,
          filters: undefined,
          presentation: undefined,
        },
      });
    });

    it('throws ApiException.notFound when view to update does not exist or belongs to foreign tenant', async () => {
      (mockDashboardsRepo.findView as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.updateView(orgContext, '018f7611-89ab-7abc-9234-nonexistent1', {
          name: 'Nonexistent',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'NOT_FOUND',
          message: 'Dashboard view not found.',
        },
      });
      expect(mockTx.dashboardView.update).not.toHaveBeenCalled();
    });
  });

  describe('archiveView', () => {
    it('verifies view existence in tenant scope and soft-deletes by setting status to archived', async () => {
      const result = await service.archiveView(orgContext, sampleViewRow.id);

      expect(mockDashboardsRepo.findView).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        sampleViewRow.id,
      );
      expect(mockTx.dashboardView.update).toHaveBeenCalledWith({
        where: { id: sampleViewRow.id },
        data: { status: 'archived' },
      });
      expect(result).toEqual({ archived: true });
    });

    it('throws ApiException.notFound when view to archive does not exist', async () => {
      (mockDashboardsRepo.findView as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.archiveView(orgContext, '018f7611-89ab-7abc-9234-nonexistent1'),
      ).rejects.toMatchObject({
        response: {
          code: 'NOT_FOUND',
          message: 'Dashboard view not found.',
        },
      });
      expect(mockTx.dashboardView.update).not.toHaveBeenCalled();
    });
  });

  describe('summary', () => {
    it('concurrently fetches metrics, bounded aggregates, and saved views with decimal string serialization', async () => {
      const filters: DashboardFilters = {
        metricId: sampleMetricSummary.id,
        regionId: 'reg-west',
        datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
        dimensionHash:
          '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
        periodStart: '2026-01-01T00:00:00.000Z',
        periodEnd: '2026-03-31T00:00:00.000Z',
      };

      const result = await service.summary(orgContext, filters);

      expect(mockAnalyticsService.listMetrics).toHaveBeenCalledWith(orgContext);
      expect(mockAnalyticsService.listAggregates).toHaveBeenCalledWith(
        orgContext,
        {
          ...filters,
          limit: 24,
        },
      );
      expect(mockDashboardsRepo.listViews).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
      );

      expect(result.metrics).toEqual([sampleMetricSummary]);
      expect(result.savedViews).toHaveLength(1);
      expect(result.aggregates).toHaveLength(1);
      expect(result.aggregates[0].value).toEqual({
        type: 'numeric',
        value: '4.85',
      });
    });

    it('handles numeric aggregate values formatted as numbers, strings, or nulls', async () => {
      (mockAnalyticsService.listAggregates as jest.Mock).mockResolvedValueOnce([
        {
          ...sampleAggregateSummary,
          id: 'agg-num',
          value: { type: 'numeric', value: 12.34 },
        },
        {
          ...sampleAggregateSummary,
          id: 'agg-null',
          value: { type: 'numeric', value: null },
        },
        {
          ...sampleAggregateSummary,
          id: 'agg-str',
          value: { type: 'numeric', value: '99.9' },
        },
      ]);

      const result = await service.summary(orgContext, {});

      expect(result.aggregates[0].value.value).toBe('12.34');
      expect(result.aggregates[1].value.value).toBeNull();
      expect(result.aggregates[2].value.value).toBe('99.9');
    });

    it('handles empty metrics, aggregates, and saved views without throwing or creating synthetic data', async () => {
      (mockAnalyticsService.listMetrics as jest.Mock).mockResolvedValueOnce([]);
      (mockAnalyticsService.listAggregates as jest.Mock).mockResolvedValueOnce(
        [],
      );
      (mockDashboardsRepo.listViews as jest.Mock).mockResolvedValueOnce([]);

      const result = await service.summary(orgContext, {});

      expect(result).toEqual({
        metrics: [],
        aggregates: [],
        savedViews: [],
      });
    });

    it('propagates errors when any of the concurrent service calls reject', async () => {
      (mockAnalyticsService.listMetrics as jest.Mock).mockRejectedValueOnce(
        new Error('Database connectivity failure'),
      );

      await expect(service.summary(orgContext, {})).rejects.toThrow(
        'Database connectivity failure',
      );
    });
  });
});
