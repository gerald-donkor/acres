import {
  DATASET_STATES,
  INGESTION_RUN_STAGES,
  MAPPING_VALIDATION_STATUSES,
  VALIDATION_ISSUE_SEVERITIES,
  isDatasetState,
  isIngestionRunStage,
  isMappingValidationStatus,
  isValidationIssueSeverity,
} from '@acres/shared';
import { ApiException } from '../common/api-exception';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import type { OrganizationContext } from '../organizations/organization-context';
import type {
  TenantTransactionClient,
  TenantTransactionService,
} from '../prisma/tenant-transaction.service';
import type { QueuePort } from '../queue/work-queue.port';
import type { CreateDatasetDto } from './dto/create-dataset.dto';
import type { CreateMappingDto } from './dto/create-mapping.dto';
import type { StartIngestionRunDto } from './dto/start-ingestion-run.dto';
import type { UpdateDatasetDto } from './dto/update-dataset.dto';
import { IngestionService } from './ingestion.service';

describe('Ingestion shared contracts and predicates', () => {
  describe('DATASET_STATES', () => {
    it('contains all canonical dataset states in order', () => {
      expect(DATASET_STATES).toEqual(['draft', 'active', 'archived']);
    });

    it('validates dataset states via isDatasetState', () => {
      for (const state of DATASET_STATES) {
        expect(isDatasetState(state)).toBe(true);
      }
      expect(isDatasetState('published')).toBe(false);
      expect(isDatasetState('DRAFT')).toBe(false);
      expect(isDatasetState('')).toBe(false);
      expect(isDatasetState(null as unknown as string)).toBe(false);
      expect(isDatasetState(undefined as unknown as string)).toBe(false);
    });
  });

  describe('INGESTION_RUN_STAGES', () => {
    it('contains all canonical ingestion run stages in order', () => {
      expect(INGESTION_RUN_STAGES).toEqual([
        'inspect',
        'parse',
        'map',
        'validate',
        'publish',
        'complete',
      ]);
    });

    it('validates ingestion run stages via isIngestionRunStage', () => {
      for (const stage of INGESTION_RUN_STAGES) {
        expect(isIngestionRunStage(stage)).toBe(true);
      }
      expect(isIngestionRunStage('upload')).toBe(false);
      expect(isIngestionRunStage('PARSE')).toBe(false);
      expect(isIngestionRunStage('')).toBe(false);
      expect(isIngestionRunStage(null as unknown as string)).toBe(false);
      expect(isIngestionRunStage(undefined as unknown as string)).toBe(false);
    });
  });

  describe('MAPPING_VALIDATION_STATUSES', () => {
    it('contains all canonical mapping validation statuses in order', () => {
      expect(MAPPING_VALIDATION_STATUSES).toEqual([
        'pending',
        'valid',
        'invalid',
      ]);
    });

    it('validates mapping validation statuses via isMappingValidationStatus', () => {
      for (const status of MAPPING_VALIDATION_STATUSES) {
        expect(isMappingValidationStatus(status)).toBe(true);
      }
      expect(isMappingValidationStatus('verified')).toBe(false);
      expect(isMappingValidationStatus('VALID')).toBe(false);
      expect(isMappingValidationStatus('')).toBe(false);
      expect(isMappingValidationStatus(null as unknown as string)).toBe(false);
      expect(isMappingValidationStatus(undefined as unknown as string)).toBe(
        false,
      );
    });
  });

  describe('VALIDATION_ISSUE_SEVERITIES', () => {
    it('contains all canonical validation issue severities in order', () => {
      expect(VALIDATION_ISSUE_SEVERITIES).toEqual(['info', 'warning', 'error']);
    });

    it('validates validation issue severities via isValidationIssueSeverity', () => {
      for (const severity of VALIDATION_ISSUE_SEVERITIES) {
        expect(isValidationIssueSeverity(severity)).toBe(true);
      }
      expect(isValidationIssueSeverity('fatal')).toBe(false);
      expect(isValidationIssueSeverity('ERROR')).toBe(false);
      expect(isValidationIssueSeverity('')).toBe(false);
      expect(isValidationIssueSeverity(null as unknown as string)).toBe(false);
      expect(isValidationIssueSeverity(undefined as unknown as string)).toBe(
        false,
      );
    });
  });
});

