import { Module } from '@nestjs/common';
import { BullmqQueueAdapter } from './bullmq-queue.adapter';
import { WORK_QUEUE } from './work-queue.port';

@Module({
  providers: [{ provide: WORK_QUEUE, useClass: BullmqQueueAdapter }],
  exports: [WORK_QUEUE],
})
export class QueueModule {}
