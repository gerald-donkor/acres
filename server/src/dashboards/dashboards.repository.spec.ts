import { Test, type TestingModule } from '@nestjs/testing';
import type { OrganizationContext } from '../organizations/organization-context';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import {
  DashboardsRepository,
  type DashboardTx,
} from './dashboards.repository';

describe('DashboardsRepository', () => {
  let repository: DashboardsRepository;
  let mockTenants: {
    organizationScoped: jest.Mock;
  };
  let mockTx: {
    dashboardView: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  const orgContext: OrganizationContext = {
    organizationId: '018f7611-89ab-7abc-9234-111111111111',
    accountId: '018f7611-89ab-7abc-9234-222222222222',
    membershipId: '018f7611-89ab-7abc-9234-333333333333',
    role: 'owner',
  };

  const sampleView = {
    id: '018f7611-89ab-7abc-9234-aaaa1111aaaa',
    organizationId: orgContext.organizationId,
    ownerAccountId: orgContext.accountId,
    name: 'Executive KPI Overview',
    description: 'Quarterly regional indicators and performance trends.',
    filters: { regionId: 'reg-west' },
    presentation: { chart: 'bar', compareBy: 'region' },
    schemaVersion: 1,
    status: 'active',
    createdAt: new Date('2026-02-01T12:00:00.000Z'),
    updatedAt: new Date('2026-02-01T12:00:00.000Z'),
  };

  beforeEach(async () => {
    mockTx = {
      dashboardView: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    mockTenants = {
      organizationScoped: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardsRepository,
        {
          provide: TenantTransactionService,
          useValue: mockTenants,
        },
      ],
    }).compile();

    repository = module.get<DashboardsRepository>(DashboardsRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('organizationScoped', () => {
    it('delegates to tenants.organizationScoped with accountId, organizationId, callback, and 5000ms statement timeout', async () => {
      const expectedResult = { success: true };
      const callback = jest.fn().mockResolvedValue(expectedResult);
      mockTenants.organizationScoped.mockResolvedValueOnce(expectedResult);

      const result = await repository.organizationScoped(orgContext, callback);

      expect(mockTenants.organizationScoped).toHaveBeenCalledTimes(1);
      expect(mockTenants.organizationScoped).toHaveBeenCalledWith(
        orgContext.accountId,
        orgContext.organizationId,
        callback,
        { statementTimeoutMs: 5000 },
      );
      expect(result).toBe(expectedResult);
    });

    it('passes callback and returns the evaluated callback result when invoked by tenant transaction service', async () => {
      mockTenants.organizationScoped.mockImplementation(
        (_accountId, _orgId, cb: (tx: DashboardTx) => Promise<unknown>) =>
          cb(mockTx as unknown as DashboardTx),
      );

      const callback = jest.fn().mockImplementation((tx: DashboardTx) =>
        Promise.resolve({
          viewCount: 42,
          txReceived: tx === (mockTx as unknown as DashboardTx),
        }),
      );

      const result = await repository.organizationScoped(orgContext, callback);

      expect(callback).toHaveBeenCalledWith(mockTx);
      expect(result).toEqual({ viewCount: 42, txReceived: true });
    });

    it('propagates rejection when tenant transaction service or callback throws', async () => {
      const error = new Error('Database transaction timeout');
      mockTenants.organizationScoped.mockRejectedValueOnce(error);

      const callback = jest.fn();

      await expect(
        repository.organizationScoped(orgContext, callback),
      ).rejects.toThrow('Database transaction timeout');
    });
  });

  describe('listViews', () => {
    it('queries active dashboard views for the organization ordered by updatedAt desc with limit of 50', async () => {
      const views = [sampleView];
      mockTx.dashboardView.findMany.mockResolvedValueOnce(views);

      const result = await repository.listViews(
        mockTx as unknown as DashboardTx,
        orgContext.organizationId,
      );

      expect(mockTx.dashboardView.findMany).toHaveBeenCalledTimes(1);
      expect(mockTx.dashboardView.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgContext.organizationId,
          status: 'active',
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 50,
      });
      expect(result).toEqual(views);
    });

    it('returns empty array when no active views exist for organization', async () => {
      mockTx.dashboardView.findMany.mockResolvedValueOnce([]);

      const result = await repository.listViews(
        mockTx as unknown as DashboardTx,
        orgContext.organizationId,
      );

      expect(result).toEqual([]);
    });

    it('propagates database errors thrown by findMany', async () => {
      const dbError = new Error('Database query failure');
      mockTx.dashboardView.findMany.mockRejectedValueOnce(dbError);

      await expect(
        repository.listViews(
          mockTx as unknown as DashboardTx,
          orgContext.organizationId,
        ),
      ).rejects.toThrow('Database query failure');
    });
  });

  describe('findView', () => {
    it('queries active dashboard view by viewId and organizationId', async () => {
      mockTx.dashboardView.findFirst.mockResolvedValueOnce(sampleView);

      const result = await repository.findView(
        mockTx as unknown as DashboardTx,
        orgContext.organizationId,
        sampleView.id,
      );

      expect(mockTx.dashboardView.findFirst).toHaveBeenCalledTimes(1);
      expect(mockTx.dashboardView.findFirst).toHaveBeenCalledWith({
        where: {
          id: sampleView.id,
          organizationId: orgContext.organizationId,
          status: 'active',
        },
      });
      expect(result).toEqual(sampleView);
    });

    it('returns null when view is not found or inactive', async () => {
      mockTx.dashboardView.findFirst.mockResolvedValueOnce(null);

      const result = await repository.findView(
        mockTx as unknown as DashboardTx,
        orgContext.organizationId,
        'non-existent-id',
      );

      expect(mockTx.dashboardView.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'non-existent-id',
          organizationId: orgContext.organizationId,
          status: 'active',
        },
      });
      expect(result).toBeNull();
    });

    it('propagates database errors thrown by findFirst', async () => {
      const dbError = new Error('Database connection reset');
      mockTx.dashboardView.findFirst.mockRejectedValueOnce(dbError);

      await expect(
        repository.findView(
          mockTx as unknown as DashboardTx,
          orgContext.organizationId,
          sampleView.id,
        ),
      ).rejects.toThrow('Database connection reset');
    });
  });
});
