import { JobReconciliationService } from './job-reconciliation.service';
import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';

@Module({
  imports: [QueueModule],
  providers: [OutboxService, OutboxDispatcherService, JobReconciliationService],
  exports: [OutboxService, OutboxDispatcherService, JobReconciliationService],
})
export class OutboxModule {}
