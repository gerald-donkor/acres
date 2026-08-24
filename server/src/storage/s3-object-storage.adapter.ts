import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AcresConfigService } from '../config/acres-config.service';
import type {
  ObjectStoragePort,
  PresignedGet,
  PresignedPut,
  StoredObjectStat,
} from './storage.port';

@Injectable()
export class S3ObjectStorageAdapter implements ObjectStoragePort {
  private readonly client: S3Client;

  constructor(private readonly config: AcresConfigService) {
    this.client = new S3Client({
      endpoint: config.storageEndpoint,
      region: config.storageRegion,
      forcePathStyle: config.storageForcePathStyle,
      credentials: {
        accessKeyId: config.storageAccessKeyId,
        secretAccessKey: config.storageSecretAccessKey,
      },
    });
  }

  async presignPut(input: {
    key: string;
    mediaType: string;
    checksumHex?: string;
  }): Promise<PresignedPut> {
    const expiresAt = new Date(
      Date.now() + this.config.presignedUploadTtlSeconds * 1000,
    );
    const headers: Record<string, string> = {
      'content-type': input.mediaType,
    };
    if (input.checksumHex !== undefined) {
      headers['x-amz-checksum-sha256'] = sha256HexToBase64(input.checksumHex);
    }
    const command = new PutObjectCommand({
      Bucket: this.config.storageBucket,
      Key: input.key,
      ContentType: input.mediaType,
      ChecksumSHA256:
        input.checksumHex === undefined
          ? undefined
          : sha256HexToBase64(input.checksumHex),
    });
    return {
      method: 'PUT',
      headers,
      expiresAt,
      url: await getSignedUrl(this.client, command, {
        expiresIn: this.config.presignedUploadTtlSeconds,
      }),
    };
  }

  async presignGet(input: {
    key: string;
    filename: string;
    mediaType: string;
  }): Promise<PresignedGet> {
    const expiresAt = new Date(
      Date.now() + this.config.acceptedDownloadTtlSeconds * 1000,
    );
    const command = new GetObjectCommand({
      Bucket: this.config.storageBucket,
      Key: input.key,
      ResponseContentType: input.mediaType,
      ResponseContentDisposition: `attachment; filename="${safeFilename(
        input.filename,
      )}"`,
    });
    return {
      method: 'GET',
      headers: {},
      expiresAt,
      url: await getSignedUrl(this.client, command, {
        expiresIn: this.config.acceptedDownloadTtlSeconds,
      }),
    };
  }

  async putBuffer(input: {
    key: string;
    body: Buffer;
    mediaType: string;
    checksumHex: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.storageBucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.mediaType,
        ChecksumSHA256: sha256HexToBase64(input.checksumHex),
      }),
    );
  }

  async stat(key: string): Promise<StoredObjectStat | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.storageBucket,
          Key: key,
        }),
      );
      return {
        byteCount: BigInt(response.ContentLength ?? 0),
        mediaType: response.ContentType ?? null,
        checksumHex: response.ChecksumSHA256 ?? null,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async getBuffer(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.storageBucket,
          Key: key,
        }),
      );
      if (response.Body === undefined) return Buffer.alloc(0);
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.storageBucket,
        Key: key,
      }),
    );
  }

  async readiness(): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.storageBucket,
          Key: '.acres-readiness',
        }),
      );
      return true;
    } catch (error) {
      return isNotFound(error);
    }
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('$metadata' in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 404
      : false)
  );
}

function sha256HexToBase64(checksumHex: string): string {
  return Buffer.from(checksumHex, 'hex').toString('base64');
}

function safeFilename(filename: string): string {
  return filename.replace(/["\r\n\\]/g, '_').slice(0, 180);
}
