import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { MemoryMailAdapter } from '../src/mail/adapters/memory-mail.adapter';
import {
  createPrismaDouble,
  createTestApp,
  PrismaDouble,
} from './helpers/test-app';

describe('Organizations and Invitations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaDouble;
  let memoryMail: MemoryMailAdapter;
  let server: App;

  const OWNER_ACCOUNT_ID = '018f0000-0000-7000-8000-000000000001';
  const OWNER_EMAIL = 'owner@acres.local';
  const ORG_ID = '018f0000-0000-7000-8000-000000000010';
  const OWNER_MEMBERSHIP_ID = '018f0000-0000-7000-8000-000000000020';
  const TARGET_MEMBERSHIP_ID = '018f0000-0000-7000-8000-000000000030';
  const INVITATION_ID = '018f0000-0000-7000-8000-000000000040';

  const OWNER_ACCOUNT = {
    id: OWNER_ACCOUNT_ID,
    email: OWNER_EMAIL,
    passwordHash: '$2a$12$dummyhash',
    displayName: 'Owner User',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const OWNER_MEMBERSHIP = {
    id: OWNER_MEMBERSHIP_ID,
    organizationId: ORG_ID,
    accountId: OWNER_ACCOUNT_ID,
    role: 'owner',
    createdAt: new Date(),
    updatedAt: new Date(),
    revokedAt: null,
    account: OWNER_ACCOUNT,
  };

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
    prisma.membership.findFirst.mockImplementation(
      (args?: { where?: { id?: string } }) => {
        if (args?.where?.id === TARGET_MEMBERSHIP_ID) {
          return Promise.resolve({
            id: TARGET_MEMBERSHIP_ID,
            organizationId: ORG_ID,
            accountId: 'another-account-id',
            role: 'viewer',
            createdAt: new Date(),
            updatedAt: new Date(),
            revokedAt: null,
            account: {
              email: 'target@example.com',
              displayName: 'Target Member',
            },
          });
        }
        return Promise.resolve(OWNER_MEMBERSHIP);
      },
    );
  });

  async function csrfTokenFor(agent: request.Agent): Promise<string> {
    const response = await agent.get('/api/v1/auth/csrf').expect(200);
    return (response.body as { data: { csrfToken: string } }).data.csrfToken;
  }

  async function signedInOwner() {
    const agent = request.agent(server);
    const preCsrf = await csrfTokenFor(agent);

    prisma.account.findUnique.mockResolvedValue(null);
    prisma.account.create.mockResolvedValue(OWNER_ACCOUNT);
    prisma.session.create.mockResolvedValue({ id: 'session-owner' });

    await agent
      .post('/api/v1/auth/register')
      .set('x-csrf-token', preCsrf)
      .send({
        email: OWNER_EMAIL,
        password: 'a-long-enough-password',
        displayName: 'Owner User',
      })
      .expect(HttpStatus.CREATED);

    prisma.session.findUnique.mockResolvedValue({
      id: 'session-owner',
      accountId: OWNER_ACCOUNT_ID,
      tokenHash: 'token-hash',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      revokedAt: null,
      account: OWNER_ACCOUNT,
    });

    const token = await csrfTokenFor(agent);
    return { agent, token };
  }

  describe('POST /api/v1/organizations/:id/invitations', () => {
    it('rejects without CSRF token with 403', async () => {
      const res = await request(server)
        .post(`/api/v1/organizations/${ORG_ID}/invitations`)
        .set('x-acres-organization-id', ORG_ID)
        .send({ email: 'newmember@example.com', role: 'viewer' })
        .expect(HttpStatus.FORBIDDEN);

      const body = res.body as { ok: boolean; error: { code: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe('CSRF_INVALID');
    });

    it('issues invitation and dispatches branded email with token link', async () => {
      const { agent, token } = await signedInOwner();
      const inviteeEmail = 'analyst@example.com';

      prisma.organization.findUnique.mockResolvedValue({
        id: ORG_ID,
        name: 'Acres Test Org',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      prisma.invitation.updateMany.mockResolvedValue({ count: 0 });
      prisma.invitation.create.mockResolvedValue({
        id: INVITATION_ID,
        organizationId: ORG_ID,
        email: inviteeEmail,
        role: 'analyst',
        tokenHash: 'hashed-token-value',
        invitedByAccountId: OWNER_ACCOUNT_ID,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        acceptedAt: null,
        revokedAt: null,
      });

      const res = await agent
        .post(`/api/v1/organizations/${ORG_ID}/invitations`)
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_ID)
        .set('Idempotency-Key', 'test-invite-key-001')
        .send({ email: inviteeEmail, role: 'analyst' })
        .expect(HttpStatus.CREATED);

      const body = res.body as {
        ok: boolean;
        data: { id: string; email: string; role: string; token: string };
      };
      expect(body.ok).toBe(true);
      expect(body.data.id).toBe(INVITATION_ID);
      expect(body.data.email).toBe(inviteeEmail);
      expect(body.data.role).toBe('analyst');
      expect(body.data.token).toBeDefined();

      // Verify email delivery via MemoryMailAdapter
      expect(memoryMail.sent).toHaveLength(1);
      const sentEmail = memoryMail.sent[0];
      expect(sentEmail.to).toBe(inviteeEmail);
      expect(sentEmail.subject).toContain('Acres Test Org');
      expect(sentEmail.text).toContain('/accept-invitation?token=');
      expect(sentEmail.text).toContain(body.data.token);
      expect(sentEmail.text).toContain('Analyst');
      expect(sentEmail.html).toContain(body.data.token);
      expect(sentEmail.html).toContain('Acres Test Org');
    });
  });

  describe('GET /api/v1/organizations/:id/invitations', () => {
    it('returns invitations for the organization', async () => {
      const { agent } = await signedInOwner();

      prisma.invitation.findMany.mockResolvedValue([
        {
          id: INVITATION_ID,
          organizationId: ORG_ID,
          email: 'analyst@example.com',
          role: 'analyst',
          invitedByAccountId: OWNER_ACCOUNT_ID,
          expiresAt: new Date(),
          createdAt: new Date(),
          acceptedAt: null,
          revokedAt: null,
        },
      ]);

      const res = await agent
        .get(`/api/v1/organizations/${ORG_ID}/invitations`)
        .set('x-acres-organization-id', ORG_ID)
        .expect(HttpStatus.OK);

      const body = res.body as { ok: boolean; data: unknown[] };
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('DELETE /api/v1/organizations/:id/invitations/:invId', () => {
    it('revokes an unaccepted invitation', async () => {
      const { agent, token } = await signedInOwner();

      prisma.invitation.findFirst.mockResolvedValue({
        id: INVITATION_ID,
        organizationId: ORG_ID,
        acceptedAt: null,
        revokedAt: null,
      });
      prisma.invitation.update.mockResolvedValue({
        id: INVITATION_ID,
        revokedAt: new Date(),
      });

      const res = await agent
        .delete(`/api/v1/organizations/${ORG_ID}/invitations/${INVITATION_ID}`)
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_ID)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({ ok: true, data: { revoked: true } });
    });
  });

  describe('GET /api/v1/organizations/:id/members', () => {
    it('returns list of members', async () => {
      const { agent } = await signedInOwner();

      prisma.membership.findMany.mockResolvedValue([OWNER_MEMBERSHIP]);

      const res = await agent
        .get(`/api/v1/organizations/${ORG_ID}/members`)
        .set('x-acres-organization-id', ORG_ID)
        .expect(HttpStatus.OK);

      const body = res.body as {
        ok: boolean;
        data: Array<{ email: string; role: string }>;
      };
      expect(body.ok).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].email).toBe(OWNER_EMAIL);
      expect(body.data[0].role).toBe('owner');
    });
  });

  describe('PATCH /api/v1/organizations/:id/members/:membershipId', () => {
    it('changes a member role when permitted', async () => {
      const { agent, token } = await signedInOwner();

      prisma.membership.update.mockResolvedValue({
        id: TARGET_MEMBERSHIP_ID,
        organizationId: ORG_ID,
        accountId: 'another-account-id',
        role: 'analyst',
        createdAt: new Date(),
        updatedAt: new Date(),
        revokedAt: null,
        account: { email: 'target@example.com', displayName: 'Target Member' },
      });

      const res = await agent
        .patch(
          `/api/v1/organizations/${ORG_ID}/members/${TARGET_MEMBERSHIP_ID}`,
        )
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_ID)
        .send({ role: 'analyst' })
        .expect(HttpStatus.OK);

      const body = res.body as { ok: boolean; data: { role: string } };
      expect(body.ok).toBe(true);
      expect(body.data.role).toBe('analyst');
    });
  });

  describe('DELETE /api/v1/organizations/:id/members/:membershipId', () => {
    it('revokes a non-owner member', async () => {
      const { agent, token } = await signedInOwner();

      prisma.membership.update.mockResolvedValue({
        id: TARGET_MEMBERSHIP_ID,
        revokedAt: new Date(),
      });

      const res = await agent
        .delete(
          `/api/v1/organizations/${ORG_ID}/members/${TARGET_MEMBERSHIP_ID}`,
        )
        .set('x-csrf-token', token)
        .set('x-acres-organization-id', ORG_ID)
        .expect(HttpStatus.OK);

      expect(res.body).toEqual({ ok: true, data: { revoked: true } });
    });
  });
});
