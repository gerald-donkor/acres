import { Inject, Injectable, Logger } from '@nestjs/common';
import { AnalyticsPublicationService } from '../analytics/analytics-publication.service';
import {
  malformedMetricMappingIssues,
  parseAnalyticsMapping,
} from '../analytics/mapping';
import type { Prisma } from '../generated/prisma/client';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../storage/storage.port';
import type { ParserIssue, ParsedSourceSummary } from './parsers/parser.types';
import { SourceParserService } from './parsers/source-parser.service';

@Injectable()
export class IngestionProcessorService {
  private readonly logger = new Logger(IngestionProcessorService.name);

  constructor(
    private readonly tenants: TenantTransactionService,
    private readonly parsers: SourceParserService,
    private readonly analytics: AnalyticsPublicationService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async processRun(runId: string): Promise<void> {
    const reserved = await this.tenants.workerScoped((tx) =>
      tx.ingestionRun.findUnique({
        where: { id: runId },
        include: {
          upload: { include: { storedObject: true } },
          mapping: true,
        },
      }),
    );
    if (reserved === null) return;
    if (reserved.state === 'published' || reserved.state === 'cancelled')
      return;

    try {
      await this.tenants.organizationScoped(
        reserved.actorAccountId,
        reserved.organizationId,
        async (tx) => {
          await tx.ingestionRun.update({
            where: { id: runId },
            data: {
              state: 'running',
              stage: 'inspect',
              progressPercent: 10,
              attempts: { increment: 1 },
              startedAt: reserved.startedAt ?? new Date(),
              failureCode: null,
              failureMessage: null,
            },
          });
        },
      );

      const bytes = await this.storage.getBuffer(
        reserved.upload.storedObject.objectKey,
      );
      if (bytes === null) {
        await this.fail(
          reserved,
          'object_missing',
          'Accepted upload object is missing.',
        );
        return;
      }

      const summary = await this.parsers.inspect(
        bytes,
        reserved.upload.declaredMediaType,
      );
      const malformedMetricIssues: ParserIssue[] = malformedMetricMappingIssues(
        reserved.mapping.mapping,
      );
      const mapping = parseAnalyticsMapping(reserved.mapping.mapping);
      const validationIssues = await this.validateMapping(
        reserved.organizationId,
        summary,
        mapping,
      );
      const analyticsIssues: ParserIssue[] = this.analytics.validateMapping({
        summaryColumns: summary.columnKeys,
        mapping,
      });
      const issues: ParserIssue[] = [
        ...summary.issues,
        ...validationIssues,
        ...malformedMetricIssues,
        ...analyticsIssues,
      ];
      const hasErrors = issues.some((issue) => issue.severity === 'error');

      await this.tenants.organizationScoped(
        reserved.actorAccountId,
        reserved.organizationId,
        async (tx) => {
          const fresh = await tx.ingestionRun.findFirst({
            where: { id: runId, organizationId: reserved.organizationId },
          });
          if (fresh === null || fresh.state === 'cancelled') return;
          await tx.validationIssue.deleteMany({
            where: {
              ingestionRunId: runId,
              organizationId: reserved.organizationId,
            },
          });
          await tx.stagedSourceSummary.deleteMany({
            where: {
              ingestionRunId: runId,
              organizationId: reserved.organizationId,
            },
          });
          await tx.stagedSourceSummary.create({
            data: {
              organizationId: reserved.organizationId,
              ingestionRunId: runId,
              rowCount: summary.rowCount,
              columnCount: summary.columnCount,
              sampleRows: summary.sampleRows,
              columnKeys: summary.columnKeys,
              sourceKind: summary.sourceKind,
              checksumHex: reserved.upload.checksumHex,
            },
          });
          if (issues.length > 0) {
            await tx.validationIssue.createMany({
              data: issues.map((issue) => ({
                organizationId: reserved.organizationId,
                ingestionRunId: runId,
                severity: issue.severity,
                code: issue.code,
                message: issue.message,
                rowNumber: issue.rowNumber,
                columnKey: issue.columnKey,
                regionRef:
                  typeof issue.details?.regionRef === 'string'
                    ? issue.details.regionRef
                    : undefined,
                details:
                  issue.details === undefined
                    ? undefined
                    : (issue.details as Prisma.InputJsonValue),
              })),
            });
          }
          if (hasErrors) {
            await tx.columnMapping.update({
              where: { id: reserved.mappingId },
              data: { validationStatus: 'invalid' },
            });
            await tx.ingestionRun.update({
              where: { id: runId },
              data: {
                state: 'validation_failed',
                stage: 'validate',
                progressPercent: 100,
                failureCode: 'validation_failed',
                failureMessage:
                  'Ingestion validation produced blocking issues.',
                finishedAt: new Date(),
              },
            });
            return;
          }

          const datasetVersion = await this.publishVersion(
            tx,
            reserved,
            summary,
          );
          await this.analytics.publish(tx, {
            organizationId: reserved.organizationId,
            datasetId: reserved.datasetId,
            datasetVersionId: datasetVersion.id,
            summary,
            mapping,
          });
          await tx.columnMapping.update({
            where: { id: reserved.mappingId },
            data: { validationStatus: 'valid' },
          });
          await tx.dataset.update({
            where: { id: reserved.datasetId },
            data: { state: 'active' },
          });
          await tx.ingestionRun.update({
            where: { id: runId },
            data: {
              datasetVersionId: datasetVersion.id,
              state: 'published',
              stage: 'complete',
              progressPercent: 100,
              finishedAt: new Date(),
            },
          });
        },
      );
    } catch (error) {
      await this.fail(
        reserved,
        'analytics_publication_failed',
        error instanceof Error
          ? error.message
          : 'Analytics publication failed.',
      );
    }
  }

  private async validateMapping(
    organizationId: string,
    summary: ParsedSourceSummary,
    mapping: {
      readonly regionColumn?: string;
      readonly regionCodeColumn?: string;
    },
  ): Promise<ParserIssue[]> {
    const issues: ParserIssue[] = [];
    const regionColumn = mapping.regionCodeColumn ?? mapping.regionColumn;
    if (!regionColumn) {
      issues.push({
        severity: 'error',
        code: 'mapping_region_missing',
        message: 'Mapping must include a regionColumn or regionCodeColumn.',
      });
      return issues;
    }
    if (!summary.columnKeys.includes(regionColumn)) {
      issues.push({
        severity: 'error',
        code: 'mapping_column_missing',
        message: 'Mapped region column is not present in the source.',
        columnKey: regionColumn,
      });
      return issues;
    }

    const samples = summary.validationRows
      .map((row) => ({
        rowNumber: row.rowNumber,
        value: row.values[regionColumn],
      }))
      .filter(
        (row): row is { rowNumber: number; value: string } =>
          typeof row.value === 'string',
      );
    for (const sample of samples) {
      const matches = await this.matchRegion(organizationId, sample.value);
      if (matches === 0) {
        issues.push({
          severity: 'error',
          code: 'region_unmatched',
          message: 'Mapped region value did not match a known region.',
          rowNumber: sample.rowNumber,
          columnKey: regionColumn,
          details: { regionRef: sample.value },
        });
      } else if (matches > 1) {
        issues.push({
          severity: 'error',
          code: 'region_ambiguous',
          message: 'Mapped region value matches more than one known region.',
          rowNumber: sample.rowNumber,
          columnKey: regionColumn,
          details: { regionRef: sample.value, matches },
        });
      }
    }
    return issues;
  }

  private async matchRegion(
    _organizationId: string,
    value: string,
  ): Promise<number> {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return 0;
    return this.tenants.workerScoped(async (tx) => {
      const [codes, aliases] = await Promise.all([
        tx.regionCode.findMany({
          where: { normalized },
          select: { regionId: true },
          distinct: ['regionId'],
          take: 2,
        }),
        tx.regionAlias.findMany({
          where: { normalized },
          select: { regionId: true },
          distinct: ['regionId'],
          take: 2,
        }),
      ]);
      return new Set([...codes, ...aliases].map((match) => match.regionId))
        .size;
    });
  }

  private async publishVersion(
    tx: Prisma.TransactionClient,
    run: {
      organizationId: string;
      datasetId: string;
      uploadId: string;
      mappingId: string;
      upload: { storedObjectId: string; checksumHex: string | null };
    },
    summary: ParsedSourceSummary,
  ) {
    const existing = await tx.datasetVersion.findFirst({
      where: {
        organizationId: run.organizationId,
        datasetId: run.datasetId,
        sourceUploadId: run.uploadId,
        mappingId: run.mappingId,
      },
    });
    if (existing !== null) return existing;
    const aggregate = await tx.datasetVersion.aggregate({
      where: { datasetId: run.datasetId },
      _max: { versionNumber: true },
    });
    return tx.datasetVersion.create({
      data: {
        organizationId: run.organizationId,
        datasetId: run.datasetId,
        versionNumber: (aggregate._max.versionNumber ?? 0) + 1,
        sourceUploadId: run.uploadId,
        storedObjectId: run.upload.storedObjectId,
        mappingId: run.mappingId,
        publicationStatus: 'published',
        checksumHex: run.upload.checksumHex,
        sourceSummary: {
          sourceKind: summary.sourceKind,
          rowCount: summary.rowCount,
          columnCount: summary.columnCount,
          columnKeys: summary.columnKeys,
          metadata: summary.metadata,
        } as Prisma.InputJsonObject,
      },
    });
  }

  private async fail(
    run: { id: string; actorAccountId: string; organizationId: string },
    code: string,
    message: string,
  ): Promise<void> {
    this.logger.warn(`Ingestion run ${run.id} failed: ${code}`);
    await this.tenants.organizationScoped(
      run.actorAccountId,
      run.organizationId,
      async (tx) => {
        await tx.ingestionRun.update({
          where: { id: run.id },
          data: {
            state: 'failed',
            failureCode: code,
            failureMessage: message,
            finishedAt: new Date(),
            progressPercent: 100,
          },
        });
      },
    );
  }
}
