import { Test, type TestingModule } from '@nestjs/testing';
import {
  INVITATION_ROLES,
  ORGANIZATION_ROLES,
  isInvitationRole,
  isOrganizationRole,
} from '@acres/shared';
import { AcresConfigService } from '../config/acres-config.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { MailService } from '../mail/mail.service';
import {
  TenantTransactionService,
  type TenantTransactionClient,
} from '../prisma/tenant-transaction.service';
import { AuditService } from './audit.service';
import type { OrganizationContext } from './organization-context';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let mockTenants: {
    accountScoped: jest.Mock;
    organizationScoped: jest.Mock;
    invitationScoped: jest.Mock;
  };
  let mockAudit: { append: jest.Mock };
  let mockConfig: {
    tenancyEnabled: boolean;
    invitationTtlHours: number;
    clientOrigin: string;
    graphqlMaxFirst: number;
  };
  let mockIdempotency: { run: jest.Mock };
  let mockMail: { sendInvitationEmail: jest.Mock };
  let mockTx: {
    $executeRaw: jest.Mock;
    organization: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    membership: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    invitation: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    auditEvent: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
  };

  const now = new Date('2026-09-20T12:00:00.000Z');
  const orgId = '018f0000-0000-7000-8000-000000000001';
  const ownerAccountId = '018f0000-0000-7000-8000-000000000002';
  const ownerMembershipId = '018f0000-0000-7000-8000-000000000003';
  const targetAccountId = '018f0000-0000-7000-8000-000000000004';
  const targetMembershipId = '018f0000-0000-7000-8000-000000000005';
  const invitationId = '018f0000-0000-7000-8000-000000000006';

  const ownerContext: OrganizationContext = {
    organizationId: orgId,
    accountId: ownerAccountId,
    membershipId: ownerMembershipId,
    role: 'owner',
  };

  const adminContext: OrganizationContext = {
    organizationId: orgId,
    accountId: '018f0000-0000-7000-8000-000000000007',
    membershipId: '018f0000-0000-7000-8000-000000000008',
    role: 'admin',
  };

  const analystContext: OrganizationContext = {
    organizationId: orgId,
    accountId: '018f0000-0000-7000-8000-000000000009',
    membershipId: '018f0000-0000-7000-8000-000000000010',
    role: 'analyst',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      organization: {
        findUnique: jest.fn().mockResolvedValue({
          id: orgId,
          name: 'Acme Farms',
          createdAt: now,
          updatedAt: now,
        }),
        create: jest.fn().mockResolvedValue({
          id: orgId,
          name: 'Acme Farms',
          createdAt: now,
          updatedAt: now,
        }),
        update: jest.fn().mockResolvedValue({
          id: orgId,
          name: 'Updated Acme',
          createdAt: now,
          updatedAt: now,
        }),
      },
      membership: {
        findFirst: jest.fn().mockImplementation(
          (args: {
            where: {
              id?: string;
              accountId?: string;
              organizationId?: string;
            };
          }) => {
            if (args.where.id) {
              if (args.where.id === ownerMembershipId) {
                return Promise.resolve({
                  id: ownerMembershipId,
                  organizationId: orgId,
                  accountId: ownerAccountId,
                  role: 'owner',
                  createdAt: now,
                  updatedAt: now,
                  revokedAt: null,
                  account: {
                    email: 'owner@example.com',
                    displayName: 'Owner',
                  },
                });
              }
              if (args.where.id === adminContext.membershipId) {
                return Promise.resolve({
                  id: adminContext.membershipId,
                  organizationId: orgId,
                  accountId: adminContext.accountId,
                  role: 'admin',
                  createdAt: now,
                  updatedAt: now,
                  revokedAt: null,
                  account: {
                    email: 'admin@example.com',
                    displayName: 'Admin',
                  },
                });
              }
              if (args.where.id === analystContext.membershipId) {
                return Promise.resolve({
                  id: analystContext.membershipId,
                  organizationId: orgId,
                  accountId: analystContext.accountId,
                  role: 'analyst',
                  createdAt: now,
                  updatedAt: now,
                  revokedAt: null,
                  account: {
                    email: 'analyst@example.com',
                    displayName: 'Analyst',
                  },
                });
              }
              if (args.where.id === targetMembershipId) {
                return Promise.resolve({
                  id: targetMembershipId,
                  organizationId: orgId,
                  accountId: targetAccountId,
                  role: 'viewer',
                  createdAt: now,
                  updatedAt: now,
                  revokedAt: null,
                  account: {
                    email: 'target@example.com',
                    displayName: 'Target',
                  },
                });
              }
              return Promise.resolve(null);
            }
            if (
              args.where.accountId === ownerAccountId &&
              args.where.organizationId === orgId
            ) {
              return Promise.resolve({
                id: ownerMembershipId,
                organizationId: orgId,
                accountId: ownerAccountId,
                role: 'owner',
                createdAt: now,
                updatedAt: now,
                revokedAt: null,
                account: {
                  email: 'owner@example.com',
                  displayName: 'Owner',
                },
              });
            }
            return Promise.resolve(null);
          },
        ),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      invitation: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      auditEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    mockTenants = {
      accountScoped: jest
        .fn()
        .mockImplementation(
          (
            _accountId: string,
            cb: (tx: TenantTransactionClient) => Promise<unknown>,
          ) => cb(mockTx as unknown as TenantTransactionClient),
        ),
      organizationScoped: jest
        .fn()
        .mockImplementation(
          (
            _accountId: string,
            _orgId: string,
            cb: (tx: TenantTransactionClient) => Promise<unknown>,
          ) => cb(mockTx as unknown as TenantTransactionClient),
        ),
      invitationScoped: jest
        .fn()
        .mockImplementation(
          (
            _accountId: string,
            _hash: string,
            cb: (tx: TenantTransactionClient) => Promise<unknown>,
          ) => cb(mockTx as unknown as TenantTransactionClient),
        ),
    };

    mockAudit = {
      append: jest.fn().mockResolvedValue(undefined),
    };

    mockConfig = {
      tenancyEnabled: true,
      invitationTtlHours: 24,
      clientOrigin: 'https://acres.example.com',
      graphqlMaxFirst: 25,
    };

    mockIdempotency = {
      run: jest
        .fn()
        .mockImplementation(
          (
            _tx: TenantTransactionClient,
            _scope: unknown,
            cb: () => Promise<unknown>,
          ) => cb(),
        ),
    };

    mockMail = {
      sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: TenantTransactionService, useValue: mockTenants },
        { provide: AuditService, useValue: mockAudit },
        { provide: AcresConfigService, useValue: mockConfig },
        { provide: IdempotencyService, useValue: mockIdempotency },
        { provide: MailService, useValue: mockMail },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('tenancy guard (ensureEnabled)', () => {
    it('throws 503 notReady when tenancyEnabled is false', async () => {
      mockConfig.tenancyEnabled = false;
      await expect(service.list(ownerAccountId)).rejects.toMatchObject({
        status: 503,
      });
    });
  });

  describe('list(accountId)', () => {
    it('returns formatted organization summaries for active memberships', async () => {
      mockTx.membership.findMany.mockResolvedValue([
        {
          id: ownerMembershipId,
          role: 'owner',
          organization: {
            id: orgId,
            name: 'Acme Farms',
            createdAt: now,
            updatedAt: now,
          },
        },
      ]);

      const result = await service.list(ownerAccountId);

      expect(mockTenants.accountScoped).toHaveBeenCalledWith(
        ownerAccountId,
        expect.any(Function),
      );
      expect(mockTx.membership.findMany).toHaveBeenCalledWith({
        where: { accountId: ownerAccountId, revokedAt: null },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: orgId,
          name: 'Acme Farms',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          membership: { id: ownerMembershipId, role: 'owner' },
        },
      ]);
    });
  });

  describe('create(accountId, name, idempotencyKey)', () => {
    it('creates organization and owner membership, runs idempotently, and logs audit', async () => {
      mockTx.organization.create.mockResolvedValue({
        id: orgId,
        name: 'New Org',
        createdAt: now,
        updatedAt: now,
      });
      mockTx.membership.create.mockResolvedValue({
        id: ownerMembershipId,
        role: 'owner',
      });

      const result = await service.create(ownerAccountId, 'New Org', 'idem-1');

      expect(mockTenants.accountScoped).toHaveBeenCalledWith(
        ownerAccountId,
        expect.any(Function),
      );
      expect(mockIdempotency.run).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          key: 'idem-1',
          accountId: ownerAccountId,
          operation: 'organizations.create',
          requestBody: { name: 'New Org' },
        }),
        expect.any(Function),
      );
      expect(mockTx.organization.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'New Org',
        }) as unknown,
      });
      expect(mockTx.membership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          accountId: ownerAccountId,
          role: 'owner',
        }) as unknown,
      });
      expect(mockAudit.append).toHaveBeenCalledWith(mockTx, {
        organizationId: orgId,
        actorAccountId: ownerAccountId,
        action: 'organization_created',
        targetType: 'organization',
        targetId: orgId,
      });
      expect(result).toEqual({
        id: orgId,
        name: 'New Org',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        membership: { id: ownerMembershipId, role: 'owner' },
      });
    });
  });

  describe('get(context)', () => {
    it('returns organization details when caller has active membership', async () => {
      mockTx.organization.findUnique.mockResolvedValue({
        id: orgId,
        name: 'Acme Farms',
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.get(ownerContext);

      expect(mockTenants.organizationScoped).toHaveBeenCalledWith(
        ownerAccountId,
        orgId,
        expect.any(Function),
        { statementTimeoutMs: undefined },
      );
      expect(result).toEqual({
        id: orgId,
        name: 'Acme Farms',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        membership: { id: ownerMembershipId, role: 'owner' },
      });
    });

    it('throws 404 when caller has no active membership', async () => {
      await expect(
        service.get({ ...ownerContext, membershipId: 'non-existent' }),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Organization not found.',
      });
    });

    it('throws 404 when organization record is not found', async () => {
      mockTx.organization.findUnique.mockResolvedValue(null);

      await expect(service.get(ownerContext)).rejects.toMatchObject({
        status: 404,
        message: 'Organization not found.',
      });
    });
  });

  describe('update(context, name)', () => {
    it('updates organization name when caller has permission and logs audit', async () => {
      mockTx.organization.update.mockResolvedValue({
        id: orgId,
        name: 'Updated Org',
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.update(ownerContext, 'Updated Org');

      expect(mockTx.organization.update).toHaveBeenCalledWith({
        where: { id: orgId },
        data: { name: 'Updated Org' },
      });
      expect(mockAudit.append).toHaveBeenCalledWith(mockTx, {
        organizationId: orgId,
        actorAccountId: ownerAccountId,
        action: 'organization_updated',
        targetType: 'organization',
        targetId: orgId,
      });
      expect(result).toEqual({
        id: orgId,
        name: 'Updated Org',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        membership: { id: ownerMembershipId, role: 'owner' },
      });
    });

    it('throws 403 when caller role lacks organization.update permission', async () => {
      await expect(
        service.update(analystContext, 'Forbidden Rename'),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('members(context) and membersPage', () => {
    it('returns formatted members list for authorized caller', async () => {
      mockTx.membership.findMany.mockResolvedValue([
        {
          id: ownerMembershipId,
          accountId: ownerAccountId,
          role: 'owner',
          createdAt: now,
          updatedAt: now,
          revokedAt: null,
          account: { email: 'owner@example.com', displayName: 'Owner' },
        },
      ]);

      const result = await service.members(ownerContext);

      expect(mockTx.membership.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        include: { account: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        {
          id: ownerMembershipId,
          accountId: ownerAccountId,
          email: 'owner@example.com',
          displayName: 'Owner',
          role: 'owner',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          revokedAt: null,
        },
      ]);
    });

    it('membersPage handles take and afterId cursor', async () => {
      mockTx.membership.findMany.mockResolvedValue([]);

      const result = await service.membersPage(ownerContext, 10, 'cursor-mem');

      expect(mockTx.membership.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        include: { account: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        cursor: { id: 'cursor-mem' },
        skip: 1,
        take: 10,
      });
      expect(result).toEqual([]);
    });

    it('membersPage handles invalid cursor (P2025) with 400 cursorInvalid', async () => {
      mockTx.membership.findMany.mockRejectedValue({ code: 'P2025' });

      await expect(
        service.membersPage(ownerContext, 10, 'invalid-cursor'),
      ).rejects.toMatchObject({
        status: 400,
        message: 'The cursor is not valid for this connection.',
      });
    });

    it('throws 403 when caller role lacks members.read permission', async () => {
      await expect(service.members(analystContext)).rejects.toMatchObject({
        status: 403,
      });
    });
  });

  describe('changeMemberRole(context, membershipId, role)', () => {
    it('updates member role, checks hierarchy, and logs audit', async () => {
      mockTx.membership.update.mockResolvedValue({
        id: targetMembershipId,
        accountId: targetAccountId,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
        revokedAt: null,
        account: { email: 'target@example.com', displayName: 'Target' },
      });

      const result = await service.changeMemberRole(
        ownerContext,
        targetMembershipId,
        'admin',
      );

      expect(mockTx.membership.update).toHaveBeenCalledWith({
        where: { id: targetMembershipId },
        data: { role: 'admin' },
        include: { account: true },
      });
      expect(mockAudit.append).toHaveBeenCalledWith(mockTx, {
        organizationId: orgId,
        actorAccountId: ownerAccountId,
        action: 'membership_role_changed',
        targetType: 'membership',
        targetId: targetMembershipId,
        details: { oldRole: 'viewer', newRole: 'admin' },
      });
      expect(result.role).toBe('admin');
    });

    it('throws 409 conflict when owner attempts self-demotion', async () => {
      await expect(
        service.changeMemberRole(ownerContext, ownerMembershipId, 'admin'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'That membership cannot be changed here.',
      });
    });

    it('throws 404 when target membership does not exist or is revoked', async () => {
      await expect(
        service.changeMemberRole(ownerContext, 'missing-mem', 'admin'),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Membership not found.',
      });
    });

    it('throws 409 conflict when attempting to change role of an owner directly', async () => {
      mockTx.membership.findFirst.mockImplementation(
        (args: { where: { id?: string } }) => {
          if (args.where.id === ownerMembershipId) {
            return Promise.resolve({
              id: ownerMembershipId,
              organizationId: orgId,
              accountId: ownerAccountId,
              role: 'owner',
              createdAt: now,
              updatedAt: now,
              revokedAt: null,
              account: {
                email: 'owner@example.com',
                displayName: 'Owner',
              },
            });
          }
          if (args.where.id === targetMembershipId) {
            return Promise.resolve({
              id: targetMembershipId,
              organizationId: orgId,
              accountId: targetAccountId,
              role: 'owner',
              createdAt: now,
              updatedAt: now,
              revokedAt: null,
              account: {
                email: 'target@example.com',
                displayName: 'Target',
              },
            });
          }
          return Promise.resolve(null);
        },
      );

      await expect(
        service.changeMemberRole(ownerContext, targetMembershipId, 'admin'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'That membership cannot be changed here.',
      });
    });

    it('throws 403 when admin tries to assign another admin role', async () => {
      await expect(
        service.changeMemberRole(adminContext, targetMembershipId, 'admin'),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('revokeMember(context, membershipId)', () => {
    it('soft-deletes member with revokedAt timestamp and logs audit', async () => {
      mockTx.membership.update.mockResolvedValue({});

      const result = await service.revokeMember(
        ownerContext,
        targetMembershipId,
      );

      expect(mockTx.membership.update).toHaveBeenCalledWith({
        where: { id: targetMembershipId },
        data: expect.objectContaining({}) as unknown,
      });
      const updateCalls = mockTx.membership.update.mock.calls as unknown as [
        [{ data: { revokedAt: Date } }],
      ];
      expect(updateCalls[0][0].data.revokedAt).toBeInstanceOf(Date);

      expect(mockAudit.append).toHaveBeenCalledWith(mockTx, {
        organizationId: orgId,
        actorAccountId: ownerAccountId,
        action: 'membership_revoked',
        targetType: 'membership',
        targetId: targetMembershipId,
      });
      expect(result).toEqual({ revoked: true });
    });

    it('throws 409 conflict when attempting to revoke an owner membership', async () => {
      await expect(
        service.revokeMember(ownerContext, ownerMembershipId),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Owners can only leave through ownership transfer.',
      });
    });

    it('throws 404 when target membership does not exist or is already revoked', async () => {
      await expect(
        service.revokeMember(ownerContext, 'non-existent-member'),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Membership not found.',
      });
    });
  });

  describe('invitations list, issuance, revocation, and acceptance', () => {
    it('lists invitations without leaking tokenHash', async () => {
      mockTx.invitation.findMany.mockResolvedValue([
        {
          id: invitationId,
          organizationId: orgId,
          email: 'analyst@example.com',
          role: 'analyst',
          invitedByAccountId: ownerAccountId,
          tokenHash: 'private-hash-never-leaked',
          expiresAt: new Date('2026-09-21T12:00:00.000Z'),
          createdAt: now,
          acceptedAt: null,
          revokedAt: null,
        },
      ]);

      const result = await service.invitations(ownerContext);

      expect(mockTx.invitation.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(
        (result[0] as unknown as Record<string, unknown>).tokenHash,
      ).toBeUndefined();
      expect(result[0].email).toBe('analyst@example.com');
    });

    it('invitationsPage handles take and afterId cursor', async () => {
      mockTx.invitation.findMany.mockResolvedValue([]);

      const result = await service.invitationsPage(
        ownerContext,
        10,
        'cursor-inv',
      );

      expect(mockTx.invitation.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        cursor: { id: 'cursor-inv' },
        skip: 1,
        take: 10,
      });
      expect(result).toEqual([]);
    });

    it('invitationsPage handles invalid cursor (P2025) with 400 cursorInvalid', async () => {
      mockTx.invitation.findMany.mockRejectedValue({ code: 'P2025' });

      await expect(
        service.invitationsPage(ownerContext, 10, 'invalid-cursor'),
      ).rejects.toMatchObject({
        status: 400,
        message: 'The cursor is not valid for this connection.',
      });
    });

    it('issues invitation with 24h expiration, hashes token, and sends email', async () => {
      mockTx.invitation.updateMany.mockResolvedValue({ count: 0 });
      mockTx.invitation.create.mockImplementation(
        (args: { data: Record<string, unknown> }) =>
          Promise.resolve({
            id: invitationId,
            ...args.data,
            createdAt: now,
            acceptedAt: null,
            revokedAt: null,
          }),
      );

      const res = await service.invite(
        ownerContext,
        'new@example.com',
        'analyst',
        'idem-inv-1',
      );

      expect(mockTx.invitation.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          organizationId: orgId,
          email: 'new@example.com',
          acceptedAt: null,
          revokedAt: null,
        }) as unknown,
        data: expect.objectContaining({}) as unknown,
      });
      const updateCalls = mockTx.invitation.updateMany.mock
        .calls as unknown as [
        [{ where: { expiresAt: { lte: Date } }; data: { revokedAt: Date } }],
      ];
      expect(updateCalls[0][0].where.expiresAt.lte).toBeInstanceOf(Date);
      expect(updateCalls[0][0].data.revokedAt).toBeInstanceOf(Date);

      expect(mockTx.invitation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: orgId,
          email: 'new@example.com',
          role: 'analyst',
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) as unknown,
          invitedByAccountId: ownerAccountId,
        }) as unknown,
      });
      const createCalls = mockTx.invitation.create.mock.calls as unknown as [
        [{ data: { expiresAt: Date } }],
      ];
      expect(createCalls[0][0].data.expiresAt).toBeInstanceOf(Date);

      expect(mockAudit.append).toHaveBeenCalledWith(mockTx, {
        organizationId: orgId,
        actorAccountId: ownerAccountId,
        action: 'invitation_issued',
        targetType: 'invitation',
        targetId: invitationId,
        details: { role: 'analyst' },
      });
      expect(mockMail.sendInvitationEmail).toHaveBeenCalledWith(
        'new@example.com',
        expect.stringContaining(
          'https://acres.example.com/accept-invitation?token=',
        ),
        'Acme Farms',
        'analyst',
      );
      expect(res.token).toBeDefined();
    });

    it('catches P2002 conflict and throws 409 when live invitation already exists', async () => {
      mockTx.invitation.updateMany.mockResolvedValue({ count: 0 });
      mockTx.invitation.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.invite(ownerContext, 'existing@example.com', 'analyst'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'A live invitation already exists.',
      });
    });

    it('swallows mail errors gracefully during invitation issuance', async () => {
      mockTx.invitation.updateMany.mockResolvedValue({ count: 0 });
      mockTx.invitation.create.mockResolvedValue({
        id: invitationId,
        organizationId: orgId,
        email: 'user@example.com',
        role: 'analyst',
        tokenHash: 'hash',
        invitedByAccountId: ownerAccountId,
        expiresAt: new Date(),
        createdAt: now,
        acceptedAt: null,
        revokedAt: null,
      });
      mockMail.sendInvitationEmail.mockRejectedValue(new Error('SMTP down'));

      const result = await service.invite(
        ownerContext,
        'user@example.com',
        'analyst',
      );
      expect(result.id).toBe(invitationId);
    });

    it('revokes an unaccepted invitation and logs audit', async () => {
      mockTx.invitation.findFirst.mockResolvedValue({
        id: invitationId,
        organizationId: orgId,
        acceptedAt: null,
        revokedAt: null,
      });

      const res = await service.revokeInvitation(ownerContext, invitationId);

      expect(mockTx.invitation.update).toHaveBeenCalledWith({
        where: { id: invitationId },
        data: expect.objectContaining({}) as unknown,
      });
      const revokeCalls = mockTx.invitation.update.mock.calls as unknown as [
        [{ data: { revokedAt: Date } }],
      ];
      expect(revokeCalls[0][0].data.revokedAt).toBeInstanceOf(Date);

      expect(mockAudit.append).toHaveBeenCalledWith(mockTx, {
        organizationId: orgId,
        actorAccountId: ownerAccountId,
        action: 'invitation_revoked',
        targetType: 'invitation',
        targetId: invitationId,
      });
      expect(res).toEqual({ revoked: true });
    });

    it('returns revoked true idempotently when invitation is already revoked', async () => {
      mockTx.invitation.findFirst.mockResolvedValue({
        id: invitationId,
        organizationId: orgId,
        acceptedAt: null,
        revokedAt: new Date('2026-09-19T10:00:00.000Z'),
      });

      const res = await service.revokeInvitation(ownerContext, invitationId);

      expect(mockTx.invitation.update).not.toHaveBeenCalled();
      expect(res).toEqual({ revoked: true });
    });

    it('throws 409 conflict when attempting to revoke an accepted invitation', async () => {
      mockTx.invitation.findFirst.mockResolvedValue({
        id: invitationId,
        organizationId: orgId,
        acceptedAt: new Date('2026-09-19T12:00:00.000Z'),
        revokedAt: null,
      });

      await expect(
        service.revokeInvitation(ownerContext, invitationId),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Accepted invitations cannot be revoked.',
      });
    });

    it('accepts invitation, claims atomically, creates membership, and logs audit', async () => {
      const token = 'sample-invitation-token-value-1234567890';
      const email = 'acceptor@example.com';
      mockTx.invitation.findUnique.mockResolvedValue({
        id: invitationId,
        organizationId: orgId,
        email,
        role: 'analyst',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockTx.invitation.updateMany.mockResolvedValue({ count: 1 });
      mockTx.membership.findUnique.mockResolvedValue(null);
      mockTx.membership.create.mockResolvedValue({
        id: targetMembershipId,
        organizationId: orgId,
        accountId: targetAccountId,
        role: 'analyst',
      });

      const res = await service.accept(
        targetAccountId,
        email,
        token,
        'idem-accept',
      );

      expect(mockTenants.invitationScoped).toHaveBeenCalled();
      expect(mockTx.$executeRaw).toHaveBeenCalled();
      expect(mockTx.invitation.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: invitationId,
          acceptedAt: null,
          revokedAt: null,
        }) as unknown,
        data: expect.objectContaining({
          acceptedByAccountId: targetAccountId,
        }) as unknown,
      });
      const acceptCalls = mockTx.invitation.updateMany.mock
        .calls as unknown as [
        [{ where: { expiresAt: { gt: Date } }; data: { acceptedAt: Date } }],
      ];
      expect(acceptCalls[0][0].where.expiresAt.gt).toBeInstanceOf(Date);
      expect(acceptCalls[0][0].data.acceptedAt).toBeInstanceOf(Date);

      expect(mockTx.membership.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          accountId: targetAccountId,
          role: 'analyst',
        },
      });
      expect(mockAudit.append).toHaveBeenCalledWith(mockTx, {
        organizationId: orgId,
        actorAccountId: targetAccountId,
        action: 'invitation_accepted',
        targetType: 'invitation',
        targetId: invitationId,
        details: { membershipId: targetMembershipId },
      });
      expect(res).toEqual({
        organizationId: orgId,
        membershipId: targetMembershipId,
      });
    });

    it('reactivates previously revoked membership upon accepting invitation', async () => {
      const token = 'sample-invitation-token-value-1234567890';
      const email = 'acceptor@example.com';
      mockTx.invitation.findUnique.mockResolvedValue({
        id: invitationId,
        organizationId: orgId,
        email,
        role: 'viewer',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockTx.invitation.updateMany.mockResolvedValue({ count: 1 });
      mockTx.membership.findUnique.mockResolvedValue({
        id: targetMembershipId,
        organizationId: orgId,
        accountId: targetAccountId,
        revokedAt: new Date('2026-08-01T00:00:00.000Z'),
      });
      mockTx.membership.update.mockResolvedValue({
        id: targetMembershipId,
        role: 'viewer',
        revokedAt: null,
      });

      const res = await service.accept(targetAccountId, email, token);

      expect(mockTx.membership.update).toHaveBeenCalledWith({
        where: { id: targetMembershipId },
        data: { role: 'viewer', revokedAt: null },
      });
      expect(res.membershipId).toBe(targetMembershipId);
    });

    it('throws 409 conflict when user is already an active member', async () => {
      const token = 'sample-invitation-token-value-1234567890';
      const email = 'acceptor@example.com';
      mockTx.invitation.findUnique.mockResolvedValue({
        id: invitationId,
        organizationId: orgId,
        email,
        role: 'viewer',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockTx.invitation.updateMany.mockResolvedValue({ count: 1 });
      mockTx.membership.findUnique.mockResolvedValue({
        id: targetMembershipId,
        organizationId: orgId,
        accountId: targetAccountId,
        revokedAt: null,
      });

      await expect(
        service.accept(targetAccountId, email, token),
      ).rejects.toMatchObject({
        status: 409,
        message: 'The account is already an active member.',
      });
    });

    it('throws 404 when acceptance email does not match invitation email', async () => {
      mockTx.invitation.findUnique.mockResolvedValue({
        id: invitationId,
        organizationId: orgId,
        email: 'original@example.com',
        role: 'analyst',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.accept(targetAccountId, 'attacker@example.com', 'some-token'),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Invitation not found.',
      });
    });
  });

  describe('transferOwnership(context, membershipId, idempotencyKey)', () => {
    it('acquires row lock, updates roles atomically, and logs audit', async () => {
      mockTx.membership.update.mockResolvedValue({});

      const res = await service.transferOwnership(
        ownerContext,
        targetMembershipId,
        'idem-transfer',
      );

      expect(mockTx.$executeRaw).toHaveBeenCalled();
      expect(mockTx.membership.update).toHaveBeenCalledWith({
        where: { id: targetMembershipId },
        data: { role: 'owner' },
      });
      expect(mockTx.membership.update).toHaveBeenCalledWith({
        where: { id: ownerMembershipId },
        data: { role: 'admin' },
      });
      expect(mockAudit.append).toHaveBeenCalledWith(mockTx, {
        organizationId: orgId,
        actorAccountId: ownerAccountId,
        action: 'ownership_transferred',
        targetType: 'membership',
        targetId: targetMembershipId,
        details: { previousOwnerMembershipId: ownerMembershipId },
      });
      expect(res).toEqual({ transferred: true });
    });

    it('throws 409 conflict when transferring ownership to self', async () => {
      await expect(
        service.transferOwnership(ownerContext, ownerMembershipId),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Choose another active member.',
      });
    });

    it('throws 404 when target membership does not exist', async () => {
      await expect(
        service.transferOwnership(ownerContext, 'missing-mem-id'),
      ).rejects.toMatchObject({
        status: 404,
        message: 'Membership not found.',
      });
    });

    it('throws 403 when non-owner tries to transfer ownership', async () => {
      await expect(
        service.transferOwnership(adminContext, targetMembershipId),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('auditEvents & auditEventsPage', () => {
    it('returns formatted audit events up to limit', async () => {
      mockTx.auditEvent.findMany.mockResolvedValue([
        {
          id: 'audit-event-1',
          action: 'organization_created',
          targetType: 'organization',
          targetId: orgId,
          actorAccountId: ownerAccountId,
          createdAt: now,
        },
      ]);

      const result = await service.auditEvents(ownerContext);

      expect(mockTx.auditEvent.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 26,
      });
      expect(result).toEqual([
        {
          id: 'audit-event-1',
          action: 'organization_created',
          targetType: 'organization',
          targetId: orgId,
          actorAccountId: ownerAccountId,
          createdAt: now.toISOString(),
        },
      ]);
    });

    it('auditEventsPage handles pagination cursor afterId', async () => {
      mockTx.auditEvent.findMany.mockResolvedValue([]);

      const result = await service.auditEventsPage(
        ownerContext,
        10,
        'cursor-id',
      );

      expect(mockTx.auditEvent.findMany).toHaveBeenCalledWith({
        where: { organizationId: orgId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        skip: 1,
        cursor: { id: 'cursor-id' },
      });
      expect(result).toEqual([]);
    });

    it('auditEventsPage handles invalid cursor (P2025) with 400 cursorInvalid', async () => {
      mockTx.auditEvent.findMany.mockRejectedValue({ code: 'P2025' });

      await expect(
        service.auditEventsPage(ownerContext, 10, 'invalid-cursor'),
      ).rejects.toMatchObject({
        status: 400,
        message: 'The cursor is not valid for this connection.',
      });
    });
  });

  describe('shared organization role predicates', () => {
    describe('isOrganizationRole', () => {
      it('returns true for all ORGANIZATION_ROLES', () => {
        for (const role of ORGANIZATION_ROLES) {
          expect(isOrganizationRole(role)).toBe(true);
        }
      });

      it('returns false for invalid roles or non-strings', () => {
        expect(isOrganizationRole('superadmin')).toBe(false);
        expect(isOrganizationRole('OWNER')).toBe(false);
        expect(isOrganizationRole('')).toBe(false);
        expect(isOrganizationRole(null as unknown as string)).toBe(false);
      });
    });

    describe('isInvitationRole', () => {
      it('returns true for all INVITATION_ROLES', () => {
        for (const role of INVITATION_ROLES) {
          expect(isInvitationRole(role)).toBe(true);
        }
      });

      it('returns false for owner or invalid roles or non-strings', () => {
        expect(isInvitationRole('owner')).toBe(false);
        expect(isInvitationRole('ADMIN')).toBe(false);
        expect(isInvitationRole('')).toBe(false);
        expect(isInvitationRole(123 as unknown as string)).toBe(false);
      });
    });
  });
});
