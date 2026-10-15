import type { SendOptions } from '@vercel/queue';
import type { AcresConfigService } from '../config/acres-config.service';
import { VercelQueueAdapter, type QueueSender } from './vercel-queue.adapter';
import { InvalidQueueMessageError } from './queue-message';

const ID = '01920000-0000-7000-8000-000000000001';

function config(overrides: Partial<AcresConfigService> = {}) {
  return {
    vercelQueueTopic: 'acres-jobs',
    vercelQueueRegion: 'iad1',
    vercelQueueRetentionSeconds: 3600,
    vercelDeploymentId: undefined,
    ...overrides,
  } as unknown as AcresConfigService;
}

describe('VercelQueueAdapter', () => {
  let send: jest.Mock<
    Promise<{ messageId: string }>,
    [string, unknown, SendOptions?]
  >;
  let sender: QueueSender;

  beforeEach(() => {
    send = jest
      .fn<Promise<{ messageId: string }>, [string, unknown, SendOptions?]>()
      .mockResolvedValue({ messageId: 'm-1' });
    sender = { send } as QueueSender;
  });

  it('publishes the opaque message with the deterministic idempotency key', async () => {
    await new VercelQueueAdapter(config(), sender).enqueue({
      deterministicKey: `upload.completed:${ID}`,
      jobName: 'upload.completed',
      payload: { uploadId: ID },
    });
    expect(send).toHaveBeenCalledWith(
      'acres-jobs',
      { v: 1, jobName: 'upload.completed', id: ID },
      { idempotencyKey: `upload.completed:${ID}`, retentionSeconds: 3600 },
    );
  });

  it('keeps the canonical key when retention recovery republishes', async () => {
    const adapter = new VercelQueueAdapter(
      config({ vercelQueueRetentionSeconds: 604800 }),
      sender,
    );
    const input = {
      deterministicKey: `ingestion.run:${ID}`,
      jobName: 'ingestion.run' as const,
      payload: { ingestionRunId: ID },
    };
    await adapter.enqueue(input);
    await adapter.enqueue(input);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(send.mock.calls[1][2]).toEqual({
      idempotencyKey: input.deterministicKey,
      retentionSeconds: 604800,
    });
    expect(input.deterministicKey.length).toBeLessThanOrEqual(256);
  });

  it('converts delays to whole seconds, leaving a minute before expiry', async () => {
    const adapter = new VercelQueueAdapter(config(), sender);
    await adapter.enqueue({
      deterministicKey: 'k1',
      jobName: 'ingestion.run',
      payload: { ingestionRunId: ID },
      delayMs: 1500,
    });
    await adapter.enqueue({
      deterministicKey: 'k2',
      jobName: 'ingestion.run',
      payload: { ingestionRunId: ID },
      delayMs: 10_000_000,
    });
    expect(send.mock.calls[0][2]).toMatchObject({ delaySeconds: 2 });
    expect(send.mock.calls[1][2]).toMatchObject({ delaySeconds: 3540 });
  });

  it('refuses to publish a payload outside the job contract', async () => {
    await expect(
      new VercelQueueAdapter(config(), sender).enqueue({
        deterministicKey: 'k',
        jobName: 'export.requested',
        payload: { uploadId: ID },
      }),
    ).rejects.toBeInstanceOf(InvalidQueueMessageError);
    expect(send).not.toHaveBeenCalled();
  });

  it('propagates provider failures so the outbox can retry', async () => {
    send.mockRejectedValueOnce(new Error('unauthorized'));
    await expect(
      new VercelQueueAdapter(config(), sender).enqueue({
        deterministicKey: 'k',
        jobName: 'upload.completed',
        payload: { uploadId: ID },
      }),
    ).rejects.toThrow('unauthorized');
  });

  it('is ready only inside a deployment that has an OIDC identity', async () => {
    await expect(
      new VercelQueueAdapter(config(), sender).readiness(),
    ).resolves.toBe(false);
    await expect(
      new VercelQueueAdapter(
        config({ vercelDeploymentId: 'dpl_x' }),
        sender,
      ).readiness(),
    ).resolves.toBe(true);
  });
});
