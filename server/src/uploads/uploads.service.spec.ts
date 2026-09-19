import { createHash } from 'node:crypto';
import { STORED_OBJECT_STATES, UPLOAD_STATES } from '@acres/shared';
import type { AcresConfigService } from '../config/acres-config.service';
import type { IdempotencyService } from '../idempotency/idempotency.service';
import type { OrganizationContext } from '../organizations/organization-context';
import type { OutboxService } from '../outbox/outbox.service';
import type {
  TenantTransactionClient,
  TenantTransactionService,
} from '../prisma/tenant-transaction.service';
import type { ObjectStoragePort } from '../storage/storage.port';
import { UploadsService } from './uploads.service';
import type { CompleteUploadDto } from './dto/complete-upload.dto';
import type { InitiateUploadDto } from './dto/initiate-upload.dto';

describe('upload states contract', () => {
  it('exports canonical runtime states matching expected lifecycle definitions', () => {
    expect(Array.isArray(UPLOAD_STATES)).toBe(true);
    expect(UPLOAD_STATES).toEqual([
      'pending_upload',
      'completed',
      'scanning',
      'accepted',
      'rejected',
      'cancelled',
      'expired',
    ]);
    expect(Array.isArray(STORED_OBJECT_STATES)).toBe(true);
    expect(STORED_OBJECT_STATES).toEqual([
      'pending_upload',
      'quarantined',
      'accepted',
      'rejected',
      'deleted',
    ]);
  });
});

