import { Inject, Injectable, Optional } from '@nestjs/common';
import { AcresConfigService } from '../../config/acres-config.service';
import type { MailMessage, MailTransport } from '../mail.interface';

export const RESEND_FETCH = Symbol('RESEND_FETCH');
export const RESEND_DELIVERY_ERROR = 'Email delivery failed.';

/** Uses the documented HTTP API so SDK development logging cannot leak errors. */
@Injectable()
export class ResendMailAdapter implements MailTransport {
  constructor(
    private readonly config: AcresConfigService,
    @Optional()
    @Inject(RESEND_FETCH)
    private readonly request: typeof fetch = fetch,
  ) {
    if (!config.resendApiKey) {
      throw new Error('Resend transport requires a configured API key.');
    }
  }

  async send(message: MailMessage): Promise<void> {
    try {
      const response = await this.request('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: {
          authorization: `Bearer ${this.config.resendApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: message.from ?? this.config.mailFrom,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html === undefined ? {} : { html: message.html }),
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(RESEND_DELIVERY_ERROR);
      }
      const receipt: unknown = await response.json();
      if (
        !receipt ||
        typeof receipt !== 'object' ||
        !('id' in receipt) ||
        typeof receipt.id !== 'string' ||
        !receipt.id.trim()
      ) {
        throw new Error(RESEND_DELIVERY_ERROR);
      }
    } catch {
      // No recipient, token, body or provider exception is logged or rethrown.
      throw new Error(RESEND_DELIVERY_ERROR);
    }
  }
}
