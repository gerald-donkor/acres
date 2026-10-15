import {
  QUEUE_JOB_NAMES,
  type QueueJobName,
  type QueueJobPayload,
} from './work-queue.port';

/**
 * The only shape a managed queue carries: a job name and opaque identifiers.
 * Authority, tenant linkage and state are always re-read from PostgreSQL at
 * execution, never taken from the message.
 */
export interface QueueMessage {
  readonly v: 1;
  readonly jobName: QueueJobName;
  readonly id: string;
  readonly outboxEventId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ID_FIELD: Record<QueueJobName, keyof QueueJobPayload> = {
  'upload.completed': 'uploadId',
  'export.requested': 'exportRequestId',
  'ingestion.run': 'ingestionRunId',
};

export class InvalidQueueMessageError extends Error {
  constructor() {
    super('Queue message does not match the job contract.');
    this.name = 'InvalidQueueMessageError';
  }
}

export function toQueueMessage(
  jobName: QueueJobName,
  payload: QueueJobPayload,
): QueueMessage {
  const id = payload[ID_FIELD[jobName]];
  if (id === undefined || !UUID.test(id)) throw new InvalidQueueMessageError();
  if (payload.outboxEventId !== undefined && !UUID.test(payload.outboxEventId))
    throw new InvalidQueueMessageError();
  return payload.outboxEventId === undefined
    ? { v: 1, jobName, id }
    : { v: 1, jobName, id, outboxEventId: payload.outboxEventId };
}

/** Strict: unknown keys, versions, names or non-UUID identifiers are rejected. */
export function parseQueueMessage(raw: unknown): QueueMessage {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new InvalidQueueMessageError();
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.some((key) => !['v', 'jobName', 'id', 'outboxEventId'].includes(key))
  )
    throw new InvalidQueueMessageError();
  const { v, jobName, id, outboxEventId } = record;
  if (v !== 1) throw new InvalidQueueMessageError();
  if (
    typeof jobName !== 'string' ||
    !(QUEUE_JOB_NAMES as readonly string[]).includes(jobName)
  )
    throw new InvalidQueueMessageError();
  if (typeof id !== 'string' || !UUID.test(id))
    throw new InvalidQueueMessageError();
  if (
    outboxEventId !== undefined &&
    (typeof outboxEventId !== 'string' || !UUID.test(outboxEventId))
  )
    throw new InvalidQueueMessageError();
  return toQueueMessage(jobName as QueueJobName, {
    [ID_FIELD[jobName as QueueJobName]]: id,
    ...(outboxEventId === undefined ? {} : { outboxEventId }),
  });
}

/** The ledger key every transport uses for this job (matches the outbox and ingestion keys). */
export function deterministicKeyFor(message: QueueMessage): string {
  return `${message.jobName}:${message.id}`;
}

export function toJobPayload(message: QueueMessage): QueueJobPayload {
  return {
    [ID_FIELD[message.jobName]]: message.id,
    ...(message.outboxEventId === undefined
      ? {}
      : { outboxEventId: message.outboxEventId }),
  };
}
