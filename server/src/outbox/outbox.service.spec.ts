import type { AcresConfigService } from '../config/acres-config.service';
import type {
  TenantTransactionClient,
  TenantTransactionService,
} from '../prisma/tenant-transaction.service';
import { OutboxService } from './outbox.service';

describe('OutboxService', () => {
  let service: OutboxService;
  let fakeTenants: Partial<TenantTransactionService>;
  let fakeConfig: Partial<AcresConfigService>;
  let mockTx: {
    outboxEvent: {
      create: jest.Mock;
      update: jest.Mock;
    };
    jobDeadLetter: {
      create: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };

  beforeEach(() => {
    mockTx = {
      outboxEvent: {
        create: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'evt-1', ...(args.data as object) }),
          ),
        update: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'evt-1', ...(args.data as object) }),
          ),
      },
      jobDeadLetter: {
        create: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'dl-1', ...(args.data as object) }),
          ),
      },
      $queryRaw: jest.fn(),
    };

    fakeTenants = {
      workerScoped: jest
        .fn()
        .mockImplementation(
          (callback: (tx: TenantTransactionClient) => Promise<unknown>) =>
            callback(mockTx as unknown as TenantTransactionClient),
        ),
    };

    fakeConfig = {
      outboxMaxAttempts: 5,
      outboxClaimBatchSize: 10,
      outboxClaimLeaseMs: 30000,
      queueBackoffMs: 5000,
    };

    service = new OutboxService(
      fakeTenants as TenantTransactionService,
      fakeConfig as AcresConfigService,
    );
  });

  describe('appendUploadCompleted', () => {
    it('appends upload.completed event within provided transaction', async () => {
      const tx = mockTx as unknown as TenantTransactionClient;
      await service.appendUploadCompleted(tx, {
        organizationId: 'org-123',
        uploadId: 'upload-456',
        version: 2,
      });

      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-123',
          eventType: 'upload.completed',
          aggregateType: 'Upload',
          aggregateId: 'upload-456',
          aggregateVersion: 2,
          payload: { uploadId: 'upload-456' },
          maxAttempts: 5,
        },
      });
    });
  });

  describe('appendExportRequested', () => {
    it('appends export.requested event within provided transaction', async () => {
      const tx = mockTx as unknown as TenantTransactionClient;
      await service.appendExportRequested(tx, {
        organizationId: 'org-123',
        exportRequestId: 'export-789',
      });

      expect(mockTx.outboxEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-123',
          eventType: 'export.requested',
          aggregateType: 'ExportRequest',
          aggregateId: 'export-789',
          aggregateVersion: 1,
          payload: { exportRequestId: 'export-789' },
          maxAttempts: 5,
        },
      });
    });
  });

  describe('claimReady', () => {
    it('returns a bounded database claim batch, including an empty batch', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);
      expect(await service.claimReady()).toEqual([]);
      expect(fakeTenants.workerScoped).toHaveBeenCalledTimes(1);
    });
  });
});
