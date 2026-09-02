import type { AcresConfigService } from '../config/acres-config.service';
import type {
  TenantTransactionClient,
  TenantTransactionService,
} from '../prisma/tenant-transaction.service';
import { OutboxService, type ClaimedOutboxEvent } from './outbox.service';

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
    it('claims ready outbox events using workerScoped raw query with lease', async () => {
      const mockClaimed: ClaimedOutboxEvent[] = [
        {
          id: 'evt-1',
          organizationId: 'org-123',
          eventType: 'upload.completed',
          aggregateId: 'up-1',
          payload: { uploadId: 'up-1' },
          attempts: 1,
          maxAttempts: 5,
        },
        {
          id: 'evt-2',
          organizationId: 'org-123',
          eventType: 'export.requested',
          aggregateId: 'exp-1',
          payload: { exportRequestId: 'exp-1' },
          attempts: 2,
          maxAttempts: 5,
        },
      ];
      mockTx.$queryRaw.mockResolvedValue(mockClaimed);

      const result = await service.claimReady();

      expect(fakeTenants.workerScoped).toHaveBeenCalled();
      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(result).toEqual(mockClaimed);
    });

    it('returns empty array when no events are available to claim', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      const result = await service.claimReady();

      expect(result).toEqual([]);
    });
  });

  describe('markDispatched', () => {
    it('marks event dispatched and clears worker locks', async () => {
      await service.markDispatched('evt-1');

      expect(fakeTenants.workerScoped).toHaveBeenCalled();
      expect(mockTx.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          state: 'dispatched',
          lockedBy: null,
          lockedUntil: null,
        }) as unknown,
      });
      const updateCalls = mockTx.outboxEvent.update.mock.calls as unknown as [
        [{ data: { dispatchedAt: Date } }],
      ];
      expect(updateCalls[0][0].data.dispatchedAt).toBeInstanceOf(Date);
    });
  });

  describe('markRetry', () => {
    it('marks event retrying with nextAttemptAt backoff and clears lease lock', async () => {
      const before = Date.now();
      await service.markRetry('evt-1', 'queue_unavailable');
      const after = Date.now();

      expect(fakeTenants.workerScoped).toHaveBeenCalled();
      expect(mockTx.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: expect.objectContaining({
          state: 'retrying',
          lastErrorCode: 'queue_unavailable',
          lockedBy: null,
          lockedUntil: null,
        }) as unknown,
      });

      const updateCalls = mockTx.outboxEvent.update.mock.calls as unknown as [
        [{ data: { nextAttemptAt: Date } }],
      ];
      const nextAttemptAt = updateCalls[0][0].data.nextAttemptAt.getTime();
      expect(nextAttemptAt).toBeGreaterThanOrEqual(before + 5000);
      expect(nextAttemptAt).toBeLessThanOrEqual(after + 5000 + 100);
    });
  });

  describe('markDeadLetter', () => {
    it('marks event dead_lettered and creates JobDeadLetter audit record', async () => {
      await service.markDeadLetter('evt-1', {
        organizationId: 'org-123',
        reasonCode: 'queue_unavailable',
        reasonMessage: 'Outbox dispatch attempts exhausted.',
        payload: { uploadId: 'up-1' },
      });

      expect(fakeTenants.workerScoped).toHaveBeenCalled();
      expect(mockTx.outboxEvent.update).toHaveBeenCalledWith({
        where: { id: 'evt-1' },
        data: {
          state: 'dead_lettered',
          lastErrorCode: 'queue_unavailable',
          lockedBy: null,
          lockedUntil: null,
        },
      });

      expect(mockTx.jobDeadLetter.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-123',
          outboxEventId: 'evt-1',
          reasonCode: 'queue_unavailable',
          reasonMessage: 'Outbox dispatch attempts exhausted.',
          payload: { uploadId: 'up-1' },
        },
      });
    });

    it('handles nullable organizationId when recording dead letter', async () => {
      await service.markDeadLetter('evt-2', {
        organizationId: null,
        reasonCode: 'payload_malformed',
        reasonMessage: 'Event payload was corrupted.',
      });

      expect(mockTx.jobDeadLetter.create).toHaveBeenCalledWith({
        data: {
          organizationId: null,
          outboxEventId: 'evt-2',
          reasonCode: 'payload_malformed',
          reasonMessage: 'Event payload was corrupted.',
          payload: undefined,
        },
      });
    });
  });
});
