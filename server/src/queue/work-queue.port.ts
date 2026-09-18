export type QueueJobName =
  'upload.completed' | 'export.requested' | 'ingestion.run';

export interface QueueJobPayload {
  readonly uploadId?: string;
  readonly ingestionRunId?: string;
  readonly exportRequestId?: string;
  readonly outboxEventId?: string;
}

export interface QueuePort {
  enqueue(input: {
    deterministicKey: string;
    jobName: QueueJobName;
    payload: QueueJobPayload;
    delayMs?: number;
  }): Promise<void>;
  readiness(): Promise<boolean>;
  close(): Promise<void>;
}

export const WORK_QUEUE = Symbol('WORK_QUEUE');
