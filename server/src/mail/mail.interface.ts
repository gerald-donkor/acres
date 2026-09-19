export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  from?: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export const MAIL_TRANSPORTS = ['smtp', 'memory'] as const;

export type MailTransportKind = (typeof MAIL_TRANSPORTS)[number];
