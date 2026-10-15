import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  BlobError,
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
  put,
  type GetBlobResult,
  type HeadBlobResult,
  type IssuedSignedToken,
  type PutBlobResult,
} from '@vercel/blob';
import type { AcresConfigService } from '../config/acres-config.service';
import { VercelBlobStorageAdapter } from './vercel-blob-storage.adapter';

jest.mock('@vercel/blob', () => {
  const actual =
    jest.requireActual<typeof import('@vercel/blob')>('@vercel/blob');
  return {
    ...actual,
    del: jest.fn(),
    get: jest.fn(),
    head: jest.fn(),
    issueSignedToken: jest.fn(),
    presignUrl: jest.fn(),
    put: jest.fn(),
  };
});

const mocked = {
  del: jest.mocked(del),
  get: jest.mocked(get),
  head: jest.mocked(head),
  issueSignedToken: jest.mocked(issueSignedToken),
  presignUrl: jest.mocked(presignUrl),
  put: jest.mocked(put),
};

const KEY =
  'organizations/org-1/quarantine/00000000-0000-4000-8000-000000000000';
const SIGNED: IssuedSignedToken = {
  delegationToken: 'delegation',
  clientSigningToken: 'signing',
  validUntil: 0,
};
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function config(token?: string): AcresConfigService {
  return {
    presignedUploadTtlSeconds: 900,
    acceptedDownloadTtlSeconds: 300,
    uploadMaxBytes: 8,
    blobReadWriteToken: token,
    blobStoreId: 'store_test',
  } as unknown as AcresConfigService;
}

function okGet(bytes: Buffer): GetBlobResult {
  return {
    statusCode: 200,
    stream: new Response(new Uint8Array(bytes)).body!,
  } as unknown as GetBlobResult;
}

