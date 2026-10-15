import { Inject, Injectable, Logger } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import {
  AFTER_RESPONSE_SCHEDULER,
  type AfterResponseScheduler,
} from './after-response.scheduler';
import { OutboxDispatcherService } from './outbox-dispatcher.service';

@Injectable()
export class DispatchKickService {
  private readonly logger = new Logger(DispatchKickService.name);
  private inFlightPromise: Promise<void> | null = null;
  private rerunRequested = false;

  constructor(
    private readonly config: AcresConfigService,
    private readonly dispatcher: OutboxDispatcherService,
    @Inject(AFTER_RESPONSE_SCHEDULER)
    private readonly scheduler: AfterResponseScheduler,
  ) {}

  afterCommit(): void {
    if (this.config.queueProvider !== 'vercel') {
      return;
    }

    if (this.inFlightPromise !== null) {
      this.rerunRequested = true;
      this.scheduler.waitUntil(this.inFlightPromise);
      return;
    }

    const chain = this.run();
    this.inFlightPromise = chain;
    this.scheduler.waitUntil(chain);
  }

  kick(): void {
    this.afterCommit();
  }

  private async run(): Promise<void> {
    try {
      try {
        await this.dispatcher.dispatchOnce();
      } catch {
        this.logger.error(
          'Outbox dispatch kick failed; durable intent remains recoverable.',
        );
      }

      if (this.rerunRequested) {
        this.rerunRequested = false;
        try {
          await this.dispatcher.dispatchOnce();
        } catch {
          this.logger.error(
            'Outbox dispatch kick failed; durable intent remains recoverable.',
          );
        }
      }
    } finally {
      this.inFlightPromise = null;
      this.rerunRequested = false;
    }
  }
}
