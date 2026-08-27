import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ApiException } from '../common/api-exception';
import { AcresConfigService } from '../config/acres-config.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { OutboxService } from '../outbox/outbox.service';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../storage/storage.port';
import type { UploadStatus } from '@acres/shared';
import type { OrganizationContext } from '../organizations/organization-context';
import type { CompleteUploadDto } from './dto/complete-upload.dto';
import type { InitiateUploadDto } from './dto/initiate-upload.dto';

const IDEMPOTENCY_KEY_RE = /^[\x21-\x7e]{16,128}$/;

export type { UploadStatus };

@Injectable()
export class UploadsService {
  constructor(
    private readonly tenants: TenantTransactionService,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxService,
    private readonly config: AcresConfigService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  async initiate(
    organization: OrganizationContext,
    idempotencyKey: string | undefined,
    body: InitiateUploadDto,
  ) {
    this.validateMediaType(body.mediaType);
    this.validateByteCount(body.byteCount);
    const key = this.objectKey(organization.organizationId);
    const signed = await this.storage.presignPut({
      key,
      mediaType: body.mediaType,
      checksumHex: body.checksumHex,
    });
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      (tx) =>
        this.idempotency.run(
          tx,
          {
            key: idempotencyKey,
            accountId: organization.accountId,
            organizationId: organization.organizationId,
            operation: 'uploads.initiate',
            requestBody: body,
            responseStatus: 201,
          },
          async () => {
            const object = await tx.storedObject.create({
              data: {
                organizationId: organization.organizationId,
                bucket: this.config.storageBucket,
                objectKey: key,
                originalFilename: body.filename,
                mediaType: body.mediaType,
                checksumAlgorithm: 'sha256',
                checksumHex: body.checksumHex?.toLowerCase(),
              },
            });
            const upload = await tx.upload.create({
              data: {
                organizationId: organization.organizationId,
                actorAccountId: organization.accountId,
                storedObjectId: object.id,
                declaredFilename: body.filename,
                declaredMediaType: body.mediaType,
                declaredByteCount: BigInt(body.byteCount),
                checksumAlgorithm: 'sha256',
                checksumHex: body.checksumHex?.toLowerCase(),
                presignedUploadExpiresAt: signed.expiresAt,
                expiresAt: new Date(
                  Date.now() + this.config.uploadStaleMinutes * 60 * 1000,
                ),
              },
            });
            return {
              uploadId: upload.id,
              object: {
                key,
                bucket: this.config.storageBucket,
                checksumAlgorithm: 'sha256',
              },
              upload: {
                url: signed.url,
                method: signed.method,
                headers: signed.headers,
                expiresAt: signed.expiresAt.toISOString(),
              },
              complete: {
                method: 'POST',
                url: `/api/v1/uploads/${upload.id}/complete`,
                requiredHeaders: ['x-csrf-token', 'idempotency-key'],
              },
            };
          },
        ),
    );
  }

  async complete(
    organization: OrganizationContext,
    uploadId: string,
    idempotencyKey: string | undefined,
    body: CompleteUploadDto,
  ) {
    this.validateByteCount(body.byteCount);
    if (!idempotencyKey || !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
      throw ApiException.idempotencyKeyRequired();
    }
    const reserved = await this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      async (tx) => {
        const upload = await tx.upload.findFirst({
          where: {
            id: uploadId,
            organizationId: organization.organizationId,
          },
          include: { storedObject: true },
        });
        if (upload === null) throw ApiException.notFound('Upload not found.');
        return {
          uploadId: upload.id,
          storedObjectId: upload.storedObjectId,
          objectKey: upload.storedObject.objectKey,
          declaredMediaType: upload.declaredMediaType,
        };
      },
    );

