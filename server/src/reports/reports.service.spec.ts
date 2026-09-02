import { createHash } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import type {
  CreateExportInput,
  CreateReportInput,
  CreateRevisionInput,
  UpdateReportInput,
  UpdateRevisionInput,
} from '@acres/shared';
import { ApiException } from '../common/api-exception';
import { AcresConfigService } from '../config/acres-config.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { OrganizationContext } from '../organizations/organization-context';
import { OutboxService } from '../outbox/outbox.service';
import { OBJECT_STORAGE } from '../storage/storage.port';
import { ReportsRepository } from './reports.repository';
import { escapeFormula, renderPdf, ReportsService } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let mockReportsRepo: Partial<ReportsRepository>;
  let mockIdempotency: Partial<IdempotencyService>;
  let mockOutbox: Partial<OutboxService>;
  let mockConfig: Partial<AcresConfigService>;
  let fakeStorage: {
    presignGet: jest.Mock;
    putBuffer: jest.Mock;
    getBuffer: jest.Mock;
    presignPut: jest.Mock;
    deleteObject: jest.Mock;
  };

  let mockTx: {
    report: {
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    reportRevision: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
    };
    reportInsight: {
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    reportEvidence: {
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    metricAggregate: {
      findFirst: jest.Mock;
    };
    dashboardView: {
      findFirst: jest.Mock;
    };
    exportRequest: {
      create: jest.Mock;
      update: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    storedObject: {
      create: jest.Mock;
    };
    exportArtifact: {
      create: jest.Mock;
    };
    auditEvent: {
      create: jest.Mock;
    };
  };

  const now = new Date('2026-01-01T00:00:00.000Z');
  const orgContext: OrganizationContext = {
    organizationId: '018f7611-89ab-7abc-9234-111111111111',
    accountId: '018f7611-89ab-7abc-9234-222222222222',
    membershipId: '018f7611-89ab-7abc-9234-333333333333',
    role: 'owner',
  };

  const viewerContext: OrganizationContext = {
    organizationId: '018f7611-89ab-7abc-9234-111111111111',
    accountId: '018f7611-89ab-7abc-9234-444444444444',
    membershipId: '018f7611-89ab-7abc-9234-555555555555',
    role: 'viewer',
  };

  const sampleReportRow = {
    id: '018f7611-89ab-7abc-9234-aaaa1111aaaa',
    organizationId: orgContext.organizationId,
    ownerAccountId: orgContext.accountId,
    createdByAccountId: orgContext.accountId,
    title: 'Regional Economic Report',
    summary: 'Comprehensive analysis of regional economic indicators.',
    status: 'draft',
    version: 1,
    createdAt: now,
    updatedAt: now,
    revisions: [
      {
        id: '018f7611-89ab-7abc-9234-bbbb1111bbbb',
        reportId: '018f7611-89ab-7abc-9234-aaaa1111aaaa',
        revisionNumber: 1,
        status: 'draft',
        title: 'Regional Economic Report',
        summary: 'Comprehensive analysis of regional economic indicators.',
        sections: [],
        authorAccountId: orgContext.accountId,
        reviewerAccountId: null,
        publisherAccountId: null,
        submittedForReviewAt: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
        insights: [
          {
            id: '018f7611-89ab-7abc-9234-cccc1111cccc',
            position: 0,
            heading: 'GDP Growth',
            body: 'Regional GDP increased by 4.2% over the quarter.',
            createdAt: now,
            updatedAt: now,
          },
        ],
        evidence: [
          {
            id: '018f7611-89ab-7abc-9234-dddd1111dddd',
            evidenceType: 'aggregate',
            aggregateId: '018f7611-89ab-7abc-9234-eeee1111eeee',
            dashboardViewId: null,
            metricDefinitionId: '018f7611-89ab-7abc-9234-ffff1111ffff',
            datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
            observationId: null,
            snapshot: {
              aggregateId: '018f7611-89ab-7abc-9234-eeee1111eeee',
              metric: {
                id: '018f7611-89ab-7abc-9234-ffff1111ffff',
                key: 'gdp_growth',
                label: 'GDP Growth Rate',
                unit: 'percent',
                calculationVersion: 'analytics-v1',
              },
              value: '4.2',
              periodStart: '2026-01-01T00:00:00.000Z',
              periodEnd: '2026-03-31T00:00:00.000Z',
              regionId: 'reg-west',
              observationCount: 12,
              datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
            },
            position: 0,
            createdAt: now,
          },
        ],
      },
    ],
  };

  const samplePublishedReportRow = {
    ...sampleReportRow,
    status: 'published',
    revisions: [
      {
        ...sampleReportRow.revisions[0],
        status: 'published',
        publisherAccountId: orgContext.accountId,
        publishedAt: now,
      },
    ],
  };

  const sampleAggregateRow = {
    id: '018f7611-89ab-7abc-9234-eeee1111eeee',
    organizationId: orgContext.organizationId,
    datasetVersionId: '018f7611-89ab-7abc-9234-000011110000',
    metricDefinitionId: '018f7611-89ab-7abc-9234-ffff1111ffff',
    regionId: 'reg-west',
    periodStart: now,
    periodEnd: new Date('2026-03-31T00:00:00.000Z'),
    dimensionHash:
      '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
    aggregateType: 'sum',
    numericValue: 4.2,
    textValue: null,
    booleanValue: null,
    unit: 'percent',
    calculationVersion: 'analytics-v1',
    observationCount: 12,
    metricDefinition: {
      id: '018f7611-89ab-7abc-9234-ffff1111ffff',
      key: 'gdp_growth',
      label: 'GDP Growth Rate',
      unit: 'percent',
      calculationVersion: 'analytics-v1',
    },
  };

  const sampleDashboardViewRow = {
    id: '018f7611-89ab-7abc-9234-999911119999',
    organizationId: orgContext.organizationId,
    name: 'Executive Regional Overview',
    filters: { regionId: 'reg-west', year: 2026 },
    presentation: { chartType: 'bar', layout: 'grid' },
    status: 'active',
  };

  const sampleExportRow = {
    id: '018f7611-89ab-7abc-9234-exp1111exp1',
    organizationId: orgContext.organizationId,
    requestedByAccountId: orgContext.accountId,
    reportId: sampleReportRow.id,
    revisionId: samplePublishedReportRow.revisions[0].id,
    format: 'csv',
    status: 'succeeded',
    deterministicKey: 'export:key-1',
    renderingVersion: 'reports-v1',
    failureCode: null,
    failureMessage: null,
    startedAt: now,
    finishedAt: now,
    expiresAt: new Date('2026-01-01T01:00:00.000Z'),
    createdAt: now,
    updatedAt: now,
    artifact: {
      id: '018f7611-89ab-7abc-9234-art1111art1',
      filename: 'regional-economic-report-report.csv',
      mediaType: 'text/csv',
      byteCount: BigInt(256),
      checksumHex:
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      createdAt: now,
      storedObject: {
        id: '018f7611-89ab-7abc-9234-obj1111obj1',
        objectKey: 'organizations/org-1/exports/exp-1/report.csv',
      },
    },
  };

  beforeEach(async () => {
    mockTx = {
      report: {
        create: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            id: sampleReportRow.id,
            version: 1,
            status: 'draft',
            createdAt: now,
            updatedAt: now,
            ...(args.data as object),
          }),
        ),
        update: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            ...sampleReportRow,
            ...(args.data as object),
            updatedAt: now,
          }),
        ),
        findFirst: jest.fn().mockResolvedValue(sampleReportRow),
        findMany: jest.fn().mockResolvedValue([sampleReportRow]),
      },
      reportRevision: {
        create: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            id: sampleReportRow.revisions[0].id,
            status: 'draft',
            sections: [],
            reviewerAccountId: null,
            publisherAccountId: null,
            submittedForReviewAt: null,
            publishedAt: null,
            createdAt: now,
            updatedAt: now,
            insights: [],
            evidence: [],
            ...(args.data as object),
          }),
        ),
        update: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            ...sampleReportRow.revisions[0],
            ...(args.data as object),
            updatedAt: now,
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(sampleReportRow.revisions[0]),
        findMany: jest.fn().mockResolvedValue(sampleReportRow.revisions),
      },
      reportInsight: {
        create: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            id: '018f7611-89ab-7abc-9234-cccc1111cccc',
            createdAt: now,
            updatedAt: now,
            ...(args.data as object),
          }),
        ),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      reportEvidence: {
        create: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            id: '018f7611-89ab-7abc-9234-dddd1111dddd',
            observationId: null,
            createdAt: now,
            ...(args.data as object),
          }),
        ),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      metricAggregate: {
        findFirst: jest.fn().mockResolvedValue(sampleAggregateRow),
      },
      dashboardView: {
        findFirst: jest.fn().mockResolvedValue(sampleDashboardViewRow),
      },
      exportRequest: {
        create: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            id: sampleExportRow.id,
            status: 'queued',
            failureCode: null,
            failureMessage: null,
            startedAt: null,
            finishedAt: null,
            expiresAt: null,
            createdAt: now,
            updatedAt: now,
            artifact: null,
            ...(args.data as object),
          }),
        ),
        update: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            ...sampleExportRow,
            ...(args.data as object),
            updatedAt: now,
          }),
        ),
        findFirst: jest.fn().mockResolvedValue(sampleExportRow),
        findUnique: jest.fn().mockResolvedValue(sampleExportRow),
        findMany: jest.fn().mockResolvedValue([sampleExportRow]),
      },
      storedObject: {
        create: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            id: '018f7611-89ab-7abc-9234-obj1111obj1',
            createdAt: now,
            ...(args.data as object),
          }),
        ),
      },
      exportArtifact: {
        create: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            id: sampleExportRow.artifact.id,
            createdAt: now,
            ...(args.data as object),
          }),
        ),
      },
      auditEvent: {
        create: jest.fn().mockImplementation((args: { data: unknown }) =>
          Promise.resolve({
            id: '018f7611-89ab-7abc-9234-aud1111aud1',
            createdAt: now,
            ...(args.data as object),
          }),
        ),
      },
    };

    mockReportsRepo = {
      organizationScoped: jest
        .fn()
        .mockImplementation(
          (
            _org: OrganizationContext,
            callback: (tx: typeof mockTx) => Promise<unknown>,
          ) => callback(mockTx),
        ),
      workerScoped: jest
        .fn()
        .mockImplementation(
          (callback: (tx: typeof mockTx) => Promise<unknown>) =>
            callback(mockTx),
        ),
      listReports: jest.fn().mockResolvedValue([sampleReportRow]),
      findReport: jest.fn().mockResolvedValue(sampleReportRow),
      findRevision: jest.fn().mockResolvedValue(sampleReportRow.revisions[0]),
      listExports: jest.fn().mockResolvedValue([sampleExportRow]),
      findExport: jest.fn().mockResolvedValue(sampleExportRow),
    };

    mockIdempotency = {
      run: jest
        .fn()
        .mockImplementation(
          (_tx: unknown, _scope: unknown, callback: () => Promise<unknown>) =>
            callback(),
        ),
    };

    mockOutbox = {
      appendExportRequested: jest.fn().mockResolvedValue(undefined),
    };

    mockConfig = {
      aiDraftEnabled: true,
      storageBucket: 'acres-storage',
      acceptedDownloadTtlSeconds: 3600,
    };

    fakeStorage = {
      presignGet: jest.fn().mockResolvedValue({
        url: 'https://storage.local/download/report.csv?signature=abc',
        method: 'GET',
        headers: { 'Content-Type': 'text/csv' },
        expiresAt: new Date('2026-01-01T01:00:00.000Z'),
      }),
      putBuffer: jest.fn().mockResolvedValue(undefined),
      getBuffer: jest.fn().mockResolvedValue(Buffer.from('sample-content')),
      presignPut: jest
        .fn()
        .mockResolvedValue({ url: 'https://storage.local/upload' }),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: ReportsRepository, useValue: mockReportsRepo },
        { provide: IdempotencyService, useValue: mockIdempotency },
        { provide: OutboxService, useValue: mockOutbox },
        { provide: AcresConfigService, useValue: mockConfig },
        { provide: OBJECT_STORAGE, useValue: fakeStorage },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  describe('listReports', () => {
    it('returns reports scoped to organization with latestRevision mapped', async () => {
      const result = await service.listReports(orgContext);

      expect(mockReportsRepo.organizationScoped).toHaveBeenCalledWith(
        orgContext,
        expect.any(Function),
      );
      expect(mockReportsRepo.listReports).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        'all',
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: sampleReportRow.id,
        title: sampleReportRow.title,
        status: 'draft',
        aiDraftEnabled: true,
      });
      expect(result[0].latestRevision).toBeDefined();
      expect(result[0].latestRevision?.insights).toHaveLength(1);
      expect(result[0].latestRevision?.evidence).toHaveLength(1);
    });

    it('filters visibility to published reports for viewer role', async () => {
      await service.listReports(viewerContext);

      expect(mockReportsRepo.listReports).toHaveBeenCalledWith(
        mockTx,
        viewerContext.organizationId,
        'published',
      );
    });
  });

  describe('getReport', () => {
    it('returns single report mapped to domain model', async () => {
      const result = await service.getReport(orgContext, sampleReportRow.id);

      expect(mockReportsRepo.findReport).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        sampleReportRow.id,
        'all',
      );
      expect(result.id).toBe(sampleReportRow.id);
      expect(result.title).toBe(sampleReportRow.title);
      expect(result.latestRevision?.title).toBe(sampleReportRow.title);
    });

    it('throws not found when report does not exist', async () => {
      (mockReportsRepo.findReport as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.getReport(orgContext, 'nonexistent-id'),
      ).rejects.toThrow(ApiException.notFound('Report not found.'));
    });
  });

  describe('getRevisionEvidence', () => {
    it('returns frozen evidence list for specified revision', async () => {
      const result = await service.getRevisionEvidence(
        orgContext,
        sampleReportRow.id,
        sampleReportRow.revisions[0].id,
      );

      expect(mockTx.reportRevision.findFirst).toHaveBeenCalledWith({
        where: {
          id: sampleReportRow.revisions[0].id,
          reportId: sampleReportRow.id,
          organizationId: orgContext.organizationId,
        },
        include: expect.any(Object) as unknown,
      });
      expect(result).toHaveLength(1);
      expect(result[0].evidenceType).toBe('aggregate');
      expect(result[0].snapshot).toEqual(
        sampleReportRow.revisions[0].evidence[0].snapshot,
      );
    });

    it('enforces published status query for viewer role', async () => {
      await service.getRevisionEvidence(
        viewerContext,
        sampleReportRow.id,
        sampleReportRow.revisions[0].id,
      );

      expect(mockTx.reportRevision.findFirst).toHaveBeenCalledWith({
        where: {
          id: sampleReportRow.revisions[0].id,
          reportId: sampleReportRow.id,
          organizationId: viewerContext.organizationId,
          status: 'published',
        },
        include: expect.any(Object) as unknown,
      });
    });

    it('throws not found when revision does not exist', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.getRevisionEvidence(
          orgContext,
          sampleReportRow.id,
          'missing-rev',
        ),
      ).rejects.toThrow(ApiException.notFound('Report revision not found.'));
    });
  });

  describe('createReport', () => {
    const createInput: CreateReportInput = {
      title: '  New Growth Analysis  ',
      summary: '  Quarterly performance metrics.  ',
      insights: [
        {
          heading: '  Market Expansion  ',
          body: '  Active customer count grew by 20%.  ',
        },
      ],
      evidence: [
        {
          aggregateId: sampleAggregateRow.id,
        },
      ],
    };

    it('creates report, initializes revision 1, resolves evidence snapshot, and wraps in idempotency', async () => {
      const result = await service.createReport(
        orgContext,
        createInput,
        'idemp-key-12345678',
      );

      expect(mockIdempotency.run).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          key: 'idemp-key-12345678',
          accountId: orgContext.accountId,
          organizationId: orgContext.organizationId,
          operation: 'reports.create',
          responseStatus: 201,
        }) as unknown,
        expect.any(Function),
      );

      expect(mockTx.report.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgContext.organizationId,
          ownerAccountId: orgContext.accountId,
          createdByAccountId: orgContext.accountId,
          title: 'New Growth Analysis',
          summary: 'Quarterly performance metrics.',
        },
      });

      expect(mockTx.reportRevision.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgContext.organizationId,
          reportId: sampleReportRow.id,
          revisionNumber: 1,
          title: 'New Growth Analysis',
          summary: 'Quarterly performance metrics.',
          authorAccountId: orgContext.accountId,
        },
      });

      expect(mockTx.reportInsight.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgContext.organizationId,
          revisionId: sampleReportRow.revisions[0].id,
          authorAccountId: orgContext.accountId,
          position: 0,
          heading: 'Market Expansion',
          body: 'Active customer count grew by 20%.',
        },
      });

      expect(mockTx.reportEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgContext.organizationId,
          revisionId: sampleReportRow.revisions[0].id,
          evidenceType: 'aggregate',
          aggregateId: sampleAggregateRow.id,
          metricDefinitionId: sampleAggregateRow.metricDefinitionId,
          datasetVersionId: sampleAggregateRow.datasetVersionId,
          position: 0,
          snapshot: expect.objectContaining({
            aggregateId: sampleAggregateRow.id,
            value: '4.2',
          }) as unknown,
        }) as unknown,
      });

      expect(result).toMatchObject({
        id: sampleReportRow.id,
        title: sampleReportRow.title,
      });
    });

    it('handles empty summary, insights, and evidence gracefully', async () => {
      await service.createReport(orgContext, {
        title: 'Minimal Report',
      });

      expect(mockTx.report.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Minimal Report',
          summary: undefined,
        }) as unknown,
      });
    });

    it('throws not found if created report cannot be fetched', async () => {
      (mockReportsRepo.findReport as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.createReport(orgContext, { title: 'Test Report' }),
      ).rejects.toThrow(ApiException.notFound('Report not found.'));
    });
  });

  describe('updateReport', () => {
    const updateInput: UpdateReportInput = {
      title: 'Updated Report Title',
      summary: 'Updated Summary',
      expectedVersion: 1,
    };

    it('updates report metadata and increments version when expectedVersion matches', async () => {
      const result = await service.updateReport(
        orgContext,
        sampleReportRow.id,
        updateInput,
      );

      expect(mockTx.report.update).toHaveBeenCalledWith({
        where: { id: sampleReportRow.id },
        data: {
          title: 'Updated Report Title',
          summary: 'Updated Summary',
          version: { increment: 1 },
        },
      });
      expect(result.id).toBe(sampleReportRow.id);
    });

    it('throws not found when report does not exist', async () => {
      mockTx.report.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateReport(orgContext, 'nonexistent-id', updateInput),
      ).rejects.toThrow(ApiException.notFound('Report not found.'));
    });

    it('throws conflict when expectedVersion does not match current version', async () => {
      mockTx.report.findFirst.mockResolvedValueOnce({
        ...sampleReportRow,
        version: 2,
      });

      await expect(
        service.updateReport(orgContext, sampleReportRow.id, {
          ...updateInput,
          expectedVersion: 1,
        }),
      ).rejects.toThrow(
        ApiException.conflict('Report was changed by another request.'),
      );
    });

    it('handles empty string summary as null', async () => {
      await service.updateReport(orgContext, sampleReportRow.id, {
        summary: '   ',
        expectedVersion: 1,
      });

      expect(mockTx.report.update).toHaveBeenCalledWith({
        where: { id: sampleReportRow.id },
        data: expect.objectContaining({
          summary: null,
        }) as unknown,
      });
    });
  });

  describe('createRevision', () => {
    const createRevInput: CreateRevisionInput = {
      title: 'Revision 2 Draft',
      summary: 'Updated insights for Q2',
      expectedVersion: 1,
      insights: [
        {
          heading: 'New Trend',
          body: 'Quarterly trends accelerated.',
        },
      ],
      evidence: [
        {
          dashboardViewId: sampleDashboardViewRow.id,
        },
      ],
    };

    it('creates next draft revision incrementing revision number from latest published revision', async () => {
      mockTx.report.findFirst.mockResolvedValueOnce({
        ...sampleReportRow,
        version: 1,
        revisions: [
          {
            ...samplePublishedReportRow.revisions[0],
            revisionNumber: 1,
            status: 'published',
          },
        ],
      });

      await service.createRevision(
        orgContext,
        sampleReportRow.id,
        createRevInput,
        'idemp-rev-123456',
      );

      expect(mockTx.reportRevision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: sampleReportRow.id,
          revisionNumber: 2,
          title: 'Revision 2 Draft',
          summary: 'Updated insights for Q2',
          authorAccountId: orgContext.accountId,
        }) as unknown,
      });

      expect(mockTx.reportEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          evidenceType: 'dashboard_view',
          dashboardViewId: sampleDashboardViewRow.id,
          snapshot: expect.objectContaining({
            dashboardViewId: sampleDashboardViewRow.id,
            name: sampleDashboardViewRow.name,
          }) as unknown,
        }) as unknown,
      });

      expect(mockTx.report.update).toHaveBeenCalledWith({
        where: { id: sampleReportRow.id },
        data: {
          version: { increment: 1 },
          updatedAt: expect.any(Date) as unknown,
        },
      });
    });

    it('throws not found if report does not exist', async () => {
      mockTx.report.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createRevision(orgContext, 'nonexistent-id', createRevInput),
      ).rejects.toThrow(ApiException.notFound('Report not found.'));
    });

    it('throws conflict if expectedVersion does not match', async () => {
      mockTx.report.findFirst.mockResolvedValueOnce({
        ...sampleReportRow,
        version: 3,
      });

      await expect(
        service.createRevision(orgContext, sampleReportRow.id, {
          ...createRevInput,
          expectedVersion: 1,
        }),
      ).rejects.toThrow(
        ApiException.conflict('Report was changed by another request.'),
      );
    });

    it('throws conflict if latest revision is already in draft status', async () => {
      mockTx.report.findFirst.mockResolvedValueOnce({
        ...sampleReportRow,
        revisions: [{ status: 'draft', revisionNumber: 1 }],
      });

      await expect(
        service.createRevision(orgContext, sampleReportRow.id, createRevInput),
      ).rejects.toThrow(
        ApiException.conflict('A draft revision already exists.'),
      );
    });

    it('throws conflict if latest revision is already in review status', async () => {
      mockTx.report.findFirst.mockResolvedValueOnce({
        ...sampleReportRow,
        revisions: [{ status: 'in_review', revisionNumber: 1 }],
      });

      await expect(
        service.createRevision(orgContext, sampleReportRow.id, createRevInput),
      ).rejects.toThrow(
        ApiException.conflict('A draft revision already exists.'),
      );
    });
  });

  describe('updateRevision', () => {
    const updateRevInput: UpdateRevisionInput = {
      title: 'Updated Draft Revision',
      summary: 'Updated draft summary',
      expectedVersion: 1,
      insights: [
        {
          heading: 'Updated Insight',
          body: 'Refined body text.',
        },
      ],
    };

    it('updates draft revision content and increments parent report version', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'draft',
      });
      mockTx.report.findFirst.mockResolvedValueOnce(sampleReportRow);

      const result = await service.updateRevision(
        orgContext,
        sampleReportRow.id,
        sampleReportRow.revisions[0].id,
        updateRevInput,
      );

      expect(mockTx.reportRevision.update).toHaveBeenCalledWith({
        where: { id: sampleReportRow.revisions[0].id },
        data: {
          title: 'Updated Draft Revision',
          summary: 'Updated draft summary',
        },
      });

      expect(mockTx.report.update).toHaveBeenCalledWith({
        where: { id: sampleReportRow.id },
        data: {
          version: { increment: 1 },
          updatedAt: expect.any(Date) as unknown,
        },
      });

      expect(result.id).toBe(sampleReportRow.id);
    });

    it('throws not found if revision does not exist', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateRevision(
          orgContext,
          sampleReportRow.id,
          'nonexistent-rev',
          updateRevInput,
        ),
      ).rejects.toThrow(ApiException.notFound('Report revision not found.'));
    });

    it('strictly rejects mutations on published revisions', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'published',
      });

      await expect(
        service.updateRevision(
          orgContext,
          sampleReportRow.id,
          sampleReportRow.revisions[0].id,
          updateRevInput,
        ),
      ).rejects.toThrow(
        ApiException.conflict('Published revisions are immutable.'),
      );
    });

    it('strictly rejects mutations on superseded revisions', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'superseded',
      });

      await expect(
        service.updateRevision(
          orgContext,
          sampleReportRow.id,
          sampleReportRow.revisions[0].id,
          updateRevInput,
        ),
      ).rejects.toThrow(
        ApiException.conflict('Published revisions are immutable.'),
      );
    });

    it('throws not found if parent report is missing', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'draft',
      });
      mockTx.report.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.updateRevision(
          orgContext,
          sampleReportRow.id,
          sampleReportRow.revisions[0].id,
          updateRevInput,
        ),
      ).rejects.toThrow(ApiException.notFound('Report not found.'));
    });

    it('throws conflict if report expectedVersion does not match', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'draft',
      });
      mockTx.report.findFirst.mockResolvedValueOnce({
        ...sampleReportRow,
        version: 5,
      });

      await expect(
        service.updateRevision(
          orgContext,
          sampleReportRow.id,
          sampleReportRow.revisions[0].id,
          { ...updateRevInput, expectedVersion: 1 },
        ),
      ).rejects.toThrow(
        ApiException.conflict('Report was changed by another request.'),
      );
    });
  });

  describe('submitRevisionForReview', () => {
    it('transitions draft revision to in_review and sets submittedForReviewAt', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'draft',
        insights: [{ id: 'ins-1' }],
        evidence: [{ id: 'ev-1' }],
      });

      const result = await service.submitRevisionForReview(
        orgContext,
        sampleReportRow.id,
        sampleReportRow.revisions[0].id,
        'idemp-sub-123456',
      );

      expect(mockTx.reportRevision.update).toHaveBeenCalledWith({
        where: { id: sampleReportRow.revisions[0].id },
        data: {
          status: 'in_review',
          reviewerAccountId: null,
          submittedForReviewAt: expect.any(Date) as unknown,
        },
      });

      expect(mockTx.report.update).toHaveBeenCalledWith({
        where: { id: sampleReportRow.id },
        data: {
          version: { increment: 1 },
          updatedAt: expect.any(Date) as unknown,
        },
      });

      expect(result.id).toBe(sampleReportRow.id);
    });

    it('throws not found if revision does not exist', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.submitRevisionForReview(
          orgContext,
          sampleReportRow.id,
          'missing-rev',
        ),
      ).rejects.toThrow(ApiException.notFound('Report revision not found.'));
    });

    it('throws conflict if revision is not in draft status', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'in_review',
      });

      await expect(
        service.submitRevisionForReview(
          orgContext,
          sampleReportRow.id,
          sampleReportRow.revisions[0].id,
        ),
      ).rejects.toThrow(
        ApiException.conflict(
          'Only draft revisions can be submitted for review.',
        ),
      );
    });

    it('throws validation error when revision has no insights', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'draft',
        insights: [],
        evidence: [{ id: 'ev-1' }],
      });

      await expect(
        service.submitRevisionForReview(
          orgContext,
          sampleReportRow.id,
          sampleReportRow.revisions[0].id,
        ),
      ).rejects.toThrow(
        ApiException.validationFailed([
          'A report submitted for review requires at least one insight and one evidence link.',
        ]),
      );
    });

    it('throws validation error when revision has no evidence', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'draft',
        insights: [{ id: 'ins-1' }],
        evidence: [],
      });

      await expect(
        service.submitRevisionForReview(
          orgContext,
          sampleReportRow.id,
          sampleReportRow.revisions[0].id,
        ),
      ).rejects.toThrow(
        ApiException.validationFailed([
          'A report submitted for review requires at least one insight and one evidence link.',
        ]),
      );
    });
  });

  describe('publishRevision', () => {
    it('freezes revision state, supersedes previous revisions, updates report, and creates audit event', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'in_review',
        insights: [{ id: 'ins-1' }],
        evidence: [{ id: 'ev-1' }],
      });

      const result = await service.publishRevision(
        orgContext,
        sampleReportRow.id,
        sampleReportRow.revisions[0].id,
        'idemp-pub-123456',
      );

      expect(mockTx.reportRevision.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgContext.organizationId,
          reportId: sampleReportRow.id,
          status: 'published',
        },
        data: { status: 'superseded' },
      });

      expect(mockTx.reportRevision.update).toHaveBeenCalledWith({
        where: { id: sampleReportRow.revisions[0].id },
        data: {
          status: 'published',
          publisherAccountId: orgContext.accountId,
          publishedAt: expect.any(Date) as unknown,
        },
      });

      expect(mockTx.report.update).toHaveBeenCalledWith({
        where: { id: sampleReportRow.id },
        data: {
          status: 'published',
          version: { increment: 1 },
          updatedAt: expect.any(Date) as unknown,
        },
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgContext.organizationId,
          actorAccountId: orgContext.accountId,
          action: 'report_published',
          targetType: 'ReportRevision',
          targetId: sampleReportRow.revisions[0].id,
          details: { reportId: sampleReportRow.id },
        },
      });

      expect(result.id).toBe(sampleReportRow.id);
    });

    it('returns current report idempotently when revision is already published', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'published',
      });

      const result = await service.publishRevision(
        orgContext,
        sampleReportRow.id,
        sampleReportRow.revisions[0].id,
      );

      expect(mockTx.reportRevision.updateMany).not.toHaveBeenCalled();
      expect(mockTx.auditEvent.create).not.toHaveBeenCalled();
      expect(result.id).toBe(sampleReportRow.id);
    });

    it('throws not found if revision does not exist', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.publishRevision(orgContext, sampleReportRow.id, 'missing-rev'),
      ).rejects.toThrow(ApiException.notFound('Report revision not found.'));
    });

    it('throws validation error when publishing without insights', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'in_review',
        insights: [],
        evidence: [{ id: 'ev-1' }],
      });

      await expect(
        service.publishRevision(
          orgContext,
          sampleReportRow.id,
          sampleReportRow.revisions[0].id,
        ),
      ).rejects.toThrow(
        ApiException.validationFailed([
          'A published report requires at least one insight and one evidence link.',
        ]),
      );
    });

    it('throws validation error when publishing without evidence', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        ...sampleReportRow.revisions[0],
        status: 'in_review',
        insights: [{ id: 'ins-1' }],
        evidence: [],
      });

      await expect(
        service.publishRevision(
          orgContext,
          sampleReportRow.id,
          sampleReportRow.revisions[0].id,
        ),
      ).rejects.toThrow(
        ApiException.validationFailed([
          'A published report requires at least one insight and one evidence link.',
        ]),
      );
    });
  });

  describe('evidence resolution and snapshot freeze', () => {
    it('freezes aggregate evidence with numeric value snapshot', async () => {
      await service.createReport(orgContext, {
        title: 'Report with Aggregate Evidence',
        evidence: [{ aggregateId: sampleAggregateRow.id }],
      });

      expect(mockTx.metricAggregate.findFirst).toHaveBeenCalledWith({
        where: {
          id: sampleAggregateRow.id,
          organizationId: orgContext.organizationId,
        },
        include: { metricDefinition: true },
      });

      expect(mockTx.reportEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          evidenceType: 'aggregate',
          aggregateId: sampleAggregateRow.id,
          dashboardViewId: null,
          metricDefinitionId: sampleAggregateRow.metricDefinitionId,
          datasetVersionId: sampleAggregateRow.datasetVersionId,
          snapshot: {
            aggregateId: sampleAggregateRow.id,
            metric: {
              id: sampleAggregateRow.metricDefinition.id,
              key: sampleAggregateRow.metricDefinition.key,
              label: sampleAggregateRow.metricDefinition.label,
              unit: sampleAggregateRow.unit,
              calculationVersion: sampleAggregateRow.calculationVersion,
            },
            value: '4.2',
            periodStart: now.toISOString(),
            periodEnd: sampleAggregateRow.periodEnd.toISOString(),
            regionId: sampleAggregateRow.regionId,
            observationCount: 12,
            datasetVersionId: sampleAggregateRow.datasetVersionId,
          },
        }) as unknown,
      });
    });

    it('freezes aggregate evidence with textValue fallback when numericValue is null', async () => {
      mockTx.metricAggregate.findFirst.mockResolvedValueOnce({
        ...sampleAggregateRow,
        numericValue: null,
        textValue: 'High Growth Category',
      });

      await service.createReport(orgContext, {
        title: 'Report with Text Aggregate',
        evidence: [{ aggregateId: sampleAggregateRow.id }],
      });

      expect(mockTx.reportEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            value: 'High Growth Category',
          }) as unknown,
        }) as unknown,
      });
    });

    it('freezes dashboard view evidence snapshot', async () => {
      await service.createReport(orgContext, {
        title: 'Report with Dashboard Evidence',
        evidence: [{ dashboardViewId: sampleDashboardViewRow.id }],
      });

      expect(mockTx.dashboardView.findFirst).toHaveBeenCalledWith({
        where: {
          id: sampleDashboardViewRow.id,
          organizationId: orgContext.organizationId,
          status: 'active',
        },
      });

      expect(mockTx.reportEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          evidenceType: 'dashboard_view',
          aggregateId: null,
          dashboardViewId: sampleDashboardViewRow.id,
          metricDefinitionId: null,
          datasetVersionId: null,
          snapshot: {
            dashboardViewId: sampleDashboardViewRow.id,
            name: sampleDashboardViewRow.name,
            filters: sampleDashboardViewRow.filters,
            presentation: sampleDashboardViewRow.presentation,
          },
        }) as unknown,
      });
    });

    it('throws validation error when evidence specifies both aggregateId and dashboardViewId', async () => {
      await expect(
        service.createReport(orgContext, {
          title: 'Invalid Evidence Report',
          evidence: [
            {
              aggregateId: sampleAggregateRow.id,
              dashboardViewId: sampleDashboardViewRow.id,
            },
          ],
        }),
      ).rejects.toThrow(
        ApiException.validationFailed([
          'Evidence must reference either aggregateId or dashboardViewId.',
        ]),
      );
    });

    it('throws validation error when evidence specifies neither aggregateId nor dashboardViewId', async () => {
      await expect(
        service.createReport(orgContext, {
          title: 'Empty Evidence Report',
          evidence: [{}],
        }),
      ).rejects.toThrow(
        ApiException.validationFailed([
          'Evidence must include aggregateId or dashboardViewId.',
        ]),
      );
    });

    it('throws not found when referenced aggregate does not exist', async () => {
      mockTx.metricAggregate.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createReport(orgContext, {
          title: 'Missing Aggregate Report',
          evidence: [{ aggregateId: 'missing-agg' }],
        }),
      ).rejects.toThrow(ApiException.notFound('Evidence aggregate not found.'));
    });

    it('throws not found when referenced dashboard view does not exist or is inactive', async () => {
      mockTx.dashboardView.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createReport(orgContext, {
          title: 'Missing View Report',
          evidence: [{ dashboardViewId: 'missing-view' }],
        }),
      ).rejects.toThrow(
        ApiException.notFound('Evidence dashboard view not found.'),
      );
    });
  });

  describe('listExports and getExport', () => {
    it('listExports returns mapped export requests', async () => {
      const result = await service.listExports(orgContext);

      expect(mockReportsRepo.listExports).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(sampleExportRow.id);
      expect(result[0].artifact?.byteCount).toBe(256);
    });

    it('getExport returns single export request', async () => {
      const result = await service.getExport(orgContext, sampleExportRow.id);

      expect(mockReportsRepo.findExport).toHaveBeenCalledWith(
        mockTx,
        orgContext.organizationId,
        sampleExportRow.id,
      );
      expect(result.id).toBe(sampleExportRow.id);
      expect(result.status).toBe('succeeded');
    });

    it('getExport throws not found when export does not exist', async () => {
      (mockReportsRepo.findExport as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.getExport(orgContext, 'missing-exp'),
      ).rejects.toThrow(ApiException.notFound('Export not found.'));
    });
  });

  describe('createExport', () => {
    const exportInput: CreateExportInput = {
      reportId: sampleReportRow.id,
      format: 'csv',
    };

    it('creates export request and enqueues outbox event for published report', async () => {
      (mockReportsRepo.findReport as jest.Mock).mockResolvedValueOnce(
        samplePublishedReportRow,
      );

      const result = await service.createExport(
        orgContext,
        exportInput,
        'idemp-exp-123456',
      );

      expect(mockTx.exportRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgContext.organizationId,
          requestedByAccountId: orgContext.accountId,
          reportId: sampleReportRow.id,
          revisionId: samplePublishedReportRow.revisions[0].id,
          format: 'csv',
          renderingVersion: 'reports-v1',
        }) as unknown,
        include: { artifact: true },
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgContext.organizationId,
          actorAccountId: orgContext.accountId,
          action: 'export_requested',
          targetType: 'ExportRequest',
          targetId: sampleExportRow.id,
          details: { format: 'csv', reportId: sampleReportRow.id },
        },
      });

      expect(mockOutbox.appendExportRequested).toHaveBeenCalledWith(mockTx, {
        organizationId: orgContext.organizationId,
        exportRequestId: sampleExportRow.id,
      });

      expect(result.id).toBe(sampleExportRow.id);
    });

    it('creates export request when targeting published revision directly', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce({
        id: samplePublishedReportRow.revisions[0].id,
        reportId: sampleReportRow.id,
        status: 'published',
      });

      const result = await service.createExport(orgContext, {
        revisionId: samplePublishedReportRow.revisions[0].id,
        format: 'pdf',
      });

      expect(mockTx.exportRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reportId: sampleReportRow.id,
          revisionId: samplePublishedReportRow.revisions[0].id,
          format: 'pdf',
        }) as unknown,
        include: { artifact: true },
      });
      expect(result.id).toBe(sampleExportRow.id);
    });

    it('throws validation error when both reportId and revisionId are omitted', () => {
      expect(() => service.createExport(orgContext, { format: 'csv' })).toThrow(
        ApiException.validationFailed(['reportId or revisionId is required.']),
      );
    });

    it('throws not found when targeted revision is not found or not published', async () => {
      mockTx.reportRevision.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.createExport(orgContext, {
          revisionId: 'unpublished-rev',
          format: 'csv',
        }),
      ).rejects.toThrow(ApiException.notFound('Published revision not found.'));
    });

    it('throws not found when targeted report is draft only', async () => {
      (mockReportsRepo.findReport as jest.Mock).mockResolvedValueOnce(
        sampleReportRow,
      );

      await expect(
        service.createExport(orgContext, {
          reportId: sampleReportRow.id,
          format: 'csv',
        }),
      ).rejects.toThrow(
        ApiException.notFound('Published report revision not found.'),
      );
    });
  });

  describe('downloadExport', () => {
    it('returns presigned download URL for completed export artifact', async () => {
      const result = await service.downloadExport(
        orgContext,
        sampleExportRow.id,
      );

      expect(fakeStorage.presignGet).toHaveBeenCalledWith({
        key: sampleExportRow.artifact.storedObject.objectKey,
        filename: sampleExportRow.artifact.filename,
        mediaType: sampleExportRow.artifact.mediaType,
      });

      expect(result).toMatchObject({
        url: 'https://storage.local/download/report.csv?signature=abc',
        method: 'GET',
      });
    });

    it('throws not found when export request does not exist', async () => {
      mockTx.exportRequest.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.downloadExport(orgContext, 'missing-export'),
      ).rejects.toThrow(
        ApiException.notFound('Completed export artifact not found.'),
      );
    });

    it('throws not found when export is not in succeeded status', async () => {
      mockTx.exportRequest.findFirst.mockResolvedValueOnce({
        ...sampleExportRow,
        status: 'running',
      });

      await expect(
        service.downloadExport(orgContext, sampleExportRow.id),
      ).rejects.toThrow(
        ApiException.notFound('Completed export artifact not found.'),
      );
    });

    it('throws not found when export artifact is null', async () => {
      mockTx.exportRequest.findFirst.mockResolvedValueOnce({
        ...sampleExportRow,
        status: 'succeeded',
        artifact: null,
      });

      await expect(
        service.downloadExport(orgContext, sampleExportRow.id),
      ).rejects.toThrow(
        ApiException.notFound('Completed export artifact not found.'),
      );
    });
  });

  describe('processExport (Worker Execution)', () => {
    it('processes CSV export: updates state to running, uploads CSV to storage, creates storedObject and artifact, and marks succeeded', async () => {
      mockTx.exportRequest.findUnique.mockResolvedValueOnce({
        ...sampleExportRow,
        status: 'queued',
        format: 'csv',
        revisionId: samplePublishedReportRow.revisions[0].id,
      });
      mockTx.reportRevision.findFirst.mockResolvedValueOnce(
        samplePublishedReportRow.revisions[0],
      );

      await service.processExport(sampleExportRow.id);

      // 1. Marks running
      expect(mockTx.exportRequest.update).toHaveBeenNthCalledWith(1, {
        where: { id: sampleExportRow.id },
        data: {
          status: 'running',
          startedAt: expect.any(Date) as unknown,
        },
      });

      // 2. Uploads CSV buffer to storage
      expect(fakeStorage.putBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          key: expect.stringContaining(
            `organizations/${orgContext.organizationId}/exports/`,
          ) as unknown,
          mediaType: 'text/csv',
          checksumHex: expect.any(String) as unknown,
        }) as unknown,
      );

      // 3. Creates StoredObject
      expect(mockTx.storedObject.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgContext.organizationId,
          bucket: 'acres-storage',
          mediaType: 'text/csv',
          checksumAlgorithm: 'sha256',
          state: 'accepted',
        }) as unknown,
      });

      // 4. Creates ExportArtifact
      expect(mockTx.exportArtifact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgContext.organizationId,
          exportRequestId: sampleExportRow.id,
          mediaType: 'text/csv',
        }) as unknown,
      });

      // 5. Marks succeeded
      expect(mockTx.exportRequest.update).toHaveBeenNthCalledWith(2, {
        where: { id: sampleExportRow.id },
        data: {
          status: 'succeeded',
          finishedAt: expect.any(Date) as unknown,
          expiresAt: expect.any(Date) as unknown,
        },
      });
    });

    it('processes PDF export: generates valid PDF buffer, uploads to storage, and marks succeeded', async () => {
      mockTx.exportRequest.findUnique.mockResolvedValueOnce({
        ...sampleExportRow,
        status: 'queued',
        format: 'pdf',
        revisionId: samplePublishedReportRow.revisions[0].id,
      });
      mockTx.reportRevision.findFirst.mockResolvedValueOnce(
        samplePublishedReportRow.revisions[0],
      );

      await service.processExport(sampleExportRow.id);

      expect(fakeStorage.putBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: 'application/pdf',
          checksumHex: expect.any(String) as unknown,
        }) as unknown,
      );

      expect(mockTx.exportRequest.update).toHaveBeenNthCalledWith(2, {
        where: { id: sampleExportRow.id },
        data: {
          status: 'succeeded',
          finishedAt: expect.any(Date) as unknown,
          expiresAt: expect.any(Date) as unknown,
        },
      });
    });

    it('returns early when export request is missing or already succeeded', async () => {
      mockTx.exportRequest.findUnique.mockResolvedValueOnce(null);
      await service.processExport('nonexistent-id');
      expect(mockTx.exportRequest.update).not.toHaveBeenCalled();

      mockTx.exportRequest.findUnique.mockResolvedValueOnce({
        ...sampleExportRow,
        status: 'succeeded',
      });
      await service.processExport(sampleExportRow.id);
      expect(mockTx.exportRequest.update).not.toHaveBeenCalled();
    });

    it('marks export failed with missing_revision when published revision cannot be found', async () => {
      mockTx.exportRequest.findUnique.mockResolvedValueOnce({
        ...sampleExportRow,
        status: 'queued',
        format: 'csv',
        revisionId: 'missing-rev-id',
      });
      mockTx.reportRevision.findFirst.mockResolvedValueOnce(null);

      await service.processExport(sampleExportRow.id);

      expect(mockTx.exportRequest.update).toHaveBeenNthCalledWith(2, {
        where: { id: sampleExportRow.id },
        data: {
          status: 'failed',
          failureCode: 'missing_revision',
          failureMessage: 'Published revision not found.',
          finishedAt: expect.any(Date) as unknown,
        },
      });
    });

    it('marks export failed with render_failed on unexpected storage or rendering crash', async () => {
      mockTx.exportRequest.findUnique.mockResolvedValueOnce({
        ...sampleExportRow,
        status: 'queued',
        format: 'csv',
        revisionId: samplePublishedReportRow.revisions[0].id,
      });
      mockTx.reportRevision.findFirst.mockResolvedValueOnce(
        samplePublishedReportRow.revisions[0],
      );
      fakeStorage.putBuffer.mockRejectedValueOnce(
        new Error('S3 upload timeout'),
      );

      await service.processExport(sampleExportRow.id);

      expect(mockTx.exportRequest.update).toHaveBeenNthCalledWith(2, {
        where: { id: sampleExportRow.id },
        data: {
          status: 'failed',
          failureCode: 'render_failed',
          failureMessage: 'Export rendering failed.',
          finishedAt: expect.any(Date) as unknown,
        },
      });
    });
  });

  describe('standalone export helpers', () => {
    describe('escapeFormula', () => {
      it.each(['=SUM(A1:A2)', '+cmd', '-2+3', '@lookup', '\t=1', '\r=1'])(
        'neutralizes spreadsheet formula cell %s',
        (value) => {
          expect(escapeFormula(value)).toBe(`'${value}`);
        },
      );

      it('leaves ordinary text unchanged', () => {
        expect(escapeFormula('Population total')).toBe('Population total');
        expect(escapeFormula('100.5%')).toBe('100.5%');
      });
    });

    describe('renderPdf', () => {
      it('renders a minimal valid PDF structure with correct catalog, fonts, and xref table', () => {
        const rendered = renderPdf({
          id: 'revision-1',
          reportId: 'report-1',
          revisionNumber: 1,
          status: 'published',
          title: 'Population report Special Chars Test',
          summary: 'Evidence-backed summary',
          sections: [],
          authorAccountId: 'account-1',
          reviewerAccountId: null,
          publisherAccountId: 'account-1',
          submittedForReviewAt: null,
          publishedAt: new Date('2026-01-01T00:00:00.000Z'),
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          insights: [
            {
              id: 'ins-1',
              position: 0,
              heading: 'Key Takeaway',
              body: 'Population growth has stabilized.',
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            },
          ],
          evidence: [],
        });

        expect(rendered.filename).toBe(
          'population-report-special-chars-test-report.pdf',
        );
        expect(rendered.mediaType).toBe('application/pdf');

        const pdf = rendered.body.toString('utf8');
        expect(pdf.startsWith('%PDF-1.4')).toBe(true);
        expect(pdf).toContain('/Type /Catalog');
        expect(pdf).toContain('/Type /Pages');
        expect(pdf).toContain('/Type /Font');
        expect(pdf).toContain('xref\n0 6');
        expect(pdf).toContain('startxref');
        expect(pdf.endsWith('%%EOF\n')).toBe(true);

        const hash = createHash('sha256').update(rendered.body).digest('hex');
        expect(hash).toHaveLength(64);
      });
    });
  });
});
