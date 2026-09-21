import type { DashboardView } from '@acres/shared';
import { ApiException } from '../common/api-exception';
import type { OrganizationContext } from '../organizations/organization-context';
import { DashboardsController } from './dashboards.controller';
import type { DashboardsService } from './dashboards.service';
import type {
  CreateDashboardViewDto,
  UpdateDashboardViewDto,
} from './dto/dashboard-view.dto';

describe('DashboardsController', () => {
  let controller: DashboardsController;
  let mockDashboardsService: {
    listViews: jest.Mock<Promise<DashboardView[]>, [OrganizationContext]>;
    getView: jest.Mock<Promise<DashboardView>, [OrganizationContext, string]>;
    createView: jest.Mock<
      Promise<DashboardView>,
      [OrganizationContext, CreateDashboardViewDto, string?]
    >;
    updateView: jest.Mock<
      Promise<DashboardView>,
      [OrganizationContext, string, UpdateDashboardViewDto]
    >;
    archiveView: jest.Mock<
      Promise<{ archived: true }>,
      [OrganizationContext, string]
    >;
  };

  const mockOrg: OrganizationContext = {
    organizationId: '018f7611-89ab-7abc-9234-111111111111',
    accountId: '018f7611-89ab-7abc-9234-222222222222',
    membershipId: '018f7611-89ab-7abc-9234-333333333333',
    role: 'owner',
    statementTimeoutMs: 5000,
  };

  const sampleView: DashboardView = {
    id: '018f7611-89ab-7abc-9234-aaaa1111aaaa',
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
    schemaVersion: 1,
    ownerAccountId: mockOrg.accountId,
    status: 'active',
    createdAt: '2026-02-01T12:00:00.000Z',
    updatedAt: '2026-02-01T12:00:00.000Z',
  };

  beforeEach(() => {
    mockDashboardsService = {
      listViews: jest.fn<Promise<DashboardView[]>, [OrganizationContext]>(),
      getView: jest.fn<Promise<DashboardView>, [OrganizationContext, string]>(),
      createView: jest.fn<
        Promise<DashboardView>,
        [OrganizationContext, CreateDashboardViewDto, string?]
      >(),
      updateView: jest.fn<
        Promise<DashboardView>,
        [OrganizationContext, string, UpdateDashboardViewDto]
      >(),
      archiveView: jest.fn<
        Promise<{ archived: true }>,
        [OrganizationContext, string]
      >(),
    };

    controller = new DashboardsController(
      mockDashboardsService as unknown as DashboardsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('calls dashboards.listViews(org) and returns array of DashboardView', async () => {
      mockDashboardsService.listViews.mockResolvedValue([sampleView]);

      const result = await controller.list(mockOrg);

      expect(mockDashboardsService.listViews).toHaveBeenCalledTimes(1);
      expect(mockDashboardsService.listViews).toHaveBeenCalledWith(mockOrg);
      expect(result).toEqual([sampleView]);
    });

    it('returns empty array when no dashboard views exist', async () => {
      mockDashboardsService.listViews.mockResolvedValue([]);

      const result = await controller.list(mockOrg);

      expect(mockDashboardsService.listViews).toHaveBeenCalledWith(mockOrg);
      expect(result).toEqual([]);
    });

    it('propagates errors thrown by dashboards.listViews', async () => {
      const error = new Error('Database connection failed');
      mockDashboardsService.listViews.mockRejectedValue(error);

      await expect(controller.list(mockOrg)).rejects.toThrow(error);
    });
  });

  describe('get', () => {
    it('calls dashboards.getView(org, viewId) and returns DashboardView', async () => {
      mockDashboardsService.getView.mockResolvedValue(sampleView);

      const result = await controller.get(mockOrg, sampleView.id);

      expect(mockDashboardsService.getView).toHaveBeenCalledTimes(1);
      expect(mockDashboardsService.getView).toHaveBeenCalledWith(
        mockOrg,
        sampleView.id,
      );
      expect(result).toEqual(sampleView);
    });

    it('propagates errors thrown by dashboards.getView', async () => {
      const error = ApiException.notFound('Dashboard view not found.');
      mockDashboardsService.getView.mockRejectedValue(error);

      await expect(controller.get(mockOrg, sampleView.id)).rejects.toThrow(
        error,
      );
    });
  });

  describe('create', () => {
    const createDto: CreateDashboardViewDto = {
      name: 'Executive KPI Overview',
      description: 'Quarterly regional indicators and performance trends.',
      filters: {
        metricId: '018f7611-89ab-7abc-9234-ffff1111ffff',
      },
      presentation: {
        chart: 'bar',
        compareBy: 'region',
      },
    };
    const idempotencyKey = 'idem-create-key-001';

    it('calls dashboards.createView(org, body, idempotencyKey) and returns created DashboardView', async () => {
      mockDashboardsService.createView.mockResolvedValue(sampleView);

      const result = await controller.create(
        mockOrg,
        createDto,
        idempotencyKey,
      );

      expect(mockDashboardsService.createView).toHaveBeenCalledTimes(1);
      expect(mockDashboardsService.createView).toHaveBeenCalledWith(
        mockOrg,
        createDto,
        idempotencyKey,
      );
      expect(result).toEqual(sampleView);
    });

    it('handles omitted idempotency key', async () => {
      mockDashboardsService.createView.mockResolvedValue(sampleView);

      const result = await controller.create(mockOrg, createDto);

      expect(mockDashboardsService.createView).toHaveBeenCalledTimes(1);
      expect(mockDashboardsService.createView).toHaveBeenCalledWith(
        mockOrg,
        createDto,
        undefined,
      );
      expect(result).toEqual(sampleView);
    });

    it('propagates errors thrown by dashboards.createView', async () => {
      const error = new Error('Creation failed');
      mockDashboardsService.createView.mockRejectedValue(error);

      await expect(
        controller.create(mockOrg, createDto, idempotencyKey),
      ).rejects.toThrow(error);
    });
  });

  describe('update', () => {
    const updateDto: UpdateDashboardViewDto = {
      name: 'Updated KPI Overview',
      presentation: {
        chart: 'line',
      },
    };

    it('calls dashboards.updateView(org, viewId, body) and returns updated DashboardView', async () => {
      const updatedView: DashboardView = {
        ...sampleView,
        name: updateDto.name!,
        presentation: {
          ...sampleView.presentation,
          chart: 'line',
        },
      };
      mockDashboardsService.updateView.mockResolvedValue(updatedView);

      const result = await controller.update(mockOrg, sampleView.id, updateDto);

      expect(mockDashboardsService.updateView).toHaveBeenCalledTimes(1);
      expect(mockDashboardsService.updateView).toHaveBeenCalledWith(
        mockOrg,
        sampleView.id,
        updateDto,
      );
      expect(result).toEqual(updatedView);
    });

    it('propagates errors thrown by dashboards.updateView', async () => {
      const error = ApiException.notFound('Dashboard view not found.');
      mockDashboardsService.updateView.mockRejectedValue(error);

      await expect(
        controller.update(mockOrg, sampleView.id, updateDto),
      ).rejects.toThrow(error);
    });
  });

  describe('archive', () => {
    it('calls dashboards.archiveView(org, viewId) and returns { archived: true }', async () => {
      const archiveResult = { archived: true as const };
      mockDashboardsService.archiveView.mockResolvedValue(archiveResult);

      const result = await controller.archive(mockOrg, sampleView.id);

      expect(mockDashboardsService.archiveView).toHaveBeenCalledTimes(1);
      expect(mockDashboardsService.archiveView).toHaveBeenCalledWith(
        mockOrg,
        sampleView.id,
      );
      expect(result).toEqual(archiveResult);
    });

    it('propagates errors thrown by dashboards.archiveView', async () => {
      const error = ApiException.notFound('Dashboard view not found.');
      mockDashboardsService.archiveView.mockRejectedValue(error);

      await expect(controller.archive(mockOrg, sampleView.id)).rejects.toThrow(
        error,
      );
    });
  });
});
