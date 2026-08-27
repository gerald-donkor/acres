import { Inject, Injectable } from '@nestjs/common';
import type { IngestionRunSummary } from '@acres/shared';
import type { Prisma } from '../generated/prisma/client';
import { ApiException } from '../common/api-exception';
import { IdempotencyService } from '../idempotency/idempotency.service';
import type { OrganizationContext } from '../organizations/organization-context';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import { WORK_QUEUE, type QueuePort } from '../queue/work-queue.port';
import type { CreateDatasetDto } from './dto/create-dataset.dto';
import type { CreateMappingDto } from './dto/create-mapping.dto';
import type { StartIngestionRunDto } from './dto/start-ingestion-run.dto';
import type { UpdateDatasetDto } from './dto/update-dataset.dto';

export type { IngestionRunSummary };

export interface DatasetSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly state: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly latestVersion: DatasetVersionSummary | null;
}

export interface DatasetVersionSummary {
  readonly id: string;
  readonly versionNumber: number;
  readonly publicationStatus: string;
  readonly publishedAt: string;
  readonly checksumHex: string | null;
  readonly sourceSummary: unknown;
}

export interface MappingSummary {
  readonly id: string;
  readonly datasetId: string;
  readonly uploadId: string;
  readonly versionNumber: number;
  readonly validationStatus: string;
  readonly createdAt: string;
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly tenants: TenantTransactionService,
    private readonly idempotency: IdempotencyService,
    @Inject(WORK_QUEUE) private readonly queue: QueuePort,
  ) {}

  async listDatasets(
    organization: OrganizationContext,
  ): Promise<DatasetSummary[]> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      async (tx) => {
        const datasets = await tx.dataset.findMany({
          where: { organizationId: organization.organizationId },
          orderBy: { updatedAt: 'desc' },
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              take: 1,
            },
          },
          take: 50,
        });
        return datasets.map((dataset) => this.toDatasetSummary(dataset));
      },
    );
  }

  async createDataset(
    organization: OrganizationContext,
    idempotencyKey: string | undefined,
    body: CreateDatasetDto,
  ): Promise<DatasetSummary> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      (tx) =>
        this.idempotency.run(
          tx,
          {
            key: idempotencyKey,
            accountId: organization.accountId,
            organizationId: organization.organizationId,
            operation: 'datasets.create',
            requestBody: body,
            responseStatus: 201,
          },
          async () => {
            const dataset = await tx.dataset.create({
              data: {
                organizationId: organization.organizationId,
                ownerAccountId: organization.accountId,
                name: body.name.trim(),
                description: body.description?.trim(),
                sourceMetadata: jsonObject(body.sourceMetadata),
              },
              include: { versions: true },
            });
            return this.toDatasetSummary(dataset);
          },
        ),
    );
  }

  async getDataset(
    organization: OrganizationContext,
    datasetId: string,
  ): Promise<DatasetSummary> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      async (tx) => {
        const dataset = await tx.dataset.findFirst({
          where: { id: datasetId, organizationId: organization.organizationId },
          include: {
            versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
          },
        });
        if (dataset === null) throw ApiException.notFound('Dataset not found.');
        return this.toDatasetSummary(dataset);
      },
    );
  }

  async updateDataset(
    organization: OrganizationContext,
    datasetId: string,
    body: UpdateDatasetDto,
  ): Promise<DatasetSummary> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      async (tx) => {
        const existing = await tx.dataset.findFirst({
          where: { id: datasetId, organizationId: organization.organizationId },
        });
        if (existing === null)
          throw ApiException.notFound('Dataset not found.');
        if (existing.state === 'archived') {
          throw ApiException.conflict('Archived datasets cannot be updated.');
        }
        const dataset = await tx.dataset.update({
          where: { id: datasetId },
          data: {
            name: body.name?.trim(),
            description: body.description?.trim(),
            sourceMetadata:
              body.sourceMetadata === undefined
                ? undefined
                : jsonObject(body.sourceMetadata),
          },
          include: {
            versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
          },
        });
        return this.toDatasetSummary(dataset);
      },
    );
  }

  async listVersions(
    organization: OrganizationContext,
    datasetId: string,
  ): Promise<DatasetVersionSummary[]> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      async (tx) => {
        await this.requireDataset(tx, organization.organizationId, datasetId);
        const versions = await tx.datasetVersion.findMany({
          where: { organizationId: organization.organizationId, datasetId },
          orderBy: { versionNumber: 'desc' },
          take: 50,
        });
        return versions.map((version) => this.toVersionSummary(version));
      },
    );
  }

  async createMapping(
    organization: OrganizationContext,
    datasetId: string,
    idempotencyKey: string | undefined,
    body: CreateMappingDto,
  ): Promise<MappingSummary> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      (tx) =>
        this.idempotency.run(
          tx,
          {
            key: idempotencyKey,
            accountId: organization.accountId,
            organizationId: organization.organizationId,
            operation: `datasets.mapping.create:${datasetId}`,
            requestBody: body,
            responseStatus: 201,
          },
          async () => {
            await this.requireDataset(
              tx,
              organization.organizationId,
              datasetId,
            );
            await this.requireAcceptedUpload(
              tx,
              organization.organizationId,
              body.uploadId,
            );
            const versionNumber = await this.nextMappingVersion(tx, datasetId);
            const mapping = await tx.columnMapping.create({
              data: {
                organizationId: organization.organizationId,
                datasetId,
                uploadId: body.uploadId,
                createdByAccountId: organization.accountId,
                versionNumber,
                mapping: jsonObject(body.mapping),
                validationStatus: 'pending',
              },
            });
            return this.toMappingSummary(mapping);
          },
        ),
    );
  }

  async startRun(
    organization: OrganizationContext,
    datasetId: string,
    idempotencyKey: string | undefined,
    body: StartIngestionRunDto,
  ): Promise<IngestionRunSummary> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      (tx) =>
        this.idempotency.run(
          tx,
          {
            key: idempotencyKey,
            accountId: organization.accountId,
            organizationId: organization.organizationId,
            operation: `ingestion.run.start:${datasetId}`,
            requestBody: body,
            responseStatus: 201,
          },
          async () => {
            await this.requireDataset(
              tx,
              organization.organizationId,
              datasetId,
            );
            await this.requireAcceptedUpload(
              tx,
              organization.organizationId,
              body.uploadId,
            );
            const mapping = await tx.columnMapping.findFirst({
              where: {
                id: body.mappingId,
                datasetId,
                uploadId: body.uploadId,
                organizationId: organization.organizationId,
              },
            });
            if (mapping === null) {
              throw ApiException.notFound('Mapping not found.');
            }
            const deterministicKey = `${datasetId}:${body.uploadId}:${body.mappingId}`;
            const run = await tx.ingestionRun.upsert({
              where: {
                organizationId_deterministicKey: {
                  organizationId: organization.organizationId,
                  deterministicKey,
                },
              },
              update: {},
              create: {
                organizationId: organization.organizationId,
                datasetId,
                uploadId: body.uploadId,
                mappingId: body.mappingId,
                actorAccountId: organization.accountId,
                deterministicKey,
                state: 'queued',
                stage: 'inspect',
              },
            });
            await this.queue.enqueue({
              deterministicKey: `ingestion.run:${run.id}`,
              jobName: 'ingestion.run',
              payload: { ingestionRunId: run.id },
            });
            return this.toRunSummary(run);
          },
        ),
    );
  }

  async getRun(
    organization: OrganizationContext,
    runId: string,
  ): Promise<IngestionRunSummary> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      async (tx) => {
        const run = await tx.ingestionRun.findFirst({
          where: { id: runId, organizationId: organization.organizationId },
        });
        if (run === null)
          throw ApiException.notFound('Ingestion run not found.');
        return this.toRunSummary(run);
      },
    );
  }

  async listIssues(
    organization: OrganizationContext,
    runId: string,
  ): Promise<unknown[]> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      async (tx) => {
        await this.requireRun(tx, organization.organizationId, runId);
        const issues = await tx.validationIssue.findMany({
          where: {
            organizationId: organization.organizationId,
            ingestionRunId: runId,
          },
          orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
          take: 100,
        });
        return issues.map((issue) => ({
          id: issue.id,
          severity: issue.severity,
          code: issue.code,
          message: issue.message,
          rowNumber: issue.rowNumber,
          columnKey: issue.columnKey,
          regionRef: issue.regionRef,
          createdAt: issue.createdAt.toISOString(),
        }));
      },
    );
  }

  async cancelRun(
    organization: OrganizationContext,
    runId: string,
  ): Promise<IngestionRunSummary> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      async (tx) => {
        const run = await tx.ingestionRun.findFirst({
          where: { id: runId, organizationId: organization.organizationId },
        });
        if (run === null)
          throw ApiException.notFound('Ingestion run not found.');
        if (run.state === 'published') {
          throw ApiException.conflict(
            'Published ingestion runs cannot be cancelled.',
          );
        }
        if (run.state === 'cancelled') return this.toRunSummary(run);
        const updated = await tx.ingestionRun.update({
          where: { id: run.id },
          data: {
            state: 'cancelled',
            cancelledAt: new Date(),
            finishedAt: new Date(),
            progressPercent: 100,
          },
        });
        return this.toRunSummary(updated);
      },
    );
  }

  private async requireDataset(
    tx: Prisma.TransactionClient,
    organizationId: string,
    datasetId: string,
  ): Promise<void> {
    const dataset = await tx.dataset.findFirst({
      where: { id: datasetId, organizationId },
      select: { id: true },
    });
    if (dataset === null) throw ApiException.notFound('Dataset not found.');
  }

  private async requireRun(
    tx: Prisma.TransactionClient,
    organizationId: string,
    runId: string,
  ): Promise<void> {
    const run = await tx.ingestionRun.findFirst({
      where: { id: runId, organizationId },
      select: { id: true },
    });
    if (run === null) throw ApiException.notFound('Ingestion run not found.');
  }

  private async requireAcceptedUpload(
    tx: Prisma.TransactionClient,
    organizationId: string,
    uploadId: string,
  ): Promise<void> {
    const upload = await tx.upload.findFirst({
      where: { id: uploadId, organizationId },
      select: { state: true },
    });
    if (upload === null) throw ApiException.notFound('Upload not found.');
    if (upload.state !== 'accepted') {
      throw ApiException.conflict('Upload must be accepted before ingestion.');
    }
  }

  private async nextMappingVersion(
    tx: Prisma.TransactionClient,
    datasetId: string,
  ): Promise<number> {
    const aggregate = await tx.columnMapping.aggregate({
      where: { datasetId },
      _max: { versionNumber: true },
    });
    return (aggregate._max.versionNumber ?? 0) + 1;
  }

  private toDatasetSummary(dataset: {
    id: string;
    name: string;
    description: string | null;
    state: string;
    createdAt: Date;
    updatedAt: Date;
    versions?: Array<{
      id: string;
      versionNumber: number;
      publicationStatus: string;
      publishedAt: Date;
      checksumHex: string | null;
      sourceSummary: unknown;
    }>;
  }): DatasetSummary {
    return {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      state: dataset.state,
      createdAt: dataset.createdAt.toISOString(),
      updatedAt: dataset.updatedAt.toISOString(),
      latestVersion: dataset.versions?.[0]
        ? this.toVersionSummary(dataset.versions[0])
        : null,
    };
  }

  private toVersionSummary(version: {
    id: string;
    versionNumber: number;
    publicationStatus: string;
    publishedAt: Date;
    checksumHex: string | null;
    sourceSummary: unknown;
  }): DatasetVersionSummary {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      publicationStatus: version.publicationStatus,
      publishedAt: version.publishedAt.toISOString(),
      checksumHex: version.checksumHex,
      sourceSummary: version.sourceSummary,
    };
  }

  private toMappingSummary(mapping: {
    id: string;
    datasetId: string;
    uploadId: string;
    versionNumber: number;
    validationStatus: string;
    createdAt: Date;
  }): MappingSummary {
    return {
      id: mapping.id,
      datasetId: mapping.datasetId,
      uploadId: mapping.uploadId,
      versionNumber: mapping.versionNumber,
      validationStatus: mapping.validationStatus,
      createdAt: mapping.createdAt.toISOString(),
    };
  }

  private toRunSummary(run: {
    id: string;
    datasetId: string;
    uploadId: string;
    mappingId: string;
    datasetVersionId: string | null;
    state: string;
    stage: string;
    progressPercent: number;
    failureCode: string | null;
    failureMessage: string | null;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  }): IngestionRunSummary {
    return {
      id: run.id,
      datasetId: run.datasetId,
      uploadId: run.uploadId,
      mappingId: run.mappingId,
      datasetVersionId: run.datasetVersionId,
      state: run.state,
      stage: run.stage,
      progressPercent: run.progressPercent,
      failure:
        run.failureCode === null
          ? null
          : { code: run.failureCode, message: run.failureMessage },
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }
}

function jsonObject(value: unknown): Prisma.InputJsonObject {
  if (value === undefined || value === null || typeof value !== 'object') {
    return {};
  }
  return value;
}
