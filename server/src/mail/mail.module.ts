import { Module } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import { MAIL_TRANSPORT } from './mail.interface';
import { MailService } from './mail.service';
import { SmtpMailAdapter } from './adapters/smtp-mail.adapter';
import { MemoryMailAdapter } from './adapters/memory-mail.adapter';

@Module({
  providers: [
    SmtpMailAdapter,
    MemoryMailAdapter,
    {
      provide: MAIL_TRANSPORT,
      useFactory: (
        config: AcresConfigService,
        smtp: SmtpMailAdapter,
        memory: MemoryMailAdapter,
      ) => {
        return config.mailTransport === 'memory' ? memory : smtp;
      },
      inject: [AcresConfigService, SmtpMailAdapter, MemoryMailAdapter],
    },
    MailService,
  ],
  exports: [MailService, MAIL_TRANSPORT, MemoryMailAdapter],
})
export class MailModule {}
