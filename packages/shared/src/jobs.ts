/** Scheduled job bookkeeping. */

export const JOB_RUN_STATUSES = [
  'running',
  'succeeded',
  'failed',
] as const;

export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export const SCHEDULED_JOB_NAMES = [
  'sessions.purge-expired',
  'uploads.purge-expired',
  'idempotency.purge-expired',
  'tokens.purge-expired',
  'exports.purge-expired',
] as const;

export type ScheduledJobName = (typeof SCHEDULED_JOB_NAMES)[number];

export interface JobRunSummary {
  id: string;
  jobName: string;
  status: JobRunStatus;
  /** ISO 8601. */
  startedAt: string;
  /** ISO 8601, or `null` while the run is still in flight. */
  finishedAt: string | null;
  message: string | null;
}
