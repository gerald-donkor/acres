import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AcresConfigService } from '../config/acres-config.service';
import {
  isNotFound,
  safeFilename,
  S3ObjectStorageAdapter,
  sha256HexToBase64,
} from './s3-object-storage.adapter';
import { STORAGE_PRESIGNED_METHODS } from './storage.port';

interface S3ErrorWithMetadata extends Error {
  $metadata?: { httpStatusCode?: number };
}

function createS3Error(
  message: string,
  statusCode: number,
): S3ErrorWithMetadata {
  const error = new Error(message) as S3ErrorWithMetadata;
  error.$metadata = { httpStatusCode: statusCode };
  return error;
}

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({
    input,
    commandName: 'PutObjectCommand',
  })),
  GetObjectCommand: jest.fn().mockImplementation((input: unknown) => ({
    input,
    commandName: 'GetObjectCommand',
  })),
  HeadObjectCommand: jest.fn().mockImplementation((input: unknown) => ({
    input,
    commandName: 'HeadObjectCommand',
  })),
  DeleteObjectCommand: jest.fn().mockImplementation((input: unknown) => ({
    input,
    commandName: 'DeleteObjectCommand',
  })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('S3ObjectStorageAdapter', () => {
  let adapter: S3ObjectStorageAdapter;
  let mockSend: jest.Mock;

  const mockConfig = {
    storageEndpoint: 'http://storage.local:9000',
    storageRegion: 'us-east-1',
    storageForcePathStyle: true,
    storageAccessKeyId: 'test-access-key',
    storageSecretAccessKey: 'test-secret-key',
    storageBucket: 'acres-test-bucket',
    presignedUploadTtlSeconds: 900,
    acceptedDownloadTtlSeconds: 300,
  } as unknown as AcresConfigService;

  beforeEach(() => {
    mockSend = jest.fn();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
    (getSignedUrl as unknown as jest.Mock).mockResolvedValue(
      'https://storage.local/signed-url',
    );

    adapter = new S3ObjectStorageAdapter(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('STORAGE_PRESIGNED_METHODS contract', () => {
    it('defines the canonical closed tuple of storage presigned methods', () => {
      expect(STORAGE_PRESIGNED_METHODS).toEqual(['PUT', 'GET']);
      expect(Array.isArray(STORAGE_PRESIGNED_METHODS)).toBe(true);
      expect(STORAGE_PRESIGNED_METHODS).toHaveLength(2);
    });
  });

  describe('S3Client initialization', () => {
    it('instantiates S3Client with configured credentials and endpoint', () => {
      expect(S3Client).toHaveBeenCalledWith({
        endpoint: 'http://storage.local:9000',
        region: 'us-east-1',
        forcePathStyle: true,
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        },
      });
    });
  });

  describe('presignPut', () => {
    const knownHex =
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    it('generates presigned PUT url with checksum header and command option when checksumHex is provided', async () => {
      const beforeTime = Date.now();
      const result = await adapter.presignPut({
        key: 'uploads/dataset-1.csv',
        mediaType: 'text/csv',
        checksumHex: knownHex,
      });
      const afterTime = Date.now();

      const expectedBase64 = sha256HexToBase64(knownHex);

      expect(result.method).toBe('PUT');
      expect(result.url).toBe('https://storage.local/signed-url');
      expect(result.headers).toEqual({
        'content-type': 'text/csv',
        'x-amz-checksum-sha256': expectedBase64,
      });
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        beforeTime + 900 * 1000,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
        afterTime + 900 * 1000,
      );

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'acres-test-bucket',
        Key: 'uploads/dataset-1.csv',
        ContentType: 'text/csv',
        ChecksumSHA256: expectedBase64,
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ commandName: 'PutObjectCommand' }),
        { expiresIn: 900 },
      );
    });

    it('generates presigned PUT url without checksum when checksumHex is omitted', async () => {
      const result = await adapter.presignPut({
        key: 'uploads/raw-data.bin',
        mediaType: 'application/octet-stream',
      });

      expect(result.method).toBe('PUT');
      expect(result.headers).toEqual({
        'content-type': 'application/octet-stream',
      });
      expect(result.headers['x-amz-checksum-sha256']).toBeUndefined();

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'acres-test-bucket',
        Key: 'uploads/raw-data.bin',
        ContentType: 'application/octet-stream',
        ChecksumSHA256: undefined,
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ commandName: 'PutObjectCommand' }),
        { expiresIn: 900 },
      );
    });
  });

  describe('presignGet', () => {
    it('generates presigned GET url with sanitized filename in content-disposition header', async () => {
      const beforeTime = Date.now();
      const result = await adapter.presignGet({
        key: 'exports/q3-report.xlsx',
        filename: 'q3-report.xlsx',
        mediaType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const afterTime = Date.now();

      expect(result.method).toBe('GET');
      expect(result.url).toBe('https://storage.local/signed-url');
      expect(result.headers).toEqual({});
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        beforeTime + 300 * 1000,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
        afterTime + 300 * 1000,
      );

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'acres-test-bucket',
        Key: 'exports/q3-report.xlsx',
        ResponseContentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ResponseContentDisposition: 'attachment; filename="q3-report.xlsx"',
      });

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ commandName: 'GetObjectCommand' }),
        { expiresIn: 300 },
      );
    });

    it('sanitizes dangerous characters in requested filename to prevent CRLF and header injection', async () => {
      await adapter.presignGet({
        key: 'exports/malicious.pdf',
        filename: 'malicious"header\r\ninjection\\name.pdf',
        mediaType: 'application/pdf',
      });

      expect(GetObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          ResponseContentDisposition:
            'attachment; filename="malicious_header__injection_name.pdf"',
        }),
      );
    });
  });

  describe('putBuffer', () => {
    it('dispatches PutObjectCommand with bucket, key, buffer body, mediaType, and base64 checksum', async () => {
      mockSend.mockResolvedValueOnce({});

      const body = Buffer.from('test binary content');
      const hex =
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

      await adapter.putBuffer({
        key: 'reports/rendered.pdf',
        body,
        mediaType: 'application/pdf',
        checksumHex: hex,
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'acres-test-bucket',
        Key: 'reports/rendered.pdf',
        Body: body,
        ContentType: 'application/pdf',
        ChecksumSHA256: sha256HexToBase64(hex),
      });
    });
  });

  describe('stat', () => {
    it('maps content length, content type, and checksum on successful HeadObjectCommand', async () => {
      mockSend.mockResolvedValueOnce({
        ContentLength: 2048,
        ContentType: 'text/csv',
        ChecksumSHA256: 'base64checksum==',
      });

      const result = await adapter.stat('uploads/file.csv');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(HeadObjectCommand).toHaveBeenCalledWith({
        Bucket: 'acres-test-bucket',
        Key: 'uploads/file.csv',
      });
      expect(result).toEqual({
        byteCount: 2048n,
        mediaType: 'text/csv',
        checksumHex: 'base64checksum==',
      });
    });

    it('provides fallbacks when optional stat metadata properties are omitted', async () => {
      mockSend.mockResolvedValueOnce({
        ContentLength: undefined,
        ContentType: undefined,
        ChecksumSHA256: undefined,
      });

      const result = await adapter.stat('uploads/sparse.bin');

      expect(result).toEqual({
        byteCount: 0n,
        mediaType: null,
        checksumHex: null,
      });
    });

    it('returns null when HeadObjectCommand throws 404 not found error', async () => {
      const notFoundError = createS3Error('Not Found', 404);
      mockSend.mockRejectedValueOnce(notFoundError);

      const result = await adapter.stat('uploads/nonexistent.csv');

      expect(result).toBeNull();
    });

    it('rethrows unexpected error when HeadObjectCommand fails with non-404 status', async () => {
      const serverError = createS3Error('Internal S3 Failure', 500);
      mockSend.mockRejectedValueOnce(serverError);

      await expect(adapter.stat('uploads/err.csv')).rejects.toThrow(
        'Internal S3 Failure',
      );
    });
  });

  describe('getBuffer', () => {
    it('reads byte stream into Buffer on successful GetObjectCommand', async () => {
      const byteArray = new Uint8Array([104, 101, 108, 108, 111]);
      mockSend.mockResolvedValueOnce({
        Body: {
          transformToByteArray: jest.fn().mockResolvedValue(byteArray),
        },
      });

      const result = await adapter.getBuffer('uploads/greeting.txt');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'acres-test-bucket',
        Key: 'uploads/greeting.txt',
      });
      expect(result).toEqual(Buffer.from('hello'));
    });

    it('returns empty buffer when response.Body is undefined', async () => {
      mockSend.mockResolvedValueOnce({
        Body: undefined,
      });

      const result = await adapter.getBuffer('uploads/empty.txt');

      expect(result).toEqual(Buffer.alloc(0));
    });

    it('returns null when GetObjectCommand throws 404 not found error', async () => {
      const notFoundError = createS3Error('NoSuchKey', 404);
      mockSend.mockRejectedValueOnce(notFoundError);

      const result = await adapter.getBuffer('uploads/missing.txt');

      expect(result).toBeNull();
    });

    it('rethrows unexpected error when GetObjectCommand fails with non-404 status', async () => {
      const forbiddenError = createS3Error('Access Denied', 403);
      mockSend.mockRejectedValueOnce(forbiddenError);

      await expect(adapter.getBuffer('uploads/secret.txt')).rejects.toThrow(
        'Access Denied',
      );
    });
  });

  describe('delete', () => {
    it('dispatches DeleteObjectCommand with bucket and key', async () => {
      mockSend.mockResolvedValueOnce({});

      await adapter.delete('uploads/trash.csv');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'acres-test-bucket',
        Key: 'uploads/trash.csv',
      });
    });
  });

  describe('readiness', () => {
    it('returns true when probe HeadObjectCommand resolves successfully', async () => {
      mockSend.mockResolvedValueOnce({});

      const isReady = await adapter.readiness();

      expect(isReady).toBe(true);
      expect(HeadObjectCommand).toHaveBeenCalledWith({
        Bucket: 'acres-test-bucket',
        Key: '.acres-readiness',
      });
    });

    it('returns true when probe HeadObjectCommand throws 404 (proving reachable bucket/endpoint)', async () => {
      const notFoundError = createS3Error('NotFound', 404);
      mockSend.mockRejectedValueOnce(notFoundError);

      const isReady = await adapter.readiness();

      expect(isReady).toBe(true);
    });

    it('returns false when probe HeadObjectCommand fails with connection error or 5xx', async () => {
      const connError = new Error('connect ECONNREFUSED 127.0.0.1:9000');
      mockSend.mockRejectedValueOnce(connError);

      const isReady = await adapter.readiness();

      expect(isReady).toBe(false);
    });

    it('returns false when probe HeadObjectCommand fails with 403 forbidden', async () => {
      const authError = createS3Error('InvalidAccessKeyId', 403);
      mockSend.mockRejectedValueOnce(authError);

      const isReady = await adapter.readiness();

      expect(isReady).toBe(false);
    });
  });

  describe('helper functions', () => {
    describe('safeFilename', () => {
      it('replaces quotes, carriage returns, newlines, and backslashes with underscores', () => {
        expect(safeFilename('file"with\r\nand\\chars.csv')).toBe(
          'file_with__and_chars.csv',
        );
      });

      it('truncates filename exceeding 180 characters', () => {
        const longName = 'a'.repeat(200) + '.csv';
        const result = safeFilename(longName);
        expect(result).toHaveLength(180);
        expect(result).toBe('a'.repeat(180));
      });

      it('preserves clean filenames unchanged', () => {
        expect(safeFilename('monthly-growth-report_2026.xlsx')).toBe(
          'monthly-growth-report_2026.xlsx',
        );
      });
    });

    describe('sha256HexToBase64', () => {
      it('converts 64-character hex sha256 to correct standard base64 string', () => {
        const hex =
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        expect(sha256HexToBase64(hex)).toBe(
          '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
        );
      });
    });

    describe('isNotFound', () => {
      it('returns true when error has $metadata with httpStatusCode 404', () => {
        expect(isNotFound({ $metadata: { httpStatusCode: 404 } })).toBe(true);
      });

      it('returns false when error has non-404 status code', () => {
        expect(isNotFound({ $metadata: { httpStatusCode: 500 } })).toBe(false);
        expect(isNotFound({ $metadata: { httpStatusCode: 403 } })).toBe(false);
      });

      it('returns false when error is null, undefined, or missing $metadata', () => {
        expect(isNotFound(null)).toBe(false);
        expect(isNotFound(undefined)).toBe(false);
        expect(isNotFound('error-string')).toBe(false);
        expect(isNotFound(404)).toBe(false);
        expect(isNotFound({})).toBe(false);
        expect(isNotFound({ $metadata: {} })).toBe(false);
      });
    });
  });
});
