import { Test } from '@nestjs/testing';
import { AcresConfigService } from '../config/acres-config.service';
import { BullmqQueueAdapter } from './bullmq-queue.adapter';
import { QueueModule } from './queue.module';
import { VercelQueueAdapter } from './vercel-queue.adapter';
import { WORK_QUEUE } from './work-queue.port';

async function resolveQueue(queueProvider: 'bullmq' | 'vercel') {
  const moduleRef = await Test.createTestingModule({
    imports: [
      {
        module: class ConfigStubModule {},
        global: true,
        providers: [
          { provide: AcresConfigService, useValue: { queueProvider } },
        ],
        exports: [AcresConfigService],
      },
      QueueModule,
    ],
  }).compile();
  const queue = moduleRef.get<unknown>(WORK_QUEUE);
  await moduleRef.close();
  return queue;
}

describe('QueueModule provider selection', () => {
  it('keeps the self-hosted BullMQ adapter by default', async () => {
    await expect(resolveQueue('bullmq')).resolves.toBeInstanceOf(
      BullmqQueueAdapter,
    );
  });

  it('selects the Vercel Queues adapter for the managed profile', async () => {
    await expect(resolveQueue('vercel')).resolves.toBeInstanceOf(
      VercelQueueAdapter,
    );
  });
});
