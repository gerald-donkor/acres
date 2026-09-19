import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import nodemailer, { type Transporter } from 'nodemailer';
import { AcresConfigService } from '../../config/acres-config.service';
import { MAIL_TRANSPORTS } from '../mail.interface';
import { SMTP_TRANSPORTER, SmtpMailAdapter } from './smtp-mail.adapter';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('SmtpMailAdapter', () => {
  let mockSendMail: jest.Mock;
  let mockTransporter: Transporter;

  const createConfig = (
    overrides: Partial<AcresConfigService> = {},
  ): AcresConfigService =>
    ({
      smtpHost: 'smtp.example.com',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'smtp-user',
      smtpPass: 'smtp-pass',
      mailFrom: 'Acres <no-reply@acres.local>',
      ...overrides,
    }) as unknown as AcresConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-test-1' });
    mockTransporter = {
      sendMail: mockSendMail,
    } as unknown as Transporter;

    (nodemailer.createTransport as unknown as jest.Mock).mockReturnValue(
      mockTransporter,
    );
  });

  describe('MAIL_TRANSPORTS contract', () => {
    it('defines the canonical closed tuple of mail transports', () => {
      expect(MAIL_TRANSPORTS).toEqual(['smtp', 'memory']);
      expect(Array.isArray(MAIL_TRANSPORTS)).toBe(true);
      expect(MAIL_TRANSPORTS).toHaveLength(2);
    });
  });

  describe('constructor initialization', () => {
    it('creates nodemailer transport with auth credentials when user and pass are set', () => {
      const config = createConfig({
        smtpHost: 'mail.custom.com',
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: 'alice',
        smtpPass: 'secret',
      });

      new SmtpMailAdapter(config);

      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'mail.custom.com',
        port: 465,
        secure: true,
        auth: {
          user: 'alice',
          pass: 'secret',
        },
      });
    });

    it('creates nodemailer transport with auth undefined when smtpUser is not set', () => {
      const config = createConfig({
        smtpUser: undefined,
        smtpPass: 'secret',
      });

      new SmtpMailAdapter(config);

      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: undefined,
        }),
      );
    });

    it('creates nodemailer transport with auth undefined when smtpPass is not set', () => {
      const config = createConfig({
        smtpUser: 'alice',
        smtpPass: undefined,
      });

      new SmtpMailAdapter(config);

      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: undefined,
        }),
      );
    });

    it('bypasses nodemailer.createTransport when custom transporter is injected', () => {
      const config = createConfig();
      const customTransporter = {
        sendMail: jest.fn().mockResolvedValue({ messageId: 'custom-1' }),
      } as unknown as Transporter;

      const adapter = new SmtpMailAdapter(config, customTransporter);

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
      expect(adapter).toBeDefined();
    });
  });

  describe('send', () => {
    it('dispatches email with default from address when from is omitted', async () => {
      const config = createConfig({
        mailFrom: 'Default Acres <noreply@acres.internal>',
      });
      const adapter = new SmtpMailAdapter(config);

      await adapter.send({
        to: 'user@example.com',
        subject: 'Welcome to Acres',
        text: 'Welcome body',
        html: '<p>Welcome body</p>',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'Default Acres <noreply@acres.internal>',
        to: 'user@example.com',
        subject: 'Welcome to Acres',
        text: 'Welcome body',
        html: '<p>Welcome body</p>',
      });
    });

    it('preserves custom from address when explicitly provided in message', async () => {
      const config = createConfig({
        mailFrom: 'Default Acres <noreply@acres.internal>',
      });
      const adapter = new SmtpMailAdapter(config);

      await adapter.send({
        from: 'Security Team <security@acres.internal>',
        to: 'admin@example.com',
        subject: 'Security Alert',
        text: 'Immediate action required',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'Security Team <security@acres.internal>',
        to: 'admin@example.com',
        subject: 'Security Alert',
        text: 'Immediate action required',
        html: undefined,
      });
    });

    it('uses injected transporter when provided in constructor', async () => {
      const config = createConfig();
      const customSendMail = jest
        .fn()
        .mockResolvedValue({ messageId: 'custom-id' });
      const customTransporter = {
        sendMail: customSendMail,
      } as unknown as Transporter;

      const adapter = new SmtpMailAdapter(config, customTransporter);

      await adapter.send({
        to: 'partner@example.com',
        subject: 'Invitation',
        text: 'Join us',
      });

      expect(customSendMail).toHaveBeenCalledTimes(1);
      expect(customSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'partner@example.com',
          subject: 'Invitation',
          text: 'Join us',
        }),
      );
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('logs error and rethrows when transporter.sendMail rejects with Error instance', async () => {
      const error = new Error('SMTP connection refused');
      mockSendMail.mockRejectedValue(error);
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const config = createConfig();
      const adapter = new SmtpMailAdapter(config);

      await expect(
        adapter.send({
          to: 'fail@example.com',
          subject: 'Will fail',
          text: 'Fail body',
        }),
      ).rejects.toThrow('SMTP connection refused');

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to send email to fail@example.com: SMTP connection refused',
      );
      loggerErrorSpy.mockRestore();
    });

    it('logs error and rethrows when transporter.sendMail rejects with non-Error value', async () => {
      mockSendMail.mockRejectedValue('network timeout string');
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const config = createConfig();
      const adapter = new SmtpMailAdapter(config);

      await expect(
        adapter.send({
          to: 'fail-string@example.com',
          subject: 'Will fail with string',
          text: 'Fail body',
        }),
      ).rejects.toBe('network timeout string');

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        'Failed to send email to fail-string@example.com: network timeout string',
      );
      loggerErrorSpy.mockRestore();
    });
  });

  describe('Nest DI resolution with SMTP_TRANSPORTER', () => {
    it('resolves SmtpMailAdapter with default nodemailer transport when SMTP_TRANSPORTER is omitted', async () => {
      const config = createConfig();
      const module = await Test.createTestingModule({
        providers: [
          SmtpMailAdapter,
          { provide: AcresConfigService, useValue: config },
        ],
      }).compile();

      const adapter = module.get<SmtpMailAdapter>(SmtpMailAdapter);
      expect(adapter).toBeDefined();
      expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    });

    it('injects custom transporter when SMTP_TRANSPORTER token is provided', async () => {
      const config = createConfig();
      const customSendMail = jest
        .fn()
        .mockResolvedValue({ messageId: 'di-custom' });
      const customTransporter = {
        sendMail: customSendMail,
      } as unknown as Transporter;

      const module = await Test.createTestingModule({
        providers: [
          SmtpMailAdapter,
          { provide: AcresConfigService, useValue: config },
          { provide: SMTP_TRANSPORTER, useValue: customTransporter },
        ],
      }).compile();

      const adapter = module.get<SmtpMailAdapter>(SmtpMailAdapter);
      expect(adapter).toBeDefined();
      expect(nodemailer.createTransport).not.toHaveBeenCalled();

      await adapter.send({
        to: 'di@example.com',
        subject: 'DI test',
        text: 'DI body',
      });

      expect(customSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'di@example.com' }),
      );
    });
  });
});
