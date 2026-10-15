import { Inject, Injectable, Logger } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { IngestionProcessorService } from '../ingestion/ingestion-processor.service';
import { TenantTransactionService } from '../prisma/tenant-transaction.service';
import { ReportsService } from '../reports/reports.service';
import {
  MALWARE_SCANNER,
  type MalwareScannerPort,
  type ScanErrorCode,
  type ScanFailureStatus,
} from '../scanner/scanner.port';
import {
  OBJECT_STORAGE,
  type ObjectStoragePort,
} from '../storage/storage.port';
import type { QueueJobPayload } from '../queue/work-queue.port';

type UploadJobData = QueueJobPayload;

/**
 * Stored on the durable `worker_exception` rows when upload processing throws
 * unexpectedly. The original error is logged server-side only; durable message
 * columns must never carry raw exception text (storage keys, endpoint URLs,
 * or library internals).
 */
export const WORKER_EXCEPTION_MESSAGE =
  'Upload processing failed unexpectedly.';

export const REJECTED_SCAN_MESSAGE =
  'Upload did not pass malware scanning.' as const;

type RejectedScanMessage = typeof REJECTED_SCAN_MESSAGE;

type RejectedScanCode = ScanErrorCode | ScanFailureStatus;

/** Request-independent processing. No listeners, timers or process bootstrap. */
@Injectable()
export class JobProcessorService {
  private readonly logger = new Logger(JobProcessorService.name);

  constructor(
    private readonly config: AcresConfigService,
    private readonly tenants: TenantTransactionService,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScannerPort,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly ingestionProcessor: IngestionProcessorService,
    private readonly reports: ReportsService,
  ) {}