describe('UploadsService', () => {
  let service: UploadsService;
  let fakeConfig: Partial<AcresConfigService>;
  let fakeTenants: Partial<TenantTransactionService>;
  let fakeIdempotency: Partial<IdempotencyService>;
  let fakeOutbox: Partial<OutboxService>;
  let fakeStorage: Partial<ObjectStoragePort>;

  let mockTx: {
    storedObject: {
      create: jest.Mock;
      update: jest.Mock;
    };
    upload: {
      create: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    jobProgressEvent: {
      create: jest.Mock;
    };
  };

  const testOrg: OrganizationContext = {
    organizationId: 'org-123',
    accountId: 'acc-456',
    membershipId: 'mem-789',
    role: 'owner',
  };

  const validIdempotencyKey = 'a-valid-idempotency-key-12345';

  beforeEach(() => {
    fakeConfig = {
      uploadAcceptedMediaTypes: [
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/geo+json',
      ],
      uploadMaxBytes: 10 * 1024 * 1024, // 10 MB
      storageBucket: 'acres-test-bucket',
      uploadStaleMinutes: 60,
    };

    mockTx = {
      storedObject: {
        create: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'so-1', ...(args.data as object) }),
          ),
        update: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'so-1', ...(args.data as object) }),
          ),
      },
      upload: {
        create: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'up-1', ...(args.data as object) }),
          ),
        findFirst: jest.fn(),
        update: jest
          .fn()
          .mockImplementation((args: { data: unknown }) =>
            Promise.resolve({ id: 'up-1', ...(args.data as object) }),
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
      organizationScoped: jest
        .fn()
        .mockImplementation(
          (
            _acc: string,
            _org: string,
            callback: (tx: TenantTransactionClient) => Promise<unknown>,
          ) => callback(mockTx as unknown as TenantTransactionClient),
        ),
    };

    fakeIdempotency = {
      run: jest
        .fn()
        .mockImplementation(
          (
            _tx: unknown,
            _options: unknown,
            operation: () => Promise<unknown>,
          ) => operation(),
        ),
    };

    fakeOutbox = {
      appendUploadCompleted: jest.fn().mockResolvedValue(undefined),
    };

    fakeStorage = {
      presignPut: jest.fn().mockResolvedValue({
        url: 'https://storage.acres.local/quarantine/test-key?sig=put',
        method: 'PUT',
        headers: { 'content-type': 'text/csv' },
        expiresAt: new Date('2026-09-20T00:00:00.000Z'),
      }),
      presignGet: jest.fn().mockResolvedValue({
        url: 'https://storage.acres.local/quarantine/test-key?sig=get',
        method: 'GET',
        headers: {},
        expiresAt: new Date('2026-09-20T00:00:00.000Z'),
      }),
      stat: jest.fn(),
      getBuffer: jest.fn(),
    };

    service = new UploadsService(
      fakeTenants as TenantTransactionService,
      fakeIdempotency as IdempotencyService,
      fakeOutbox as OutboxService,
      fakeConfig as AcresConfigService,
      fakeStorage as ObjectStoragePort,
    );
  });

  describe('initiate', () => {
    const validBody: InitiateUploadDto = {
      filename: 'sample.csv',
      mediaType: 'text/csv',
      byteCount: 1024,
      checksumHex:
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };

    it('rejects unaccepted media type with validation failure', async () => {
      const invalid = { ...validBody, mediaType: 'image/png' };
      await expect(
        service.initiate(testOrg, validIdempotencyKey, invalid),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
        details: ['mediaType is not accepted.'],
      });
    });

    it('rejects byteCount exceeding configured max bytes', async () => {
      const oversized = {
        ...validBody,
        byteCount: (fakeConfig.uploadMaxBytes ?? 0) + 1,
      };
      await expect(
        service.initiate(testOrg, validIdempotencyKey, oversized),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
        details: ['byteCount exceeds the temporary development limit.'],
      });
    });

    it('presigns PUT upload, creates stored object and upload in tenant scope', async () => {
      const result = await service.initiate(
        testOrg,
        validIdempotencyKey,
        validBody,
      );

      expect(fakeStorage.presignPut).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: validBody.mediaType,
          checksumHex: validBody.checksumHex,
        }) as unknown,
      );
      const putCalls = (fakeStorage.presignPut as jest.Mock).mock
        .calls as unknown as [[{ key: string; mediaType: string }]];
      expect(putCalls[0][0].key).toMatch(
        new RegExp(`^organizations/${testOrg.organizationId}/quarantine/`),
      );

      expect(fakeTenants.organizationScoped).toHaveBeenCalledWith(
        testOrg.accountId,
        testOrg.organizationId,
        expect.any(Function),
      );

      expect(fakeIdempotency.run).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          key: validIdempotencyKey,
          accountId: testOrg.accountId,
          organizationId: testOrg.organizationId,
          operation: 'uploads.initiate',
          responseStatus: 201,
        }),
        expect.any(Function),
      );

      expect(mockTx.storedObject.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: testOrg.organizationId,
          bucket: fakeConfig.storageBucket,
          originalFilename: validBody.filename,
          mediaType: validBody.mediaType,
          checksumAlgorithm: 'sha256',
          checksumHex: validBody.checksumHex?.toLowerCase(),
        }) as unknown,
      });

      expect(mockTx.upload.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: testOrg.organizationId,
          actorAccountId: testOrg.accountId,
          storedObjectId: 'so-1',
          declaredFilename: validBody.filename,
          declaredMediaType: validBody.mediaType,
          declaredByteCount: BigInt(validBody.byteCount),
          checksumAlgorithm: 'sha256',
        }) as unknown,
      });

      expect(result.uploadId).toBe('up-1');
      expect(result.object.bucket).toBe(fakeConfig.storageBucket);
      expect(result.object.checksumAlgorithm).toBe('sha256');
      expect(result.object.key).toMatch(
        new RegExp(`^organizations/${testOrg.organizationId}/quarantine/`),
      );
      expect(result.upload).toEqual({
        url: 'https://storage.acres.local/quarantine/test-key?sig=put',
        method: 'PUT',
        headers: { 'content-type': 'text/csv' },
        expiresAt: '2026-09-20T00:00:00.000Z',
      });
      expect(result.complete).toEqual({
        method: 'POST',
        url: '/api/v1/uploads/up-1/complete',
        requiredHeaders: ['x-csrf-token', 'idempotency-key'],
      });
    });
  });

  describe('complete', () => {
    const fileBytes = Buffer.from('col1,col2\nval1,val2\n');
    const validChecksum = createHash('sha256').update(fileBytes).digest('hex');
    const validCompleteBody: CompleteUploadDto = {
      byteCount: fileBytes.length,
      checksumHex: validChecksum,
    };

    const mockReservedUpload = {
      id: 'up-1',
      organizationId: testOrg.organizationId,
      storedObjectId: 'so-1',
      declaredFilename: 'data.csv',
      declaredMediaType: 'text/csv',
      declaredByteCount: BigInt(fileBytes.length),
      state: 'pending_upload',
      storedObject: {
        id: 'so-1',
        objectKey: `organizations/${testOrg.organizationId}/quarantine/uuid-1`,
      },
    };

    it('rejects byteCount exceeding uploadMaxBytes', async () => {
      const oversized: CompleteUploadDto = {
        byteCount: (fakeConfig.uploadMaxBytes ?? 0) + 1,
        checksumHex: validChecksum,
      };

      await expect(
        service.complete(testOrg, 'up-1', validIdempotencyKey, oversized),
      ).rejects.toMatchObject({
        status: 400,
        code: 'VALIDATION_FAILED',
        details: ['byteCount exceeds the temporary development limit.'],
      });
    });

    it('rejects missing or format-invalid idempotency key', async () => {
      await expect(
        service.complete(testOrg, 'up-1', undefined, validCompleteBody),
      ).rejects.toMatchObject({
        status: 400,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      });

      await expect(
        service.complete(testOrg, 'up-1', 'short-key', validCompleteBody),
      ).rejects.toMatchObject({
        status: 400,
        code: 'IDEMPOTENCY_KEY_REQUIRED',
      });
    });

    it('throws 404 when upload not found in tenant scope', async () => {
      mockTx.upload.findFirst.mockResolvedValue(null);

      await expect(
        service.complete(
          testOrg,
          'up-unknown',
          validIdempotencyKey,
          validCompleteBody,
        ),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Upload not found.',
      });
    });

    it('throws 409 conflict when storage stat returns null', async () => {
      mockTx.upload.findFirst.mockResolvedValue(mockReservedUpload);
      (fakeStorage.stat as jest.Mock).mockResolvedValue(null);

      await expect(
        service.complete(
          testOrg,
          'up-1',
          validIdempotencyKey,
          validCompleteBody,
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Uploaded object was not found.',
      });
    });

    it('throws 400 validation error when byteCount does not match storage stat', async () => {
      mockTx.upload.findFirst.mockResolvedValue(mockReservedUpload);
      (fakeStorage.stat as jest.Mock).mockResolvedValue({
        byteCount: BigInt(fileBytes.length + 50),
        mediaType: 'text/csv',
      });

      await expect(
        service.complete(
          testOrg,
          'up-1',
          validIdempotencyKey,
          validCompleteBody,
        ),
      ).rejects.toMatchObject({
        status: 400,
        details: ['byteCount does not match object storage.'],
      });
    });

    it('throws 400 validation error when mediaType does not match storage stat', async () => {
      mockTx.upload.findFirst.mockResolvedValue(mockReservedUpload);
      (fakeStorage.stat as jest.Mock).mockResolvedValue({
        byteCount: BigInt(fileBytes.length),
        mediaType: 'application/json',
      });

      await expect(
        service.complete(
          testOrg,
          'up-1',
          validIdempotencyKey,
          validCompleteBody,
        ),
      ).rejects.toMatchObject({
        status: 400,
        details: ['mediaType does not match object storage.'],
      });
    });

    it('throws 409 conflict when storage getBuffer returns null', async () => {
      mockTx.upload.findFirst.mockResolvedValue(mockReservedUpload);
      (fakeStorage.stat as jest.Mock).mockResolvedValue({
        byteCount: BigInt(fileBytes.length),
        mediaType: 'text/csv',
      });
      (fakeStorage.getBuffer as jest.Mock).mockResolvedValue(null);

      await expect(
        service.complete(
          testOrg,
          'up-1',
          validIdempotencyKey,
          validCompleteBody,
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Uploaded object was not found.',
      });
    });

    it('throws 400 validation error when checksum does not match storage buffer', async () => {
      mockTx.upload.findFirst.mockResolvedValue(mockReservedUpload);
      (fakeStorage.stat as jest.Mock).mockResolvedValue({
        byteCount: BigInt(fileBytes.length),
        mediaType: 'text/csv',
      });
      (fakeStorage.getBuffer as jest.Mock).mockResolvedValue(fileBytes);

      const mismatchedBody: CompleteUploadDto = {
        byteCount: fileBytes.length,
        checksumHex:
          '0000000000000000000000000000000000000000000000000000000000000000',
      };

      await expect(
        service.complete(testOrg, 'up-1', validIdempotencyKey, mismatchedBody),
      ).rejects.toMatchObject({
        status: 400,
        details: ['checksumHex does not match object storage.'],
      });
    });

    it('throws 409 conflict when upload is not in pending_upload state', async () => {
      mockTx.upload.findFirst
        .mockResolvedValueOnce(mockReservedUpload)
        .mockResolvedValueOnce({ ...mockReservedUpload, state: 'scanning' });

      (fakeStorage.stat as jest.Mock).mockResolvedValue({
        byteCount: BigInt(fileBytes.length),
        mediaType: 'text/csv',
      });
      (fakeStorage.getBuffer as jest.Mock).mockResolvedValue(fileBytes);

      await expect(
        service.complete(
          testOrg,
          'up-1',
          validIdempotencyKey,
          validCompleteBody,
        ),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Upload is not awaiting completion.',
      });
    });

    it('successfully completes upload, updates stored object, creates progress event, and enqueues outbox event', async () => {
      mockTx.upload.findFirst
        .mockResolvedValueOnce(mockReservedUpload)
        .mockResolvedValueOnce(mockReservedUpload);

      (fakeStorage.stat as jest.Mock).mockResolvedValue({
        byteCount: BigInt(fileBytes.length),
        mediaType: null,
      });
      (fakeStorage.getBuffer as jest.Mock).mockResolvedValue(fileBytes);

      mockTx.upload.update.mockResolvedValueOnce({
        id: 'up-1',
        state: 'completed',
        declaredFilename: 'data.csv',
        declaredMediaType: 'text/csv',
        declaredByteCount: BigInt(fileBytes.length),
        completedByteCount: BigInt(fileBytes.length),
        checksumHex: validChecksum,
        progressStage: 'queued_scan',
        progressPercent: 20,
        failureCode: null,
        failureMessage: null,
        acceptedAt: null,
        version: 2,
      });

      const result = await service.complete(
        testOrg,
        'up-1',
        validIdempotencyKey,
        validCompleteBody,
      );

      expect(mockTx.upload.update).toHaveBeenCalledWith({
        where: { id: 'up-1' },
        data: expect.objectContaining({
          state: 'completed',
          completedByteCount: BigInt(fileBytes.length),
          checksumHex: validChecksum,
          scanStatus: 'pending',
          progressStage: 'queued_scan',
          progressPercent: 20,
          version: { increment: 1 },
        }) as unknown,
      });
      const updateCalls = mockTx.upload.update.mock.calls as unknown as [
        [{ data: { completedAt: Date } }],
      ];
      expect(updateCalls[0][0].data.completedAt).toBeInstanceOf(Date);

      expect(mockTx.storedObject.update).toHaveBeenCalledWith({
        where: { id: mockReservedUpload.storedObjectId },
        data: {
          state: 'quarantined',
          byteCount: BigInt(fileBytes.length),
          checksumHex: validChecksum,
        },
      });

      expect(mockTx.jobProgressEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: testOrg.organizationId,
          uploadId: 'up-1',
          stage: 'queued_scan',
          percent: 20,
        },
      });

      expect(fakeOutbox.appendUploadCompleted).toHaveBeenCalledWith(
        expect.anything(),
        {
          organizationId: testOrg.organizationId,
          uploadId: 'up-1',
          version: 2,
        },
      );

      expect(result).toEqual({
        id: 'up-1',
        state: 'completed',
        filename: 'data.csv',
        mediaType: 'text/csv',
        byteCount: fileBytes.length,
        checksumHex: validChecksum,
        progress: {
          stage: 'queued_scan',
          percent: 20,
        },
        failure: null,
        acceptedAt: null,
      });
    });
  });

  describe('get', () => {
    it('throws 404 when upload not found', async () => {
      mockTx.upload.findFirst.mockResolvedValue(null);

      await expect(service.get(testOrg, 'up-not-found')).rejects.toMatchObject({
        status: 404,
        message: 'Upload not found.',
      });
    });

    it('returns formatted UploadStatus without failure when failureCode is null', async () => {
      const now = new Date();
      mockTx.upload.findFirst.mockResolvedValue({
        id: 'up-1',
        state: 'accepted',
        declaredFilename: 'regions.geojson',
        declaredMediaType: 'application/geo+json',
        declaredByteCount: 5000n,
        completedByteCount: 5000n,
        checksumHex: 'abc123',
        progressStage: 'complete',
        progressPercent: 100,
        failureCode: null,
        failureMessage: null,
        acceptedAt: now,
      });

      const status = await service.get(testOrg, 'up-1');
      expect(status).toEqual({
        id: 'up-1',
        state: 'accepted',
        filename: 'regions.geojson',
        mediaType: 'application/geo+json',
        byteCount: 5000,
        checksumHex: 'abc123',
        progress: {
          stage: 'complete',
          percent: 100,
        },
        failure: null,
        acceptedAt: now.toISOString(),
      });
    });

    it('returns formatted UploadStatus with failure details when failureCode is present', async () => {
      mockTx.upload.findFirst.mockResolvedValue({
        id: 'up-1',
        state: 'rejected',
        declaredFilename: 'malware.exe',
        declaredMediaType: 'text/csv',
        declaredByteCount: 100n,
        completedByteCount: 100n,
        checksumHex: 'badhash',
        progressStage: 'rejected',
        progressPercent: 100,
        failureCode: 'malware_detected',
        failureMessage: 'File contains malware signature.',
        acceptedAt: null,
      });

      const status = await service.get(testOrg, 'up-1');
      expect(status.failure).toEqual({
        code: 'malware_detected',
        message: 'File contains malware signature.',
      });
      expect(status.acceptedAt).toBeNull();
    });
  });

  describe('cancel', () => {
    it('throws 404 when upload not found', async () => {
      mockTx.upload.findFirst.mockResolvedValue(null);

      await expect(
        service.cancel(testOrg, 'up-not-found', validIdempotencyKey),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Upload not found.',
      });
    });

    it('returns existing status idempotently when upload is already cancelled', async () => {
      mockTx.upload.findFirst.mockResolvedValue({
        id: 'up-1',
        state: 'cancelled',
        declaredFilename: 'file.csv',
        declaredMediaType: 'text/csv',
        declaredByteCount: 1000n,
        completedByteCount: null,
        checksumHex: null,
        progressStage: 'cancelled',
        progressPercent: 100,
        failureCode: null,
        failureMessage: null,
        acceptedAt: null,
      });

      const result = await service.cancel(testOrg, 'up-1', validIdempotencyKey);
      expect(result.state).toBe('cancelled');
      expect(mockTx.upload.update).not.toHaveBeenCalled();
    });

    it('throws 409 conflict when upload is already accepted', async () => {
      mockTx.upload.findFirst.mockResolvedValue({
        id: 'up-1',
        state: 'accepted',
        declaredFilename: 'file.csv',
        declaredMediaType: 'text/csv',
        declaredByteCount: 1000n,
        completedByteCount: 1000n,
        checksumHex: 'abc',
        progressStage: 'accepted',
        progressPercent: 100,
        failureCode: null,
        failureMessage: null,
        acceptedAt: new Date(),
      });

      await expect(
        service.cancel(testOrg, 'up-1', validIdempotencyKey),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Upload can no longer be cancelled.',
      });
    });

    it('throws 409 conflict when upload is already rejected', async () => {
      mockTx.upload.findFirst.mockResolvedValue({
        id: 'up-1',
        state: 'rejected',
        declaredFilename: 'file.csv',
        declaredMediaType: 'text/csv',
        declaredByteCount: 1000n,
        completedByteCount: 1000n,
        checksumHex: 'abc',
        progressStage: 'rejected',
        progressPercent: 100,
        failureCode: 'malware_detected',
        failureMessage: 'Infected',
        acceptedAt: null,
      });

      await expect(
        service.cancel(testOrg, 'up-1', validIdempotencyKey),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Upload can no longer be cancelled.',
      });
    });

    it('updates pending upload to cancelled state', async () => {
      mockTx.upload.findFirst.mockResolvedValue({
        id: 'up-1',
        state: 'pending_upload',
        declaredFilename: 'file.csv',
        declaredMediaType: 'text/csv',
        declaredByteCount: 1000n,
        completedByteCount: null,
        checksumHex: null,
        progressStage: 'created',
        progressPercent: 0,
        failureCode: null,
        failureMessage: null,
        acceptedAt: null,
      });

      mockTx.upload.update.mockResolvedValue({
        id: 'up-1',
        state: 'cancelled',
        declaredFilename: 'file.csv',
        declaredMediaType: 'text/csv',
        declaredByteCount: 1000n,
        completedByteCount: null,
        checksumHex: null,
        progressStage: 'cancelled',
        progressPercent: 100,
        failureCode: null,
        failureMessage: null,
        acceptedAt: null,
      });

      const result = await service.cancel(testOrg, 'up-1', validIdempotencyKey);
      expect(mockTx.upload.update).toHaveBeenCalledWith({
        where: { id: 'up-1' },
        data: expect.objectContaining({
          state: 'cancelled',
          progressStage: 'cancelled',
          progressPercent: 100,
        }) as unknown,
      });
      const cancelUpdateCalls = mockTx.upload.update.mock.calls as unknown as [
        [{ data: { cancelledAt: Date } }],
      ];
      expect(cancelUpdateCalls[0][0].data.cancelledAt).toBeInstanceOf(Date);
      expect(result.state).toBe('cancelled');
      expect(result.progress.stage).toBe('cancelled');
      expect(result.progress.percent).toBe(100);
    });
  });

  describe('download', () => {
    it('throws 404 when upload not found', async () => {
      mockTx.upload.findFirst.mockResolvedValue(null);

      await expect(
        service.download(testOrg, 'up-not-found'),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Accepted object not found.',
      });
    });

    it('throws 404 when upload state is not accepted', async () => {
      mockTx.upload.findFirst.mockResolvedValue({
        id: 'up-1',
        state: 'pending_upload',
        storedObject: { objectKey: 'quarantine/key' },
      });

      await expect(service.download(testOrg, 'up-1')).rejects.toMatchObject({
        status: 404,
        message: 'Accepted object not found.',
      });
    });

    it('presigns and returns download URL for accepted upload', async () => {
      mockTx.upload.findFirst.mockResolvedValue({
        id: 'up-1',
        state: 'accepted',
        declaredFilename: 'clean-data.csv',
        declaredMediaType: 'text/csv',
        storedObject: {
          objectKey: 'organizations/org-123/accepted/uuid-1',
        },
      });

      const downloadResult = await service.download(testOrg, 'up-1');
      expect(fakeStorage.presignGet).toHaveBeenCalledWith({
        key: 'organizations/org-123/accepted/uuid-1',
        filename: 'clean-data.csv',
        mediaType: 'text/csv',
      });
      expect(downloadResult).toEqual({
        url: 'https://storage.acres.local/quarantine/test-key?sig=get',
        method: 'GET',
        headers: {},
        expiresAt: '2026-09-20T00:00:00.000Z',
      });
    });
  });
});
