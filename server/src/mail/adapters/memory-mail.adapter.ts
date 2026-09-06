import { Injectable, Logger } from '@nestjs/common';
import type { MailMessage, MailTransport } from '../mail.interface';

@Injectable()
export class MemoryMailAdapter implements MailTransport {
  private readonly logger = new Logger(MemoryMailAdapter.name);
  private messages: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.messages.push({ ...message });
    this.logger.log(
      `In-memory email recorded for ${message.to} (subject: "${message.subject}")`,
    );
    return Promise.resolve();
  }

  get sent(): readonly MailMessage[] {
    return this.messages;
  }

  clear(): void {
    this.messages = [];
  }
}
