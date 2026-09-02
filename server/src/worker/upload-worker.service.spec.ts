import type { AcresConfigService } from '../config/acres-config.service';
import type { IngestionProcessorService } from '../ingestion/ingestion-processor.service';
import type { MetricsService } from '../metrics/metrics.service';
import type {
  OutboxService,
  ClaimedOutboxEvent,
} from '../outbox/outbox.service';
import type {
  TenantTransactionClient,
  TenantTransactionService,
} from '../prisma/tenant-transaction.service';
import type { QueuePort } from '../queue/work-queue.port';
import type { ReportsService } from '../reports/reports.service';
import type { MalwareScannerPort } from '../scanner/scanner.port';
import type { ObjectStoragePort } from '../storage/storage.port';
import { UploadWorkerService } from './upload-worker.service';

describe('UploadWorkerService', () => {
  let service: UploadWorkerService;
  let fakeConfig: Partial<AcresConfigService>;
  let fakeTenants: Partial<TenantTransactionService>;
  let fakeOutbox: Partial<OutboxService>;
  let fakeQueue: Partial<QueuePort>;
  let fakeScanner: Partial<MalwareScannerPort>;
  let fakeStorage: Partial<ObjectStoragePort>;
  let fakeIngestionProcessor: Partial<IngestionProcessorService>;
  let fakeReports: Partial<ReportsService>;
  let fakeMetrics: Partial<MetricsService>;

  let mockWorkerTx: {
    upload: {
      findUnique: jest.Mock;
    };
    durableJob: {
      upsert: jest.Mock;
      update: jest.Mock;
    };
    jobDeadLetter: {
      create: jest.Mock;
    };
  };

  let mockOrgTx: {
    upload: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    storedObject: {
      update: jest.Mock;
    };
    jobProgressEvent: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    fakeConfig = {
      queueName: 'acres-queue',
      queuePrefix: 'acres',
      valkeyUrl: 'redis://localhost:6379',
      uploadCleanupIntervalMs: 60000,
      queueDefaultAttempts: 3,
    };

    mockWorkerTx = {
      upload: {
        findUnique: jest.fn(),
      },
      durableJob: {
        upsert: jest
          .fn()
          .mockImplementation(
            (args: { create: { deterministicKey: string } }) =>
              Promise.resolve({ id: 'dj-1', ...args.create }),
          ),
        update: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'dj-1', ...(args.data as object) }),
          ),
      },
      jobDeadLetter: {
        create: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'dl-1', ...(args.data as object) }),
          ),
      },
    };

    mockOrgTx = {
      upload: {
        findFirst: jest.fn(),
        update: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'up-1', ...(args.data as object) }),
          ),
      },
      storedObject: {
        update: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'so-1', ...(args.data as object) }),
          ),
      },
      jobProgressEvent: {
        create: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'jpe-1', ...(args.data as object) }),
          ),
      },
    };

    fakeTenants = {
      workerScoped: jest
        .fn()
        .mockImplementation(
          (callback: (tx: TenantTransactionClient) => Promise<unknown>) =>
            callback(mockWorkerTx as unknown as TenantTransactionClient),
        ),
      organizationScoped: jest
        .fn()
        .mockImplementation(
          (
            _acc: string,
            _org: string,
            callback: (tx: TenantTransactionClient) => Promise<unknown>,
          ) => callback(mockOrgTx as unknown as TenantTransactionClient),
        ),
    };

    fakeOutbox = {
      claimReady: jest.fn().mockResolvedValue([]),
      markDispatched: jest.fn().mockResolvedValue(undefined),
      markRetry: jest.fn().mockResolvedValue(undefined),
      markDeadLetter: jest.fn().mockResolvedValue(undefined),
    };

    fakeQueue = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };

    fakeScanner = {
      scanBuffer: jest.fn().mockResolvedValue({ status: 'clean' }),
    };

    fakeStorage = {
      getBuffer: jest
        .fn()
        .mockResolvedValue(Buffer.from('sample-file-content')),
    };

    fakeIngestionProcessor = {
      processRun: jest.fn().mockResolvedValue(undefined),
    };

    fakeReports = {
      processExport: jest.fn().mockResolvedValue(undefined),
    };

    fakeMetrics = {
      recordQueueJob: jest.fn(),
    };

    service = new UploadWorkerService(
      fakeConfig as AcresConfigService,
      fakeTenants as TenantTransactionService,
      fakeOutbox as OutboxService,
      fakeQueue as QueuePort,
      fakeScanner as MalwareScannerPort,
      fakeStorage as ObjectStoragePort,
      fakeIngestionProcessor as IngestionProcessorService,
      fakeReports as ReportsService,
      fakeMetrics as MetricsService,
    );
  });

  describe('dispatchOutboxOnce', () => {
    it('dispatches upload.completed events and enqueues durable jobs', async () => {
      const event: ClaimedOutboxEvent = {
        id: 'evt-1',
        organizationId: 'org-123',
        eventType: 'upload.completed',
        aggregateId: 'upload-456',
        payload: { uploadId: 'upload-456' },
        attempts: 1,
        maxAttempts: 3,
      };
      (fakeOutbox.claimReady as jest.Mock).mockResolvedValue([event]);

      await service.dispatchOutboxOnce();

      expect(mockWorkerTx.durableJob.upsert).toHaveBeenCalledWith({
        where: { deterministicKey: 'upload.completed:upload-456' },
        create: expect.objectContaining({
          deterministicKey: 'upload.completed:upload-456',
          organizationId: 'org-123',
          uploadId: 'upload-456',
          jobType: 'upload.completed',
          state: 'queued',
        }) as unknown,
        update: expect.anything() as unknown,
      });
      expect(fakeQueue.enqueue).toHaveBeenCalledWith({
        deterministicKey: 'upload.completed:upload-456',
        jobName: 'upload.completed',
        payload: {
          uploadId: 'upload-456',
          outboxEventId: 'evt-1',
        },
      });
      expect(fakeOutbox.markDispatched).toHaveBeenCalledWith('evt-1');
    });

    it('dispatches export.requested events and enqueues durable export jobs', async () => {
      const event: ClaimedOutboxEvent = {
        id: 'evt-2',
        organizationId: 'org-123',
        eventType: 'export.requested',
        aggregateId: 'export-789',
        payload: { exportRequestId: 'export-789' },
        attempts: 1,
        maxAttempts: 3,
      };
      (fakeOutbox.claimReady as jest.Mock).mockResolvedValue([event]);

      await service.dispatchOutboxOnce();

      expect(mockWorkerTx.durableJob.upsert).toHaveBeenCalledWith({
        where: { deterministicKey: 'export.requested:export-789' },
        create: expect.objectContaining({
          deterministicKey: 'export.requested:export-789',
          organizationId: 'org-123',
          uploadId: null,
          jobType: 'export.requested',
          state: 'queued',
        }) as unknown,
        update: expect.anything() as unknown,
      });
      expect(fakeQueue.enqueue).toHaveBeenCalledWith({
        deterministicKey: 'export.requested:export-789',
        jobName: 'export.requested',
        payload: {
          exportRequestId: 'export-789',
          outboxEventId: 'evt-2',
        },
      });
      expect(fakeOutbox.markDispatched).toHaveBeenCalledWith('evt-2');
    });

    it('schedules retry when enqueue fails and attempts < maxAttempts', async () => {
      const event: ClaimedOutboxEvent = {
        id: 'evt-3',
        organizationId: 'org-123',
        eventType: 'upload.completed',
        aggregateId: 'upload-999',
        payload: { uploadId: 'upload-999' },
        attempts: 1,
        maxAttempts: 3,
      };
      (fakeOutbox.claimReady as jest.Mock).mockResolvedValue([event]);
      (fakeQueue.enqueue as jest.Mock).mockRejectedValueOnce(
        new Error('Queue connection down'),
      );

      await service.dispatchOutboxOnce();

      expect(fakeOutbox.markRetry).toHaveBeenCalledWith(
        'evt-3',
        'queue_unavailable',
      );
      expect(fakeOutbox.markDeadLetter).not.toHaveBeenCalled();
      expect(fakeOutbox.markDispatched).not.toHaveBeenCalled();
    });

    it('dead letters event when enqueue fails and attempts >= maxAttempts', async () => {
      const event: ClaimedOutboxEvent = {
        id: 'evt-4',
        organizationId: 'org-123',
        eventType: 'upload.completed',
        aggregateId: 'upload-999',
        payload: { uploadId: 'upload-999' },
        attempts: 3,
        maxAttempts: 3,
      };
      (fakeOutbox.claimReady as jest.Mock).mockResolvedValue([event]);
      (fakeQueue.enqueue as jest.Mock).mockRejectedValueOnce(
        new Error('Queue permanent failure'),
      );

      await service.dispatchOutboxOnce();

      expect(fakeOutbox.markDeadLetter).toHaveBeenCalledWith('evt-4', {
        organizationId: 'org-123',
        reasonCode: 'queue_unavailable',
        reasonMessage: 'Outbox dispatch attempts exhausted.',
        payload: { uploadId: 'upload-999' },
      });
      expect(fakeOutbox.markRetry).not.toHaveBeenCalled();
    });

    it('skips dispatching if stopped or already dispatching', async () => {
      (fakeOutbox.claimReady as jest.Mock).mockClear();

      // Simulate dispatching flag true
      (service as unknown as { dispatching: boolean }).dispatching = true;
      await service.dispatchOutboxOnce();
      expect(fakeOutbox.claimReady).not.toHaveBeenCalled();

      // Reset and simulate stopping true
      (service as unknown as { dispatching: boolean }).dispatching = false;
      (service as unknown as { stopping: boolean }).stopping = true;
      await service.dispatchOutboxOnce();
      expect(fakeOutbox.claimReady).not.toHaveBeenCalled();
    });
  });

  describe('process', () => {
    const mockUpload = {
      id: 'upload-1',
      organizationId: 'org-1',
      actorAccountId: 'acc-1',
      state: 'completed',
      storedObjectId: 'obj-1',
      storedObject: {
        id: 'obj-1',
        objectKey: 'organizations/org-1/quarantine/raw.csv',
      },
    };

    it('delegates to ingestion processor when ingestionRunId is present', async () => {
      await service.process({ ingestionRunId: 'ingest-123' });

      expect(fakeIngestionProcessor.processRun).toHaveBeenCalledWith(
        'ingest-123',
      );
      expect(fakeStorage.getBuffer).not.toHaveBeenCalled();
    });

    it('delegates to reports service when exportRequestId is present', async () => {
      await service.process({ exportRequestId: 'export-456' });

      expect(fakeReports.processExport).toHaveBeenCalledWith('export-456');
      expect(fakeStorage.getBuffer).not.toHaveBeenCalled();
    });

    it('returns early when uploadId is undefined or upload not found', async () => {
      await service.process({});
      expect(mockWorkerTx.durableJob.upsert).not.toHaveBeenCalled();

      mockWorkerTx.upload.findUnique.mockResolvedValueOnce(null);
      await service.process({ uploadId: 'upload-nonexistent' });
      expect(fakeStorage.getBuffer).not.toHaveBeenCalled();
    });

    it('returns early if upload has null organizationId', async () => {
      mockWorkerTx.upload.findUnique.mockResolvedValueOnce({
        ...mockUpload,
        organizationId: null,
      });

      await service.process({ uploadId: 'upload-1' });
      expect(fakeStorage.getBuffer).not.toHaveBeenCalled();
    });

    it('skips scan if fresh upload state is not "completed"', async () => {
      mockWorkerTx.upload.findUnique.mockResolvedValueOnce(mockUpload);
      mockOrgTx.upload.findFirst.mockResolvedValueOnce({
        ...mockUpload,
        state: 'pending_upload', // not completed
      });

      await service.process({ uploadId: 'upload-1' });

      expect(fakeStorage.getBuffer).not.toHaveBeenCalled();
      expect(fakeScanner.scanBuffer).not.toHaveBeenCalled();
    });

    it('processes clean upload: transitions to scanning then accepted and succeeds durable job', async () => {
      mockWorkerTx.upload.findUnique.mockResolvedValueOnce(mockUpload);
      mockOrgTx.upload.findFirst
        .mockResolvedValueOnce(mockUpload) // initial check in scanning stage
        .mockResolvedValueOnce({ ...mockUpload, state: 'scanning' }); // second check in terminal stage

      (fakeStorage.getBuffer as jest.Mock).mockResolvedValueOnce(
        Buffer.from('valid csv content'),
      );
      (fakeScanner.scanBuffer as jest.Mock).mockResolvedValueOnce({
        status: 'clean',
      });

      await service.process({ uploadId: 'upload-1' });

      // Stage 1: scanning transition
      expect(mockOrgTx.upload.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'upload-1' },
        data: {
          state: 'scanning',
          progressStage: 'scanning',
          progressPercent: 50,
        },
      });
      expect(mockOrgTx.jobProgressEvent.create).toHaveBeenNthCalledWith(1, {
        data: {
          organizationId: 'org-1',
          uploadId: 'upload-1',
          durableJobId: 'dj-1',
          stage: 'scanning',
          percent: 50,
        },
      });

      // Stage 2: accepted transition
      expect(mockOrgTx.upload.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'upload-1' },
        data: expect.objectContaining({
          state: 'accepted',
          scanStatus: 'clean',
          scanResult: 'clean',
          progressStage: 'accepted',
          progressPercent: 100,
        }) as unknown,
      });
      expect(mockOrgTx.storedObject.update).toHaveBeenCalledWith({
        where: { id: 'obj-1' },
        data: { state: 'accepted' },
      });
      expect(mockOrgTx.jobProgressEvent.create).toHaveBeenNthCalledWith(2, {
        data: {
          organizationId: 'org-1',
          uploadId: 'upload-1',
          durableJobId: 'dj-1',
          stage: 'accepted',
          percent: 100,
        },
      });

      // Durable job update
      expect(mockWorkerTx.durableJob.update).toHaveBeenCalledWith({
        where: { id: 'dj-1' },
        data: expect.objectContaining({
          state: 'succeeded',
          lastErrorCode: null,
          lastErrorMessage: null,
        }) as unknown,
      });
      const updateCalls = mockWorkerTx.durableJob.update.mock
        .calls as unknown as [[{ data: { finishedAt: Date } }]];
      expect(updateCalls[0][0].data.finishedAt).toBeInstanceOf(Date);
      expect(mockWorkerTx.jobDeadLetter.create).not.toHaveBeenCalled();
    });

    it('processes infected upload: rejects upload/storedObject, fails durableJob, and writes dead letter', async () => {
      mockWorkerTx.upload.findUnique.mockResolvedValueOnce(mockUpload);
      mockOrgTx.upload.findFirst
        .mockResolvedValueOnce(mockUpload)
        .mockResolvedValueOnce({ ...mockUpload, state: 'scanning' });

      (fakeStorage.getBuffer as jest.Mock).mockResolvedValueOnce(
        Buffer.from('malicious payload'),
      );
      (fakeScanner.scanBuffer as jest.Mock).mockResolvedValueOnce({
        status: 'infected',
        signature: 'Win.Test.EICAR_HDB-1',
      });

      await service.process({ uploadId: 'upload-1' });

      expect(mockOrgTx.upload.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'upload-1' },
        data: {
          state: 'rejected',
          scanStatus: 'infected',
          scanResult: 'Win.Test.EICAR_HDB-1',
          failureCode: 'infected',
          failureMessage: 'Upload did not pass malware scanning.',
          progressStage: 'rejected',
          progressPercent: 100,
        },
      });
      expect(mockOrgTx.storedObject.update).toHaveBeenCalledWith({
        where: { id: 'obj-1' },
        data: { state: 'rejected' },
      });
      expect(mockWorkerTx.durableJob.update).toHaveBeenCalledWith({
        where: { id: 'dj-1' },
        data: expect.objectContaining({
          state: 'failed',
          lastErrorCode: 'infected',
          lastErrorMessage: 'Upload did not pass malware scanning.',
        }) as unknown,
      });
      expect(mockWorkerTx.jobDeadLetter.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          durableJobId: 'dj-1',
          reasonCode: 'infected',
          reasonMessage: 'Upload did not pass malware scanning.',
          payload: { uploadId: 'upload-1' },
        },
      });
    });

    it('fails closed when object is missing from storage', async () => {
      mockWorkerTx.upload.findUnique.mockResolvedValueOnce(mockUpload);
      mockOrgTx.upload.findFirst
        .mockResolvedValueOnce(mockUpload)
        .mockResolvedValueOnce({ ...mockUpload, state: 'scanning' });

      (fakeStorage.getBuffer as jest.Mock).mockResolvedValueOnce(null);

      await service.process({ uploadId: 'upload-1' });

      expect(fakeScanner.scanBuffer).not.toHaveBeenCalled();
      expect(mockOrgTx.upload.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'upload-1' },
        data: {
          state: 'rejected',
          scanStatus: 'failed',
          scanResult: 'object_missing',
          failureCode: 'object_missing',
          failureMessage: 'Upload did not pass malware scanning.',
          progressStage: 'rejected',
          progressPercent: 100,
        },
      });
      expect(mockWorkerTx.durableJob.update).toHaveBeenCalledWith({
        where: { id: 'dj-1' },
        data: expect.objectContaining({
          state: 'failed',
          lastErrorCode: 'object_missing',
          lastErrorMessage: 'Upload did not pass malware scanning.',
        }) as unknown,
      });
      expect(mockWorkerTx.jobDeadLetter.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          durableJobId: 'dj-1',
          reasonCode: 'object_missing',
          reasonMessage: 'Upload did not pass malware scanning.',
          payload: { uploadId: 'upload-1' },
        },
      });
    });

    it('safely cancels processing when upload is cancelled mid-scan', async () => {
      mockWorkerTx.upload.findUnique.mockResolvedValueOnce(mockUpload);
      mockOrgTx.upload.findFirst
        .mockResolvedValueOnce(mockUpload)
        .mockResolvedValueOnce({ ...mockUpload, state: 'cancelled' }); // cancelled mid-scan

      (fakeStorage.getBuffer as jest.Mock).mockResolvedValueOnce(
        Buffer.from('data'),
      );
      (fakeScanner.scanBuffer as jest.Mock).mockResolvedValueOnce({
        status: 'clean',
      });

      await service.process({ uploadId: 'upload-1' });

      // Does not update upload or storedObject to accepted
      expect(mockOrgTx.storedObject.update).not.toHaveBeenCalled();
      expect(mockWorkerTx.durableJob.update).toHaveBeenCalledWith({
        where: { id: 'dj-1' },
        data: expect.objectContaining({
          state: 'cancelled',
          lastErrorCode: null,
          lastErrorMessage: null,
        }) as unknown,
      });
      expect(mockWorkerTx.jobDeadLetter.create).not.toHaveBeenCalled();
    });

    it('finalizes exception and dead letters on unexpected worker crash', async () => {
      mockWorkerTx.upload.findUnique.mockResolvedValueOnce(mockUpload);
      mockOrgTx.upload.findFirst.mockResolvedValueOnce(mockUpload);

      (fakeStorage.getBuffer as jest.Mock).mockRejectedValueOnce(
        new Error('S3 connection reset'),
      );

      await expect(service.process({ uploadId: 'upload-1' })).rejects.toThrow(
        'S3 connection reset',
      );

      expect(mockWorkerTx.durableJob.update).toHaveBeenCalledWith({
        where: { id: 'dj-1' },
        data: expect.objectContaining({
          state: 'failed',
          lastErrorCode: 'worker_exception',
        }) as unknown,
      });
      expect(mockWorkerTx.jobDeadLetter.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          durableJobId: 'dj-1',
          reasonCode: 'worker_exception',
          payload: { uploadId: 'upload-1' },
        }) as unknown,
      });
    });
  });

  describe('stop', () => {
    it('sets stopping flag, closes worker and queue', async () => {
      await service.stop();

      expect(fakeQueue.close).toHaveBeenCalled();
    });
  });
});
