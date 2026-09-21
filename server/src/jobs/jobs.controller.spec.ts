import type { JobRunSummary } from '@acres/shared';
import { JobsController } from './jobs.controller';
import type { JobRunsService } from './job-runs.service';

describe('JobsController', () => {
  let controller: JobsController;
  let jobRunsService: {
    listRecent: jest.Mock<Promise<JobRunSummary[]>, [number?]>;
  };

  beforeEach(() => {
    jobRunsService = {
      listRecent: jest.fn<Promise<JobRunSummary[]>, [number?]>(),
    };
    controller = new JobsController(
      jobRunsService as unknown as JobRunsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listRuns', () => {
    it('calls jobRunsService.listRecent() and returns the array of JobRunSummary', async () => {
      const mockSummaries: JobRunSummary[] = [
        {
          id: 'run-uuid-1',
          jobName: 'sessions.purge-expired',
          status: 'succeeded',
          startedAt: '2026-09-20T10:00:00.000Z',
          finishedAt: '2026-09-20T10:01:00.000Z',
          message: 'purged 3 session(s)',
        },
        {
          id: 'run-uuid-2',
          jobName: 'uploads.purge-expired',
          status: 'running',
          startedAt: '2026-09-20T11:00:00.000Z',
          finishedAt: null,
          message: null,
        },
      ];
      jobRunsService.listRecent.mockResolvedValue(mockSummaries);

      const result = await controller.listRuns();

      expect(jobRunsService.listRecent).toHaveBeenCalledTimes(1);
      expect(jobRunsService.listRecent).toHaveBeenCalledWith();
      expect(result).toEqual(mockSummaries);
    });
  });
});
