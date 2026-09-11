import { Logger } from '@nestjs/common';
import type { AcresConfigService } from '../config/acres-config.service';
import type { SessionsService } from '../sessions/sessions.service';
import type { JobRunsService } from './job-runs.service';
import {
  SESSION_MAINTENANCE_JOB,
  SESSION_PURGE_UNEXPECTED_FAILURE_MESSAGE,
  SessionMaintenanceJob,
} from './session-maintenance.job';

describe('SessionMaintenanceJob', () => {
  let runs: {
    start: jest.Mock<Promise<string>, [string]>;
    finish: jest.Mock<
      Promise<void>,
      [string, 'succeeded' | 'failed', string | undefined]
    >;
  };
  let config: { schedulerEnabled: boolean };
  let sessions: { purgeExpired: jest.Mock<Promise<number>, []> };

  beforeEach(() => {
    config = { schedulerEnabled: true };
    runs = {
      start: jest.fn<Promise<string>, [string]>().mockResolvedValue('run-123'),
      finish: jest
        .fn<
          Promise<void>,
          [string, 'succeeded' | 'failed', string | undefined]
        >()
        .mockResolvedValue(undefined),
    };
    sessions = { purgeExpired: jest.fn<Promise<number>, []>() };
  });

  function buildJob() {
    return new SessionMaintenanceJob(
      sessions as unknown as SessionsService,
      runs as unknown as JobRunsService,
      config as unknown as AcresConfigService,
    );
  }

  it('skips execution when the scheduler is disabled', async () => {
    config.schedulerEnabled = false;
    const job = buildJob();

    await job.purgeExpiredSessions();

    expect(runs.start).not.toHaveBeenCalled();
    expect(sessions.purgeExpired).not.toHaveBeenCalled();
    expect(runs.finish).not.toHaveBeenCalled();
  });

  it('aborts gracefully when runs.start throws', async () => {
    runs.start.mockRejectedValueOnce(new Error('Job run start failed'));
    const job = buildJob();

    await job.purgeExpiredSessions();

    expect(sessions.purgeExpired).not.toHaveBeenCalled();
    expect(runs.finish).not.toHaveBeenCalled();
  });

  it('records the purged count on success', async () => {
    sessions.purgeExpired.mockResolvedValueOnce(3);
    const job = buildJob();

    await job.purgeExpiredSessions();

    expect(runs.start).toHaveBeenCalledWith(SESSION_MAINTENANCE_JOB);
    expect(runs.finish).toHaveBeenCalledWith(
      'run-123',
      'succeeded',
      expect.stringContaining('purged 3 session(s)'),
    );
  });

  it('records a fixed message when the session purge throws', async () => {
    sessions.purgeExpired.mockRejectedValueOnce(
      new Error(
        'DB deadlock on connection postgres://acres:secret@db:5432/acres for key sessions/sess-1',
      ),
    );
    const job = buildJob();
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    try {
      await job.purgeExpiredSessions();

      expect(runs.finish).toHaveBeenCalledWith(
        'run-123',
        'failed',
        SESSION_PURGE_UNEXPECTED_FAILURE_MESSAGE,
      );
      const stored = runs.finish.mock.calls[0][2] as string;
      expect(stored).not.toContain('postgres://');
      expect(stored).not.toContain('sessions/sess-1');
      expect(loggerError).toHaveBeenCalled();
      expect(String(loggerError.mock.calls[0][0])).toContain('DB deadlock');
    } finally {
      loggerError.mockRestore();
    }
  });

  it('records the same fixed message for a non-Error session throw', async () => {
    sessions.purgeExpired.mockRejectedValueOnce('boom');
    const job = buildJob();

    await job.purgeExpiredSessions();

    expect(runs.finish).toHaveBeenCalledWith(
      'run-123',
      'failed',
      SESSION_PURGE_UNEXPECTED_FAILURE_MESSAGE,
    );
  });
});