  async process(data: UploadJobData): Promise<void> {
    if (data.ingestionRunId !== undefined) {
      await this.ingestionProcessor.processRun(data.ingestionRunId);
      return;
    }
    if (data.exportRequestId !== undefined) {
      await this.reports.processExport(data.exportRequestId);
      return;
    }
    if (data.uploadId === undefined) return;
    const upload = await this.tenants.workerScoped((tx) => {
      return tx.upload.findUnique({
        where: { id: data.uploadId },
        include: { storedObject: true },
      });
    });
    if (upload === null || upload.organizationId === null) return;
    const deterministicKey = `upload.completed:${upload.id}`;
    const durableJob = await this.tenants.workerScoped((tx) =>
      tx.durableJob.upsert({
        where: { deterministicKey },
        update: {
          state: 'running',
          attempts: { increment: 1 },
          startedAt: new Date(),
          lastErrorCode: null,
          lastErrorMessage: null,
        },
        create: {
          deterministicKey,
          organizationId: upload.organizationId,
          uploadId: upload.id,
          jobType: 'upload.completed',
          state: 'running',
          attempts: 1,
          maxAttempts: this.config.queueDefaultAttempts,
          startedAt: new Date(),
        },
      }),
    );
    try {
      const canScan = await this.tenants.organizationScoped(
        upload.actorAccountId,
        upload.organizationId,
        async (tx) => {
          const fresh = await tx.upload.findFirst({
            where: { id: upload.id, organizationId: upload.organizationId },
          });
          if (fresh === null || fresh.state !== 'completed') return false;
          await tx.upload.update({
            where: { id: upload.id },
            data: {
              state: 'scanning',
              progressStage: 'scanning',
              progressPercent: 50,
            },
          });
          await tx.jobProgressEvent.create({
            data: {
              organizationId: upload.organizationId,
              uploadId: upload.id,
              durableJobId: durableJob.id,
              stage: 'scanning',
              percent: 50,
            },
          });
          return true;
        },
      );
      if (!canScan) return;

      const bytes = await this.storage.getBuffer(upload.storedObject.objectKey);
      const scan =
        bytes === null
          ? ({ status: 'failed', errorCode: 'object_missing' } as const)
          : await this.scanner.scanBuffer(bytes);
      const terminalState = await this.tenants.organizationScoped(
        upload.actorAccountId,
        upload.organizationId,
        async (tx) => {
          const fresh = await tx.upload.findFirst({
            where: { id: upload.id, organizationId: upload.organizationId },
          });
          if (fresh === null) return 'missing' as const;
          if (fresh.state === 'cancelled') return 'cancelled' as const;
          if (scan.status === 'clean') {
            await tx.upload.update({
              where: { id: upload.id },
              data: {
                state: 'accepted',
                scanStatus: 'clean',
                scanResult: 'clean',
                progressStage: 'accepted',
                progressPercent: 100,
                acceptedAt: new Date(),
              },
            });
            await tx.storedObject.update({
              where: { id: upload.storedObjectId },
              data: { state: 'accepted' },
            });
          } else {
            // Server logs only. The raw scanner signature must never sit in
            // a durable column (same rule as prompts 72-75).
            this.logger.warn(
              `Upload rejected by malware scan for upload ${upload.id} org ${upload.organizationId} job ${durableJob.id}: ${scan.status}/${scan.signature ?? scan.errorCode ?? scan.status}`,
            );
            const rejectedScanResult: RejectedScanCode =
              scan.status === 'infected'
                ? 'infected'
                : (scan.errorCode ?? scan.status);
            const rejectedFailureCode: RejectedScanCode =
              scan.errorCode ?? scan.status;
            const rejectedMessage: RejectedScanMessage = REJECTED_SCAN_MESSAGE;
            await tx.upload.update({
              where: { id: upload.id },
              data: {
                state: 'rejected',
                scanStatus: scan.status,
                scanResult: rejectedScanResult,
                failureCode: rejectedFailureCode,
                failureMessage: rejectedMessage,
                progressStage: 'rejected',
                progressPercent: 100,
              },
            });
            await tx.storedObject.update({
              where: { id: upload.storedObjectId },
              data: { state: 'rejected' },
            });
          }
          await tx.jobProgressEvent.create({
            data: {
              organizationId: upload.organizationId,
              uploadId: upload.id,
              durableJobId: durableJob.id,
              stage: scan.status === 'clean' ? 'accepted' : 'rejected',
              percent: 100,
            },
          });
          return scan.status === 'clean'
            ? ('succeeded' as const)
            : ('failed' as const);
        },
      );
      await this.tenants.workerScoped(async (tx) => {
        const rejectedLastErrorCode: RejectedScanCode | null =
          terminalState === 'cancelled'
            ? null
            : scan.status === 'clean'
              ? null
              : (scan.errorCode ?? scan.status);
        const rejectedMessage: RejectedScanMessage = REJECTED_SCAN_MESSAGE;
        await tx.durableJob.update({
          where: { id: durableJob.id },
          data: {
            state:
              terminalState === 'cancelled'
                ? 'cancelled'
                : scan.status === 'clean'
                  ? 'succeeded'
                  : 'failed',
            finishedAt: new Date(),
            lastErrorCode: rejectedLastErrorCode,
            lastErrorMessage:
              terminalState === 'cancelled' || scan.status === 'clean'
                ? null
                : rejectedMessage,
          },
        });
        if (terminalState !== 'cancelled' && scan.status !== 'clean') {
          const rejectedReasonCode: RejectedScanCode =
            scan.errorCode ?? scan.status;
          await tx.jobDeadLetter.create({
            data: {
              organizationId: upload.organizationId,
              durableJobId: durableJob.id,
              reasonCode: rejectedReasonCode,
              reasonMessage: rejectedMessage,
              payload: { uploadId: upload.id },
            },
          });
        }
      });
    } catch (error) {
      await this.finalizeException(
        durableJob.id,
        upload.organizationId,
        upload.id,
        error,
      );
      throw error;
    }
  }

  private async finalizeException(
    durableJobId: string,
    organizationId: string,
    uploadId: string,
    error: unknown,
  ): Promise<void> {
    // Operator diagnostics only. Never persisted to any column, metric label,
    // or returned payload.
    const detail =
      error instanceof Error ? (error.stack ?? error.message) : String(error);
    this.logger.error(
      `Upload worker exception for durableJob ${durableJobId} upload ${uploadId} org ${organizationId}: ${detail}`,
    );
    await this.tenants.workerScoped(async (tx) => {
      await tx.durableJob.update({
        where: { id: durableJobId },
        data: {
          state: 'failed',
          finishedAt: new Date(),
          lastErrorCode: 'worker_exception',
          lastErrorMessage: WORKER_EXCEPTION_MESSAGE,
        },
      });
      await tx.jobDeadLetter.create({
        data: {
          organizationId,
          durableJobId,
          reasonCode: 'worker_exception',
          reasonMessage: WORKER_EXCEPTION_MESSAGE,
          payload: { uploadId },
        },
      });
    });
  }
}
