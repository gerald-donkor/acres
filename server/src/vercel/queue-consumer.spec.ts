import {
  AggregateNotVisibleError,
  JobAttemptsExhaustedError,
  JobLeaseBusyError,
} from '../worker/leased-job-executor.service';
import {
  MISSING_AGGREGATE_DELIVERIES,
  createQueueConsumer,
  type ConsumerRuntime,
} from './queue-consumer';

const ID = '01920000-0000-7000-8000-000000000001';
const logger = { warn: jest.fn(), log: jest.fn() };
const delivery = (deliveryCount: number) => ({ messageId: 'm', deliveryCount });

function runtime(execute = jest.fn().mockResolvedValue('processed')) {
  const value: ConsumerRuntime = { execute, backoffMs: 10_000 };
  return { execute, resolve: jest.fn().mockResolvedValue(value) };
}

describe('createQueueConsumer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('executes a valid message', async () => {
    const rt = runtime();
    const consumer = createQueueConsumer(rt.resolve, logger);
    await consumer.handle(
      { v: 1, jobName: 'ingestion.run', id: ID },
      delivery(2),
    );
    expect(rt.execute).toHaveBeenCalledWith({
      v: 1,
      jobName: 'ingestion.run',
      id: ID,
    });
  });

  it('acknowledges malformed messages without booting or executing', async () => {
    const rt = runtime();
    const consumer = createQueueConsumer(rt.resolve, logger);
    await expect(
      consumer.handle({ uploadId: ID }, delivery(1)),
    ).resolves.toBeUndefined();
    expect(rt.resolve).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Dropped malformed queue message m',
    );
  });

  it('acknowledges only a failure the ledger has dead-lettered', () => {
    const consumer = createQueueConsumer(runtime().resolve, logger);
    expect(
      consumer.retry(new JobAttemptsExhaustedError('dj'), delivery(1)),
    ).toEqual({ acknowledge: true });
  });

  it('keeps retrying unrecorded failures with capped exponential backoff, never acknowledging', async () => {
    const rt = runtime(jest.fn().mockRejectedValue(new Error('db down')));
    const consumer = createQueueConsumer(rt.resolve, logger);
    await expect(
      consumer.handle(
        { v: 1, jobName: 'upload.completed', id: ID },
        delivery(1),
      ),
    ).rejects.toThrow('db down');
    const err = new Error('db down');
    expect(consumer.retry(err, delivery(1))).toEqual({ afterSeconds: 10 });
    expect(consumer.retry(err, delivery(2))).toEqual({ afterSeconds: 20 });
    expect(consumer.retry(err, delivery(50))).toEqual({ afterSeconds: 900 });
  });

  it('uses the boot fallback backoff when the runtime never resolved', () => {
    const consumer = createQueueConsumer(
      jest.fn().mockRejectedValue(new Error('boot')),
      logger,
    );
    expect(consumer.retry(new Error('boot'), delivery(1))).toEqual({
      afterSeconds: 30,
    });
    expect(consumer.retry(new Error('boot'), delivery(99))).toEqual({
      afterSeconds: 900,
    });
  });

  it('waits out a live lease and never acknowledges on its account', () => {
    const consumer = createQueueConsumer(runtime().resolve, logger);
    expect(consumer.retry(new JobLeaseBusyError(42_100), delivery(99))).toEqual(
      { afterSeconds: 44 },
    );
    expect(consumer.retry(new JobLeaseBusyError(0), delivery(1))).toEqual({
      afterSeconds: 5,
    });
    expect(
      consumer.retry(new JobLeaseBusyError(10_000_000), delivery(1)),
    ).toEqual({ afterSeconds: 900 });
  });

  it('gives an uncommitted aggregate a bounded window to become visible', () => {
    const consumer = createQueueConsumer(runtime().resolve, logger);
    const err = new AggregateNotVisibleError();
    expect(consumer.retry(err, delivery(1))).toEqual({ afterSeconds: 5 });
    expect(consumer.retry(err, delivery(4))).toEqual({ afterSeconds: 40 });
    expect(consumer.retry(err, delivery(MISSING_AGGREGATE_DELIVERIES))).toEqual(
      { acknowledge: true },
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Queue message m names an aggregate that never became visible',
    );
  });
});
