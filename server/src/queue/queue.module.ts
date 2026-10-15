import { Module } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { BullmqQueueAdapter } from './bullmq-queue.adapter';
import { VercelQueueAdapter } from './vercel-queue.adapter';
import { WORK_QUEUE, type QueuePort } from './work-queue.port';

@Module({
  providers: [
    {
      provide: WORK_QUEUE,
      inject: [AcresConfigService],
      // Both adapters connect lazily, so the unselected one never opens a socket.
      useFactory: (config: AcresConfigService): QueuePort =>
        config.queueProvider === 'vercel'
          ? new VercelQueueAdapter(config)
          : new BullmqQueueAdapter(config),
    },
  ],
  exports: [WORK_QUEUE],
})
export class QueueModule {}
