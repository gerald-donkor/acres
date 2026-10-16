import { Module } from '@nestjs/common';
import { ThrottleStorageModule } from '../security/throttle-storage.module';
import { QueueModule } from '../queue/queue.module';
import {
  AFTER_RESPONSE_SCHEDULER,
  defaultAfterResponseScheduler,
} from './after-response.scheduler';
import { DispatchKickService } from './dispatch-kick.service';
import { JobReconciliationService } from './job-reconciliation.service';
import { ManagedDispatchRunnerService } from './managed-dispatch-runner.service';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';

@Module({
  imports: [QueueModule, ThrottleStorageModule],
  providers: [
    OutboxService,
    OutboxDispatcherService,
    JobReconciliationService,
    ManagedDispatchRunnerService,
    DispatchKickService,
    {
      provide: AFTER_RESPONSE_SCHEDULER,
      useValue: defaultAfterResponseScheduler,
    },
  ],
  exports: [
    OutboxService,
    OutboxDispatcherService,
    JobReconciliationService,
    ManagedDispatchRunnerService,
    DispatchKickService,
    AFTER_RESPONSE_SCHEDULER,
  ],
})
export class OutboxModule {}
