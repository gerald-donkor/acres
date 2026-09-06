import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { hashToken } from '../src/common/tokens';
import { MemoryMailAdapter } from '../src/mail/adapters/memory-mail.adapter';
import {
  createPrismaDouble,
  createTestApp,
  PrismaDouble,
} from './helpers/test-app';

describe('Auth Password Recovery (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaDouble;
  let memoryMail: MemoryMailAdapter;
  let server: App;

  const existingAccountId = '018f0000-0000-7000-8000-000000000001';
  const existingEmail = 'ada@acres.local';
  const initialPasswordHash = '$2a$12$initialpasswordhashhere';

  beforeAll(async () => {
    prisma = createPrismaDouble();

    const testApp = await createTestApp(prisma, {
      MAIL_TRANSPORT: 'memory',
    });
    app = testApp.app;
    server = app.getHttpServer() as App;
    memoryMail = app.get(MemoryMailAdapter);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    memoryMail.clear();
  });

  async function csrfAgent() {
    const agent = request.agent(server);
    const response = await agent.get('/api/v1/auth/csrf').expect(200);
    const body = response.body as {
      data: { csrfToken: string; headerName: string };
    };
    return { agent, token: body.data.csrfToken };
  }

  describe('POST /api/v1/auth/forgot-password', () => {
    it('rejects request without CSRF token with 403', async () => {
      const res = await request(server)
        .post('/api/v1/auth/forgot-password')
        .send({ email: existingEmail })
        .expect(HttpStatus.FORBIDDEN);

      const body = res.body as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('CSRF_INVALID');
    });

    it('rejects invalid email formats with 400 VALIDATION_FAILED', async () => {
      const { agent, token } = await csrfAgent();
      const res = await agent
        .post('/api/v1/auth/forgot-password')
        .set('x-csrf-token', token)
        .send({ email: 'not-an-email' })
        .expect(HttpStatus.BAD_REQUEST);

      const body = res.body as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('returns 200 accepted and sends NO email when email is unregistered (anti-enumeration)', async () => {
      prisma.account.findUnique.mockResolvedValue(null);

      const { agent, token } = await csrfAgent();
      const res = await agent
        .post('/api/v1/auth/forgot-password')
        .set('x-csrf-token', token)
        .send({ email: 'nonexistent@example.com' })
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        ok: true,
        data: { accepted: true },
      });
      expect(memoryMail.sent).toHaveLength(0);
      expect(prisma.accountToken.create).not.toHaveBeenCalled();
    });

    it('returns 200 accepted and dispatches recovery email when email is registered', async () => {
      prisma.account.findUnique.mockResolvedValue({
        id: existingAccountId,
        email: existingEmail,
        passwordHash: initialPasswordHash,
        displayName: 'Ada Lovelace',
        createdAt: new Date(),
      });

      const { agent, token } = await csrfAgent();
      const res = await agent
        .post('/api/v1/auth/forgot-password')
        .set('x-csrf-token', token)
        .send({ email: existingEmail })
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        ok: true,
        data: { accepted: true },
      });

      expect(prisma.accountToken.updateMany).toHaveBeenCalledWith({
        where: {
          accountId: existingAccountId,
          purpose: 'password_recovery',
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: expect.any(Date) as unknown },
      });

      expect(prisma.accountToken.create).toHaveBeenCalledWith({
        data: {
          accountId: existingAccountId,
          purpose: 'password_recovery',
          tokenHash: expect.any(String) as string,
          expiresAt: expect.any(Date) as unknown,
        },
      });

      expect(memoryMail.sent).toHaveLength(1);
      const email = memoryMail.sent[0];
      expect(email.to).toBe(existingEmail);
      expect(email.subject).toBe('Reset your Acres password');
      expect(email.text).toMatch(/\/reset-password\?token=[A-Za-z0-9_-]+/);
      expect(email.html).toMatch(/\/reset-password\?token=[A-Za-z0-9_-]+/);
    });

    it('returns HTTP 200 accepted even if mail transport fails (error oracle protection)', async () => {
      prisma.account.findUnique.mockResolvedValue({
        id: existingAccountId,
        email: existingEmail,
        passwordHash: initialPasswordHash,
        displayName: 'Ada Lovelace',
        createdAt: new Date(),
      });

      jest
        .spyOn(memoryMail, 'send')
        .mockRejectedValueOnce(new Error('SMTP connection timed out'));

      const { agent, token } = await csrfAgent();
      const res = await agent
        .post('/api/v1/auth/forgot-password')
        .set('x-csrf-token', token)
        .send({ email: existingEmail })
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        ok: true,
        data: { accepted: true },
      });
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    const rawToken = 'test-raw-recovery-token-xyz-123456';
    const newPassword = 'new-valid-secure-password-456';

    it('rejects request without CSRF token with 403', async () => {
      const res = await request(server)
        .post('/api/v1/auth/reset-password')
        .send({ token: rawToken, password: newPassword })
        .expect(HttpStatus.FORBIDDEN);

      const body = res.body as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('CSRF_INVALID');
    });

    it('rejects invalid password length (<12 characters) with 400 VALIDATION_FAILED', async () => {
      const { agent, token: csrf } = await csrfAgent();
      const res = await agent
        .post('/api/v1/auth/reset-password')
        .set('x-csrf-token', csrf)
        .send({ token: rawToken, password: 'short' })
        .expect(HttpStatus.BAD_REQUEST);

      const body = res.body as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('fails with 400 INVALID_TOKEN when token does not exist or is expired', async () => {
      // Prisma updateMany count = 0 indicates no unconsumed unexpired token claimed
      prisma.accountToken.updateMany.mockResolvedValue({ count: 0 });

      const { agent, token: csrf } = await csrfAgent();
      const res = await agent
        .post('/api/v1/auth/reset-password')
        .set('x-csrf-token', csrf)
        .send({ token: rawToken, password: newPassword })
        .expect(HttpStatus.BAD_REQUEST);

      const body = res.body as {
        ok: boolean;
        error: { code: string; message: string };
      };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('INVALID_TOKEN');
      expect(body.error.message).toContain('invalid or has expired');
    });

    it('resets password, updates hash, and revokes all sessions on valid token', async () => {
      // 1. Claim token succeeds
      prisma.accountToken.updateMany.mockResolvedValue({ count: 1 });
      // 2. Token lookup returns account
      prisma.accountToken.findUnique.mockResolvedValue({
        id: 'token-row-1',
        accountId: existingAccountId,
        purpose: 'password_recovery',
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 1800000),
        consumedAt: new Date(),
        revokedAt: null,
      });
      // 3. Account update password
      prisma.account.update.mockResolvedValue({
        id: existingAccountId,
        email: existingEmail,
        passwordHash: 'new-hashed-password',
        displayName: 'Ada Lovelace',
        createdAt: new Date(),
      });
      // 4. Revoke sessions for account
      prisma.session.updateMany.mockResolvedValue({ count: 2 });

      const { agent, token: csrf } = await csrfAgent();
      const res = await agent
        .post('/api/v1/auth/reset-password')
        .set('x-csrf-token', csrf)
        .send({ token: rawToken, password: newPassword })
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({
        ok: true,
        data: { reset: true },
      });

      // Verify account password was updated
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: existingAccountId },
        data: { passwordHash: expect.any(String) as string },
      });

      // Verify sessions were revoked (TM-03)
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { accountId: existingAccountId, revokedAt: null },
        data: { revokedAt: expect.any(Date) as unknown },
      });
    });

    it('enforces single-use consumption: replaying the same token fails with 400 INVALID_TOKEN', async () => {
      // First attempt claims the token
      prisma.accountToken.updateMany.mockResolvedValueOnce({ count: 1 });
      prisma.accountToken.findUnique.mockResolvedValueOnce({
        id: 'token-row-1',
        accountId: existingAccountId,
        purpose: 'password_recovery',
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + 1800000),
        consumedAt: new Date(),
        revokedAt: null,
      });
      prisma.account.update.mockResolvedValueOnce({
        id: existingAccountId,
        email: existingEmail,
        passwordHash: 'new-hashed-password',
        displayName: 'Ada Lovelace',
        createdAt: new Date(),
      });
      prisma.session.updateMany.mockResolvedValueOnce({ count: 1 });

      const { agent, token: csrf } = await csrfAgent();
      const firstRes = await agent
        .post('/api/v1/auth/reset-password')
        .set('x-csrf-token', csrf)
        .send({ token: rawToken, password: newPassword })
        .expect(HttpStatus.OK);
      const firstBody = firstRes.body as { ok: boolean };
      expect(firstBody.ok).toBe(true);

      // Second attempt finds count = 0 (token already marked consumedAt)
      prisma.accountToken.updateMany.mockResolvedValueOnce({ count: 0 });
      const secondRes = await agent
        .post('/api/v1/auth/reset-password')
        .set('x-csrf-token', csrf)
        .send({ token: rawToken, password: 'another-new-password-789' })
        .expect(HttpStatus.BAD_REQUEST);

      const secondBody = secondRes.body as {
        ok: boolean;
        error: { code: string };
      };
      expect(secondBody.ok).toBe(false);
      expect(secondBody.error.code).toBe('INVALID_TOKEN');
    });
  });
});