    const stat = await this.storage.stat(reserved.objectKey);
    if (stat === null)
      throw ApiException.conflict('Uploaded object was not found.');
    if (stat.byteCount !== BigInt(body.byteCount)) {
      throw ApiException.validationFailed([
        'byteCount does not match object storage.',
      ]);
    }
    if (
      stat.mediaType !== null &&
      stat.mediaType !== reserved.declaredMediaType
    ) {
      throw ApiException.validationFailed([
        'mediaType does not match object storage.',
      ]);
    }
    const bytes = await this.storage.getBuffer(reserved.objectKey);
    if (bytes === null)
      throw ApiException.conflict('Uploaded object was not found.');
    const checksumHex = body.checksumHex.toLowerCase();
    const actualChecksum = createHash('sha256').update(bytes).digest('hex');
    if (checksumHex !== actualChecksum) {
      throw ApiException.validationFailed([
        'checksumHex does not match object storage.',
      ]);
    }

    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      (tx) =>
        this.idempotency.run(
          tx,
          {
            key: idempotencyKey,
            accountId: organization.accountId,
            organizationId: organization.organizationId,
            operation: `uploads.complete:${uploadId}`,
            requestBody: body,
            responseStatus: 200,
          },
          async () => {
            const upload = await tx.upload.findFirst({
              where: {
                id: uploadId,
                organizationId: organization.organizationId,
              },
            });
            if (upload === null)
              throw ApiException.notFound('Upload not found.');
            if (upload.state !== 'pending_upload') {
              throw ApiException.conflict('Upload is not awaiting completion.');
            }
            const updated = await tx.upload.update({
              where: { id: upload.id },
              data: {
                state: 'completed',
                completedByteCount: BigInt(body.byteCount),
                checksumHex,
                scanStatus: 'pending',
                progressStage: 'queued_scan',
                progressPercent: 20,
                completedAt: new Date(),
                version: { increment: 1 },
              },
            });
            await tx.storedObject.update({
              where: { id: upload.storedObjectId },
              data: {
                state: 'quarantined',
                byteCount: BigInt(body.byteCount),
                checksumHex,
              },
            });
            await tx.jobProgressEvent.create({
              data: {
                organizationId: organization.organizationId,
                uploadId,
                stage: 'queued_scan',
                percent: 20,
              },
            });
            await this.outbox.appendUploadCompleted(tx, {
              organizationId: organization.organizationId,
              uploadId,
              version: updated.version,
            });
            return this.toStatus(updated);
          },
        ),
    );
  }

  async get(
    organization: OrganizationContext,
    uploadId: string,
  ): Promise<UploadStatus> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      async (tx) => {
        const upload = await tx.upload.findFirst({
          where: { id: uploadId, organizationId: organization.organizationId },
        });
        if (upload === null) throw ApiException.notFound('Upload not found.');
        return this.toStatus(upload);
      },
    );
  }

  async cancel(
    organization: OrganizationContext,
    uploadId: string,
    idempotencyKey: string | undefined,
  ): Promise<UploadStatus> {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      (tx) =>
        this.idempotency.run(
          tx,
          {
            key: idempotencyKey,
            accountId: organization.accountId,
            organizationId: organization.organizationId,
            operation: `uploads.cancel:${uploadId}`,
            requestBody: {},
            responseStatus: 200,
          },
          async () => {
            const upload = await tx.upload.findFirst({
              where: {
                id: uploadId,
                organizationId: organization.organizationId,
              },
            });
            if (upload === null)
              throw ApiException.notFound('Upload not found.');
            if (upload.state === 'cancelled') return this.toStatus(upload);
            if (['accepted', 'rejected'].includes(upload.state)) {
              throw ApiException.conflict('Upload can no longer be cancelled.');
            }
            const updated = await tx.upload.update({
              where: { id: uploadId },
              data: {
                state: 'cancelled',
                cancelledAt: new Date(),
                progressStage: 'cancelled',
                progressPercent: 100,
              },
            });
            return this.toStatus(updated);
          },
        ),
    );
  }

  async download(organization: OrganizationContext, uploadId: string) {
    return this.tenants.organizationScoped(
      organization.accountId,
      organization.organizationId,
      async (tx) => {
        const upload = await tx.upload.findFirst({
          where: { id: uploadId, organizationId: organization.organizationId },
          include: { storedObject: true },
        });
        if (upload === null || upload.state !== 'accepted') {
          throw ApiException.notFound('Accepted object not found.');
        }
        const signed = await this.storage.presignGet({
          key: upload.storedObject.objectKey,
          filename: upload.declaredFilename,
          mediaType: upload.declaredMediaType,
        });
        return {
          url: signed.url,
          method: signed.method,
          headers: signed.headers,
          expiresAt: signed.expiresAt.toISOString(),
        };
      },
    );
  }

  private validateMediaType(mediaType: string): void {
    if (!this.config.uploadAcceptedMediaTypes.includes(mediaType)) {
      throw ApiException.validationFailed(['mediaType is not accepted.']);
    }
  }

  private validateByteCount(byteCount: number): void {
    if (byteCount > this.config.uploadMaxBytes) {
      throw ApiException.validationFailed([
        'byteCount exceeds the temporary development limit.',
      ]);
    }
  }

  private objectKey(organizationId: string): string {
    return `organizations/${organizationId}/quarantine/${randomUUID()}`;
  }

  private toStatus(upload: {
    id: string;
    state: string;
    declaredFilename: string;
    declaredMediaType: string;
    declaredByteCount: bigint;
    completedByteCount: bigint | null;
    checksumHex: string | null;
    progressStage: string;
    progressPercent: number;
    failureCode: string | null;
    failureMessage: string | null;
    acceptedAt: Date | null;
  }): UploadStatus {
    return {
      id: upload.id,
      state: upload.state,
      filename: upload.declaredFilename,
      mediaType: upload.declaredMediaType,
      byteCount: Number(upload.completedByteCount ?? upload.declaredByteCount),
      checksumHex: upload.checksumHex,
      progress: {
        stage: upload.progressStage,
        percent: upload.progressPercent,
      },
      failure:
        upload.failureCode === null
          ? null
          : { code: upload.failureCode, message: upload.failureMessage },
      acceptedAt: upload.acceptedAt?.toISOString() ?? null,
    };
  }
}