describe('VercelBlobStorageAdapter', () => {
  let adapter: VercelBlobStorageAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new VercelBlobStorageAdapter(config());
    mocked.issueSignedToken.mockResolvedValue(SIGNED);
    mocked.presignUrl.mockResolvedValue({
      presignedUrl:
        'https://vercel.com/api/blob/?pathname=x&vercel-blob-signature=sig',
    });
  });

  describe('presignPut', () => {
    it('binds the exact path, type, declared size, expiry and overwrite denial', async () => {
      const before = Date.now();
      const signed = await adapter.presignPut({
        key: KEY,
        mediaType: 'text/csv',
        maxBytes: 1234,
        checksumHex: 'a'.repeat(64),
      });
      const tokenOptions = mocked.issueSignedToken.mock.calls[0][0];
      expect(tokenOptions).toMatchObject({
        pathname: KEY,
        operations: ['put'],
        allowedContentTypes: ['text/csv'],
        maximumSizeInBytes: 1234,
      });
      expect(tokenOptions.validUntil).toBeGreaterThanOrEqual(before + 900_000);
      expect(tokenOptions.validUntil).toBeLessThanOrEqual(Date.now() + 900_000);
      expect(tokenOptions.token).toBeUndefined();
      expect(tokenOptions.storeId).toBe('store_test');
      expect(tokenOptions.abortSignal).toBeInstanceOf(AbortSignal);
      expect(mocked.presignUrl).toHaveBeenCalledWith(SIGNED, {
        operation: 'put',
        pathname: KEY,
        access: 'private',
        allowedContentTypes: ['text/csv'],
        maximumSizeInBytes: 1234,
        allowOverwrite: false,
        addRandomSuffix: false,
        validUntil: tokenOptions.validUntil,
      });
      expect(signed.method).toBe('PUT');
      expect(signed.headers).toEqual({ 'content-type': 'text/csv' });
      expect(signed.expiresAt.getTime()).toBe(tokenOptions.validUntil);
    });

    it('passes the read-write token only when it is configured', async () => {
      adapter = new VercelBlobStorageAdapter(config('vercel_blob_rw_x'));
      await adapter.presignPut({
        key: KEY,
        mediaType: 'text/csv',
        maxBytes: 1,
      });
      expect(mocked.issueSignedToken.mock.calls[0][0].token).toBe(
        'vercel_blob_rw_x',
      );
    });
  });

  it('presignGet signs a read-only, uncached, short-lived URL', async () => {
    const before = Date.now();
    const signed = await adapter.presignGet({
      key: KEY,
      filename: 'a.csv',
      mediaType: 'text/csv',
    });
    const tokenOptions = mocked.issueSignedToken.mock.calls[0][0];
    expect(tokenOptions).toMatchObject({ pathname: KEY, operations: ['get'] });
    expect(tokenOptions.validUntil).toBeGreaterThanOrEqual(before + 300_000);
    expect(mocked.presignUrl).toHaveBeenCalledWith(SIGNED, {
      operation: 'get',
      pathname: KEY,
      access: 'private',
      useCache: false,
    });
    expect(signed).toMatchObject({ method: 'GET', headers: {} });
  });

  describe('stat', () => {
    it('maps size and type', async () => {
      mocked.head.mockResolvedValue({
        size: 42,
        contentType: 'text/csv',
      } as HeadBlobResult);
      await expect(adapter.stat(KEY)).resolves.toEqual({
        byteCount: 42n,
        mediaType: 'text/csv',
        checksumHex: null,
      });
    });

    it('returns null when missing and rethrows anything else', async () => {
      mocked.head.mockRejectedValueOnce(new BlobNotFoundError());
      await expect(adapter.stat(KEY)).resolves.toBeNull();
      mocked.head.mockRejectedValueOnce(new BlobError('boom'));
      await expect(adapter.stat(KEY)).rejects.toThrow('boom');
    });
  });

  describe('getBuffer', () => {
    it('reads a private object without cache', async () => {
      mocked.get.mockResolvedValue(okGet(Buffer.from('a,b')));
      await expect(adapter.getBuffer(KEY)).resolves.toEqual(Buffer.from('a,b'));
      expect(mocked.get.mock.calls[0][1]).toMatchObject({
        access: 'private',
        useCache: false,
      });
    });

    it('returns null when missing', async () => {
      mocked.get.mockResolvedValue(null);
      await expect(adapter.getBuffer(KEY)).resolves.toBeNull();
    });

    it('refuses to buffer an object above the accepted maximum', async () => {
      mocked.get.mockResolvedValue(okGet(Buffer.alloc(9)));
      await expect(adapter.getBuffer(KEY)).rejects.toThrow(
        'maximum accepted size',
      );
    });
  });

  describe('putBuffer', () => {
    const body = Buffer.from('a,b\n');
    const exists = new BlobError(
      'This blob already exists, use `allowOverwrite: true` if you want to overwrite it.',
    );

    it('writes private, no suffix, no overwrite', async () => {
      mocked.put.mockResolvedValue({} as PutBlobResult);
      await adapter.putBuffer({
        key: KEY,
        body,
        mediaType: 'text/csv',
        checksumHex: sha(body),
      });
      expect(mocked.put).toHaveBeenCalledWith(
        KEY,
        body,
        expect.objectContaining({
          access: 'private',
          contentType: 'text/csv',
          addRandomSuffix: false,
          allowOverwrite: false,
        }),
      );
    });

    it('refuses a body that does not match its checksum before uploading', async () => {
      await expect(
        adapter.putBuffer({
          key: KEY,
          body,
          mediaType: 'text/csv',
          checksumHex: 'b'.repeat(64),
        }),
      ).rejects.toThrow('declared checksum');
      expect(mocked.put).not.toHaveBeenCalled();
    });

    it('treats an identical existing object as an idempotent retry', async () => {
      mocked.put.mockRejectedValue(exists);
      mocked.get.mockResolvedValue(okGet(body));
      await expect(
        adapter.putBuffer({
          key: KEY,
          body,
          mediaType: 'text/csv',
          checksumHex: sha(body).toUpperCase(),
        }),
      ).resolves.toBeUndefined();
    });

    it('fails when a different object already exists', async () => {
      mocked.put.mockRejectedValue(exists);
      mocked.get.mockResolvedValue(okGet(Buffer.from('x,y\n')));
      await expect(
        adapter.putBuffer({
          key: KEY,
          body,
          mediaType: 'text/csv',
          checksumHex: sha(body),
        }),
      ).rejects.toThrow('different object');
    });

    it('rethrows other provider errors', async () => {
      mocked.put.mockRejectedValue(new BlobError('service unavailable'));
      await expect(
        adapter.putBuffer({
          key: KEY,
          body,
          mediaType: 'text/csv',
          checksumHex: sha(body),
        }),
      ).rejects.toThrow('service unavailable');
      expect(mocked.get).not.toHaveBeenCalled();
    });
  });

  it('delete treats not-found as success and rethrows other errors', async () => {
    mocked.del.mockRejectedValueOnce(new BlobNotFoundError());
    await expect(adapter.delete(KEY)).resolves.toBeUndefined();
    mocked.del.mockRejectedValueOnce(new BlobError('forbidden'));
    await expect(adapter.delete(KEY)).rejects.toThrow('forbidden');
  });

  it('delete removes the exact pathname', async () => {
    mocked.del.mockResolvedValue(undefined);
    await adapter.delete(KEY);
    expect(mocked.del).toHaveBeenCalledWith(KEY, expect.any(Object));
  });

  describe('readiness', () => {
    it('is ready when the probe key is simply missing', async () => {
      mocked.head.mockRejectedValue(new BlobNotFoundError());
      await expect(adapter.readiness()).resolves.toBe(true);
    });

    it('is not ready on any other error', async () => {
      mocked.head.mockRejectedValue(new BlobError('forbidden'));
      await expect(adapter.readiness()).resolves.toBe(false);
    });
  });

  it('never logs a token, URL or signature', async () => {
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map(
      (level) => jest.spyOn(Logger.prototype, level),
    );
    adapter = new VercelBlobStorageAdapter(config('vercel_blob_rw_secret'));
    mocked.head.mockRejectedValue(new BlobError('forbidden'));
    mocked.put.mockRejectedValue(new BlobError('boom'));
    await adapter.presignPut({ key: KEY, mediaType: 'text/csv', maxBytes: 1 });
    await adapter.presignGet({
      key: KEY,
      filename: 'a',
      mediaType: 'text/csv',
    });
    await adapter.readiness();
    await adapter
      .putBuffer({
        key: KEY,
        body: Buffer.from('a'),
        mediaType: 'text/csv',
        checksumHex: sha(Buffer.from('a')),
      })
      .catch(() => undefined);
    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        const text = JSON.stringify(call);
        expect(text).not.toContain('vercel_blob_rw_');
        expect(text).not.toContain('vercel-blob-signature');
      }
      spy.mockRestore();
    }
  });
});