describe('IngestionService', () => {
  let service: IngestionService;
  let mockTenants: Partial<TenantTransactionService>;
  let mockIdempotency: Partial<IdempotencyService>;
  let mockQueue: Partial<QueuePort>;

  let mockTx: {
    dataset: {
      findMany: jest.Mock;
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    datasetVersion: {
      findMany: jest.Mock;
    };
    columnMapping: {
      create: jest.Mock;
      findFirst: jest.Mock;
      aggregate: jest.Mock;
    };
    upload: {
      findFirst: jest.Mock;
    };
    ingestionRun: {
      upsert: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    validationIssue: {
      findMany: jest.Mock;
    };
  };

  const orgContext: OrganizationContext = {
    accountId: 'acc-123',
    organizationId: 'org-456',
    membershipId: 'mem-789',
    role: 'owner',
    permissions: ['*'],
  } as unknown as OrganizationContext;

  beforeEach(() => {
    mockTx = {
      dataset: {
        findMany: jest.fn(),
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      datasetVersion: {
        findMany: jest.fn(),
      },
      columnMapping: {
        create: jest.fn(),
        findFirst: jest.fn(),
        aggregate: jest.fn(),
      },
      upload: {
        findFirst: jest.fn(),
      },
      ingestionRun: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      validationIssue: {
        findMany: jest.fn(),
      },
    };

    mockTenants = {
      organizationScoped: jest
        .fn()
        .mockImplementation(
          (
            _accountId: string,
            _orgId: string,
            callback: (tx: TenantTransactionClient) => Promise<unknown>,
          ) => callback(mockTx as unknown as TenantTransactionClient),
        ),
    };

    mockIdempotency = {
      run: jest
        .fn()
        .mockImplementation(
          (_tx: unknown, _options: unknown, callback: () => Promise<unknown>) =>
            callback(),
        ),
    };

    mockQueue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    service = new IngestionService(
      mockTenants as TenantTransactionService,
      mockIdempotency as IdempotencyService,
      mockQueue as QueuePort,
    );
  });

  describe('listDatasets', () => {
    it('queries datasets ordered by updatedAt desc and maps to summary', async () => {
      const now = new Date();
      mockTx.dataset.findMany.mockResolvedValue([
        {
          id: 'ds-1',
          name: 'Dataset 1',
          description: 'Description 1',
          state: 'active',
          createdAt: now,
          updatedAt: now,
          versions: [
            {
              id: 'ver-1',
              versionNumber: 1,
              publicationStatus: 'published',
              publishedAt: now,
              checksumHex: 'abc',
              sourceSummary: { rowCount: 100 },
            },
          ],
        },
        {
          id: 'ds-2',
          name: 'Dataset 2',
          description: null,
          state: 'draft',
          createdAt: now,
          updatedAt: now,
          versions: [],
        },
      ]);

      const result = await service.listDatasets(orgContext);

      expect(mockTenants.organizationScoped).toHaveBeenCalledWith(
        'acc-123',
        'org-456',
        expect.any(Function),
      );
      expect(mockTx.dataset.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-456' },
        orderBy: { updatedAt: 'desc' },
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
          },
        },
        take: 50,
      });

      expect(result).toEqual([
        {
          id: 'ds-1',
          name: 'Dataset 1',
          description: 'Description 1',
          state: 'active',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          latestVersion: {
            id: 'ver-1',
            versionNumber: 1,
            publicationStatus: 'published',
            publishedAt: now.toISOString(),
            checksumHex: 'abc',
            sourceSummary: { rowCount: 100 },
          },
        },
        {
          id: 'ds-2',
          name: 'Dataset 2',
          description: null,
          state: 'draft',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          latestVersion: null,
        },
      ]);
    });
  });

  describe('createDataset', () => {
    it('creates dataset via idempotency and returns summary', async () => {
      const now = new Date();
      mockTx.dataset.create.mockResolvedValue({
        id: 'ds-new',
        name: 'New Dataset',
        description: 'New Description',
        state: 'draft',
        createdAt: now,
        updatedAt: now,
        versions: [],
      });

      const body: CreateDatasetDto = {
        name: '  New Dataset  ',
        description: '  New Description  ',
        sourceMetadata: { provider: 'Census' },
      };

      const result = await service.createDataset(
        orgContext,
        'idem-key-1',
        body,
      );

      expect(mockIdempotency.run).toHaveBeenCalledWith(
        mockTx,
        {
          key: 'idem-key-1',
          accountId: 'acc-123',
          organizationId: 'org-456',
          operation: 'datasets.create',
          requestBody: body,
          responseStatus: 201,
        },
        expect.any(Function),
      );

      expect(mockTx.dataset.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-456',
          ownerAccountId: 'acc-123',
          name: 'New Dataset',
          description: 'New Description',
          sourceMetadata: { provider: 'Census' },
        },
        include: { versions: true },
      });

      expect(result.id).toBe('ds-new');
      expect(result.name).toBe('New Dataset');
      expect(result.latestVersion).toBeNull();
    });
  });

  describe('getDataset', () => {
    it('returns dataset summary when found', async () => {
      const now = new Date();
      mockTx.dataset.findFirst.mockResolvedValue({
        id: 'ds-1',
        name: 'Dataset 1',
        description: null,
        state: 'active',
        createdAt: now,
        updatedAt: now,
        versions: [],
      });

      const result = await service.getDataset(orgContext, 'ds-1');

      expect(mockTx.dataset.findFirst).toHaveBeenCalledWith({
        where: { id: 'ds-1', organizationId: 'org-456' },
        include: {
          versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        },
      });
      expect(result.id).toBe('ds-1');
    });

    it('throws notFound ApiException if dataset does not exist', async () => {
      mockTx.dataset.findFirst.mockResolvedValue(null);

      await expect(
        service.getDataset(orgContext, 'ds-missing'),
      ).rejects.toThrow(ApiException);
      try {
        await service.getDataset(orgContext, 'ds-missing');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ApiException);
        if (err instanceof ApiException) {
          expect(err.getStatus()).toBe(404);
          expect(err.code).toBe('NOT_FOUND');
        }
      }
    });
  });

  describe('updateDataset', () => {
    it('updates dataset fields when dataset exists and is not archived', async () => {
      const now = new Date();
      mockTx.dataset.findFirst.mockResolvedValue({
        id: 'ds-1',
        state: 'active',
      });
      mockTx.dataset.update.mockResolvedValue({
        id: 'ds-1',
        name: 'Updated Name',
        description: 'Updated Desc',
        state: 'active',
        createdAt: now,
        updatedAt: now,
        versions: [],
      });

      const updateBody: UpdateDatasetDto = {
        name: '  Updated Name  ',
        description: '  Updated Desc  ',
      };
      const result = await service.updateDataset(
        orgContext,
        'ds-1',
        updateBody,
      );

      expect(mockTx.dataset.update).toHaveBeenCalledWith({
        where: { id: 'ds-1' },
        data: {
          name: 'Updated Name',
          description: 'Updated Desc',
          sourceMetadata: undefined,
        },
        include: {
          versions: { orderBy: { versionNumber: 'desc' }, take: 1 },
        },
      });
      expect(result.name).toBe('Updated Name');
    });

    it('throws notFound if updating nonexistent dataset', async () => {
      mockTx.dataset.findFirst.mockResolvedValue(null);

      await expect(
        service.updateDataset(orgContext, 'ds-missing', { name: 'Name' }),
      ).rejects.toThrow('Dataset not found.');
    });

    it('throws conflict ApiException if dataset is archived', async () => {
      mockTx.dataset.findFirst.mockResolvedValue({
        id: 'ds-archived',
        state: 'archived',
      });

      await expect(
        service.updateDataset(orgContext, 'ds-archived', { name: 'Name' }),
      ).rejects.toThrow('Archived datasets cannot be updated.');
    });
  });

  describe('listVersions', () => {
    it('returns versions list when dataset exists', async () => {
      const now = new Date();
      mockTx.dataset.findFirst.mockResolvedValue({ id: 'ds-1' });
      mockTx.datasetVersion.findMany.mockResolvedValue([
        {
          id: 'v-2',
          versionNumber: 2,
          publicationStatus: 'published',
          publishedAt: now,
          checksumHex: 'def',
          sourceSummary: { rows: 200 },
        },
      ]);

      const result = await service.listVersions(orgContext, 'ds-1');

      expect(mockTx.dataset.findFirst).toHaveBeenCalledWith({
        where: { id: 'ds-1', organizationId: 'org-456' },
        select: { id: true },
      });
      expect(mockTx.datasetVersion.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-456', datasetId: 'ds-1' },
        orderBy: { versionNumber: 'desc' },
        take: 50,
      });
      expect(result).toHaveLength(1);
      expect(result[0].versionNumber).toBe(2);
    });

    it('throws notFound when listing versions for missing dataset', async () => {
      mockTx.dataset.findFirst.mockResolvedValue(null);

      await expect(
        service.listVersions(orgContext, 'ds-missing'),
      ).rejects.toThrow('Dataset not found.');
    });
  });

  describe('createMapping', () => {
    it('creates column mapping with next versionNumber and pending validationStatus', async () => {
      const now = new Date();
      mockTx.dataset.findFirst.mockResolvedValue({ id: 'ds-1' });
      mockTx.upload.findFirst.mockResolvedValue({ state: 'accepted' });
      mockTx.columnMapping.aggregate.mockResolvedValue({
        _max: { versionNumber: 2 },
      });
      mockTx.columnMapping.create.mockResolvedValue({
        id: 'map-1',
        datasetId: 'ds-1',
        uploadId: 'up-1',
        versionNumber: 3,
        validationStatus: 'pending',
        createdAt: now,
      });

      const body: CreateMappingDto = {
        uploadId: 'up-1',
        mapping: { regionColumn: 'code' },
      };

      const result = await service.createMapping(
        orgContext,
        'ds-1',
        'idem-map',
        body,
      );

      expect(mockTx.columnMapping.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-456',
          datasetId: 'ds-1',
          uploadId: 'up-1',
          createdByAccountId: 'acc-123',
          versionNumber: 3,
          mapping: { regionColumn: 'code' },
          validationStatus: 'pending',
        },
      });
      expect(result).toEqual({
        id: 'map-1',
        datasetId: 'ds-1',
        uploadId: 'up-1',
        versionNumber: 3,
        validationStatus: 'pending',
        createdAt: now.toISOString(),
      });
    });

    it('throws notFound if upload is missing', async () => {
      mockTx.dataset.findFirst.mockResolvedValue({ id: 'ds-1' });
      mockTx.upload.findFirst.mockResolvedValue(null);

      const missingUpBody: CreateMappingDto = {
        uploadId: 'missing-up',
        mapping: {},
      };

      await expect(
        service.createMapping(orgContext, 'ds-1', undefined, missingUpBody),
      ).rejects.toThrow('Upload not found.');
    });

    it('throws conflict if upload state is not accepted', async () => {
      mockTx.dataset.findFirst.mockResolvedValue({ id: 'ds-1' });
      mockTx.upload.findFirst.mockResolvedValue({ state: 'pending_upload' });

      const pendingUpBody: CreateMappingDto = {
        uploadId: 'pending-up',
        mapping: {},
      };

      await expect(
        service.createMapping(orgContext, 'ds-1', undefined, pendingUpBody),
      ).rejects.toThrow('Upload must be accepted before ingestion.');
    });
  });

  describe('startRun', () => {
    it('creates ingestion run, enqueues worker job, and returns summary', async () => {
      const now = new Date();
      mockTx.dataset.findFirst.mockResolvedValue({ id: 'ds-1' });
      mockTx.upload.findFirst.mockResolvedValue({ state: 'accepted' });
      mockTx.columnMapping.findFirst.mockResolvedValue({ id: 'map-1' });
      mockTx.ingestionRun.upsert.mockResolvedValue({
        id: 'run-1',
        datasetId: 'ds-1',
        uploadId: 'up-1',
        mappingId: 'map-1',
        datasetVersionId: null,
        state: 'queued',
        stage: 'inspect',
        progressPercent: 0,
        failureCode: null,
        failureMessage: null,
        createdAt: now,
        startedAt: null,
        finishedAt: null,
      });

      const body: StartIngestionRunDto = {
        uploadId: 'up-1',
        mappingId: 'map-1',
      };
      const result = await service.startRun(
        orgContext,
        'ds-1',
        'idem-run',
        body,
      );

      expect(mockTx.ingestionRun.upsert).toHaveBeenCalledWith({
        where: {
          organizationId_deterministicKey: {
            organizationId: 'org-456',
            deterministicKey: 'ds-1:up-1:map-1',
          },
        },
        update: {},
        create: {
          organizationId: 'org-456',
          datasetId: 'ds-1',
          uploadId: 'up-1',
          mappingId: 'map-1',
          actorAccountId: 'acc-123',
          deterministicKey: 'ds-1:up-1:map-1',
          state: 'queued',
          stage: 'inspect',
        },
      });

      expect(mockQueue.enqueue).toHaveBeenCalledWith({
        deterministicKey: 'ingestion.run:run-1',
        jobName: 'ingestion.run',
        payload: { ingestionRunId: 'run-1' },
      });

      expect(result.id).toBe('run-1');
      expect(result.state).toBe('queued');
      expect(result.stage).toBe('inspect');
      expect(result.failure).toBeNull();
    });

    it('throws notFound if mapping is missing', async () => {
      mockTx.dataset.findFirst.mockResolvedValue({ id: 'ds-1' });
      mockTx.upload.findFirst.mockResolvedValue({ state: 'accepted' });
      mockTx.columnMapping.findFirst.mockResolvedValue(null);

      const missingMapBody: StartIngestionRunDto = {
        uploadId: 'up-1',
        mappingId: 'missing-map',
      };

      await expect(
        service.startRun(orgContext, 'ds-1', undefined, missingMapBody),
      ).rejects.toThrow('Mapping not found.');
      expect(mockQueue.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('getRun', () => {
    it('returns run summary when found', async () => {
      const now = new Date();
      mockTx.ingestionRun.findFirst.mockResolvedValue({
        id: 'run-1',
        datasetId: 'ds-1',
        uploadId: 'up-1',
        mappingId: 'map-1',
        datasetVersionId: 'v-1',
        state: 'published',
        stage: 'complete',
        progressPercent: 100,
        failureCode: null,
        failureMessage: null,
        createdAt: now,
        startedAt: now,
        finishedAt: now,
      });

      const result = await service.getRun(orgContext, 'run-1');
      expect(result.id).toBe('run-1');
      expect(result.state).toBe('published');
      expect(result.stage).toBe('complete');
    });

    it('throws notFound when run does not exist', async () => {
      mockTx.ingestionRun.findFirst.mockResolvedValue(null);

      await expect(service.getRun(orgContext, 'run-missing')).rejects.toThrow(
        'Ingestion run not found.',
      );
    });
  });

  describe('listIssues', () => {
    it('returns mapped validation issues for a run', async () => {
      const now = new Date();
      mockTx.ingestionRun.findFirst.mockResolvedValue({ id: 'run-1' });
      mockTx.validationIssue.findMany.mockResolvedValue([
        {
          id: 'issue-1',
          severity: 'error',
          code: 'INVALID_VALUE',
          message: 'Invalid number',
          rowNumber: 5,
          columnKey: 'metric_a',
          regionRef: null,
          createdAt: now,
        },
      ]);

      const result = await service.listIssues(orgContext, 'run-1');

      expect(mockTx.validationIssue.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-456', ingestionRunId: 'run-1' },
        orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
        take: 100,
      });
      expect(result).toEqual([
        {
          id: 'issue-1',
          severity: 'error',
          code: 'INVALID_VALUE',
          message: 'Invalid number',
          rowNumber: 5,
          columnKey: 'metric_a',
          regionRef: null,
          createdAt: now.toISOString(),
        },
      ]);
    });

    it('throws notFound if run does not exist when listing issues', async () => {
      mockTx.ingestionRun.findFirst.mockResolvedValue(null);

      await expect(
        service.listIssues(orgContext, 'missing-run'),
      ).rejects.toThrow('Ingestion run not found.');
    });
  });

  describe('cancelRun', () => {
    it('cancels run and updates state to cancelled with 100% progress', async () => {
      const now = new Date();
      mockTx.ingestionRun.findFirst.mockResolvedValue({
        id: 'run-1',
        state: 'running',
        datasetId: 'ds-1',
        uploadId: 'up-1',
        mappingId: 'map-1',
        datasetVersionId: null,
        stage: 'validate',
        progressPercent: 50,
        failureCode: null,
        failureMessage: null,
        createdAt: now,
        startedAt: now,
        finishedAt: null,
      });
      mockTx.ingestionRun.update.mockResolvedValue({
        id: 'run-1',
        state: 'cancelled',
        datasetId: 'ds-1',
        uploadId: 'up-1',
        mappingId: 'map-1',
        datasetVersionId: null,
        stage: 'validate',
        progressPercent: 100,
        failureCode: null,
        failureMessage: null,
        createdAt: now,
        startedAt: now,
        finishedAt: now,
      });

      const result = await service.cancelRun(orgContext, 'run-1');

      expect(mockTx.ingestionRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: {
          state: 'cancelled',
          cancelledAt: expect.any(Date) as unknown,
          finishedAt: expect.any(Date) as unknown,
          progressPercent: 100,
        },
      });
      expect(result.state).toBe('cancelled');
    });

    it('returns existing summary if run is already cancelled', async () => {
      const now = new Date();
      mockTx.ingestionRun.findFirst.mockResolvedValue({
        id: 'run-1',
        state: 'cancelled',
        datasetId: 'ds-1',
        uploadId: 'up-1',
        mappingId: 'map-1',
        datasetVersionId: null,
        stage: 'validate',
        progressPercent: 100,
        failureCode: null,
        failureMessage: null,
        createdAt: now,
        startedAt: now,
        finishedAt: now,
      });

      const result = await service.cancelRun(orgContext, 'run-1');
      expect(mockTx.ingestionRun.update).not.toHaveBeenCalled();
      expect(result.state).toBe('cancelled');
    });

    it('throws conflict if run is published', async () => {
      mockTx.ingestionRun.findFirst.mockResolvedValue({
        id: 'run-1',
        state: 'published',
      });

      await expect(service.cancelRun(orgContext, 'run-1')).rejects.toThrow(
        'Published ingestion runs cannot be cancelled.',
      );
    });

    it('throws notFound if cancelling missing run', async () => {
      mockTx.ingestionRun.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelRun(orgContext, 'run-missing'),
      ).rejects.toThrow('Ingestion run not found.');
    });
  });
});
