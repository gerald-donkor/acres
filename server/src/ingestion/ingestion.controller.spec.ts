import type { MessageEvent } from '@nestjs/common';
import { firstValueFrom, take, toArray } from 'rxjs';
import {
  INGESTION_RUN_STATES,
  TERMINAL_INGESTION_RUN_STATES,
  isTerminalIngestionRunState,
  type DatasetSummary,
  type DatasetVersionSummary,
  type IngestionRunSummary,
  type MappingSummary,
  type TerminalIngestionRunState,
  type ValidationIssueSummary,
} from '@acres/shared';
import type { OrganizationContext } from '../organizations/organization-context';
import { IngestionController } from './ingestion.controller';
import type { IngestionService } from './ingestion.service';
import type { CreateDatasetDto } from './dto/create-dataset.dto';
import type { CreateMappingDto } from './dto/create-mapping.dto';
import type { StartIngestionRunDto } from './dto/start-ingestion-run.dto';
import type { UpdateDatasetDto } from './dto/update-dataset.dto';

describe('IngestionController', () => {
  let controller: IngestionController;
  let mockIngestionService: {
    listDatasets: jest.Mock<Promise<DatasetSummary[]>, [OrganizationContext]>;
    createDataset: jest.Mock<
      Promise<DatasetSummary>,
      [OrganizationContext, string | undefined, CreateDatasetDto]
    >;
    getDataset: jest.Mock<
      Promise<DatasetSummary>,
      [OrganizationContext, string]
    >;
    updateDataset: jest.Mock<
      Promise<DatasetSummary>,
      [OrganizationContext, string, UpdateDatasetDto]
    >;
    listVersions: jest.Mock<
      Promise<DatasetVersionSummary[]>,
      [OrganizationContext, string]
    >;
    createMapping: jest.Mock<
      Promise<MappingSummary>,
      [OrganizationContext, string, string | undefined, CreateMappingDto]
    >;
    startRun: jest.Mock<
      Promise<IngestionRunSummary>,
      [OrganizationContext, string, string | undefined, StartIngestionRunDto]
    >;
    getRun: jest.Mock<
      Promise<IngestionRunSummary>,
      [OrganizationContext, string]
    >;
    listIssues: jest.Mock<
      Promise<ValidationIssueSummary[]>,
      [OrganizationContext, string]
    >;
    cancelRun: jest.Mock<
      Promise<IngestionRunSummary>,
      [OrganizationContext, string]
    >;
  };

  const testOrg: OrganizationContext = {
    organizationId: 'org-test-123',
    accountId: 'acc-test-456',
    membershipId: 'mem-test-789',
    role: 'owner',
  };

  const testDatasetId = 'dataset-uuid-1';
  const testUploadId = 'upload-uuid-1';
  const testMappingId = 'mapping-uuid-1';
  const testRunId = 'run-uuid-1';
  const testIdempotencyKey = 'a-valid-idempotency-key-12345';

  const mockDataset: DatasetSummary = {
    id: testDatasetId,
    name: 'Regional Housing Starts',
    description: 'Quarterly planning data',
    state: 'active',
    createdAt: '2026-09-20T10:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    latestVersion: {
      id: 'version-uuid-1',
      versionNumber: 1,
      publicationStatus: 'published',
      publishedAt: '2026-09-20T12:00:00.000Z',
      checksumHex:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      sourceSummary: { rowCount: 1500 },
    },
  };

  const mockVersion: DatasetVersionSummary = {
    id: 'version-uuid-1',
    versionNumber: 1,
    publicationStatus: 'published',
    publishedAt: '2026-09-20T12:00:00.000Z',
    checksumHex:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sourceSummary: { rowCount: 1500 },
  };

  const mockMapping: MappingSummary = {
    id: testMappingId,
    datasetId: testDatasetId,
    uploadId: testUploadId,
    versionNumber: 1,
    validationStatus: 'pending',
    createdAt: '2026-09-20T10:30:00.000Z',
  };

  const mockRun: IngestionRunSummary = {
    id: testRunId,
    datasetId: testDatasetId,
    uploadId: testUploadId,
    mappingId: testMappingId,
    datasetVersionId: null,
    state: 'running',
    stage: 'parse',
    progressPercent: 35,
    failure: null,
    createdAt: '2026-09-20T11:00:00.000Z',
    startedAt: '2026-09-20T11:00:05.000Z',
    finishedAt: null,
  };

  const mockIssue: ValidationIssueSummary = {
    id: 'issue-uuid-1',
    severity: 'error',
    code: 'invalid_region_code',
    message: 'Unknown region code: REG-999',
    rowNumber: 42,
    columnKey: 'region_code',
    regionRef: 'REG-999',
    createdAt: '2026-09-20T11:01:00.000Z',
  };

  beforeEach(() => {
    jest.useFakeTimers();

    mockIngestionService = {
      listDatasets: jest.fn<Promise<DatasetSummary[]>, [OrganizationContext]>(),
      createDataset: jest.fn<
        Promise<DatasetSummary>,
        [OrganizationContext, string | undefined, CreateDatasetDto]
      >(),
      getDataset: jest.fn<
        Promise<DatasetSummary>,
        [OrganizationContext, string]
      >(),
      updateDataset: jest.fn<
        Promise<DatasetSummary>,
        [OrganizationContext, string, UpdateDatasetDto]
      >(),
      listVersions: jest.fn<
        Promise<DatasetVersionSummary[]>,
        [OrganizationContext, string]
      >(),
      createMapping: jest.fn<
        Promise<MappingSummary>,
        [OrganizationContext, string, string | undefined, CreateMappingDto]
      >(),
      startRun: jest.fn<
        Promise<IngestionRunSummary>,
        [OrganizationContext, string, string | undefined, StartIngestionRunDto]
      >(),
      getRun: jest.fn<
        Promise<IngestionRunSummary>,
        [OrganizationContext, string]
      >(),
      listIssues: jest.fn<
        Promise<ValidationIssueSummary[]>,
        [OrganizationContext, string]
      >(),
      cancelRun: jest.fn<
        Promise<IngestionRunSummary>,
        [OrganizationContext, string]
      >(),
    };

    controller = new IngestionController(
      mockIngestionService as unknown as IngestionService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('canonical state assertions', () => {
    it('verifies INGESTION_RUN_STATES contains all expected states', () => {
      expect(Array.isArray(INGESTION_RUN_STATES)).toBe(true);
      expect(INGESTION_RUN_STATES).toEqual([
        'queued',
        'running',
        'validation_failed',
        'published',
        'failed',
        'cancelling',
        'cancelled',
      ]);
    });

    it('verifies TERMINAL_INGESTION_RUN_STATES contains exactly published, failed, and cancelled', () => {
      expect(Array.isArray(TERMINAL_INGESTION_RUN_STATES)).toBe(true);
      expect(TERMINAL_INGESTION_RUN_STATES).toEqual([
        'published',
        'failed',
        'cancelled',
      ]);
    });

    it('returns true for terminal ingestion run states', () => {
      const terminalStates: TerminalIngestionRunState[] = [
        'published',
        'failed',
        'cancelled',
      ];

      for (const state of terminalStates) {
        expect(isTerminalIngestionRunState(state)).toBe(true);
      }
    });

    it('returns false for non-terminal and arbitrary states', () => {
      const nonTerminalStates: string[] = [
        'queued',
        'running',
        'validation_failed',
        'cancelling',
        'draft',
        'active',
        'unknown',
        '',
      ];

      for (const state of nonTerminalStates) {
        expect(isTerminalIngestionRunState(state)).toBe(false);
      }
    });
  });

  describe('listDatasets', () => {
    it('calls ingestion.listDatasets with organization and returns datasets', async () => {
      const expectedDatasets: DatasetSummary[] = [mockDataset];
      mockIngestionService.listDatasets.mockResolvedValue(expectedDatasets);

      const result = await controller.listDatasets(testOrg);

      expect(mockIngestionService.listDatasets).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.listDatasets).toHaveBeenCalledWith(testOrg);
      expect(result).toEqual(expectedDatasets);
    });

    it('propagates service rejection', async () => {
      mockIngestionService.listDatasets.mockRejectedValue(
        new Error('Database unavailable'),
      );

      await expect(controller.listDatasets(testOrg)).rejects.toThrow(
        'Database unavailable',
      );
    });
  });

  describe('createDataset', () => {
    it('calls ingestion.createDataset with organization, idempotencyKey, and body', async () => {
      const body: CreateDatasetDto = {
        name: 'Regional Housing Starts',
        description: 'Quarterly planning data',
        sourceMetadata: { source: 'planning-office' },
      };

      mockIngestionService.createDataset.mockResolvedValue(mockDataset);

      const result = await controller.createDataset(
        testOrg,
        testIdempotencyKey,
        body,
      );

      expect(mockIngestionService.createDataset).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.createDataset).toHaveBeenCalledWith(
        testOrg,
        testIdempotencyKey,
        body,
      );
      expect(result).toEqual(mockDataset);
    });

    it('supports optional idempotencyKey being undefined', async () => {
      const body: CreateDatasetDto = {
        name: 'New Dataset',
      };

      mockIngestionService.createDataset.mockResolvedValue(mockDataset);

      const result = await controller.createDataset(testOrg, undefined, body);

      expect(mockIngestionService.createDataset).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.createDataset).toHaveBeenCalledWith(
        testOrg,
        undefined,
        body,
      );
      expect(result).toEqual(mockDataset);
    });

    it('propagates service rejection', async () => {
      const body: CreateDatasetDto = { name: 'Faulty Dataset' };
      mockIngestionService.createDataset.mockRejectedValue(
        new Error('Duplicate dataset name'),
      );

      await expect(
        controller.createDataset(testOrg, testIdempotencyKey, body),
      ).rejects.toThrow('Duplicate dataset name');
    });
  });

  describe('getDataset', () => {
    it('calls ingestion.getDataset with organization and datasetId', async () => {
      mockIngestionService.getDataset.mockResolvedValue(mockDataset);

      const result = await controller.getDataset(testOrg, testDatasetId);

      expect(mockIngestionService.getDataset).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.getDataset).toHaveBeenCalledWith(
        testOrg,
        testDatasetId,
      );
      expect(result).toEqual(mockDataset);
    });

    it('propagates service rejection', async () => {
      mockIngestionService.getDataset.mockRejectedValue(
        new Error('Dataset not found'),
      );

      await expect(
        controller.getDataset(testOrg, testDatasetId),
      ).rejects.toThrow('Dataset not found');
    });
  });

  describe('updateDataset', () => {
    it('calls ingestion.updateDataset with organization, datasetId, and body', async () => {
      const body: UpdateDatasetDto = {
        name: 'Updated Housing Starts',
        description: 'Revised description',
      };

      const updatedDataset: DatasetSummary = {
        ...mockDataset,
        name: 'Updated Housing Starts',
        description: 'Revised description',
      };

      mockIngestionService.updateDataset.mockResolvedValue(updatedDataset);

      const result = await controller.updateDataset(
        testOrg,
        testDatasetId,
        body,
      );

      expect(mockIngestionService.updateDataset).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.updateDataset).toHaveBeenCalledWith(
        testOrg,
        testDatasetId,
        body,
      );
      expect(result).toEqual(updatedDataset);
    });

    it('propagates service rejection', async () => {
      const body: UpdateDatasetDto = { name: 'Cannot Update' };
      mockIngestionService.updateDataset.mockRejectedValue(
        new Error('Archived datasets cannot be updated'),
      );

      await expect(
        controller.updateDataset(testOrg, testDatasetId, body),
      ).rejects.toThrow('Archived datasets cannot be updated');
    });
  });

  describe('listVersions', () => {
    it('calls ingestion.listVersions with organization and datasetId', async () => {
      const expectedVersions: DatasetVersionSummary[] = [mockVersion];
      mockIngestionService.listVersions.mockResolvedValue(expectedVersions);

      const result = await controller.listVersions(testOrg, testDatasetId);

      expect(mockIngestionService.listVersions).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.listVersions).toHaveBeenCalledWith(
        testOrg,
        testDatasetId,
      );
      expect(result).toEqual(expectedVersions);
    });

    it('propagates service rejection', async () => {
      mockIngestionService.listVersions.mockRejectedValue(
        new Error('Dataset not found'),
      );

      await expect(
        controller.listVersions(testOrg, testDatasetId),
      ).rejects.toThrow('Dataset not found');
    });
  });

  describe('createMapping', () => {
    it('calls ingestion.createMapping with organization, datasetId, idempotencyKey, and body', async () => {
      const body: CreateMappingDto = {
        uploadId: testUploadId,
        mapping: {
          regionColumn: 'region',
          periodColumn: 'year',
          unitColumn: 'people',
        },
      };

      mockIngestionService.createMapping.mockResolvedValue(mockMapping);

      const result = await controller.createMapping(
        testOrg,
        testDatasetId,
        testIdempotencyKey,
        body,
      );

      expect(mockIngestionService.createMapping).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.createMapping).toHaveBeenCalledWith(
        testOrg,
        testDatasetId,
        testIdempotencyKey,
        body,
      );
      expect(result).toEqual(mockMapping);
    });

    it('supports optional idempotencyKey being undefined', async () => {
      const body: CreateMappingDto = {
        uploadId: testUploadId,
        mapping: { regionColumn: 'region' },
      };

      mockIngestionService.createMapping.mockResolvedValue(mockMapping);

      const result = await controller.createMapping(
        testOrg,
        testDatasetId,
        undefined,
        body,
      );

      expect(mockIngestionService.createMapping).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.createMapping).toHaveBeenCalledWith(
        testOrg,
        testDatasetId,
        undefined,
        body,
      );
      expect(result).toEqual(mockMapping);
    });

    it('propagates service rejection', async () => {
      const body: CreateMappingDto = {
        uploadId: testUploadId,
        mapping: {},
      };
      mockIngestionService.createMapping.mockRejectedValue(
        new Error('Upload not found'),
      );

      await expect(
        controller.createMapping(
          testOrg,
          testDatasetId,
          testIdempotencyKey,
          body,
        ),
      ).rejects.toThrow('Upload not found');
    });
  });

  describe('startRun', () => {
    it('calls ingestion.startRun with organization, datasetId, idempotencyKey, and body', async () => {
      const body: StartIngestionRunDto = {
        uploadId: testUploadId,
        mappingId: testMappingId,
      };

      mockIngestionService.startRun.mockResolvedValue(mockRun);

      const result = await controller.startRun(
        testOrg,
        testDatasetId,
        testIdempotencyKey,
        body,
      );

      expect(mockIngestionService.startRun).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.startRun).toHaveBeenCalledWith(
        testOrg,
        testDatasetId,
        testIdempotencyKey,
        body,
      );
      expect(result).toEqual(mockRun);
    });

    it('supports optional idempotencyKey being undefined', async () => {
      const body: StartIngestionRunDto = {
        uploadId: testUploadId,
        mappingId: testMappingId,
      };

      mockIngestionService.startRun.mockResolvedValue(mockRun);

      const result = await controller.startRun(
        testOrg,
        testDatasetId,
        undefined,
        body,
      );

      expect(mockIngestionService.startRun).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.startRun).toHaveBeenCalledWith(
        testOrg,
        testDatasetId,
        undefined,
        body,
      );
      expect(result).toEqual(mockRun);
    });

    it('propagates service rejection', async () => {
      const body: StartIngestionRunDto = {
        uploadId: testUploadId,
        mappingId: testMappingId,
      };
      mockIngestionService.startRun.mockRejectedValue(
        new Error('Queue unavailable'),
      );

      await expect(
        controller.startRun(testOrg, testDatasetId, testIdempotencyKey, body),
      ).rejects.toThrow('Queue unavailable');
    });
  });

  describe('getRun', () => {
    it('calls ingestion.getRun with organization and runId', async () => {
      mockIngestionService.getRun.mockResolvedValue(mockRun);

      const result = await controller.getRun(testOrg, testRunId);

      expect(mockIngestionService.getRun).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.getRun).toHaveBeenCalledWith(
        testOrg,
        testRunId,
      );
      expect(result).toEqual(mockRun);
    });

    it('propagates service rejection', async () => {
      mockIngestionService.getRun.mockRejectedValue(
        new Error('Ingestion run not found'),
      );

      await expect(controller.getRun(testOrg, testRunId)).rejects.toThrow(
        'Ingestion run not found',
      );
    });
  });

  describe('listIssues', () => {
    it('calls ingestion.listIssues with organization and runId', async () => {
      const expectedIssues: ValidationIssueSummary[] = [mockIssue];
      mockIngestionService.listIssues.mockResolvedValue(expectedIssues);

      const result = await controller.listIssues(testOrg, testRunId);

      expect(mockIngestionService.listIssues).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.listIssues).toHaveBeenCalledWith(
        testOrg,
        testRunId,
      );
      expect(result).toEqual(expectedIssues);
    });

    it('propagates service rejection', async () => {
      mockIngestionService.listIssues.mockRejectedValue(
        new Error('Run not found'),
      );

      await expect(controller.listIssues(testOrg, testRunId)).rejects.toThrow(
        'Run not found',
      );
    });
  });

  describe('cancelRun', () => {
    it('calls ingestion.cancelRun with organization and runId', async () => {
      const cancelledRun: IngestionRunSummary = {
        ...mockRun,
        state: 'cancelled',
        stage: 'complete',
        progressPercent: 100,
        finishedAt: '2026-09-20T11:05:00.000Z',
      };
      mockIngestionService.cancelRun.mockResolvedValue(cancelledRun);

      const result = await controller.cancelRun(testOrg, testRunId);

      expect(mockIngestionService.cancelRun).toHaveBeenCalledTimes(1);
      expect(mockIngestionService.cancelRun).toHaveBeenCalledWith(
        testOrg,
        testRunId,
      );
      expect(result).toEqual(cancelledRun);
    });

    it('propagates service rejection', async () => {
      mockIngestionService.cancelRun.mockRejectedValue(
        new Error('Cannot cancel completed run'),
      );

      await expect(controller.cancelRun(testOrg, testRunId)).rejects.toThrow(
        'Cannot cancel completed run',
      );
    });
  });

  describe('events (SSE Observable stream)', () => {
    it('maps emitted initial ingestion run status to MessageEvent structure with formatted id and type', async () => {
      const inProgressRun: IngestionRunSummary = {
        ...mockRun,
        state: 'running',
        stage: 'inspect',
        progressPercent: 10,
      };

      mockIngestionService.getRun.mockResolvedValue(inProgressRun);

      const sseStream$ = await controller.events(testOrg, testRunId);

      expect(mockIngestionService.getRun).toHaveBeenCalledWith(
        testOrg,
        testRunId,
      );

      const event = await firstValueFrom(sseStream$);

      expect(event).toEqual({
        type: 'ingestion.progress',
        id: `${testRunId}:running:inspect:10`,
        data: inProgressRun,
      });
    });

    it('emits initial event and subsequent polling tick events until terminal state (published), then completes', async () => {
      const step1Initial: IngestionRunSummary = {
        ...mockRun,
        state: 'queued',
        stage: 'inspect',
        progressPercent: 0,
      };

      const step2Running: IngestionRunSummary = {
        ...mockRun,
        state: 'running',
        stage: 'parse',
        progressPercent: 40,
      };

      const step3Validating: IngestionRunSummary = {
        ...mockRun,
        state: 'running',
        stage: 'validate',
        progressPercent: 80,
      };

      const step4Published: IngestionRunSummary = {
        ...mockRun,
        state: 'published',
        stage: 'complete',
        progressPercent: 100,
        datasetVersionId: 'version-uuid-1',
        finishedAt: '2026-09-20T11:05:00.000Z',
      };

      mockIngestionService.getRun
        .mockResolvedValueOnce(step1Initial)
        .mockResolvedValueOnce(step2Running)
        .mockResolvedValueOnce(step3Validating)
        .mockResolvedValueOnce(step4Published);

      const sseStream$ = await controller.events(testOrg, testRunId);
      const allEventsPromise = firstValueFrom(sseStream$.pipe(toArray()));

      // Advance timers through intervals
      await jest.advanceTimersByTimeAsync(1500);
      await jest.advanceTimersByTimeAsync(1500);
      await jest.advanceTimersByTimeAsync(1500);

      const events: MessageEvent[] = await allEventsPromise;

      expect(mockIngestionService.getRun).toHaveBeenCalledTimes(4);
      expect(events).toHaveLength(4);
      expect(events[0]).toEqual({
        type: 'ingestion.progress',
        id: `${testRunId}:queued:inspect:0`,
        data: step1Initial,
      });
      expect(events[1]).toEqual({
        type: 'ingestion.progress',
        id: `${testRunId}:running:parse:40`,
        data: step2Running,
      });
      expect(events[2]).toEqual({
        type: 'ingestion.progress',
        id: `${testRunId}:running:validate:80`,
        data: step3Validating,
      });
      expect(events[3]).toEqual({
        type: 'ingestion.progress',
        id: `${testRunId}:published:complete:100`,
        data: step4Published,
      });
    });

    it('terminates immediately and inclusively when initial status is published', async () => {
      const publishedStatus: IngestionRunSummary = {
        ...mockRun,
        state: 'published',
        stage: 'complete',
        progressPercent: 100,
        datasetVersionId: 'version-uuid-1',
        finishedAt: '2026-09-20T11:05:00.000Z',
      };

      mockIngestionService.getRun.mockResolvedValue(publishedStatus);

      const sseStream$ = await controller.events(testOrg, testRunId);
      const allEventsPromise = firstValueFrom(sseStream$.pipe(toArray()));

      await jest.advanceTimersByTimeAsync(1500);

      const events = await allEventsPromise;

      expect(mockIngestionService.getRun).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'ingestion.progress',
        id: `${testRunId}:published:complete:100`,
        data: publishedStatus,
      });
    });

    it('terminates stream for failed and cancelled terminal states', async () => {
      const terminalCases: Array<{
        state: TerminalIngestionRunState;
        stage: IngestionRunSummary['stage'];
        failure: IngestionRunSummary['failure'];
      }> = [
        {
          state: 'failed',
          stage: 'validate',
          failure: {
            code: 'parse_error',
            message: 'Invalid CSV format at line 12',
          },
        },
        {
          state: 'cancelled',
          stage: 'complete',
          failure: {
            code: 'cancelled_by_user',
            message: 'User cancelled run',
          },
        },
      ];

      for (const testCase of terminalCases) {
        mockIngestionService.getRun.mockReset();

        const status: IngestionRunSummary = {
          ...mockRun,
          state: testCase.state,
          stage: testCase.stage,
          progressPercent: 100,
          failure: testCase.failure,
          finishedAt: '2026-09-20T11:05:00.000Z',
        };

        mockIngestionService.getRun.mockResolvedValue(status);

        const sseStream$ = await controller.events(testOrg, testRunId);
        const allEventsPromise = firstValueFrom(sseStream$.pipe(toArray()));

        await jest.advanceTimersByTimeAsync(1500);

        const events = await allEventsPromise;
        expect(events).toHaveLength(1);
        expect((events[0].data as IngestionRunSummary).state).toBe(
          testCase.state,
        );
        expect(mockIngestionService.getRun).toHaveBeenCalledTimes(1);
      }
    });

    it('stops polling when a subsequent tick transitions to failed or cancelled', async () => {
      const runningStatus: IngestionRunSummary = {
        ...mockRun,
        state: 'running',
        stage: 'map',
        progressPercent: 50,
      };

      const failedStatus: IngestionRunSummary = {
        ...mockRun,
        state: 'failed',
        stage: 'map',
        progressPercent: 50,
        failure: {
          code: 'mapping_mismatch',
          message: 'Expected numeric column',
        },
        finishedAt: '2026-09-20T11:03:00.000Z',
      };

      mockIngestionService.getRun
        .mockResolvedValueOnce(runningStatus)
        .mockResolvedValueOnce(failedStatus);

      const sseStream$ = await controller.events(testOrg, testRunId);
      const allEventsPromise = firstValueFrom(sseStream$.pipe(toArray()));

      await jest.advanceTimersByTimeAsync(1500);

      const events = await allEventsPromise;
      expect(events).toHaveLength(2);
      expect(events[0].data).toEqual(runningStatus);
      expect(events[1].data).toEqual(failedStatus);
      expect(mockIngestionService.getRun).toHaveBeenCalledTimes(2);
    });

    it('allows consumers to take a specific number of items using RxJS take operator', async () => {
      const inProgressStatus: IngestionRunSummary = {
        ...mockRun,
        state: 'running',
        stage: 'parse',
        progressPercent: 20,
      };

      mockIngestionService.getRun.mockResolvedValue(inProgressStatus);

      const sseStream$ = await controller.events(testOrg, testRunId);
      const twoEventsPromise = firstValueFrom(
        sseStream$.pipe(take(2), toArray()),
      );

      await jest.advanceTimersByTimeAsync(1500);

      const events = await twoEventsPromise;
      expect(events).toHaveLength(2);
      // initial getRun call + 1 tick from timer
      expect(mockIngestionService.getRun).toHaveBeenCalledTimes(2);
    });

    it('propagates service rejection when initial getRun fails', async () => {
      mockIngestionService.getRun.mockRejectedValue(new Error('Run not found'));

      await expect(controller.events(testOrg, testRunId)).rejects.toThrow(
        'Run not found',
      );
    });

    it('propagates error to subscriber if polling getRun fails during stream', async () => {
      const runningStatus: IngestionRunSummary = {
        ...mockRun,
        state: 'running',
        stage: 'parse',
        progressPercent: 20,
      };

      mockIngestionService.getRun
        .mockResolvedValueOnce(runningStatus)
        .mockRejectedValueOnce(new Error('Database connection failed'));

      const sseStream$ = await controller.events(testOrg, testRunId);
      const events: MessageEvent[] = [];
      let streamError: unknown = null;

      sseStream$.subscribe({
        next: (ev) => events.push(ev),
        error: (err) => {
          streamError = err;
        },
      });

      expect(events).toHaveLength(1); // initial event received synchronously
      await jest.advanceTimersByTimeAsync(1500);

      expect(streamError).toEqual(new Error('Database connection failed'));
    });
  });
});
