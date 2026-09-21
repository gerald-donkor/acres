import type { MessageEvent } from '@nestjs/common';
import { firstValueFrom, take, toArray } from 'rxjs';
import {
  EXPORT_STATUSES,
  TERMINAL_EXPORT_STATUSES,
  isTerminalExportStatus,
  type ExportDownload,
  type ExportRequest,
  type Report,
  type ReportEvidence,
  type TerminalExportStatus,
} from '@acres/shared';
import type { OrganizationContext } from '../organizations/organization-context';
import { ReportsController } from './reports.controller';
import type { ReportsService } from './reports.service';
import type {
  CreateExportDto,
  CreateReportDto,
  CreateRevisionDto,
  UpdateReportDto,
  UpdateRevisionDto,
} from './dto/report.dto';

describe('ReportsController', () => {
  let controller: ReportsController;
  let mockReportsService: {
    listReports: jest.Mock<Promise<Report[]>, [OrganizationContext]>;
    createReport: jest.Mock<
      Promise<Report>,
      [OrganizationContext, CreateReportDto, string | undefined]
    >;
    getReport: jest.Mock<Promise<Report>, [OrganizationContext, string]>;
    updateReport: jest.Mock<
      Promise<Report>,
      [OrganizationContext, string, UpdateReportDto]
    >;
    createRevision: jest.Mock<
      Promise<Report>,
      [OrganizationContext, string, CreateRevisionDto, string | undefined]
    >;
    updateRevision: jest.Mock<
      Promise<Report>,
      [OrganizationContext, string, string, UpdateRevisionDto]
    >;
    submitRevisionForReview: jest.Mock<
      Promise<Report>,
      [OrganizationContext, string, string, string | undefined]
    >;
    publishRevision: jest.Mock<
      Promise<Report>,
      [OrganizationContext, string, string, string | undefined]
    >;
    getRevisionEvidence: jest.Mock<
      Promise<ReportEvidence[]>,
      [OrganizationContext, string, string]
    >;
    listExports: jest.Mock<Promise<ExportRequest[]>, [OrganizationContext]>;
    createExport: jest.Mock<
      Promise<ExportRequest>,
      [OrganizationContext, CreateExportDto, string | undefined]
    >;
    getExport: jest.Mock<Promise<ExportRequest>, [OrganizationContext, string]>;
    downloadExport: jest.Mock<
      Promise<ExportDownload>,
      [OrganizationContext, string]
    >;
  };

  const testOrg: OrganizationContext = {
    organizationId: '018f7611-89ab-7abc-9234-111111111111',
    accountId: '018f7611-89ab-7abc-9234-222222222222',
    membershipId: '018f7611-89ab-7abc-9234-333333333333',
    role: 'owner',
  };

  const testReportId = '018f7611-89ab-7abc-9234-aaaa1111aaaa';
  const testRevisionId = '018f7611-89ab-7abc-9234-bbbb1111bbbb';
  const testExportId = '018f7611-89ab-7abc-9234-exp1111exp1';
  const testIdempotencyKey = 'idem-reports-spec-key-12345';

  const mockEvidenceList: ReportEvidence[] = [
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
        value: '4.2',
      },
      position: 0,
      createdAt: '2026-09-21T00:00:00.000Z',
    },
  ];

  const mockReport: Report = {
    id: testReportId,
    title: 'Regional Agriculture & Soil Report',
    summary: 'Quarterly regional harvest and soil moisture analysis.',
    status: 'draft',
    version: 1,
    ownerAccountId: testOrg.accountId,
    createdByAccountId: testOrg.accountId,
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z',
    latestRevision: {
      id: testRevisionId,
      reportId: testReportId,
      revisionNumber: 1,
      status: 'draft',
      title: 'Regional Agriculture & Soil Report',
      summary: 'Quarterly regional harvest and soil moisture analysis.',
      sections: [],
      authorAccountId: testOrg.accountId,
      reviewerAccountId: null,
      publisherAccountId: null,
      submittedForReviewAt: null,
      publishedAt: null,
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
      insights: [
        {
          id: '018f7611-89ab-7abc-9234-cccc1111cccc',
          position: 0,
          heading: 'Soil Moisture Recovery',
          body: 'Subsurface moisture levels improved by 14% across the eastern parcel.',
          createdAt: '2026-09-21T00:00:00.000Z',
          updatedAt: '2026-09-21T00:00:00.000Z',
        },
      ],
      evidence: mockEvidenceList,
    },
    aiDraftEnabled: false,
  };

  const mockExportRequest: ExportRequest = {
    id: testExportId,
    reportId: testReportId,
    revisionId: testRevisionId,
    format: 'pdf',
    status: 'queued',
    renderingVersion: 'reports-v1',
    failure: null,
    artifact: null,
    startedAt: null,
    finishedAt: null,
    expiresAt: null,
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z',
  };

  const mockExportDownload: ExportDownload = {
    url: 'https://storage.example.com/exports/export-1.pdf',
    method: 'GET',
    headers: { 'response-content-disposition': 'attachment' },
    expiresAt: '2026-09-21T01:00:00.000Z',
  };

  beforeEach(() => {
    jest.useFakeTimers();

    mockReportsService = {
      listReports: jest.fn<Promise<Report[]>, [OrganizationContext]>(),
      createReport: jest.fn<
        Promise<Report>,
        [OrganizationContext, CreateReportDto, string | undefined]
      >(),
      getReport: jest.fn<Promise<Report>, [OrganizationContext, string]>(),
      updateReport: jest.fn<
        Promise<Report>,
        [OrganizationContext, string, UpdateReportDto]
      >(),
      createRevision: jest.fn<
        Promise<Report>,
        [OrganizationContext, string, CreateRevisionDto, string | undefined]
      >(),
      updateRevision: jest.fn<
        Promise<Report>,
        [OrganizationContext, string, string, UpdateRevisionDto]
      >(),
      submitRevisionForReview: jest.fn<
        Promise<Report>,
        [OrganizationContext, string, string, string | undefined]
      >(),
      publishRevision: jest.fn<
        Promise<Report>,
        [OrganizationContext, string, string, string | undefined]
      >(),
      getRevisionEvidence: jest.fn<
        Promise<ReportEvidence[]>,
        [OrganizationContext, string, string]
      >(),
      listExports: jest.fn<Promise<ExportRequest[]>, [OrganizationContext]>(),
      createExport: jest.fn<
        Promise<ExportRequest>,
        [OrganizationContext, CreateExportDto, string | undefined]
      >(),
      getExport: jest.fn<
        Promise<ExportRequest>,
        [OrganizationContext, string]
      >(),
      downloadExport: jest.fn<
        Promise<ExportDownload>,
        [OrganizationContext, string]
      >(),
    };

    controller = new ReportsController(
      mockReportsService as unknown as ReportsService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('canonical state assertions', () => {
    it('verifies EXPORT_STATUSES contains all expected lifecycle statuses', () => {
      expect(Array.isArray(EXPORT_STATUSES)).toBe(true);
      expect(EXPORT_STATUSES).toEqual([
        'queued',
        'running',
        'succeeded',
        'failed',
        'cancelled',
      ]);
    });

    it('verifies TERMINAL_EXPORT_STATUSES contains exactly succeeded, failed, and cancelled', () => {
      expect(Array.isArray(TERMINAL_EXPORT_STATUSES)).toBe(true);
      expect(TERMINAL_EXPORT_STATUSES).toEqual([
        'succeeded',
        'failed',
        'cancelled',
      ]);
    });

    it('returns true for terminal export statuses', () => {
      const terminalStatuses: TerminalExportStatus[] = [
        'succeeded',
        'failed',
        'cancelled',
      ];

      for (const status of terminalStatuses) {
        expect(isTerminalExportStatus(status)).toBe(true);
      }
    });

    it('returns false for non-terminal and arbitrary export statuses', () => {
      const nonTerminalStatuses: string[] = [
        'queued',
        'running',
        'pending',
        'completed',
        'in_progress',
        'unknown',
        '',
      ];

      for (const status of nonTerminalStatuses) {
        expect(isTerminalExportStatus(status)).toBe(false);
      }
    });
  });

  describe('listReports', () => {
    it('calls reports.listReports with organization and returns reports', async () => {
      const expectedReports: Report[] = [mockReport];
      mockReportsService.listReports.mockResolvedValue(expectedReports);

      const result = await controller.listReports(testOrg);

      expect(mockReportsService.listReports).toHaveBeenCalledTimes(1);
      expect(mockReportsService.listReports).toHaveBeenCalledWith(testOrg);
      expect(result).toEqual(expectedReports);
    });

    it('propagates service rejection', async () => {
      mockReportsService.listReports.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(controller.listReports(testOrg)).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('createReport', () => {
    const createDto: CreateReportDto = {
      title: 'Regional Agriculture & Soil Report',
      summary: 'Quarterly regional harvest and soil moisture analysis.',
      insights: [
        {
          heading: 'Soil Moisture Recovery',
          body: 'Subsurface moisture levels improved by 14% across the eastern parcel.',
        },
      ],
      evidence: [
        {
          aggregateId: '018f7611-89ab-7abc-9234-eeee1111eeee',
        },
      ],
    };

    it('calls reports.createReport with organization, body, and idempotencyKey', async () => {
      mockReportsService.createReport.mockResolvedValue(mockReport);

      const result = await controller.createReport(
        testOrg,
        createDto,
        testIdempotencyKey,
      );

      expect(mockReportsService.createReport).toHaveBeenCalledTimes(1);
      expect(mockReportsService.createReport).toHaveBeenCalledWith(
        testOrg,
        createDto,
        testIdempotencyKey,
      );
      expect(result).toEqual(mockReport);
    });

    it('supports optional idempotencyKey being undefined', async () => {
      mockReportsService.createReport.mockResolvedValue(mockReport);

      const result = await controller.createReport(
        testOrg,
        createDto,
        undefined,
      );

      expect(mockReportsService.createReport).toHaveBeenCalledTimes(1);
      expect(mockReportsService.createReport).toHaveBeenCalledWith(
        testOrg,
        createDto,
        undefined,
      );
      expect(result).toEqual(mockReport);
    });

    it('propagates service rejection', async () => {
      mockReportsService.createReport.mockRejectedValue(
        new Error('Failed to create report'),
      );

      await expect(
        controller.createReport(testOrg, createDto, testIdempotencyKey),
      ).rejects.toThrow('Failed to create report');
    });
  });

  describe('getReport', () => {
    it('calls reports.getReport with organization and reportId', async () => {
      mockReportsService.getReport.mockResolvedValue(mockReport);

      const result = await controller.getReport(testOrg, testReportId);

      expect(mockReportsService.getReport).toHaveBeenCalledTimes(1);
      expect(mockReportsService.getReport).toHaveBeenCalledWith(
        testOrg,
        testReportId,
      );
      expect(result).toEqual(mockReport);
    });

    it('propagates service rejection', async () => {
      mockReportsService.getReport.mockRejectedValue(
        new Error('Report not found'),
      );

      await expect(controller.getReport(testOrg, testReportId)).rejects.toThrow(
        'Report not found',
      );
    });
  });

  describe('updateReport', () => {
    const updateDto: UpdateReportDto = {
      title: 'Updated Agriculture Report',
      summary: 'Updated summary of regional crop yields.',
      expectedVersion: 1,
    };

    it('calls reports.updateReport with organization, reportId, and body', async () => {
      const updatedReport: Report = {
        ...mockReport,
        title: updateDto.title!,
        summary: updateDto.summary!,
        version: 2,
      };
      mockReportsService.updateReport.mockResolvedValue(updatedReport);

      const result = await controller.updateReport(
        testOrg,
        testReportId,
        updateDto,
      );

      expect(mockReportsService.updateReport).toHaveBeenCalledTimes(1);
      expect(mockReportsService.updateReport).toHaveBeenCalledWith(
        testOrg,
        testReportId,
        updateDto,
      );
      expect(result).toEqual(updatedReport);
    });

    it('propagates service rejection', async () => {
      mockReportsService.updateReport.mockRejectedValue(
        new Error('Conflict: report version mismatch'),
      );

      await expect(
        controller.updateReport(testOrg, testReportId, updateDto),
      ).rejects.toThrow('Conflict: report version mismatch');
    });
  });

  describe('createRevision', () => {
    const createRevisionDto: CreateRevisionDto = {
      title: 'Revised Regional Soil Report',
      summary: 'Added latest quarter sensor readings.',
      expectedVersion: 1,
      insights: [
        {
          heading: 'Moisture Stability',
          body: 'Stable moisture patterns across all parcels.',
        },
      ],
      evidence: [
        {
          dashboardViewId: '018f7611-89ab-7abc-9234-999911119999',
        },
      ],
    };

    it('calls reports.createRevision with organization, reportId, body, and idempotencyKey', async () => {
      const reportWithNewRevision: Report = {
        ...mockReport,
        version: 2,
      };
      mockReportsService.createRevision.mockResolvedValue(
        reportWithNewRevision,
      );

      const result = await controller.createRevision(
        testOrg,
        testReportId,
        createRevisionDto,
        testIdempotencyKey,
      );

      expect(mockReportsService.createRevision).toHaveBeenCalledTimes(1);
      expect(mockReportsService.createRevision).toHaveBeenCalledWith(
        testOrg,
        testReportId,
        createRevisionDto,
        testIdempotencyKey,
      );
      expect(result).toEqual(reportWithNewRevision);
    });

    it('supports optional idempotencyKey being undefined', async () => {
      mockReportsService.createRevision.mockResolvedValue(mockReport);

      const result = await controller.createRevision(
        testOrg,
        testReportId,
        createRevisionDto,
        undefined,
      );

      expect(mockReportsService.createRevision).toHaveBeenCalledTimes(1);
      expect(mockReportsService.createRevision).toHaveBeenCalledWith(
        testOrg,
        testReportId,
        createRevisionDto,
        undefined,
      );
      expect(result).toEqual(mockReport);
    });

    it('propagates service rejection', async () => {
      mockReportsService.createRevision.mockRejectedValue(
        new Error('A draft revision already exists.'),
      );

      await expect(
        controller.createRevision(
          testOrg,
          testReportId,
          createRevisionDto,
          testIdempotencyKey,
        ),
      ).rejects.toThrow('A draft revision already exists.');
    });
  });

  describe('updateRevision', () => {
    const updateRevisionDto: UpdateRevisionDto = {
      title: 'Updated Draft Revision',
      summary: 'Updated draft summary notes.',
      expectedVersion: 1,
      insights: [
        {
          heading: 'Refined Soil Insights',
          body: 'Corrected sensor discrepancy in eastern region.',
        },
      ],
    };

    it('calls reports.updateRevision with organization, reportId, revisionId, and body', async () => {
      const updatedReport: Report = {
        ...mockReport,
        version: 2,
      };
      mockReportsService.updateRevision.mockResolvedValue(updatedReport);

      const result = await controller.updateRevision(
        testOrg,
        testReportId,
        testRevisionId,
        updateRevisionDto,
      );

      expect(mockReportsService.updateRevision).toHaveBeenCalledTimes(1);
      expect(mockReportsService.updateRevision).toHaveBeenCalledWith(
        testOrg,
        testReportId,
        testRevisionId,
        updateRevisionDto,
      );
      expect(result).toEqual(updatedReport);
    });

    it('propagates service rejection', async () => {
      mockReportsService.updateRevision.mockRejectedValue(
        new Error('Published revisions are immutable.'),
      );

      await expect(
        controller.updateRevision(
          testOrg,
          testReportId,
          testRevisionId,
          updateRevisionDto,
        ),
      ).rejects.toThrow('Published revisions are immutable.');
    });
  });

  describe('submitRevisionForReview', () => {
    it('calls reports.submitRevisionForReview with organization, reportId, revisionId, and idempotencyKey', async () => {
      const inReviewReport: Report = {
        ...mockReport,
        latestRevision: {
          ...mockReport.latestRevision!,
          status: 'in_review',
        },
      };
      mockReportsService.submitRevisionForReview.mockResolvedValue(
        inReviewReport,
      );

      const result = await controller.submitRevisionForReview(
        testOrg,
        testReportId,
        testRevisionId,
        testIdempotencyKey,
      );

      expect(mockReportsService.submitRevisionForReview).toHaveBeenCalledTimes(
        1,
      );
      expect(mockReportsService.submitRevisionForReview).toHaveBeenCalledWith(
        testOrg,
        testReportId,
        testRevisionId,
        testIdempotencyKey,
      );
      expect(result).toEqual(inReviewReport);
    });

    it('supports optional idempotencyKey being undefined', async () => {
      mockReportsService.submitRevisionForReview.mockResolvedValue(mockReport);

      const result = await controller.submitRevisionForReview(
        testOrg,
        testReportId,
        testRevisionId,
        undefined,
      );

      expect(mockReportsService.submitRevisionForReview).toHaveBeenCalledTimes(
        1,
      );
      expect(mockReportsService.submitRevisionForReview).toHaveBeenCalledWith(
        testOrg,
        testReportId,
        testRevisionId,
        undefined,
      );
      expect(result).toEqual(mockReport);
    });

    it('propagates service rejection', async () => {
      mockReportsService.submitRevisionForReview.mockRejectedValue(
        new Error('Only draft revisions can be submitted for review.'),
      );

      await expect(
        controller.submitRevisionForReview(
          testOrg,
          testReportId,
          testRevisionId,
          testIdempotencyKey,
        ),
      ).rejects.toThrow('Only draft revisions can be submitted for review.');
    });
  });

  describe('publishRevision', () => {
    it('calls reports.publishRevision with organization, reportId, revisionId, and idempotencyKey', async () => {
      const publishedReport: Report = {
        ...mockReport,
        status: 'published',
        latestRevision: {
          ...mockReport.latestRevision!,
          status: 'published',
          publishedAt: '2026-09-21T00:00:00.000Z',
        },
      };
      mockReportsService.publishRevision.mockResolvedValue(publishedReport);

      const result = await controller.publishRevision(
        testOrg,
        testReportId,
        testRevisionId,
        testIdempotencyKey,
      );

      expect(mockReportsService.publishRevision).toHaveBeenCalledTimes(1);
      expect(mockReportsService.publishRevision).toHaveBeenCalledWith(
        testOrg,
        testReportId,
        testRevisionId,
        testIdempotencyKey,
      );
      expect(result).toEqual(publishedReport);
    });

    it('supports optional idempotencyKey being undefined', async () => {
      mockReportsService.publishRevision.mockResolvedValue(mockReport);

      const result = await controller.publishRevision(
        testOrg,
        testReportId,
        testRevisionId,
        undefined,
      );

      expect(mockReportsService.publishRevision).toHaveBeenCalledTimes(1);
      expect(mockReportsService.publishRevision).toHaveBeenCalledWith(
        testOrg,
        testReportId,
        testRevisionId,
        undefined,
      );
      expect(result).toEqual(mockReport);
    });

    it('propagates service rejection', async () => {
      mockReportsService.publishRevision.mockRejectedValue(
        new Error('Revision not eligible for publication'),
      );

      await expect(
        controller.publishRevision(
          testOrg,
          testReportId,
          testRevisionId,
          testIdempotencyKey,
        ),
      ).rejects.toThrow('Revision not eligible for publication');
    });
  });

  describe('revisionEvidence', () => {
    it('calls reports.getRevisionEvidence with organization, reportId, and revisionId', async () => {
      mockReportsService.getRevisionEvidence.mockResolvedValue(
        mockEvidenceList,
      );

      const result = await controller.revisionEvidence(
        testOrg,
        testReportId,
        testRevisionId,
      );

      expect(mockReportsService.getRevisionEvidence).toHaveBeenCalledTimes(1);
      expect(mockReportsService.getRevisionEvidence).toHaveBeenCalledWith(
        testOrg,
        testReportId,
        testRevisionId,
      );
      expect(result).toEqual(mockEvidenceList);
    });

    it('propagates service rejection', async () => {
      mockReportsService.getRevisionEvidence.mockRejectedValue(
        new Error('Report revision not found.'),
      );

      await expect(
        controller.revisionEvidence(testOrg, testReportId, testRevisionId),
      ).rejects.toThrow('Report revision not found.');
    });
  });

  describe('listExports', () => {
    it('calls reports.listExports with organization and returns exports', async () => {
      const expectedExports: ExportRequest[] = [mockExportRequest];
      mockReportsService.listExports.mockResolvedValue(expectedExports);

      const result = await controller.listExports(testOrg);

      expect(mockReportsService.listExports).toHaveBeenCalledTimes(1);
      expect(mockReportsService.listExports).toHaveBeenCalledWith(testOrg);
      expect(result).toEqual(expectedExports);
    });

    it('propagates service rejection', async () => {
      mockReportsService.listExports.mockRejectedValue(
        new Error('Failed to list exports'),
      );

      await expect(controller.listExports(testOrg)).rejects.toThrow(
        'Failed to list exports',
      );
    });
  });

  describe('createExport', () => {
    const createExportDto: CreateExportDto = {
      reportId: testReportId,
      format: 'pdf',
    };

    it('calls reports.createExport with organization, body, and idempotencyKey', async () => {
      mockReportsService.createExport.mockResolvedValue(mockExportRequest);

      const result = await controller.createExport(
        testOrg,
        createExportDto,
        testIdempotencyKey,
      );

      expect(mockReportsService.createExport).toHaveBeenCalledTimes(1);
      expect(mockReportsService.createExport).toHaveBeenCalledWith(
        testOrg,
        createExportDto,
        testIdempotencyKey,
      );
      expect(result).toEqual(mockExportRequest);
    });

    it('supports optional idempotencyKey being undefined', async () => {
      mockReportsService.createExport.mockResolvedValue(mockExportRequest);

      const result = await controller.createExport(
        testOrg,
        createExportDto,
        undefined,
      );

      expect(mockReportsService.createExport).toHaveBeenCalledTimes(1);
      expect(mockReportsService.createExport).toHaveBeenCalledWith(
        testOrg,
        createExportDto,
        undefined,
      );
      expect(result).toEqual(mockExportRequest);
    });

    it('propagates service rejection', async () => {
      mockReportsService.createExport.mockRejectedValue(
        new Error('reportId or revisionId is required.'),
      );

      await expect(
        controller.createExport(testOrg, createExportDto, testIdempotencyKey),
      ).rejects.toThrow('reportId or revisionId is required.');
    });
  });

  describe('getExport', () => {
    it('calls reports.getExport with organization and exportId', async () => {
      mockReportsService.getExport.mockResolvedValue(mockExportRequest);

      const result = await controller.getExport(testOrg, testExportId);

      expect(mockReportsService.getExport).toHaveBeenCalledTimes(1);
      expect(mockReportsService.getExport).toHaveBeenCalledWith(
        testOrg,
        testExportId,
      );
      expect(result).toEqual(mockExportRequest);
    });

    it('propagates service rejection', async () => {
      mockReportsService.getExport.mockRejectedValue(
        new Error('Export not found.'),
      );

      await expect(controller.getExport(testOrg, testExportId)).rejects.toThrow(
        'Export not found.',
      );
    });
  });

  describe('downloadExport', () => {
    it('calls reports.downloadExport with organization and exportId', async () => {
      mockReportsService.downloadExport.mockResolvedValue(mockExportDownload);

      const result = await controller.downloadExport(testOrg, testExportId);

      expect(mockReportsService.downloadExport).toHaveBeenCalledTimes(1);
      expect(mockReportsService.downloadExport).toHaveBeenCalledWith(
        testOrg,
        testExportId,
      );
      expect(result).toEqual(mockExportDownload);
    });

    it('propagates service rejection', async () => {
      mockReportsService.downloadExport.mockRejectedValue(
        new Error('Completed export artifact not found.'),
      );

      await expect(
        controller.downloadExport(testOrg, testExportId),
      ).rejects.toThrow('Completed export artifact not found.');
    });
  });

  describe('events (SSE stream)', () => {
    it('maps initial event to MessageEvent structure with formatted id, type, and data', async () => {
      const runningStatus: ExportRequest = {
        ...mockExportRequest,
        status: 'running',
        startedAt: '2026-09-21T00:00:10.000Z',
        updatedAt: '2026-09-21T00:00:15.000Z',
      };
      mockReportsService.getExport.mockResolvedValue(runningStatus);

      const sseStream$ = await controller.events(testOrg, testExportId);

      const event = await firstValueFrom(sseStream$);

      expect(mockReportsService.getExport).toHaveBeenCalledTimes(1);
      expect(mockReportsService.getExport).toHaveBeenCalledWith(
        testOrg,
        testExportId,
      );
      expect(event).toEqual({
        type: 'export.progress',
        id: `${testExportId}:running:2026-09-21T00:00:15.000Z`,
        data: runningStatus,
      });
    });

    it('formats event id using finishedAt when finishedAt is present', async () => {
      const finishedStatus: ExportRequest = {
        ...mockExportRequest,
        status: 'succeeded',
        finishedAt: '2026-09-21T00:01:00.000Z',
        updatedAt: '2026-09-21T00:00:50.000Z',
      };
      mockReportsService.getExport.mockResolvedValue(finishedStatus);

      const sseStream$ = await controller.events(testOrg, testExportId);
      const event = await firstValueFrom(sseStream$);

      expect(event.id).toBe(
        `${testExportId}:succeeded:2026-09-21T00:01:00.000Z`,
      );
    });

    it('formats event id using updatedAt when finishedAt is null', async () => {
      const runningStatus: ExportRequest = {
        ...mockExportRequest,
        status: 'running',
        finishedAt: null,
        updatedAt: '2026-09-21T00:00:30.000Z',
      };
      mockReportsService.getExport.mockResolvedValue(runningStatus);

      const sseStream$ = await controller.events(testOrg, testExportId);
      const event = await firstValueFrom(sseStream$);

      expect(event.id).toBe(`${testExportId}:running:2026-09-21T00:00:30.000Z`);
    });

    it('terminates immediately when initial status is terminal (succeeded)', async () => {
      const succeededStatus: ExportRequest = {
        ...mockExportRequest,
        status: 'succeeded',
        finishedAt: '2026-09-21T00:01:00.000Z',
        artifact: {
          id: '018f7611-89ab-7abc-9234-art1111art1',
          filename: 'report.pdf',
          mediaType: 'application/pdf',
          byteCount: 1024,
          checksumHex: 'deadbeef1234',
          createdAt: '2026-09-21T00:01:00.000Z',
        },
      };

      mockReportsService.getExport.mockResolvedValue(succeededStatus);

      const sseStream$ = await controller.events(testOrg, testExportId);
      const events = await firstValueFrom(sseStream$.pipe(toArray()));

      expect(mockReportsService.getExport).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'export.progress',
        id: `${testExportId}:succeeded:2026-09-21T00:01:00.000Z`,
        data: succeededStatus,
      });
    });

    it('terminates immediately for all terminal states (succeeded, failed, cancelled)', async () => {
      for (const terminalStatus of TERMINAL_EXPORT_STATUSES) {
        mockReportsService.getExport.mockReset();

        const status: ExportRequest = {
          ...mockExportRequest,
          status: terminalStatus,
          finishedAt: '2026-09-21T00:01:00.000Z',
          failure:
            terminalStatus === 'failed'
              ? { code: 'rendering_failed', message: 'PDF rendering timed out' }
              : null,
        };

        mockReportsService.getExport.mockResolvedValue(status);

        const sseStream$ = await controller.events(testOrg, testExportId);
        const events = await firstValueFrom(sseStream$.pipe(toArray()));

        expect(mockReportsService.getExport).toHaveBeenCalledTimes(1);
        expect(events).toHaveLength(1);
        expect((events[0].data as ExportRequest).status).toBe(terminalStatus);
      }
    });

    it('emits consecutive progress events via polling until terminal state is reached, then completes', async () => {
      const step1Queued: ExportRequest = {
        ...mockExportRequest,
        status: 'queued',
        updatedAt: '2026-09-21T00:00:00.000Z',
      };

      const step2Running: ExportRequest = {
        ...mockExportRequest,
        status: 'running',
        startedAt: '2026-09-21T00:00:01.000Z',
        updatedAt: '2026-09-21T00:00:01.500Z',
      };

      const step3Succeeded: ExportRequest = {
        ...mockExportRequest,
        status: 'succeeded',
        startedAt: '2026-09-21T00:00:01.000Z',
        finishedAt: '2026-09-21T00:00:03.000Z',
        updatedAt: '2026-09-21T00:00:03.000Z',
        artifact: {
          id: '018f7611-89ab-7abc-9234-art1111art1',
          filename: 'report.pdf',
          mediaType: 'application/pdf',
          byteCount: 2048,
          checksumHex: 'cafebabe5678',
          createdAt: '2026-09-21T00:00:03.000Z',
        },
      };

      // Initial call gets step1Queued; polling ticks get step2Running then step3Succeeded
      mockReportsService.getExport
        .mockResolvedValueOnce(step1Queued)
        .mockResolvedValueOnce(step2Running)
        .mockResolvedValueOnce(step3Succeeded);

      const sseStream$ = await controller.events(testOrg, testExportId);
      const allEventsPromise = firstValueFrom(sseStream$.pipe(toArray()));

      // Advance timers for the two polling intervals (1500ms each)
      await jest.advanceTimersByTimeAsync(1500);
      await jest.advanceTimersByTimeAsync(1500);

      const events: MessageEvent[] = await allEventsPromise;

      expect(mockReportsService.getExport).toHaveBeenCalledTimes(3);
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        type: 'export.progress',
        id: `${testExportId}:queued:2026-09-21T00:00:00.000Z`,
        data: step1Queued,
      });
      expect(events[1]).toEqual({
        type: 'export.progress',
        id: `${testExportId}:running:2026-09-21T00:00:01.500Z`,
        data: step2Running,
      });
      expect(events[2]).toEqual({
        type: 'export.progress',
        id: `${testExportId}:succeeded:2026-09-21T00:00:03.000Z`,
        data: step3Succeeded,
      });
    });

    it('terminates stream when polling encounters failed or cancelled terminal states', async () => {
      for (const terminalStatus of ['failed', 'cancelled'] as const) {
        mockReportsService.getExport.mockReset();

        const initialRunning: ExportRequest = {
          ...mockExportRequest,
          status: 'running',
          startedAt: '2026-09-21T00:00:01.000Z',
          updatedAt: '2026-09-21T00:00:01.000Z',
        };

        const finalStatus: ExportRequest = {
          ...mockExportRequest,
          status: terminalStatus,
          startedAt: '2026-09-21T00:00:01.000Z',
          finishedAt: '2026-09-21T00:00:02.500Z',
          updatedAt: '2026-09-21T00:00:02.500Z',
          failure:
            terminalStatus === 'failed'
              ? { code: 'worker_timeout', message: 'Job timed out' }
              : { code: 'cancelled_by_user', message: null },
        };

        mockReportsService.getExport
          .mockResolvedValueOnce(initialRunning)
          .mockResolvedValueOnce(finalStatus);

        const sseStream$ = await controller.events(testOrg, testExportId);
        const allEventsPromise = firstValueFrom(sseStream$.pipe(toArray()));

        await jest.advanceTimersByTimeAsync(1500);

        const events = await allEventsPromise;
        expect(mockReportsService.getExport).toHaveBeenCalledTimes(2);
        expect(events).toHaveLength(2);
        expect((events[1].data as ExportRequest).status).toBe(terminalStatus);
      }
    });

    it('allows consumers to take a specific number of items using RxJS take operator', async () => {
      const runningStatus: ExportRequest = {
        ...mockExportRequest,
        status: 'running',
        startedAt: '2026-09-21T00:00:01.000Z',
        updatedAt: '2026-09-21T00:00:01.000Z',
      };
      mockReportsService.getExport.mockResolvedValue(runningStatus);

      const sseStream$ = await controller.events(testOrg, testExportId);
      const twoEventsPromise = firstValueFrom(
        sseStream$.pipe(take(2), toArray()),
      );

      await jest.advanceTimersByTimeAsync(1500);

      const events = await twoEventsPromise;
      expect(events).toHaveLength(2);
      expect(mockReportsService.getExport).toHaveBeenCalledTimes(2);
    });

    it('propagates error when initial getExport fails', async () => {
      mockReportsService.getExport.mockRejectedValue(
        new Error('Export not found.'),
      );

      await expect(controller.events(testOrg, testExportId)).rejects.toThrow(
        'Export not found.',
      );
    });

    it('propagates error when polling getExport encounters an error', async () => {
      const initialRunning: ExportRequest = {
        ...mockExportRequest,
        status: 'running',
      };

      mockReportsService.getExport
        .mockResolvedValueOnce(initialRunning)
        .mockRejectedValueOnce(new Error('Connection lost during poll'));

      const sseStream$ = await controller.events(testOrg, testExportId);
      const allEventsPromise = firstValueFrom(sseStream$.pipe(toArray()));
      const assertion = expect(allEventsPromise).rejects.toThrow(
        'Connection lost during poll',
      );

      await jest.advanceTimersByTimeAsync(1500);

      await assertion;
    });
  });
});
