import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  BlobError,
  BlobNotFoundError,
  del,
  get,
  head,
  issueSignedToken,
  presignUrl,
  put,
} from '@vercel/blob';
import { AcresConfigService } from '../config/acres-config.service';
import type {
  ObjectStoragePort,
  PresignedGet,
  PresignedPut,
  StoredObjectStat,
} from './storage.port';

const CONTROL_TIMEOUT_MS = 30_000;
const BODY_TIMEOUT_MS = 120_000;

/**
 * Private Vercel Blob behind the storage port (managed profile only).
 *
 * The browser receives one presigned PUT URL bound to the exact pathname,
 * media type, declared size and expiry, with overwrite denied. It is the same
 * `{ url, method: 'PUT', headers }` contract the S3 adapter returns. With no
 * read-write token configured, the SDK authenticates with OIDC and
 * `BLOB_STORE_ID`; a configured token always takes precedence. No URL, token
 * or signature is ever logged.
 */
@Injectable()
export class VercelBlobStorageAdapter implements ObjectStoragePort {
  constructor(private readonly config: AcresConfigService) {}

  async presignPut(input: {
    key: string;
    mediaType: string;
    maxBytes: number;
    checksumHex?: string;
  }): Promise<PresignedPut> {
    // Blob has no SHA-256 precondition; complete() verifies the checksum.
    const validUntil =
      Date.now() + this.config.presignedUploadTtlSeconds * 1000;
    const constraints = {
      allowedContentTypes: [input.mediaType],
      maximumSizeInBytes: input.maxBytes,
      validUntil,
    };
    const token = await issueSignedToken({
      ...this.control(),
      pathname: input.key,
      operations: ['put'],
      ...constraints,
    });
    // Extensionless keys: the API stores and checks the `content-type` the
    // browser sends (proved on the preview store, 2026-10-15).
    const { presignedUrl } = await presignUrl(token, {
      operation: 'put',
      pathname: input.key,
      access: 'private',
      allowOverwrite: false,
      addRandomSuffix: false,
      ...constraints,
    });
    return {
      url: presignedUrl,
      method: 'PUT',
      headers: { 'content-type': input.mediaType },
      expiresAt: new Date(validUntil),
    };
  }

  async presignGet(input: {
    key: string;
    filename: string;
    mediaType: string;
  }): Promise<PresignedGet> {
    // Presigned Blob GETs cannot set a per-URL filename or media type; the
    // stored type is served with `content-disposition: attachment`.
    const validUntil =
      Date.now() + this.config.acceptedDownloadTtlSeconds * 1000;
    const token = await issueSignedToken({
      ...this.control(),
      pathname: input.key,
      operations: ['get'],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(token, {
      operation: 'get',
      pathname: input.key,
      access: 'private',
      useCache: false,
    });
    return {
      url: presignedUrl,
      method: 'GET',
      headers: {},
      expiresAt: new Date(validUntil),
    };
  }

  async putBuffer(input: {
    key: string;
    body: Buffer;
    mediaType: string;
    checksumHex: string;
  }): Promise<void> {
    const expected = input.checksumHex.toLowerCase();
    if (sha256Hex(input.body) !== expected) {
      throw new Error('Object body does not match its declared checksum.');
    }
    try {
      await put(input.key, input.body, {
        ...this.control(BODY_TIMEOUT_MS),
        access: 'private',
        contentType: input.mediaType,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
      // A retry after "object written, ledger not committed": identical bytes
      // are success; anything else is a conflicting object.
      const existing = await this.getBuffer(input.key);
      if (existing === null || sha256Hex(existing) !== expected) {
        throw new Error('A different object already exists at this key.');
      }
    }
  }

  async stat(key: string): Promise<StoredObjectStat | null> {
    try {
      const meta = await head(key, this.control());
      return {
        byteCount: BigInt(meta.size),
        mediaType: meta.contentType || null,
        checksumHex: null,
      };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    const result = await get(key, {
      ...this.control(BODY_TIMEOUT_MS),
      access: 'private',
      useCache: false,
    });
    if (result === null || result.statusCode !== 200) return null;
    return readBounded(result.stream, this.config.uploadMaxBytes);
  }

  async delete(key: string): Promise<void> {
    // Deleting a missing pathname succeeds (observed 2026-10-15); a not-found
    // error is also success, in case the API starts returning one.
    try {
      await del(key, this.control());
    } catch (error) {
      if (!(error instanceof BlobNotFoundError)) throw error;
    }
  }

  async readiness(): Promise<boolean> {
    try {
      await head('.acres-readiness', this.control());
      return true;
    } catch (error) {
      return error instanceof BlobNotFoundError;
    }
  }

  private control(timeoutMs = CONTROL_TIMEOUT_MS): {
    abortSignal: AbortSignal;
    storeId?: string;
    token?: string;
  } {
    // An explicit token wins over OIDC in the SDK, so OIDC is used only when
    // no token is configured. The store id comes from config, not from the
    // SDK's own read of process.env (validation ties both to one store).
    const token = this.config.blobReadWriteToken;
    return {
      abortSignal: AbortSignal.timeout(timeoutMs),
      storeId: this.config.blobStoreId,
      ...(token === undefined ? {} : { token }),
    };
  }
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isAlreadyExists(error: unknown): boolean {
  // The SDK maps this to a plain BlobError (observed 2026-10-15, 2.8.2).
  return (
    error instanceof BlobError &&
    !(error instanceof BlobNotFoundError) &&
    error.message.includes('This blob already exists')
  );
}

/** Reads at most `limit` bytes; a larger object is never buffered. */
export async function readBounded(
  stream: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        throw new Error('Stored object exceeds the maximum accepted size.');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
