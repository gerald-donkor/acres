import { Inject, Injectable, Logger } from '@nestjs/common';
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
import type {
  InitiateUploadResult,
  UploadDownload,
  UploadState,
  UploadStatus,
} from '@acres/shared';
import type { OrganizationContext } from '../organizations/organization-context';
import type { CompleteUploadDto } from './dto/complete-upload.dto';
import type { InitiateUploadDto } from './dto/initiate-upload.dto';

const IDEMPOTENCY_KEY_RE = /^[\x21-\x7e]{16,128}$/;

export type { InitiateUploadResult, UploadDownload, UploadState, UploadStatus };

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);

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
  ): Promise<InitiateUploadResult> {
    this.validateMediaType(body.mediaType);
    this.validateByteCount(body.byteCount);
    const key = this.objectKey(organization.organizationId);
    const signed = await this.storage.presignPut({
      key,
      mediaType: body.mediaType,
      maxBytes: body.byteCount,
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
  ): Promise<UploadStatus> {
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
            // Compare-and-set: a concurrent cancel that committed first leaves
            // no pending row to match, so this call conflicts instead of
            // overwriting it (cancel deletes never-quarantined bytes).
            const claimed = await tx.upload.updateMany({
              where: {
                id: upload.id,
                organizationId: organization.organizationId,
                state: 'pending_upload',
              },
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
            if (claimed.count !== 1) {
              throw ApiException.conflict('Upload is not awaiting completion.');
            }
            const updated = await tx.upload.findFirstOrThrow({
              where: {
                id: upload.id,
                organizationId: organization.organizationId,
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
    // Set only when this call (not an idempotent replay) cancels an upload
    // whose bytes never reached quarantine; deleted after the commit.
    // (Typed by assertion: assignment happens inside the callback, which
    // control-flow narrowing does not follow.)
    let unclaimed = null as {
      storedObjectId: string;
      objectKey: string;
    } | null;
    const status = await this.tenants.organizationScoped(
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
              include: {
                storedObject: { select: { id: true, objectKey: true } },
              },
            });
            if (upload === null)
              throw ApiException.notFound('Upload not found.');
            if (upload.state === 'cancelled') return this.toStatus(upload);
            if (['accepted', 'rejected'].includes(upload.state)) {
              throw ApiException.conflict('Upload can no longer be cancelled.');
            }
            // Compare-and-set on the state just read: if a concurrent
            // complete committed first, conflict rather than cancel (and
            // later delete) an upload that has moved on.
            const claimed = await tx.upload.updateMany({
              where: {
                id: uploadId,
                organizationId: organization.organizationId,
                state: upload.state,
              },
              data: {
                state: 'cancelled',
                cancelledAt: new Date(),
                progressStage: 'cancelled',
                progressPercent: 100,
              },
            });
            if (claimed.count !== 1) {
              throw ApiException.conflict(
                'Upload changed while cancelling; retry.',
              );
            }
            const updated = await tx.upload.findFirstOrThrow({
              where: {
                id: uploadId,
                organizationId: organization.organizationId,
              },
            });
            // From completed/scanning the processor finishes the cancelled
            // work; those quarantined bytes are left for the sweeper.
            if (upload.state === 'pending_upload') {
              unclaimed = {
                storedObjectId: upload.storedObject.id,
                objectKey: upload.storedObject.objectKey,
              };
            }
            return this.toStatus(updated);
          },
        ),
    );
    if (unclaimed !== null)
      await this.deleteUnclaimed(organization, uploadId, unclaimed);
    return status;
  }

  /**
   * Best-effort: a failed delete still returns the cancelled status and leaves
   * the StoredObject `pending_upload` for the reconciliation sweeper. A
   * still-valid PUT URL can write again until it expires; complete() then
   * returns 409 and nothing reads those bytes.
   */
  private async deleteUnclaimed(
    organization: OrganizationContext,
    uploadId: string,
    object: { storedObjectId: string; objectKey: string },
  ): Promise<void> {
    // The upload id only: object keys and provider errors stay out of logs.
    try {
      await this.storage.delete(object.objectKey);
    } catch {
      this.logger.warn(
        `Cancelled upload ${uploadId} left its object for the sweeper.`,
      );
      return;
    }
    try {
      await this.tenants.organizationScoped(
        organization.accountId,
        organization.organizationId,
        (tx) =>
          tx.storedObject.updateMany({
            where: {
              id: object.storedObjectId,
              organizationId: organization.organizationId,
              state: 'pending_upload',
            },
            data: { state: 'deleted', deletedAt: new Date() },
          }),
      );
    } catch {
      this.logger.warn(
        `Cancelled upload ${uploadId} deleted its object but kept the ledger row pending_upload.`,
      );
    }
  }

  async download(
    organization: OrganizationContext,
    uploadId: string,
  ): Promise<UploadDownload> {
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
    state: UploadState;
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
