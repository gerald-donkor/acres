import type { MessageEvent } from '@nestjs/common';
import { firstValueFrom, take, toArray } from 'rxjs';
import {
  isTerminalUploadState,
  TERMINAL_UPLOAD_STATES,
  type InitiateUploadResult,
  type TerminalUploadState,
  type UploadDownload,
  type UploadStatus,
} from '@acres/shared';
import type { OrganizationContext } from '../organizations/organization-context';
import { UploadsController } from './uploads.controller';
import type { UploadsService } from './uploads.service';
import type { CompleteUploadDto } from './dto/complete-upload.dto';
import type { InitiateUploadDto } from './dto/initiate-upload.dto';

describe('UploadsController', () => {
  let controller: UploadsController;
  let mockUploadsService: {
    initiate: jest.Mock<
      Promise<InitiateUploadResult>,
      [OrganizationContext, string | undefined, InitiateUploadDto]
    >;
    complete: jest.Mock<
      Promise<UploadStatus>,
      [OrganizationContext, string, string | undefined, CompleteUploadDto]
    >;
    get: jest.Mock<Promise<UploadStatus>, [OrganizationContext, string]>;
    cancel: jest.Mock<
      Promise<UploadStatus>,
      [OrganizationContext, string, string | undefined]
    >;
    download: jest.Mock<Promise<UploadDownload>, [OrganizationContext, string]>;
  };

  const testOrg: OrganizationContext = {
    organizationId: 'org-test-123',
    accountId: 'acc-test-456',
    membershipId: 'mem-test-789',
    role: 'owner',
  };

  const testUploadId = 'upload-uuid-1';
  const testIdempotencyKey = 'a-valid-idempotency-key-12345';

  beforeEach(() => {
    jest.useFakeTimers();

    mockUploadsService = {
      initiate: jest.fn<
        Promise<InitiateUploadResult>,
        [OrganizationContext, string | undefined, InitiateUploadDto]
      >(),
      complete: jest.fn<
        Promise<UploadStatus>,
        [OrganizationContext, string, string | undefined, CompleteUploadDto]
      >(),
      get: jest.fn<Promise<UploadStatus>, [OrganizationContext, string]>(),
      cancel: jest.fn<
        Promise<UploadStatus>,
        [OrganizationContext, string, string | undefined]
      >(),
      download: jest.fn<
        Promise<UploadDownload>,
        [OrganizationContext, string]
      >(),
    };

    controller = new UploadsController(
      mockUploadsService as unknown as UploadsService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('canonical exports & state helpers', () => {
    it('verifies TERMINAL_UPLOAD_STATES contains exactly accepted, rejected, cancelled, and expired', () => {
      expect(Array.isArray(TERMINAL_UPLOAD_STATES)).toBe(true);
      expect(TERMINAL_UPLOAD_STATES).toEqual([
        'accepted',
        'rejected',
        'cancelled',
        'expired',
      ]);
    });

    it('returns true for terminal upload states', () => {
      const terminalStates: TerminalUploadState[] = [
        'accepted',
        'rejected',
        'cancelled',
        'expired',
      ];

      for (const state of terminalStates) {
        expect(isTerminalUploadState(state)).toBe(true);
      }
    });

    it('returns false for non-terminal and arbitrary upload states', () => {
      const nonTerminalStates: string[] = [
        'pending_upload',
        'completed',
        'scanning',
        'quarantined',
        'deleted',
        'unknown',
        '',
      ];

      for (const state of nonTerminalStates) {
        expect(isTerminalUploadState(state)).toBe(false);
      }
    });
  });

  describe('initiate', () => {
    it('calls uploads.initiate with organization, idempotencyKey, and body', async () => {
      const body: InitiateUploadDto = {
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        checksumHex:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      const expectedResult: InitiateUploadResult = {
        uploadId: testUploadId,
        object: {
          key: `orgs/${testOrg.organizationId}/uploads/${testUploadId}`,
          bucket: 'acres-storage',
          checksumAlgorithm: 'sha256',
        },
        upload: {
          url: 'https://storage.example.com/put-signed',
          method: 'PUT',
          headers: { 'content-type': 'text/csv' },
          expiresAt: '2026-09-21T02:00:00.000Z',
        },
        complete: {
          method: 'POST',
          url: `/api/v1/uploads/${testUploadId}/complete`,
          requiredHeaders: ['idempotency-key'],
        },
      };

      mockUploadsService.initiate.mockResolvedValue(expectedResult);

      const result = await controller.initiate(
        testOrg,
        testIdempotencyKey,
        body,
      );

      expect(mockUploadsService.initiate).toHaveBeenCalledTimes(1);
      expect(mockUploadsService.initiate).toHaveBeenCalledWith(
        testOrg,
        testIdempotencyKey,
        body,
      );
      expect(result).toEqual(expectedResult);
    });

    it('supports optional idempotencyKey being undefined', async () => {
      const body: InitiateUploadDto = {
        filename: 'metrics.geojson',
        mediaType: 'application/geo+json',
        byteCount: 4096,
      };

      const expectedResult: InitiateUploadResult = {
        uploadId: 'upload-uuid-2',
        object: {
          key: `orgs/${testOrg.organizationId}/uploads/upload-uuid-2`,
          bucket: 'acres-storage',
          checksumAlgorithm: 'sha256',
        },
        upload: {
          url: 'https://storage.example.com/put-signed-2',
          method: 'PUT',
          headers: {},
          expiresAt: '2026-09-21T02:00:00.000Z',
        },
        complete: {
          method: 'POST',
          url: '/api/v1/uploads/upload-uuid-2/complete',
          requiredHeaders: ['idempotency-key'],
        },
      };

      mockUploadsService.initiate.mockResolvedValue(expectedResult);

      const result = await controller.initiate(testOrg, undefined, body);

      expect(mockUploadsService.initiate).toHaveBeenCalledTimes(1);
      expect(mockUploadsService.initiate).toHaveBeenCalledWith(
        testOrg,
        undefined,
        body,
      );
      expect(result).toEqual(expectedResult);
    });

    it('propagates service rejection', async () => {
      const body: InitiateUploadDto = {
        filename: 'data.csv',
        mediaType: 'text/csv',
        byteCount: 1024,
      };
      mockUploadsService.initiate.mockRejectedValue(
        new Error('Storage unavailable'),
      );

      await expect(
        controller.initiate(testOrg, testIdempotencyKey, body),
      ).rejects.toThrow('Storage unavailable');
    });
  });

  describe('complete', () => {
    it('calls uploads.complete with organization, uploadId, idempotencyKey, and body', async () => {
      const body: CompleteUploadDto = {
        byteCount: 2048,
        checksumHex:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };

      const expectedStatus: UploadStatus = {
        id: testUploadId,
        state: 'completed',
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        checksumHex:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        progress: { stage: 'completed', percent: 25 },
        failure: null,
        acceptedAt: null,
      };

      mockUploadsService.complete.mockResolvedValue(expectedStatus);

      const result = await controller.complete(
        testOrg,
        testUploadId,
        testIdempotencyKey,
        body,
      );

      expect(mockUploadsService.complete).toHaveBeenCalledTimes(1);
      expect(mockUploadsService.complete).toHaveBeenCalledWith(
        testOrg,
        testUploadId,
        testIdempotencyKey,
        body,
      );
      expect(result).toEqual(expectedStatus);
    });

    it('propagates service rejection', async () => {
      const body: CompleteUploadDto = {
        byteCount: 2048,
        checksumHex:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      };
      mockUploadsService.complete.mockRejectedValue(
        new Error('Invalid checksum'),
      );

      await expect(
        controller.complete(testOrg, testUploadId, testIdempotencyKey, body),
      ).rejects.toThrow('Invalid checksum');
    });
  });

  describe('get', () => {
    it('calls uploads.get with organization and uploadId', async () => {
      const expectedStatus: UploadStatus = {
        id: testUploadId,
        state: 'scanning',
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        checksumHex:
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        progress: { stage: 'antivirus', percent: 50 },
        failure: null,
        acceptedAt: null,
      };

      mockUploadsService.get.mockResolvedValue(expectedStatus);

      const result = await controller.get(testOrg, testUploadId);

      expect(mockUploadsService.get).toHaveBeenCalledTimes(1);
      expect(mockUploadsService.get).toHaveBeenCalledWith(
        testOrg,
        testUploadId,
      );
      expect(result).toEqual(expectedStatus);
    });

    it('propagates service rejection', async () => {
      mockUploadsService.get.mockRejectedValue(new Error('Upload not found'));

      await expect(controller.get(testOrg, testUploadId)).rejects.toThrow(
        'Upload not found',
      );
    });
  });

  describe('cancel', () => {
    it('calls uploads.cancel with organization, uploadId, and idempotencyKey', async () => {
      const expectedStatus: UploadStatus = {
        id: testUploadId,
        state: 'cancelled',
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        checksumHex: null,
        progress: { stage: 'cancelled', percent: 100 },
        failure: {
          code: 'cancelled_by_user',
          message: 'Upload cancelled by user',
        },
        acceptedAt: null,
      };

      mockUploadsService.cancel.mockResolvedValue(expectedStatus);

      const result = await controller.cancel(
        testOrg,
        testUploadId,
        testIdempotencyKey,
      );

      expect(mockUploadsService.cancel).toHaveBeenCalledTimes(1);
      expect(mockUploadsService.cancel).toHaveBeenCalledWith(
        testOrg,
        testUploadId,
        testIdempotencyKey,
      );
      expect(result).toEqual(expectedStatus);
    });

    it('supports cancel with undefined idempotencyKey', async () => {
      const expectedStatus: UploadStatus = {
        id: testUploadId,
        state: 'cancelled',
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        checksumHex: null,
        progress: { stage: 'cancelled', percent: 100 },
        failure: { code: 'cancelled_by_user', message: null },
        acceptedAt: null,
      };

      mockUploadsService.cancel.mockResolvedValue(expectedStatus);

      const result = await controller.cancel(testOrg, testUploadId, undefined);

      expect(mockUploadsService.cancel).toHaveBeenCalledWith(
        testOrg,
        testUploadId,
        undefined,
      );
      expect(result).toEqual(expectedStatus);
    });

    it('propagates service rejection', async () => {
      mockUploadsService.cancel.mockRejectedValue(
        new Error('Cannot cancel active upload'),
      );

      await expect(
        controller.cancel(testOrg, testUploadId, testIdempotencyKey),
      ).rejects.toThrow('Cannot cancel active upload');
    });
  });

  describe('download', () => {
    it('calls uploads.download with organization and uploadId', async () => {
      const expectedDownload: UploadDownload = {
        url: 'https://storage.example.com/get-signed-download-url',
        method: 'GET',
        headers: { 'response-content-disposition': 'attachment' },
        expiresAt: '2026-09-21T02:00:00.000Z',
      };

      mockUploadsService.download.mockResolvedValue(expectedDownload);

      const result = await controller.download(testOrg, testUploadId);

      expect(mockUploadsService.download).toHaveBeenCalledTimes(1);
      expect(mockUploadsService.download).toHaveBeenCalledWith(
        testOrg,
        testUploadId,
      );
      expect(result).toEqual(expectedDownload);
    });

    it('propagates service rejection', async () => {
      mockUploadsService.download.mockRejectedValue(
        new Error('Object quarantined'),
      );

      await expect(controller.download(testOrg, testUploadId)).rejects.toThrow(
        'Object quarantined',
      );
    });
  });

  describe('events (SSE Observable stream)', () => {
    it('maps emitted upload status to MessageEvent structure with formatted id and type', async () => {
      const inProgressStatus: UploadStatus = {
        id: testUploadId,
        state: 'scanning',
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 1024,
        checksumHex: null,
        progress: { stage: 'antivirus', percent: 50 },
        failure: null,
        acceptedAt: null,
      };

      mockUploadsService.get.mockResolvedValue(inProgressStatus);

      const sseStream$ = controller.events(testOrg, testUploadId);

      const eventPromise = firstValueFrom(sseStream$);
      await jest.advanceTimersByTimeAsync(1500);
      const event = await eventPromise;

      expect(mockUploadsService.get).toHaveBeenCalledWith(
        testOrg,
        testUploadId,
      );
      expect(event).toEqual({
        type: 'upload.progress',
        id: `${testUploadId}:antivirus:50`,
        data: inProgressStatus,
      });
    });

    it('emits consecutive progress events until a terminal state is reached, including the terminal event, then completes', async () => {
      const step1Status: UploadStatus = {
        id: testUploadId,
        state: 'scanning',
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        checksumHex: null,
        progress: { stage: 'antivirus', percent: 30 },
        failure: null,
        acceptedAt: null,
      };

      const step2Status: UploadStatus = {
        id: testUploadId,
        state: 'scanning',
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        checksumHex: null,
        progress: { stage: 'schema_validation', percent: 70 },
        failure: null,
        acceptedAt: null,
      };

      const step3AcceptedStatus: UploadStatus = {
        id: testUploadId,
        state: 'accepted',
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        checksumHex: 'abc123',
        progress: { stage: 'completed', percent: 100 },
        failure: null,
        acceptedAt: '2026-09-21T01:30:00.000Z',
      };

      mockUploadsService.get
        .mockResolvedValueOnce(step1Status)
        .mockResolvedValueOnce(step2Status)
        .mockResolvedValueOnce(step3AcceptedStatus);

      const sseStream$ = controller.events(testOrg, testUploadId);
      const allEventsPromise = firstValueFrom(sseStream$.pipe(toArray()));

      // Advance timer through all three intervals
      await jest.advanceTimersByTimeAsync(1500);
      await jest.advanceTimersByTimeAsync(1500);
      await jest.advanceTimersByTimeAsync(1500);

      const events: MessageEvent[] = await allEventsPromise;

      expect(mockUploadsService.get).toHaveBeenCalledTimes(3);
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({
        type: 'upload.progress',
        id: `${testUploadId}:antivirus:30`,
        data: step1Status,
      });
      expect(events[1]).toEqual({
        type: 'upload.progress',
        id: `${testUploadId}:schema_validation:70`,
        data: step2Status,
      });
      expect(events[2]).toEqual({
        type: 'upload.progress',
        id: `${testUploadId}:completed:100`,
        data: step3AcceptedStatus,
      });
    });

    it('terminates immediately and inclusively when initial status is already terminal (e.g. rejected)', async () => {
      const rejectedStatus: UploadStatus = {
        id: testUploadId,
        state: 'rejected',
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        checksumHex: null,
        progress: { stage: 'rejected', percent: 100 },
        failure: {
          code: 'virus_detected',
          message: 'Malware signature detected',
        },
        acceptedAt: null,
      };

      mockUploadsService.get.mockResolvedValue(rejectedStatus);

      const sseStream$ = controller.events(testOrg, testUploadId);
      const allEventsPromise = firstValueFrom(sseStream$.pipe(toArray()));

      await jest.advanceTimersByTimeAsync(1500);

      const events = await allEventsPromise;

      expect(mockUploadsService.get).toHaveBeenCalledTimes(1);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'upload.progress',
        id: `${testUploadId}:rejected:100`,
        data: rejectedStatus,
      });
    });

    it('terminates stream for cancelled and expired terminal states', async () => {
      for (const terminalState of ['cancelled', 'expired'] as const) {
        mockUploadsService.get.mockReset();

        const status: UploadStatus = {
          id: testUploadId,
          state: terminalState,
          filename: 'dataset.csv',
          mediaType: 'text/csv',
          byteCount: 2048,
          checksumHex: null,
          progress: { stage: terminalState, percent: 100 },
          failure:
            terminalState === 'cancelled'
              ? { code: 'cancelled_by_user', message: null }
              : { code: 'upload_expired', message: 'Upload window expired' },
          acceptedAt: null,
        };

        mockUploadsService.get.mockResolvedValue(status);

        const sseStream$ = controller.events(testOrg, testUploadId);
        const allEventsPromise = firstValueFrom(sseStream$.pipe(toArray()));

        await jest.advanceTimersByTimeAsync(1500);

        const events = await allEventsPromise;
        expect(events).toHaveLength(1);
        expect((events[0].data as UploadStatus).state).toBe(terminalState);
      }
    });

    it('allows consumers to take a specific number of items using RxJS take operator', async () => {
      const inProgressStatus: UploadStatus = {
        id: testUploadId,
        state: 'pending_upload',
        filename: 'dataset.csv',
        mediaType: 'text/csv',
        byteCount: 2048,
        checksumHex: null,
        progress: { stage: 'waiting_for_storage', percent: 10 },
        failure: null,
        acceptedAt: null,
      };

      mockUploadsService.get.mockResolvedValue(inProgressStatus);

      const sseStream$ = controller.events(testOrg, testUploadId);
      const twoEventsPromise = firstValueFrom(
        sseStream$.pipe(take(2), toArray()),
      );

      await jest.advanceTimersByTimeAsync(1500);
      await jest.advanceTimersByTimeAsync(1500);

      const events = await twoEventsPromise;
      expect(events).toHaveLength(2);
      expect(mockUploadsService.get).toHaveBeenCalledTimes(2);
    });
  });
});
