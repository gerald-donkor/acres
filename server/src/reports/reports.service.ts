import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  CreateExportInput,
  CreateRevisionInput,
  CreateReportInput,
  ExportRequest,
  Report,
  ReportEvidenceInput,
  UpdateReportInput,
  UpdateRevisionInput,
} from '@acres/shared';
import { ApiException } from '../common/api-exception';
import { AcresConfigService } from '../config/acres-config.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { OrganizationContext } from '../organizations/organization-context';
import { OutboxService } from '../outbox/outbox.service';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../storage/storage.port';
import {
  ReportsRepository,
  type ReportsTx,
  revisionInclude,
} from './reports.repository';

const RENDERING_VERSION = 'reports-v1';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly reports: ReportsRepository,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxService,
    private readonly config: AcresConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  listReports(organization: OrganizationContext): Promise<Report[]> {
    return this.reports.organizationScoped(organization, async (tx) => {
      const rows = await this.reports.listReports(
        tx,
        organization.organizationId,
        reportVisibility(organization),
      );
      return rows.map((r) => toReport(r, this.config.aiDraftEnabled));
    });
  }

  getReport(
    organization: OrganizationContext,
    reportId: string,
  ): Promise<Report> {
    return this.reports.organizationScoped(organization, async (tx) => {
      const row = await this.reports.findReport(
        tx,
        organization.organizationId,
        reportId,
        reportVisibility(organization),
      );
      if (row === null) throw ApiException.notFound('Report not found.');
      return toReport(row, this.config.aiDraftEnabled);
    });
  }

  getRevisionEvidence(
    organization: OrganizationContext,
    reportId: string,
    revisionId: string,
  ): Promise<NonNullable<Report['latestRevision']>['evidence']> {
    return this.reports.organizationScoped(organization, async (tx) => {
      const revision = await tx.reportRevision.findFirst({
        where: {
          id: revisionId,
          reportId,
          organizationId: organization.organizationId,
          ...(reportVisibility(organization) === 'published'
            ? { status: 'published' as const }
            : {}),
        },
        include: revisionInclude(),
      });
      if (revision === null)
        throw ApiException.notFound('Report revision not found.');
      return toRevision(revision).evidence;
    });
  }

  createReport(
    organization: OrganizationContext,
    input: CreateReportInput,
    idempotencyKey?: string,
  ): Promise<Report> {
    const body = normalizeCreate(input);
    return this.reports.organizationScoped(organization, (tx) =>
      this.idempotency.run(
        tx,
        {
          key: idempotencyKey,
          accountId: organization.accountId,
          organizationId: organization.organizationId,
          operation: 'reports.create',
          requestBody: body,
          responseStatus: 201,
        },
        async () => {
          const report = await tx.report.create({
            data: {
              organizationId: organization.organizationId,
              ownerAccountId: organization.accountId,
              createdByAccountId: organization.accountId,
              title: body.title,
              summary: body.summary,
            },
          });
          const revision = await tx.reportRevision.create({
            data: {
              organizationId: organization.organizationId,
              reportId: report.id,
              revisionNumber: 1,
              title: body.title,
              summary: body.summary,
              authorAccountId: organization.accountId,
            },
          });
          await this.replaceRevisionContent(tx, organization, revision.id, {
            insights: body.insights,
            evidence: body.evidence,
          });
          const row = await this.reports.findReport(
            tx,
            organization.organizationId,
            report.id,
          );
          if (row === null) throw ApiException.notFound('Report not found.');
          return toReport(row, this.config.aiDraftEnabled);
        },
      ),
    );
  }

  updateReport(
    organization: OrganizationContext,
    reportId: string,
    input: UpdateReportInput,
  ): Promise<Report> {
    return this.reports.organizationScoped(organization, async (tx) => {
      const existing = await tx.report.findFirst({
        where: { id: reportId, organizationId: organization.organizationId },
      });
      if (existing === null) throw ApiException.notFound('Report not found.');
      if (existing.version !== input.expectedVersion) {
        throw ApiException.conflict('Report was changed by another request.');
      }
      await tx.report.update({
        where: { id: existing.id },
        data: {
          title: input.title?.trim(),
          summary:
            input.summary === undefined
              ? undefined
              : optionalText(input.summary),
          version: { increment: 1 },
        },
      });
      const row = await this.reports.findReport(
        tx,
        organization.organizationId,
        reportId,
      );
      if (row === null) throw ApiException.notFound('Report not found.');
      return toReport(row, this.config.aiDraftEnabled);
    });
  }

  updateRevision(
    organization: OrganizationContext,
    reportId: string,
    revisionId: string,
    input: UpdateRevisionInput,
  ): Promise<Report> {
    return this.reports.organizationScoped(organization, async (tx) => {
      const revision = await tx.reportRevision.findFirst({
        where: {
          id: revisionId,
          reportId,
          organizationId: organization.organizationId,
        },
      });
      if (revision === null)
        throw ApiException.notFound('Report revision not found.');
      if (revision.status === 'published' || revision.status === 'superseded') {
        throw ApiException.conflict('Published revisions are immutable.');
      }
      const report = await tx.report.findFirst({
        where: { id: reportId, organizationId: organization.organizationId },
      });
      if (report === null) throw ApiException.notFound('Report not found.');
      if (report.version !== input.expectedVersion) {
        throw ApiException.conflict('Report was changed by another request.');
      }
      await tx.reportRevision.update({
        where: { id: revision.id },
        data: {
          title: input.title?.trim(),
          summary:
            input.summary === undefined
              ? undefined
              : optionalText(input.summary),
        },
      });
      await this.replaceRevisionContent(tx, organization, revision.id, input);
      await tx.report.update({
        where: { id: reportId },
        data: { version: { increment: 1 }, updatedAt: new Date() },
      });
      const row = await this.reports.findReport(
        tx,
        organization.organizationId,
        reportId,
      );
      if (row === null) throw ApiException.notFound('Report not found.');
      return toReport(row, this.config.aiDraftEnabled);
    });
  }

  createRevision(
    organization: OrganizationContext,
    reportId: string,
    input: CreateRevisionInput,
    idempotencyKey?: string,
  ): Promise<Report> {
    return this.reports.organizationScoped(organization, (tx) =>
      this.idempotency.run(
        tx,
        {
          key: idempotencyKey,
          accountId: organization.accountId,
          organizationId: organization.organizationId,
          operation: `reports.revisions.create:${reportId}`,
          requestBody: input,
          responseStatus: 201,
        },
        async () => {
          const report = await tx.report.findFirst({
            where: {
              id: reportId,
              organizationId: organization.organizationId,
              status: { not: 'archived' },
            },
            include: {
              revisions: {
                orderBy: { revisionNumber: 'desc' },
                take: 1,
                include: revisionInclude(),
              },
            },
          });
          if (report === null) throw ApiException.notFound('Report not found.');
          if (report.version !== input.expectedVersion) {
            throw ApiException.conflict(
              'Report was changed by another request.',
            );
          }
          const latest = report.revisions[0];
          if (latest?.status === 'draft' || latest?.status === 'in_review') {
            throw ApiException.conflict('A draft revision already exists.');
          }
          const revision = await tx.reportRevision.create({
            data: {
              organizationId: organization.organizationId,
              reportId,
              revisionNumber: (latest?.revisionNumber ?? 0) + 1,
              title: input.title?.trim() ?? latest?.title ?? report.title,
              summary:
                input.summary === undefined
                  ? (latest?.summary ?? report.summary)
                  : optionalText(input.summary),
              sections: latest?.sections ?? [],
              authorAccountId: organization.accountId,
            },
          });
          await this.replaceRevisionContent(tx, organization, revision.id, {
            insights:
              input.insights ??
              latest?.insights.map((insight) => ({
                heading: insight.heading,
                body: insight.body,
              })) ??
              [],
            evidence:
              input.evidence ??
              latest?.evidence.map((evidence) => ({
                aggregateId: evidence.aggregateId ?? undefined,
                dashboardViewId: evidence.dashboardViewId ?? undefined,
              })) ??
              [],
          });
          await tx.report.update({
            where: { id: reportId },
            data: { version: { increment: 1 }, updatedAt: new Date() },
          });
          const row = await this.reports.findReport(
            tx,
            organization.organizationId,
            reportId,
          );
          if (row === null) throw ApiException.notFound('Report not found.');
          return toReport(row, this.config.aiDraftEnabled);
        },
      ),
    );
  }

  submitRevisionForReview(
    organization: OrganizationContext,
    reportId: string,
    revisionId: string,
    idempotencyKey?: string,
  ): Promise<Report> {
    return this.reports.organizationScoped(organization, (tx) =>
      this.idempotency.run(
        tx,
        {
          key: idempotencyKey,
          accountId: organization.accountId,
          organizationId: organization.organizationId,
          operation: `reports.submit_review:${revisionId}`,
          requestBody: {},
          responseStatus: 200,
        },
        async () => {
          const revision = await tx.reportRevision.findFirst({
            where: {
              id: revisionId,
              reportId,
              organizationId: organization.organizationId,
            },
            include: revisionInclude(),
          });
          if (revision === null) {
            throw ApiException.notFound('Report revision not found.');
          }
          if (revision.status !== 'draft') {
            throw ApiException.conflict(
              'Only draft revisions can be submitted for review.',
            );
          }
          if (
            revision.insights.length === 0 ||
            revision.evidence.length === 0
          ) {
            throw ApiException.validationFailed([
              'A report submitted for review requires at least one insight and one evidence link.',
            ]);
          }
          await tx.reportRevision.update({
            where: { id: revision.id },
            data: {
              status: 'in_review',
              reviewerAccountId: null,
              submittedForReviewAt: new Date(),
            },
          });
          await tx.report.update({
            where: { id: reportId },
            data: { version: { increment: 1 }, updatedAt: new Date() },
          });
          const current = await this.reports.findReport(
            tx,
            organization.organizationId,
            reportId,
          );
          if (current === null) {
            throw ApiException.notFound('Report not found.');
          }
          return toReport(current, this.config.aiDraftEnabled);
        },
      ),
    );
  }

  publishRevision(
    organization: OrganizationContext,
    reportId: string,
    revisionId: string,
    idempotencyKey?: string,
  ): Promise<Report> {
    return this.reports.organizationScoped(organization, (tx) =>
      this.idempotency.run(
        tx,
        {
          key: idempotencyKey,
          accountId: organization.accountId,
          organizationId: organization.organizationId,
          operation: `reports.publish:${revisionId}`,
          requestBody: {},
          responseStatus: 200,
        },
        async () => {
          const revision = await tx.reportRevision.findFirst({
            where: {
              id: revisionId,
              reportId,
              organizationId: organization.organizationId,
            },
            include: revisionInclude(),
          });
          if (revision === null)
            throw ApiException.notFound('Report revision not found.');
          if (revision.status === 'published') {
            const current = await this.reports.findReport(
              tx,
              organization.organizationId,
              reportId,
            );
            if (current === null)
              throw ApiException.notFound('Report not found.');
            return toReport(current, this.config.aiDraftEnabled);
          }
          if (
            revision.insights.length === 0 ||
            revision.evidence.length === 0
          ) {
            throw ApiException.validationFailed([
              'A published report requires at least one insight and one evidence link.',
            ]);
          }
          await tx.reportRevision.updateMany({
            where: {
              organizationId: organization.organizationId,
              reportId,
              status: 'published',
            },
            data: { status: 'superseded' },
          });
          await tx.reportRevision.update({
            where: { id: revision.id },
            data: {
              status: 'published',
              publisherAccountId: organization.accountId,
              publishedAt: new Date(),
            },
          });
          await tx.report.update({
            where: { id: reportId },
            data: {
              status: 'published',
              version: { increment: 1 },
              updatedAt: new Date(),
            },
          });
          await tx.auditEvent.create({
            data: {
              organizationId: organization.organizationId,
              actorAccountId: organization.accountId,
              action: 'report_published',
              targetType: 'ReportRevision',
              targetId: revision.id,
              details: { reportId },
            },
          });
          const current = await this.reports.findReport(
            tx,
            organization.organizationId,
            reportId,
          );
          if (current === null)
            throw ApiException.notFound('Report not found.');
          return toReport(current, this.config.aiDraftEnabled);
        },
      ),
    );
  }

  listExports(organization: OrganizationContext): Promise<ExportRequest[]> {
    return this.reports.organizationScoped(organization, async (tx) => {
      const rows = await this.reports.listExports(
        tx,
        organization.organizationId,
      );
      return rows.map(toExport);
    });
  }

  getExport(
    organization: OrganizationContext,
    exportId: string,
  ): Promise<ExportRequest> {
    return this.reports.organizationScoped(organization, async (tx) => {
      const row = await this.reports.findExport(
        tx,
        organization.organizationId,
        exportId,
      );
      if (row === null) throw ApiException.notFound('Export not found.');
      return toExport(row);
    });
  }

  createExport(
    organization: OrganizationContext,
    input: CreateExportInput,
    idempotencyKey?: string,
  ): Promise<ExportRequest> {
    if (!input.reportId && !input.revisionId) {
      throw ApiException.validationFailed([
        'reportId or revisionId is required.',
      ]);
    }
    return this.reports.organizationScoped(organization, (tx) =>
      this.idempotency.run(
        tx,
        {
          key: idempotencyKey,
          accountId: organization.accountId,
          organizationId: organization.organizationId,
          operation: 'exports.create',
          requestBody: input,
          responseStatus: 201,
        },
        async () => {
          const target = await this.resolveExportTarget(
            tx,
            organization,
            input,
          );
          const deterministicKey = `export:${target.revisionId}:${input.format}:${randomUUID()}`;
          const row = await tx.exportRequest.create({
            data: {
              organizationId: organization.organizationId,
              requestedByAccountId: organization.accountId,
              reportId: target.reportId,
              revisionId: target.revisionId,
              format: input.format,
              deterministicKey,
              renderingVersion: RENDERING_VERSION,
            },
            include: { artifact: true },
          });
          await tx.auditEvent.create({
            data: {
              organizationId: organization.organizationId,
              actorAccountId: organization.accountId,
              action: 'export_requested',
              targetType: 'ExportRequest',
              targetId: row.id,
              details: { format: input.format, reportId: target.reportId },
            },
          });
          await this.outbox.appendExportRequested(tx, {
            organizationId: organization.organizationId,
            exportRequestId: row.id,
          });
          return toExport(row);
        },
      ),
    );
  }

  async downloadExport(organization: OrganizationContext, exportId: string) {
    return this.reports.organizationScoped(organization, async (tx) => {
      const row = await tx.exportRequest.findFirst({
        where: { id: exportId, organizationId: organization.organizationId },
        include: { artifact: { include: { storedObject: true } } },
      });
      if (row === null || row.status !== 'succeeded' || row.artifact === null) {
        throw ApiException.notFound('Completed export artifact not found.');
      }
      const signed = await this.storage.presignGet({
        key: row.artifact.storedObject.objectKey,
        filename: row.artifact.filename,
        mediaType: row.artifact.mediaType,
      });
      return {
        url: signed.url,
        method: signed.method,
        headers: signed.headers,
        expiresAt: signed.expiresAt.toISOString(),
      };
    });
  }

  async processExport(exportRequestId: string): Promise<void> {
    const request = await this.reports.workerScoped((tx) =>
      tx.exportRequest.findUnique({
        where: { id: exportRequestId },
        include: { artifact: true },
      }),
    );
    if (request === null || request.status === 'succeeded') return;
    await this.reports.workerScoped((tx) =>
      tx.exportRequest.update({
        where: { id: request.id },
        data: { status: 'running', startedAt: new Date() },
      }),
    );
    try {
      const revision = await this.reports.workerScoped((tx) =>
        tx.reportRevision.findFirst({
          where: {
            id: request.revisionId ?? undefined,
            organizationId: request.organizationId,
            status: 'published',
          },
          include: revisionInclude(),
        }),
      );
      if (revision === null) {
        throw new ExportFailure(
          'missing_revision',
          'Published revision not found.',
        );
      }
      const rendered =
        request.format === 'csv' ? renderCsv(revision) : renderPdf(revision);
      const checksumHex = createHash('sha256')
        .update(rendered.body)
        .digest('hex');
      const objectKey = `organizations/${request.organizationId}/exports/${request.id}/${rendered.filename}`;
      await this.storage.putBuffer({
        key: objectKey,
        body: rendered.body,
        mediaType: rendered.mediaType,
        checksumHex,
      });
      await this.reports.workerScoped(async (tx) => {
        const object = await tx.storedObject.create({
          data: {
            organizationId: request.organizationId,
            bucket: this.config.storageBucket,
            objectKey,
            originalFilename: rendered.filename,
            mediaType: rendered.mediaType,
            byteCount: BigInt(rendered.body.byteLength),
            checksumAlgorithm: 'sha256',
            checksumHex,
            state: 'accepted',
          },
        });
        await tx.exportArtifact.create({
          data: {
            organizationId: request.organizationId,
            exportRequestId: request.id,
            storedObjectId: object.id,
            filename: rendered.filename,
            mediaType: rendered.mediaType,
            byteCount: BigInt(rendered.body.byteLength),
            checksumHex,
          },
        });
        await tx.exportRequest.update({
          where: { id: request.id },
          data: {
            status: 'succeeded',
            finishedAt: new Date(),
            expiresAt: new Date(
              Date.now() + this.config.acceptedDownloadTtlSeconds * 1000,
            ),
          },
        });
      });
    } catch (error) {
      const failure =
        error instanceof ExportFailure
          ? error
          : new ExportFailure('render_failed', 'Export rendering failed.');
      this.logger.warn(`Export ${exportRequestId} failed: ${failure.code}`);
      await this.reports.workerScoped((tx) =>
        tx.exportRequest.update({
          where: { id: exportRequestId },
          data: {
            status: 'failed',
            failureCode: failure.code,
            failureMessage: failure.message,
            finishedAt: new Date(),
          },
        }),
      );
    }
  }

  private async replaceRevisionContent(
    tx: ReportsTx,
    organization: OrganizationContext,
    revisionId: string,
    input: Pick<UpdateRevisionInput, 'insights' | 'evidence'>,
  ): Promise<void> {
    if (input.insights !== undefined) {
      await tx.reportEvidence.deleteMany({
        where: { organizationId: organization.organizationId, revisionId },
      });
      await tx.reportInsight.deleteMany({
        where: { organizationId: organization.organizationId, revisionId },
      });
      for (const [position, insight] of input.insights.entries()) {
        await tx.reportInsight.create({
          data: {
            organizationId: organization.organizationId,
            revisionId,
            authorAccountId: organization.accountId,
            position,
            heading: insight.heading.trim(),
            body: insight.body.trim(),
          },
        });
      }
    }
    if (input.evidence !== undefined) {
      await tx.reportEvidence.deleteMany({
        where: { organizationId: organization.organizationId, revisionId },
      });
      for (const [position, evidence] of input.evidence.entries()) {
        const resolved = await this.resolveEvidence(
          tx,
          organization.organizationId,
          evidence,
        );
        await tx.reportEvidence.create({
          data: {
            organizationId: organization.organizationId,
            revisionId,
            evidenceType: resolved.evidenceType,
            aggregateId: resolved.aggregateId,
            dashboardViewId: resolved.dashboardViewId,
            metricDefinitionId: resolved.metricDefinitionId,
            datasetVersionId: resolved.datasetVersionId,
            snapshot: resolved.snapshot,
            position,
          },
        });
      }
    }
  }

  private async resolveEvidence(
    tx: ReportsTx,
    organizationId: string,
    input: ReportEvidenceInput,
  ) {
    if (input.aggregateId && input.dashboardViewId) {
      throw ApiException.validationFailed([
        'Evidence must reference either aggregateId or dashboardViewId.',
      ]);
    }
    if (input.aggregateId) {
      const aggregate = await tx.metricAggregate.findFirst({
        where: { id: input.aggregateId, organizationId },
        include: { metricDefinition: true },
      });
      if (aggregate === null)
        throw ApiException.notFound('Evidence aggregate not found.');
      return {
        evidenceType: 'aggregate' as const,
        aggregateId: aggregate.id,
        dashboardViewId: null,
        metricDefinitionId: aggregate.metricDefinitionId,
        datasetVersionId: aggregate.datasetVersionId,
        snapshot: {
          aggregateId: aggregate.id,
          metric: {
            id: aggregate.metricDefinition.id,
            key: aggregate.metricDefinition.key,
            label: aggregate.metricDefinition.label,
            unit: aggregate.unit,
            calculationVersion: aggregate.calculationVersion,
          },
          value:
            aggregate.numericValue?.toString() ??
            aggregate.textValue ??
            aggregate.booleanValue,
          periodStart: aggregate.periodStart.toISOString(),
          periodEnd: aggregate.periodEnd.toISOString(),
          regionId: aggregate.regionId,
          observationCount: aggregate.observationCount,
          datasetVersionId: aggregate.datasetVersionId,
        },
      };
    }
    if (input.dashboardViewId) {
      const view = await tx.dashboardView.findFirst({
        where: { id: input.dashboardViewId, organizationId, status: 'active' },
      });
      if (view === null)
        throw ApiException.notFound('Evidence dashboard view not found.');
      return {
        evidenceType: 'dashboard_view' as const,
        aggregateId: null,
        dashboardViewId: view.id,
        metricDefinitionId: null,
        datasetVersionId: null,
        snapshot: {
          dashboardViewId: view.id,
          name: view.name,
          filters: view.filters,
          presentation: view.presentation,
        },
      };
    }
    throw ApiException.validationFailed([
      'Evidence must include aggregateId or dashboardViewId.',
    ]);
  }

  private async resolveExportTarget(
    tx: ReportsTx,
    organization: OrganizationContext,
    input: CreateExportInput,
  ) {
    if (input.revisionId) {
      const revision = await tx.reportRevision.findFirst({
        where: {
          id: input.revisionId,
          organizationId: organization.organizationId,
          status: 'published',
        },
      });
      if (revision === null)
        throw ApiException.notFound('Published revision not found.');
      return { reportId: revision.reportId, revisionId: revision.id };
    }
    const report = await this.reports.findReport(
      tx,
      organization.organizationId,
      input.reportId ?? '',
    );
    const revision = report?.revisions[0];
    if (
      report === null ||
      revision === undefined ||
      revision.status !== 'published'
    ) {
      throw ApiException.notFound('Published report revision not found.');
    }
    return { reportId: report.id, revisionId: revision.id };
  }
}

class ExportFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function reportVisibility(
  organization: OrganizationContext,
): 'all' | 'published' {
  return organization.role === 'viewer' ? 'published' : 'all';
}

function normalizeCreate(input: CreateReportInput): CreateReportInput & {
  insights: NonNullable<CreateReportInput['insights']>;
  evidence: NonNullable<CreateReportInput['evidence']>;
} {
  return {
    title: input.title.trim(),
    summary: optionalText(input.summary) ?? undefined,
    insights: input.insights ?? [],
    evidence: input.evidence ?? [],
  };
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

function toReport(
  row: {
    id: string;
    title: string;
    summary: string | null;
    status: string;
    version: number;
    ownerAccountId: string;
    createdByAccountId: string;
    createdAt: Date;
    updatedAt: Date;
    revisions: Array<Parameters<typeof toRevision>[0]>;
  },
  aiDraftEnabled = false,
): Report {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status as Report['status'],
    version: row.version,
    ownerAccountId: row.ownerAccountId,
    createdByAccountId: row.createdByAccountId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    latestRevision: row.revisions[0] ? toRevision(row.revisions[0]) : null,
    aiDraftEnabled,
  };
}

function toRevision(row: {
  id: string;
  reportId: string;
  revisionNumber: number;
  status: string;
  title: string;
  summary: string | null;
  sections: unknown;
  authorAccountId: string;
  reviewerAccountId: string | null;
  publisherAccountId: string | null;
  submittedForReviewAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  insights: Array<{
    id: string;
    position: number;
    heading: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  evidence: Array<{
    id: string;
    evidenceType: string;
    aggregateId: string | null;
    dashboardViewId: string | null;
    metricDefinitionId: string | null;
    datasetVersionId: string | null;
    observationId: string | null;
    snapshot: unknown;
    position: number;
    createdAt: Date;
  }>;
}) {
  return {
    id: row.id,
    reportId: row.reportId,
    revisionNumber: row.revisionNumber,
    status: row.status as Report['latestRevision'] extends infer R
      ? R extends { status: infer S }
        ? S
        : never
      : never,
    title: row.title,
    summary: row.summary,
    sections: Array.isArray(row.sections) ? row.sections : [],
    authorAccountId: row.authorAccountId,
    reviewerAccountId: row.reviewerAccountId,
    publisherAccountId: row.publisherAccountId,
    submittedForReviewAt: row.submittedForReviewAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    insights: row.insights.map((insight) => ({
      id: insight.id,
      position: insight.position,
      heading: insight.heading,
      body: insight.body,
      createdAt: insight.createdAt.toISOString(),
      updatedAt: insight.updatedAt.toISOString(),
    })),
    evidence: row.evidence.map((evidence) => ({
      id: evidence.id,
      evidenceType: evidence.evidenceType as 'aggregate' | 'dashboard_view',
      aggregateId: evidence.aggregateId,
      dashboardViewId: evidence.dashboardViewId,
      metricDefinitionId: evidence.metricDefinitionId,
      datasetVersionId: evidence.datasetVersionId,
      observationId: evidence.observationId,
      snapshot: asRecord(evidence.snapshot),
      position: evidence.position,
      createdAt: evidence.createdAt.toISOString(),
    })),
  };
}

function toExport(row: {
  id: string;
  reportId: string | null;
  revisionId: string | null;
  format: string;
  status: string;
  renderingVersion: string;
  failureCode: string | null;
  failureMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  artifact: {
    id: string;
    filename: string;
    mediaType: string;
    byteCount: bigint;
    checksumHex: string;
    createdAt: Date;
  } | null;
}): ExportRequest {
  return {
    id: row.id,
    reportId: row.reportId,
    revisionId: row.revisionId,
    format: row.format as ExportRequest['format'],
    status: row.status as ExportRequest['status'],
    renderingVersion: row.renderingVersion,
    failure:
      row.failureCode === null
        ? null
        : { code: row.failureCode, message: row.failureMessage },
    artifact:
      row.artifact === null
        ? null
        : {
            id: row.artifact.id,
            filename: row.artifact.filename,
            mediaType: row.artifact.mediaType,
            byteCount: Number(row.artifact.byteCount),
            checksumHex: row.artifact.checksumHex,
            createdAt: row.artifact.createdAt.toISOString(),
          },
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function renderCsv(revision: Parameters<typeof toRevision>[0]) {
  const rows = [
    ['Report', revision.title],
    ['Revision', String(revision.revisionNumber)],
    ['Published At', revision.publishedAt?.toISOString() ?? ''],
    [],
    ['Insight', 'Body'],
    ...revision.insights.map((insight) => [insight.heading, insight.body]),
    [],
    ['Evidence Type', 'Metric or View', 'Value', 'Dataset Version'],
    ...revision.evidence.map((evidence) => {
      const snapshot = asRecord(evidence.snapshot);
      const metric = asRecord(snapshot.metric);
      return [
        evidence.evidenceType,
        scalarText(metric.label ?? snapshot.name),
        scalarText(snapshot.value),
        scalarText(snapshot.datasetVersionId),
      ];
    }),
  ];
  return {
    filename: safeFilename(`${revision.title}-report.csv`),
    mediaType: 'text/csv',
    body: Buffer.from(rows.map(csvRow).join('\r\n'), 'utf8'),
  };
}

function csvRow(cells: unknown[]): string {
  return cells
    .map((cell) => {
      const escaped = escapeFormula(scalarText(cell));
      return `"${escaped.replace(/"/g, '""')}"`;
    })
    .join(',');
}

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

export function escapeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export function renderPdf(revision: Parameters<typeof toRevision>[0]) {
  const lines = [
    revision.title,
    revision.summary ?? '',
    `Revision ${revision.revisionNumber}`,
    ...revision.insights.flatMap((insight) => [insight.heading, insight.body]),
  ].map((line) => line.replace(/[()\\]/g, '\\$&').slice(0, 180));
  const stream = [
    'BT',
    '/F1 18 Tf',
    '72 760 Td',
    ...lines.flatMap((line, index) => [
      index === 0 ? '' : '0 -24 Td',
      `(${line}) Tj`,
    ]),
    'ET',
  ].join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj\n`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }
  const startXref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;
  return {
    filename: safeFilename(`${revision.title}-report.pdf`),
    mediaType: 'application/pdf',
    body: Buffer.from(pdf, 'utf8'),
  };
}

function safeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180)
    .toLowerCase();
}
