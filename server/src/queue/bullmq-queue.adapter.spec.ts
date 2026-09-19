import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { AcresConfigService } from '../config/acres-config.service';
import { BullmqQueueAdapter } from './bullmq-queue.adapter';
import { QUEUE_JOB_NAMES } from './work-queue.port';

jest.mock('bullmq', () => ({
  Queue: jest.fn(),
}));

jest.mock('ioredis', () => {
  return jest.fn();
});

describe('BullmqQueueAdapter', () => {
  let adapter: BullmqQueueAdapter;
  let mockQueueInstance: {
    add: jest.Mock;
    getJobCounts: jest.Mock;
    close: jest.Mock;
  };
  let mockRedisInstance: {
    disconnect: jest.Mock;
  };

  const mockConfig = {
    valkeyUrl: 'redis://localhost:6379',
    queueName: 'acres-work-queue',
    queuePrefix: 'acres-queue',
    queueDefaultAttempts: 3,
    queueBackoffMs: 2000,
  } as unknown as AcresConfigService;

  beforeEach(() => {
    mockQueueInstance = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0 }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (Queue as unknown as jest.Mock).mockImplementation(() => mockQueueInstance);

    mockRedisInstance = {
      disconnect: jest.fn(),
    };
    (IORedis as unknown as jest.Mock).mockImplementation(
      () => mockRedisInstance,
    );

    adapter = new BullmqQueueAdapter(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('QUEUE_JOB_NAMES contract', () => {
    it('defines the canonical closed tuple of queue job names', () => {
      expect(QUEUE_JOB_NAMES).toEqual([
        'upload.completed',
        'export.requested',
        'ingestion.run',
      ]);
      expect(Array.isArray(QUEUE_JOB_NAMES)).toBe(true);
      expect(QUEUE_JOB_NAMES).toHaveLength(3);
    });
  });

  describe('lazy initialization & instance caching', () => {
    it('does not instantiate IORedis or Queue upon adapter construction', () => {
      expect(IORedis).not.toHaveBeenCalled();
      expect(Queue).not.toHaveBeenCalled();
    });

    it('initializes connection and queue with expected configuration options on first operation', async () => {
      await adapter.enqueue({
        deterministicKey: 'key-1',
        jobName: 'upload.completed',
        payload: { uploadId: 'up-1' },
      });

      expect(IORedis).toHaveBeenCalledTimes(1);
      expect(IORedis).toHaveBeenCalledWith('redis://localhost:6379', {
        maxRetriesPerRequest: null,
        enableReadyCheck: true,
      });

      expect(Queue).toHaveBeenCalledTimes(1);
      expect(Queue).toHaveBeenCalledWith('acres-work-queue', {
        connection: mockRedisInstance,
        prefix: 'acres-queue',
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { age: 24 * 60 * 60 },
          removeOnFail: { age: 7 * 24 * 60 * 60 },
        },
      });
    });

    it('reuses existing connection and queue instances on subsequent calls', async () => {
      await adapter.enqueue({
        deterministicKey: 'key-1',
        jobName: 'upload.completed',
        payload: { uploadId: 'up-1' },
      });

      await adapter.enqueue({
        deterministicKey: 'key-2',
        jobName: 'export.requested',
        payload: { exportRequestId: 'exp-1' },
      });

      expect(IORedis).toHaveBeenCalledTimes(1);
      expect(Queue).toHaveBeenCalledTimes(1);
      expect(mockQueueInstance.add).toHaveBeenCalledTimes(2);
    });
  });

  describe('enqueue', () => {
    it('adds job with default delay of 0 when delayMs is undefined', async () => {
      await adapter.enqueue({
        deterministicKey: 'upload.completed:up-1',
        jobName: 'upload.completed',
        payload: { uploadId: 'up-1' },
      });

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'upload.completed',
        { uploadId: 'up-1' },
        {
          jobId: 'upload.completed:up-1',
          delay: 0,
        },
      );
    });

    it('adds job with custom delayMs when specified', async () => {
      await adapter.enqueue({
        deterministicKey: 'ingestion.run:run-1',
        jobName: 'ingestion.run',
        payload: { ingestionRunId: 'run-1' },
        delayMs: 5000,
      });

      expect(mockQueueInstance.add).toHaveBeenCalledWith(
        'ingestion.run',
        { ingestionRunId: 'run-1' },
        {
          jobId: 'ingestion.run:run-1',
          delay: 5000,
        },
      );
    });
  });

  describe('readiness', () => {
    it('returns true when getJobCounts resolves successfully', async () => {
      mockQueueInstance.getJobCounts.mockResolvedValue({ waiting: 2 });

      const isReady = await adapter.readiness();
      expect(isReady).toBe(true);
      expect(mockQueueInstance.getJobCounts).toHaveBeenCalledWith('waiting');
    });

    it('returns false when getJobCounts rejects with an error', async () => {
      mockQueueInstance.getJobCounts.mockRejectedValue(
        new Error('Connection lost'),
      );

      const isReady = await adapter.readiness();
      expect(isReady).toBe(false);
    });
  });

  describe('close & onModuleDestroy', () => {
    it('safely handles close when queue and connection were never initialized', async () => {
      await expect(adapter.close()).resolves.toBeUndefined();
      expect(mockQueueInstance.close).not.toHaveBeenCalled();
      expect(mockRedisInstance.disconnect).not.toHaveBeenCalled();
    });

    it('closes queue and disconnects connection when initialized', async () => {
      await adapter.enqueue({
        deterministicKey: 'key-1',
        jobName: 'upload.completed',
        payload: { uploadId: 'up-1' },
      });

      await adapter.close();

      expect(mockQueueInstance.close).toHaveBeenCalledTimes(1);
      expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
    });

    it('delegates onModuleDestroy to close', async () => {
      const closeSpy = jest.spyOn(adapter, 'close');
      await adapter.onModuleDestroy();
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
