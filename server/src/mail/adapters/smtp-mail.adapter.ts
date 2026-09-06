import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { AcresConfigService } from '../../config/acres-config.service';
import type { MailMessage, MailTransport } from '../mail.interface';

@Injectable()
export class SmtpMailAdapter implements MailTransport {
  private readonly logger = new Logger(SmtpMailAdapter.name);
  private readonly transporter: Transporter;

  constructor(private readonly config: AcresConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpSecure,
      auth:
        this.config.smtpUser && this.config.smtpPass
          ? {
              user: this.config.smtpUser,
              pass: this.config.smtpPass,
            }
          : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    const from = message.from ?? this.config.mailFrom;
    try {
      await this.transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      this.logger.log(
        `Email dispatched to ${message.to} (subject: "${message.subject}")`,
      );
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send email to ${message.to}: ${err}`);
      throw error;
    }
  }
}
