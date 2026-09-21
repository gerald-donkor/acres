import { Test, type TestingModule } from '@nestjs/testing';
import type { OrganizationContext } from '../organizations/organization-context';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import {
  latestRevisionInclude,
  ReportsRepository,
  type ReportsTx,
  revisionInclude,
} from './reports.repository';

describe('ReportsRepository', () => {
  let repository: ReportsRepository;
  let mockTenants: {
    organizationScoped: jest.Mock;
    workerScoped: jest.Mock;
  };

  let mockTx: {
    report: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
    reportRevision: {
      findFirst: jest.Mock;
    };
    exportRequest: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  const sampleOrgContext: OrganizationContext = {
    organizationId: '018f7611-89ab-7abc-9234-111111111111',
    accountId: '018f7611-89ab-7abc-9234-222222222222',
    membershipId: '018f7611-89ab-7abc-9234-333333333333',
    role: 'owner',
  };

  beforeEach(async () => {
    mockTenants = {
      organizationScoped: jest.fn(),
      workerScoped: jest.fn(),
    };

    mockTx = {
      report: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      reportRevision: {
        findFirst: jest.fn(),
      },
      exportRequest: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsRepository,
        {
          provide: TenantTransactionService,
          useValue: mockTenants,
        },
      ],
    }).compile();

    repository = module.get<ReportsRepository>(ReportsRepository);
  });

  describe('organizationScoped', () => {
    it('forwards accountId, organizationId, callback, and statementTimeoutMs of 5000 to tenant service', async () => {
      const expectedResult = { success: true };
      const callback = jest.fn().mockResolvedValue(expectedResult);
      mockTenants.organizationScoped.mockImplementation(
        (
          _accId: string,
          _orgId: string,
          cb: (tx: ReportsTx) => Promise<unknown>,
        ) => cb(mockTx as unknown as ReportsTx),
      );

      const result = await repository.organizationScoped(
        sampleOrgContext,
        callback,
      );

      expect(mockTenants.organizationScoped).toHaveBeenCalledTimes(1);
      expect(mockTenants.organizationScoped).toHaveBeenCalledWith(
        sampleOrgContext.accountId,
        sampleOrgContext.organizationId,
        callback,
        { statementTimeoutMs: 5000 },
      );
      expect(callback).toHaveBeenCalledWith(mockTx);
      expect(result).toBe(expectedResult);
    });

    it('propagates rejection when tenant transaction fails', async () => {
      const error = new Error('Database connection failure');
      mockTenants.organizationScoped.mockRejectedValue(error);

      await expect(
        repository.organizationScoped(sampleOrgContext, jest.fn()),
      ).rejects.toThrow(error);
    });
  });

  describe('workerScoped', () => {
    it('forwards callback and statementTimeoutMs of 10000 to workerScoped tenant service', async () => {
      const expectedResult = { workerResult: 42 };
      const callback = jest.fn().mockResolvedValue(expectedResult);
      mockTenants.workerScoped.mockImplementation(
        (cb: (tx: ReportsTx) => Promise<unknown>) =>
          cb(mockTx as unknown as ReportsTx),
      );

      const result = await repository.workerScoped(callback);

      expect(mockTenants.workerScoped).toHaveBeenCalledTimes(1);
      expect(mockTenants.workerScoped).toHaveBeenCalledWith(callback, {
        statementTimeoutMs: 10000,
      });
      expect(callback).toHaveBeenCalledWith(mockTx);
      expect(result).toBe(expectedResult);
    });

    it('propagates rejection when worker transaction fails', async () => {
      const error = new Error('Worker transaction timeout');
      mockTenants.workerScoped.mockRejectedValue(error);

      await expect(repository.workerScoped(jest.fn())).rejects.toThrow(error);
    });
  });

  describe('listReports', () => {
    it('queries reports with default (all) visibility excluding archived records', async () => {
      const mockReports = [
        { id: 'report-1', title: 'Report 1', status: 'draft' },
        { id: 'report-2', title: 'Report 2', status: 'published' },
      ];
      mockTx.report.findMany.mockResolvedValue(mockReports);

      const result = await repository.listReports(
        mockTx as unknown as ReportsTx,
        sampleOrgContext.organizationId,
      );

      expect(mockTx.report.findMany).toHaveBeenCalledTimes(1);
      expect(mockTx.report.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: sampleOrgContext.organizationId,
          status: { not: 'archived' },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 50,
        include: latestRevisionInclude('all'),
      });
      expect(result).toBe(mockReports);
    });

    it('queries reports with explicit all visibility', async () => {
      mockTx.report.findMany.mockResolvedValue([]);

      await repository.listReports(
        mockTx as unknown as ReportsTx,
        sampleOrgContext.organizationId,
        'all',
      );

      expect(mockTx.report.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: sampleOrgContext.organizationId,
          status: { not: 'archived' },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 50,
        include: latestRevisionInclude('all'),
      });
    });

    it('queries reports with published visibility', async () => {
      const publishedReports = [
        { id: 'report-2', title: 'Report 2', status: 'published' },
      ];
      mockTx.report.findMany.mockResolvedValue(publishedReports);

      const result = await repository.listReports(
        mockTx as unknown as ReportsTx,
        sampleOrgContext.organizationId,
        'published',
      );

      expect(mockTx.report.findMany).toHaveBeenCalledTimes(1);
      expect(mockTx.report.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: sampleOrgContext.organizationId,
          status: 'published',
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 50,
        include: latestRevisionInclude('published'),
      });
      expect(result).toBe(publishedReports);
    });
  });

  describe('findReport', () => {
    const reportId = '018f7611-89ab-7abc-9234-aaaa1111aaaa';

    it('finds report with default (all) visibility excluding archived records', async () => {
      const mockReport = {
        id: reportId,
        organizationId: sampleOrgContext.organizationId,
        status: 'draft',
      };
      mockTx.report.findFirst.mockResolvedValue(mockReport);

      const result = await repository.findReport(
        mockTx as unknown as ReportsTx,
        sampleOrgContext.organizationId,
        reportId,
      );

      expect(mockTx.report.findFirst).toHaveBeenCalledTimes(1);
      expect(mockTx.report.findFirst).toHaveBeenCalledWith({
        where: {
          id: reportId,
          organizationId: sampleOrgContext.organizationId,
          status: { not: 'archived' },
        },
        include: latestRevisionInclude('all'),
      });
      expect(result).toBe(mockReport);
    });

    it('finds report with explicit all visibility', async () => {
      mockTx.report.findFirst.mockResolvedValue(null);

      const result = await repository.findReport(
        mockTx as unknown as ReportsTx,
        sampleOrgContext.organizationId,
        reportId,
        'all',
      );

      expect(mockTx.report.findFirst).toHaveBeenCalledWith({
        where: {
          id: reportId,
          organizationId: sampleOrgContext.organizationId,
          status: { not: 'archived' },
        },
        include: latestRevisionInclude('all'),
      });
      expect(result).toBeNull();
    });

    it('finds report with published visibility', async () => {
      const mockReport = {
        id: reportId,
        organizationId: sampleOrgContext.organizationId,
        status: 'published',
      };
      mockTx.report.findFirst.mockResolvedValue(mockReport);

      const result = await repository.findReport(
        mockTx as unknown as ReportsTx,
        sampleOrgContext.organizationId,
        reportId,
        'published',
      );

      expect(mockTx.report.findFirst).toHaveBeenCalledTimes(1);
      expect(mockTx.report.findFirst).toHaveBeenCalledWith({
        where: {
          id: reportId,
          organizationId: sampleOrgContext.organizationId,
          status: 'published',
        },
        include: latestRevisionInclude('published'),
      });
      expect(result).toBe(mockReport);
    });
  });

  describe('findRevision', () => {
    it('queries reportRevision with revisionId, organizationId, and revisionInclude', async () => {
      const revisionId = '018f7611-89ab-7abc-9234-bbbb2222bbbb';
      const mockRevision = {
        id: revisionId,
        organizationId: sampleOrgContext.organizationId,
        revisionNumber: 1,
        insights: [],
        evidence: [],
      };
      mockTx.reportRevision.findFirst.mockResolvedValue(mockRevision);

      const result = await repository.findRevision(
        mockTx as unknown as ReportsTx,
        sampleOrgContext.organizationId,
        revisionId,
      );

      expect(mockTx.reportRevision.findFirst).toHaveBeenCalledTimes(1);
      expect(mockTx.reportRevision.findFirst).toHaveBeenCalledWith({
        where: {
          id: revisionId,
          organizationId: sampleOrgContext.organizationId,
        },
        include: revisionInclude(),
      });
      expect(result).toBe(mockRevision);
    });
  });

  describe('listExports', () => {
    it('queries exportRequests ordered by createdAt descending with limit 50 and artifact included', async () => {
      const mockExports = [
        { id: 'export-1', organizationId: sampleOrgContext.organizationId },
        { id: 'export-2', organizationId: sampleOrgContext.organizationId },
      ];
      mockTx.exportRequest.findMany.mockResolvedValue(mockExports);

      const result = await repository.listExports(
        mockTx as unknown as ReportsTx,
        sampleOrgContext.organizationId,
      );

      expect(mockTx.exportRequest.findMany).toHaveBeenCalledTimes(1);
      expect(mockTx.exportRequest.findMany).toHaveBeenCalledWith({
        where: { organizationId: sampleOrgContext.organizationId },
        orderBy: [{ createdAt: 'desc' }],
        take: 50,
        include: { artifact: true },
      });
      expect(result).toBe(mockExports);
    });
  });

  describe('findExport', () => {
    it('finds exportRequest by id and organizationId with artifact included', async () => {
      const exportId = '018f7611-89ab-7abc-9234-cccc3333cccc';
      const mockExport = {
        id: exportId,
        organizationId: sampleOrgContext.organizationId,
        artifact: null,
      };
      mockTx.exportRequest.findFirst.mockResolvedValue(mockExport);

      const result = await repository.findExport(
        mockTx as unknown as ReportsTx,
        sampleOrgContext.organizationId,
        exportId,
      );

      expect(mockTx.exportRequest.findFirst).toHaveBeenCalledTimes(1);
      expect(mockTx.exportRequest.findFirst).toHaveBeenCalledWith({
        where: {
          id: exportId,
          organizationId: sampleOrgContext.organizationId,
        },
        include: { artifact: true },
      });
      expect(result).toBe(mockExport);
    });
  });

  describe('helper functions', () => {
    describe('revisionInclude', () => {
      it('returns correct include structure ordering insights and evidence by position ascending', () => {
        expect(revisionInclude()).toEqual({
          insights: { orderBy: { position: 'asc' } },
          evidence: { orderBy: { position: 'asc' } },
        });
      });
    });

    describe('latestRevisionInclude', () => {
      it('returns latest revision include for default (all) visibility with undefined where clause', () => {
        expect(latestRevisionInclude()).toEqual({
          revisions: {
            where: undefined,
            orderBy: { revisionNumber: 'desc' },
            take: 1,
            include: revisionInclude(),
          },
        });
      });

      it('returns latest revision include for explicit all visibility', () => {
        expect(latestRevisionInclude('all')).toEqual({
          revisions: {
            where: undefined,
            orderBy: { revisionNumber: 'desc' },
            take: 1,
            include: revisionInclude(),
          },
        });
      });

      it('returns latest revision include for published visibility with published status filter', () => {
        expect(latestRevisionInclude('published')).toEqual({
          revisions: {
            where: { status: 'published' },
            orderBy: { revisionNumber: 'desc' },
            take: 1,
            include: revisionInclude(),
          },
        });
      });
    });
  });
});
