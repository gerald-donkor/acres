import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createHash } from 'node:crypto';
import {
  createPrismaDouble,
  createTestApp,
  type PrismaDouble,
} from './helpers/test-app';

describe('Acres API', () => {
  let app: INestApplication;
  let server: App;
  let prisma: PrismaDouble;

  beforeEach(async () => {
    prisma = createPrismaDouble();
    ({ app } = await createTestApp(prisma));
    server = app.getHttpServer() as App;
  });

  afterEach(async () => {
    await app?.close();
  });

  /** Fetches a CSRF token on an agent that keeps the paired cookie. */
  async function csrfAgent() {
    const agent = request.agent(server);
    const response = await agent.get('/auth/csrf').expect(200);
    const body = response.body as {
      data: { csrfToken: string; headerName: string };
    };
    return { agent, token: body.data.csrfToken };
  }

  type Agent = ReturnType<typeof request.agent>;

  /**
   * Re-reads the CSRF token on an agent. Necessary after login: the token is
   * bound to the session cookie's value, which login has just changed.
   */
  async function csrfTokenFor(agent: Agent): Promise<string> {
    const response = await agent.get('/auth/csrf').expect(200);
    return (response.body as { data: { csrfToken: string } }).data.csrfToken;
  }

  async function recreateApp(
    envOverrides: Partial<Record<string, string>>,
  ): Promise<void> {
    await app.close();
    prisma = createPrismaDouble();
    ({ app } = await createTestApp(prisma, envOverrides));
    server = app.getHttpServer() as App;
  }

  function sessionCookieValue(response: request.Response): string {
    const cookies = response.headers['set-cookie'] as unknown as string[];
    return /acres_session=([^;]+)/.exec(cookies.join(';'))?.[1] ?? '';
  }

  const ACCOUNT_ROW = {
    id: 'account-1',
    email: 'ada@example.com',
    passwordHash: '',
    displayName: 'Ada Lovelace',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  /**
   * Registers, then hands back an agent carrying the real session cookie the
   * server issued. The session lookup is answered from the same row, so the
   * guard runs its actual code path rather than being stubbed out.
   */
  async function signedInAgent() {
    const { agent, token } = await csrfAgent();
    prisma.account.findUnique.mockResolvedValue(null);
    prisma.account.create.mockResolvedValue(ACCOUNT_ROW);
    prisma.session.create.mockResolvedValue({ id: 'session-1' });

    const response = await agent
      .post('/auth/register')
      .set('x-csrf-token', token)
      .send({
        email: 'ada@example.com',
        password: 'a-long-enough-password',
        displayName: 'Ada Lovelace',
      })
      .expect(201);

    prisma.session.findUnique.mockResolvedValue({
      id: 'session-1',
      accountId: ACCOUNT_ROW.id,
      tokenHash: 'unused-the-guard-looks-up-by-hash',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      revokedAt: null,
      account: ACCOUNT_ROW,
    });

    return { agent, response };
  }

  describe('GET /health', () => {
    it('reports ok in the success envelope', async () => {
      const response = await request(server).get('/health').expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: { status: 'ok', service: 'acres-api' },
      });
    });

    it('does not touch the database', async () => {
      await request(server).get('/health').expect(200);

      expect(prisma.account.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('CSRF', () => {
    it('rejects a mutation with no token', async () => {
      const response = await request(server)
        .post('/forms/contact')
        .send({ name: 'A', email: 'a@example.com', message: 'x'.repeat(20) })
        .expect(403);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'CSRF_INVALID' },
      });
    });
  });

  describe('POST /auth/register', () => {
    it('rejects a short password with VALIDATION_FAILED', async () => {
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/auth/register')
        .set('x-csrf-token', token)
        .send({ email: 'someone@example.com', password: 'short' })
        .expect(400);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(prisma.account.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown property', async () => {
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/auth/register')
        .set('x-csrf-token', token)
        .send({
          email: 'someone@example.com',
          password: 'a-long-enough-password',
          isAdmin: true,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
    });
  });

  describe('POST /auth/login', () => {
    it('fails with INVALID_CREDENTIALS for an unknown account', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/auth/login')
        .set('x-csrf-token', token)
        .send({ email: 'nobody@example.com', password: 'wrong-password-here' })
        .expect(401);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'INVALID_CREDENTIALS' },
      });
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
  });

  describe('the session guard', () => {
    it('rejects GET /account without a session', async () => {
      const response = await request(server).get('/account').expect(401);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
    });

    it('rejects GET /jobs/runs without a session', async () => {
      const response = await request(server).get('/jobs/runs').expect(401);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(prisma.jobRun.findMany).not.toHaveBeenCalled();
    });
  });

  describe('GET /auth/session', () => {
    it('answers with the anonymous profile when no cookie is sent', async () => {
      const response = await request(server).get('/auth/session').expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: { authenticated: false, account: null, expiresAt: null },
      });
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('clears a cookie that no longer resolves to a session', async () => {
      const { agent } = await signedInAgent();
      prisma.session.findUnique.mockResolvedValue(null);

      const response = await agent.get('/auth/session').expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: { authenticated: false },
      });
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain('acres_session=;');
    });
  });

  describe('POST /forms/contact', () => {
    it('rejects a message under the minimum length', async () => {
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/forms/contact')
        .set('x-csrf-token', token)
        .send({ name: 'Ada', email: 'ada@example.com', message: 'too short' })
        .expect(400);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(prisma.contactSubmission.create).not.toHaveBeenCalled();
    });

    it('stores a valid submission and returns a receipt', async () => {
      const receivedAt = new Date('2026-08-21T10:00:00.000Z');
      prisma.contactSubmission.create.mockResolvedValue({
        id: 'submission-1',
        createdAt: receivedAt,
      });
      const { agent, token } = await csrfAgent();

      const response = await agent
        .post('/forms/contact')
        .set('x-csrf-token', token)
        .send({
          name: 'Ada Lovelace',
          email: 'Ada@Example.com ',
          message: 'We would like a walkthrough of the regional dataset.',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        ok: true,
        data: { id: 'submission-1', receivedAt: receivedAt.toISOString() },
      });
      const expectedData: unknown = expect.objectContaining({
        email: 'ada@example.com',
        source: 'landing',
      });
      expect(prisma.contactSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expectedData }),
      );
    });
  });

  describe('an authenticated session', () => {
    it('sets an HttpOnly, SameSite=Lax, path-scoped session cookie', async () => {
      const { response } = await signedInAgent();

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const session = cookies.find((cookie) =>
        cookie.startsWith('acres_session='),
      );

      expect(session).toBeDefined();
      expect(session).toContain('HttpOnly');
      expect(session).toContain('SameSite=Lax');
      expect(session).toContain('Path=/');
      // Not Secure outside production, or the cookie would never be sent
      // over plain http in local development.
      expect(session).not.toContain('Secure');
      expect(session).toContain('Expires=');
    });

    it('stores only a hash of the session token, never the token', async () => {
      const { response } = await signedInAgent();

      const raw = sessionCookieValue(response);
      const [firstCall] = prisma.session.create.mock.calls as unknown as [
        [{ data: { tokenHash: string } }],
      ];
      const stored = firstCall[0];

      expect(raw).toBeTruthy();
      expect(stored.data.tokenHash).not.toBe(raw);
      expect(stored.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('admits the session to GET /account', async () => {
      const { agent, response: registration } = await signedInAgent();

      const response = await agent.get('/account').expect(200);

      expect(response.body).toMatchObject({
        ok: true,
        data: { id: 'account-1', email: 'ada@example.com' },
      });
      expect(response.body).not.toHaveProperty('data.passwordHash');

      // The double ignores `where`, so without this the test would still pass
      // if `resolve` hashed the token differently from `issue` — the one
      // regression that would break every real login.
      const raw = sessionCookieValue(registration);
      expect(prisma.session.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: createHash('sha256').update(raw).digest('hex') },
        }),
      );
    });

    it('admits the session to GET /jobs/runs', async () => {
      prisma.jobRun.findMany.mockResolvedValue([]);
      const { agent } = await signedInAgent();

      const response = await agent.get('/jobs/runs').expect(200);

      expect(response.body).toMatchObject({ ok: true, data: [] });
      expect(prisma.jobRun.findMany).toHaveBeenCalled();
    });

    it('revokes the session and clears the cookie on logout', async () => {
      prisma.session.updateMany.mockResolvedValue({ count: 1 });
      const { agent } = await signedInAgent();
      const token = await csrfTokenFor(agent);

      const response = await agent
        .post('/auth/logout')
        .set('x-csrf-token', token)
        .expect(200);

      const expectedRevocation: unknown = expect.objectContaining({
        revokedAt: expect.any(Date) as unknown,
      });
      expect(prisma.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'session-1' }) as unknown,
          data: expectedRevocation,
        }),
      );
      const cookies = response.headers['set-cookie'] as unknown as string[];
      expect(cookies.join(';')).toContain('acres_session=;');
    });
  });

  describe('organizations', () => {
    it('fails closed when tenancy is disabled', async () => {
      await recreateApp({ TENANCY_ENABLED: 'false' });
      const { agent } = await signedInAgent();

      const response = await agent.get('/organizations').expect(503);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_READY' },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('fails closed on organization-scoped routes before tenant lookup', async () => {
      await recreateApp({ TENANCY_ENABLED: 'false' });
      const { agent } = await signedInAgent();

      const response = await agent
        .get('/organizations/018f0000-0000-7000-8000-000000000001')
        .expect(503);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_READY' },
      });
      expect(prisma.membership.findFirst).not.toHaveBeenCalled();
    });

    it('creates an explicit first organization for the signed-in account', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      const createdAt = new Date('2026-08-24T10:00:00.000Z');
      const updatedAt = new Date('2026-08-24T10:01:00.000Z');
      prisma.organization.create.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000001',
        name: 'Acme Analytics',
        createdAt,
        updatedAt,
      });
      prisma.membership.create.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId: '018f0000-0000-7000-8000-000000000001',
        accountId: 'account-1',
        role: 'owner',
        createdAt,
        updatedAt,
        revokedAt: null,
      });
      prisma.auditEvent.create.mockResolvedValue({ id: 'audit-1' });

      const response = await agent
        .post('/organizations')
        .set('x-csrf-token', csrf)
        .send({ name: ' Acme Analytics ' })
        .expect(201);

      expect(response.body).toMatchObject({
        ok: true,
        data: {
          name: 'Acme Analytics',
          membership: { role: 'owner' },
        },
      });
      const expectedMembershipData: unknown = expect.objectContaining({
        accountId: 'account-1',
        role: 'owner',
      });
      expect(prisma.membership.create).toHaveBeenCalledWith({
        data: expectedMembershipData,
      });
    });

    it('returns NOT_FOUND for malformed organization context before querying', async () => {
      const { agent } = await signedInAgent();

      const response = await agent.get('/organizations/not-a-uuid').expect(404);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
      expect(prisma.membership.findFirst).not.toHaveBeenCalled();
    });

    it('validates ownership-transfer membership ids from the body', async () => {
      const { agent } = await signedInAgent();
      const csrf = await csrfTokenFor(agent);
      prisma.membership.findFirst.mockResolvedValue({
        id: '018f0000-0000-7000-8000-000000000002',
        organizationId: '018f0000-0000-7000-8000-000000000001',
        accountId: 'account-1',
        role: 'owner',
        revokedAt: null,
      });

      const response = await agent
        .post(
          '/organizations/018f0000-0000-7000-8000-000000000001/ownership-transfers',
        )
        .set('x-csrf-token', csrf)
        .send({ membershipId: 'not-a-uuid' })
        .expect(400);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(prisma.membership.update).not.toHaveBeenCalled();
    });
  });

  describe('GET /regions/:slug', () => {
    it('answers 404 NOT_FOUND for an unknown slug', async () => {
      prisma.region.findUnique.mockResolvedValue(null);

      const response = await request(server)
        .get('/regions/nowhere')
        .expect(404);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'NOT_FOUND' },
      });
    });
  });

  describe('rate limiting', () => {
    it('limits POST /forms/contact with the strict tier', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_STRICT_LIMIT: '2',
      });
      prisma.contactSubmission.create.mockResolvedValue({
        id: 'submission-1',
        createdAt: new Date('2026-08-23T10:00:00.000Z'),
      });
      const { agent, token } = await csrfAgent();
      const body = {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        message: 'We would like a walkthrough of the regional dataset.',
      };

      await agent
        .post('/forms/contact')
        .set('x-csrf-token', token)
        .send(body)
        .expect(201);
      await agent
        .post('/forms/contact')
        .set('x-csrf-token', token)
        .send(body)
        .expect(201);
      const response = await agent
        .post('/forms/contact')
        .set('x-csrf-token', token)
        .send(body)
        .expect(429);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED', message: expect.any(String) as string },
      });
    });

    it('limits POST /auth/login with the strict tier', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_STRICT_LIMIT: '2',
      });
      prisma.account.findUnique.mockResolvedValue(null);
      const { agent, token } = await csrfAgent();
      const body = {
        email: 'nobody@example.com',
        password: 'wrong-password-here',
      };

      await agent
        .post('/auth/login')
        .set('x-csrf-token', token)
        .send(body)
        .expect(401);
      await agent
        .post('/auth/login')
        .set('x-csrf-token', token)
        .send(body)
        .expect(401);
      const response = await agent
        .post('/auth/login')
        .set('x-csrf-token', token)
        .send(body)
        .expect(429);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED', message: expect.any(String) as string },
      });
    });

    it('limits POST /auth/register with the strict tier', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_STRICT_LIMIT: '2',
      });
      prisma.account.findUnique.mockResolvedValue(null);
      prisma.account.create.mockResolvedValue(ACCOUNT_ROW);
      prisma.session.create.mockResolvedValue({ id: 'session-1' });
      const { agent, token } = await csrfAgent();
      const body = {
        email: 'new-account@example.com',
        password: 'a-long-enough-password',
        displayName: 'Ada Lovelace',
      };

      await agent
        .post('/auth/register')
        .set('x-csrf-token', token)
        .send(body)
        .expect(201);
      const secondToken = await csrfTokenFor(agent);
      await agent
        .post('/auth/register')
        .set('x-csrf-token', secondToken)
        .send(body)
        .expect(201);
      const blockedToken = await csrfTokenFor(agent);
      const response = await agent
        .post('/auth/register')
        .set('x-csrf-token', blockedToken)
        .send(body)
        .expect(429);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED', message: expect.any(String) as string },
      });
    });

    it('keeps GET /auth/csrf on the default tier', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_STRICT_LIMIT: '2',
      });
      const agent = request.agent(server);

      for (let attempt = 0; attempt < 7; attempt += 1) {
        await agent.get('/auth/csrf').expect(200);
      }
    });

    it('limits GET /auth/csrf with the default tier', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_DEFAULT_LIMIT: '2',
      });
      const agent = request.agent(server);

      await agent.get('/auth/csrf').expect(200);
      await agent.get('/auth/csrf').expect(200);
      const response = await agent.get('/auth/csrf').expect(429);

      expect(response.body).toMatchObject({
        ok: false,
        error: { code: 'RATE_LIMITED', message: expect.any(String) as string },
      });
    });

    it('skips throttling for GET /health', async () => {
      await recreateApp({
        RATE_LIMIT_TTL_MS: '60000',
        RATE_LIMIT_DEFAULT_LIMIT: '2',
      });

      for (let attempt = 0; attempt < 7; attempt += 1) {
        await request(server).get('/health').expect(200);
      }
    });
  });
});
