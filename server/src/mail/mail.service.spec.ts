import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { MemoryMailAdapter } from './adapters/memory-mail.adapter';
import { MAIL_TRANSPORT } from './mail.interface';
import { AcresConfigService } from '../config/acres-config.service';

describe('MailService', () => {
  let mailService: MailService;
  let memoryTransport: MemoryMailAdapter;
  let mockConfig: Partial<AcresConfigService>;

  beforeEach(async () => {
    memoryTransport = new MemoryMailAdapter();
    mockConfig = {
      mailFrom: 'Acres <no-reply@acres.local>',
      accountTokenTtlMinutes: 30,
      clientOrigin: 'http://localhost:3000',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MAIL_TRANSPORT, useValue: memoryTransport },
        { provide: AcresConfigService, useValue: mockConfig },
      ],
    }).compile();

    mailService = module.get<MailService>(MailService);
  });

  afterEach(() => {
    memoryTransport.clear();
  });

  it('sends message using configured default from address', async () => {
    await mailService.send({
      to: 'user@example.com',
      subject: 'Test subject',
      text: 'Test content',
    });

    expect(memoryTransport.sent).toHaveLength(1);
    expect(memoryTransport.sent[0]).toEqual({
      from: 'Acres <no-reply@acres.local>',
      to: 'user@example.com',
      subject: 'Test subject',
      text: 'Test content',
      html: undefined,
    });
  });

  it('preserves custom from address when provided', async () => {
    await mailService.send({
      from: 'Custom <custom@example.com>',
      to: 'user@example.com',
      subject: 'Custom from',
      text: 'Custom text',
    });

    expect(memoryTransport.sent).toHaveLength(1);
    expect(memoryTransport.sent[0].from).toBe('Custom <custom@example.com>');
  });

  it('composes and sends password recovery email with token and instructions', async () => {
    const resetUrl =
      'http://localhost:3000/reset-password?token=secret-token-123';
    await mailService.sendPasswordRecoveryEmail('user@example.com', resetUrl);

    expect(memoryTransport.sent).toHaveLength(1);
    const sent = memoryTransport.sent[0];
    expect(sent.to).toBe('user@example.com');
    expect(sent.subject).toBe('Reset your Acres password');
    expect(sent.text).toContain(resetUrl);
    expect(sent.text).toContain('30 minutes');
    expect(sent.html).toContain(resetUrl);
    expect(sent.html).toContain('Reset Password');
    expect(sent.html).toContain('30 minutes');
  });

  it('memory adapter clears sent messages on clear()', async () => {
    await mailService.send({
      to: 'user@example.com',
      subject: 'Msg',
      text: 'Text',
    });
    expect(memoryTransport.sent).toHaveLength(1);

    memoryTransport.clear();
    expect(memoryTransport.sent).toHaveLength(0);
  });
});
