import type { AcresConfigService } from '../../config/acres-config.service';
import {
  ResendMailAdapter,
  RESEND_DELIVERY_ERROR,
} from './resend-mail.adapter';

const config = {
  mailFrom: 'Acres <verified@example.test>',
  resendApiKey: 're_test_key',
} as AcresConfigService;
const message = {
  to: 'operator@example.test',
  subject: 'Invitation',
  text: 'Private token',
  html: '<p>Private token</p>',
};

describe('ResendMailAdapter', () => {
  function setup() {
    const request = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ id: 'mail-1' })),
      );
    return { request, adapter: new ResendMailAdapter(config, request) };
  }
  it('passes existing templates to the fixed HTTPS API with a bounded signal', async () => {
    const { adapter, request } = setup();
    await adapter.send(message);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(request.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: 'Bearer re_test_key',
        'content-type': 'application/json',
      },
    });
    expect(request.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    const init = request.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      ...message,
      from: config.mailFrom,
    });
  });
  it('preserves explicit sender and plain text without inventing HTML', async () => {
    const { adapter, request } = setup();
    const plain = {
      to: message.to,
      subject: message.subject,
      text: message.text,
      from: 'Contact <contact@example.test>',
    };
    await adapter.send(plain);
    expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toEqual(plain);
  });
  it.each([null, {}, { id: '' }, { id: ' ' }, { id: 123 }])(
    'rejects missing or invalid receipt %j',
    async (receipt) => {
      const { adapter, request } = setup();
      request.mockImplementation(() => Promise.resolve(Response.json(receipt)));
      await expect(adapter.send(message)).rejects.toThrow(
        RESEND_DELIVERY_ERROR,
      );
    },
  );
  it('sanitizes rejected provider responses', async () => {
    const { adapter, request } = setup();
    request.mockImplementation(() =>
      Promise.resolve(new Response('private response', { status: 429 })),
    );
    await expect(adapter.send(message)).rejects.toThrow(
      /^Email delivery failed\.$/,
    );
  });
  it('sanitizes thrown network errors', async () => {
    const { adapter, request } = setup();
    request.mockRejectedValue(new Error('https://internal/token-secret'));
    await expect(adapter.send(message)).rejects.toThrow(
      /^Email delivery failed\.$/,
    );
  });
  it('rejects missing credentials before a request', () => {
    expect(() => new ResendMailAdapter({} as AcresConfigService)).toThrow(
      'requires a configured API key',
    );
  });
});
