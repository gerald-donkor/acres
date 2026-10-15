import type { QueueJobName } from '../queue/work-queue.port';

export type AggregateLedgerState =
  'running' | 'succeeded' | 'failed' | 'cancelled';

/** Shared by delivery preflight and database-only retention recovery. */
export function aggregateLedgerState(
  jobName: QueueJobName,
  state: string,
): AggregateLedgerState {
  switch (jobName) {
    case 'upload.completed':
      if (state === 'accepted') return 'succeeded';
      if (state === 'rejected') return 'failed';
      if (state === 'cancelled' || state === 'expired') return 'cancelled';
      break;
    case 'ingestion.run':
      if (state === 'published') return 'succeeded';
      if (state === 'failed' || state === 'validation_failed') return 'failed';
      if (state === 'cancelled') return 'cancelled';
      break;
    case 'export.requested':
      if (state === 'succeeded' || state === 'failed' || state === 'cancelled')
        return state;
  }
  return 'running';
}
