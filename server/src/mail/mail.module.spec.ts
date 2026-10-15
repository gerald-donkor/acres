import { Test } from '@nestjs/testing';
import { AcresConfigService } from '../config/acres-config.service';
import { MailModule } from './mail.module';
import { MAIL_TRANSPORT } from './mail.interface';
import { SmtpMailAdapter } from './adapters/smtp-mail.adapter';
import { MemoryMailAdapter } from './adapters/memory-mail.adapter';
import { ResendMailAdapter } from './adapters/resend-mail.adapter';

describe('MailModule provider selection', () => {
  it.each(['memory', 'smtp', 'resend'] as const)(
    'resolves %s without sending mail',
    async (transport) => {
      const smtp = { send: jest.fn() };
      const memory = { send: jest.fn() };
      const module = await Test.createTestingModule({ imports: [MailModule] })
        .overrideProvider(SmtpMailAdapter)
        .useValue(smtp)
        .overrideProvider(MemoryMailAdapter)
        .useValue(memory)
        .useMocker((token) =>
          token === AcresConfigService
            ? {
                mailTransport: transport,
                resendApiKey: 're_test_key',
                mailFrom: 'Acres <verified@example.test>',
              }
            : undefined,
        )
        .compile();
      try {
        const selected: unknown = module.get(MAIL_TRANSPORT);
        if (transport === 'resend')
          expect(selected).toBeInstanceOf(ResendMailAdapter);
        else expect(selected).toBe(transport === 'memory' ? memory : smtp);
        expect(smtp.send).not.toHaveBeenCalled();
        expect(memory.send).not.toHaveBeenCalled();
      } finally {
        await module.close();
      }
    },
  );
});
