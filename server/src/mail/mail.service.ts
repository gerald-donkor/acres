import { Inject, Injectable } from '@nestjs/common';
import { AcresConfigService } from '../config/acres-config.service';
import {
  MAIL_TRANSPORT,
  type MailMessage,
  type MailTransport,
} from './mail.interface';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
    private readonly config: AcresConfigService,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const from = message.from ?? this.config.mailFrom;
    await this.transport.send({ ...message, from });
  }

  async sendPasswordRecoveryEmail(to: string, resetUrl: string): Promise<void> {
    const subject = 'Reset your Acres password';
    const text = [
      'You requested a password reset for your Acres account.',
      '',
      'Use the following link to set a new password:',
      resetUrl,
      '',
      `This link will expire in ${this.config.accountTokenTtlMinutes} minutes.`,
      '',
      'If you did not request a password reset, you can safely ignore this email.',
    ].join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.5; color: #000000; background-color: #FFFFFF; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; border: 1px solid #E9E9E9; border-radius: 14px; padding: 32px; background: #FFFFFF;">
    <h1 style="font-size: 24px; font-weight: 600; color: #485C11; margin: 0 0 16px 0;">Acres</h1>
    <h2 style="font-size: 20px; font-weight: 500; margin: 0 0 16px 0;">Reset your password</h2>
    <p style="color: #6F6F6F; margin: 0 0 24px 0; font-size: 15px;">
      You requested a password reset for your Acres account. Click the button below to choose a new password:
    </p>
    <div style="margin: 0 0 24px 0;">
      <a href="${resetUrl}" style="display: inline-block; background-color: #485C11; color: #FFFFFF; text-decoration: none; padding: 12px 24px; border-radius: 24px; font-size: 15px; font-weight: 500;">
        Reset Password
      </a>
    </div>
    <p style="color: #6F6F6F; font-size: 13px; margin: 0 0 16px 0;">
      If the button does not work, copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: #485C11; word-break: break-all;">${resetUrl}</a>
    </p>
    <p style="color: #929292; font-size: 13px; margin: 0; border-top: 1px solid #E9E9E9; padding-top: 16px;">
      This link will expire in ${this.config.accountTokenTtlMinutes} minutes. If you did not request this email, no action is needed.
    </p>
  </div>
</body>
</html>`;

    await this.send({
      to,
      subject,
      text,
      html,
    });
  }
}
