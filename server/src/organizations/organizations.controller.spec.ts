import type {
  AccountProfile,
  IssuedInvitation,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationSummary,
} from '@acres/shared';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import type { OrganizationContext } from './organization-context';
import type {
  AcceptInvitationDto,
  ChangeMemberRoleDto,
  CreateOrganizationDto,
  InviteMemberDto,
  TransferOwnershipDto,
  UpdateOrganizationDto,
} from './dto';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let mockOrganizationsService: {
    list: jest.Mock;
    create: jest.Mock;
    get: jest.Mock;
    update: jest.Mock;
    members: jest.Mock;
    changeMemberRole: jest.Mock;
    revokeMember: jest.Mock;
    transferOwnership: jest.Mock;
    invitations: jest.Mock;
    invite: jest.Mock;
    revokeInvitation: jest.Mock;
    accept: jest.Mock;
  };

  const mockAccount: AccountProfile = {
    id: '018f0000-0000-7000-8000-000000000001',
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    createdAt: '2026-08-20T00:00:00.000Z',
  };

  const mockOrgContext: OrganizationContext = {
    organizationId: '018f0000-0000-7000-8000-000000000010',
    accountId: mockAccount.id,
    membershipId: '018f0000-0000-7000-8000-000000000020',
    role: 'owner',
    statementTimeoutMs: 5000,
  };

  const mockOrgSummary: OrganizationSummary = {
    id: '018f0000-0000-7000-8000-000000000010',
    name: 'Acme Corp',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    membership: {
      id: '018f0000-0000-7000-8000-000000000020',
      role: 'owner',
    },
  };

  const mockMember: OrganizationMember = {
    id: '018f0000-0000-7000-8000-000000000021',
    accountId: '018f0000-0000-7000-8000-000000000002',
    email: 'teammate@example.com',
    displayName: 'Grace Hopper',
    role: 'analyst',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    revokedAt: null,
  };

  const mockInvitation: OrganizationInvitation = {
    id: '018f0000-0000-7000-8000-000000000030',
    organizationId: mockOrgContext.organizationId,
    email: 'invitee@example.com',
    role: 'viewer',
    invitedByAccountId: mockAccount.id,
    expiresAt: '2026-08-27T00:00:00.000Z',
    createdAt: '2026-08-20T00:00:00.000Z',
    acceptedAt: null,
    revokedAt: null,
  };

  const mockIssuedInvitation: IssuedInvitation = {
    ...mockInvitation,
    token: 'raw_invitation_token_12345678901234567890',
  };

  beforeEach(() => {
    mockOrganizationsService = {
      list: jest.fn(),
      create: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      members: jest.fn(),
      changeMemberRole: jest.fn(),
      revokeMember: jest.fn(),
      transferOwnership: jest.fn(),
      invitations: jest.fn(),
      invite: jest.fn(),
      revokeInvitation: jest.fn(),
      accept: jest.fn(),
    };

    controller = new OrganizationsController(
      mockOrganizationsService as unknown as OrganizationsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('calls organizations.list(account.id) and returns array of summaries', async () => {
      mockOrganizationsService.list.mockResolvedValue([mockOrgSummary]);

      const result = await controller.list(mockAccount);

      expect(mockOrganizationsService.list).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.list).toHaveBeenCalledWith(
        mockAccount.id,
      );
      expect(result).toEqual([mockOrgSummary]);
    });

    it('propagates errors thrown by organizations.list', async () => {
      mockOrganizationsService.list.mockRejectedValue(new Error('list failed'));

      await expect(controller.list(mockAccount)).rejects.toThrow('list failed');
    });
  });

  describe('create', () => {
    const body: CreateOrganizationDto = { name: 'Acme Corp' };

    it('calls organizations.create(account.id, body.name, idempotencyKey) and returns summary', async () => {
      const idempotencyKey = 'idem-create-key';
      mockOrganizationsService.create.mockResolvedValue(mockOrgSummary);

      const result = await controller.create(mockAccount, body, idempotencyKey);

      expect(mockOrganizationsService.create).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.create).toHaveBeenCalledWith(
        mockAccount.id,
        body.name,
        idempotencyKey,
      );
      expect(result).toEqual(mockOrgSummary);
    });

    it('handles omitted idempotency key', async () => {
      mockOrganizationsService.create.mockResolvedValue(mockOrgSummary);

      const result = await controller.create(mockAccount, body);

      expect(mockOrganizationsService.create).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.create).toHaveBeenCalledWith(
        mockAccount.id,
        body.name,
        undefined,
      );
      expect(result).toEqual(mockOrgSummary);
    });

    it('propagates errors thrown by organizations.create', async () => {
      mockOrganizationsService.create.mockRejectedValue(
        new Error('create failed'),
      );

      await expect(controller.create(mockAccount, body)).rejects.toThrow(
        'create failed',
      );
    });
  });

  describe('get', () => {
    it('calls organizations.get(organization) and returns summary', async () => {
      mockOrganizationsService.get.mockResolvedValue(mockOrgSummary);

      const result = await controller.get(mockOrgContext);

      expect(mockOrganizationsService.get).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.get).toHaveBeenCalledWith(mockOrgContext);
      expect(result).toEqual(mockOrgSummary);
    });

    it('propagates errors thrown by organizations.get', async () => {
      mockOrganizationsService.get.mockRejectedValue(
        new Error('organization not found'),
      );

      await expect(controller.get(mockOrgContext)).rejects.toThrow(
        'organization not found',
      );
    });
  });

  describe('update', () => {
    const body: UpdateOrganizationDto = { name: 'Acme Worldwide' };

    it('calls organizations.update(organization, body.name) and returns summary', async () => {
      const updatedSummary: OrganizationSummary = {
        ...mockOrgSummary,
        name: body.name,
      };
      mockOrganizationsService.update.mockResolvedValue(updatedSummary);

      const result = await controller.update(mockOrgContext, body);

      expect(mockOrganizationsService.update).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.update).toHaveBeenCalledWith(
        mockOrgContext,
        body.name,
      );
      expect(result).toEqual(updatedSummary);
    });

    it('propagates errors thrown by organizations.update', async () => {
      mockOrganizationsService.update.mockRejectedValue(
        new Error('update failed'),
      );

      await expect(controller.update(mockOrgContext, body)).rejects.toThrow(
        'update failed',
      );
    });
  });

  describe('members', () => {
    it('calls organizations.members(organization) and returns members', async () => {
      mockOrganizationsService.members.mockResolvedValue([mockMember]);

      const result = await controller.members(mockOrgContext);

      expect(mockOrganizationsService.members).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.members).toHaveBeenCalledWith(
        mockOrgContext,
      );
      expect(result).toEqual([mockMember]);
    });

    it('propagates errors thrown by organizations.members', async () => {
      mockOrganizationsService.members.mockRejectedValue(
        new Error('members error'),
      );

      await expect(controller.members(mockOrgContext)).rejects.toThrow(
        'members error',
      );
    });
  });

  describe('changeMemberRole', () => {
    const membershipId = '018f0000-0000-7000-8000-000000000021';
    const body: ChangeMemberRoleDto = { role: 'admin' };

    it('calls organizations.changeMemberRole(organization, membershipId, body.role) and returns updated member', async () => {
      const updatedMember: OrganizationMember = {
        ...mockMember,
        role: 'admin',
      };
      mockOrganizationsService.changeMemberRole.mockResolvedValue(
        updatedMember,
      );

      const result = await controller.changeMemberRole(
        mockOrgContext,
        membershipId,
        body,
      );

      expect(mockOrganizationsService.changeMemberRole).toHaveBeenCalledTimes(
        1,
      );
      expect(mockOrganizationsService.changeMemberRole).toHaveBeenCalledWith(
        mockOrgContext,
        membershipId,
        body.role,
      );
      expect(result).toEqual(updatedMember);
    });

    it('propagates errors thrown by organizations.changeMemberRole', async () => {
      mockOrganizationsService.changeMemberRole.mockRejectedValue(
        new Error('cannot change role'),
      );

      await expect(
        controller.changeMemberRole(mockOrgContext, membershipId, body),
      ).rejects.toThrow('cannot change role');
    });
  });

  describe('revokeMember', () => {
    const membershipId = '018f0000-0000-7000-8000-000000000021';

    it('calls organizations.revokeMember(organization, membershipId) and returns { revoked: true }', async () => {
      mockOrganizationsService.revokeMember.mockResolvedValue({
        revoked: true,
      });

      const result = await controller.revokeMember(
        mockOrgContext,
        membershipId,
      );

      expect(mockOrganizationsService.revokeMember).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.revokeMember).toHaveBeenCalledWith(
        mockOrgContext,
        membershipId,
      );
      expect(result).toEqual({ revoked: true });
    });

    it('propagates errors thrown by organizations.revokeMember', async () => {
      mockOrganizationsService.revokeMember.mockRejectedValue(
        new Error('cannot revoke owner'),
      );

      await expect(
        controller.revokeMember(mockOrgContext, membershipId),
      ).rejects.toThrow('cannot revoke owner');
    });
  });

  describe('transferOwnership', () => {
    const body: TransferOwnershipDto = {
      membershipId: '018f0000-0000-7000-8000-000000000021',
    };

    it('calls organizations.transferOwnership(organization, body.membershipId, idempotencyKey) and returns { transferred: true }', async () => {
      const idempotencyKey = 'idem-transfer-key';
      mockOrganizationsService.transferOwnership.mockResolvedValue({
        transferred: true,
      });

      const result = await controller.transferOwnership(
        mockOrgContext,
        body,
        idempotencyKey,
      );

      expect(mockOrganizationsService.transferOwnership).toHaveBeenCalledTimes(
        1,
      );
      expect(mockOrganizationsService.transferOwnership).toHaveBeenCalledWith(
        mockOrgContext,
        body.membershipId,
        idempotencyKey,
      );
      expect(result).toEqual({ transferred: true });
    });

    it('handles omitted idempotency key', async () => {
      mockOrganizationsService.transferOwnership.mockResolvedValue({
        transferred: true,
      });

      const result = await controller.transferOwnership(mockOrgContext, body);

      expect(mockOrganizationsService.transferOwnership).toHaveBeenCalledTimes(
        1,
      );
      expect(mockOrganizationsService.transferOwnership).toHaveBeenCalledWith(
        mockOrgContext,
        body.membershipId,
        undefined,
      );
      expect(result).toEqual({ transferred: true });
    });

    it('propagates errors thrown by organizations.transferOwnership', async () => {
      mockOrganizationsService.transferOwnership.mockRejectedValue(
        new Error('cannot transfer to self'),
      );

      await expect(
        controller.transferOwnership(mockOrgContext, body),
      ).rejects.toThrow('cannot transfer to self');
    });
  });

  describe('invitations', () => {
    it('calls organizations.invitations(organization) and returns invitations', async () => {
      mockOrganizationsService.invitations.mockResolvedValue([mockInvitation]);

      const result = await controller.invitations(mockOrgContext);

      expect(mockOrganizationsService.invitations).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.invitations).toHaveBeenCalledWith(
        mockOrgContext,
      );
      expect(result).toEqual([mockInvitation]);
    });

    it('propagates errors thrown by organizations.invitations', async () => {
      mockOrganizationsService.invitations.mockRejectedValue(
        new Error('invitations error'),
      );

      await expect(controller.invitations(mockOrgContext)).rejects.toThrow(
        'invitations error',
      );
    });
  });

  describe('invite', () => {
    const body: InviteMemberDto = {
      email: 'invitee@example.com',
      role: 'viewer',
    };

    it('calls organizations.invite(organization, body.email, body.role, idempotencyKey) and returns issued invitation', async () => {
      const idempotencyKey = 'idem-invite-key';
      mockOrganizationsService.invite.mockResolvedValue(mockIssuedInvitation);

      const result = await controller.invite(
        mockOrgContext,
        body,
        idempotencyKey,
      );

      expect(mockOrganizationsService.invite).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.invite).toHaveBeenCalledWith(
        mockOrgContext,
        body.email,
        body.role,
        idempotencyKey,
      );
      expect(result).toEqual(mockIssuedInvitation);
    });

    it('handles omitted idempotency key', async () => {
      mockOrganizationsService.invite.mockResolvedValue(mockIssuedInvitation);

      const result = await controller.invite(mockOrgContext, body);

      expect(mockOrganizationsService.invite).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.invite).toHaveBeenCalledWith(
        mockOrgContext,
        body.email,
        body.role,
        undefined,
      );
      expect(result).toEqual(mockIssuedInvitation);
    });

    it('propagates errors thrown by organizations.invite', async () => {
      mockOrganizationsService.invite.mockRejectedValue(
        new Error('live invitation already exists'),
      );

      await expect(controller.invite(mockOrgContext, body)).rejects.toThrow(
        'live invitation already exists',
      );
    });
  });

  describe('revokeInvitation', () => {
    const invitationId = '018f0000-0000-7000-8000-000000000030';

    it('calls organizations.revokeInvitation(organization, invitationId) and returns { revoked: true }', async () => {
      mockOrganizationsService.revokeInvitation.mockResolvedValue({
        revoked: true,
      });

      const result = await controller.revokeInvitation(
        mockOrgContext,
        invitationId,
      );

      expect(mockOrganizationsService.revokeInvitation).toHaveBeenCalledTimes(
        1,
      );
      expect(mockOrganizationsService.revokeInvitation).toHaveBeenCalledWith(
        mockOrgContext,
        invitationId,
      );
      expect(result).toEqual({ revoked: true });
    });

    it('propagates errors thrown by organizations.revokeInvitation', async () => {
      mockOrganizationsService.revokeInvitation.mockRejectedValue(
        new Error('invitation not found'),
      );

      await expect(
        controller.revokeInvitation(mockOrgContext, invitationId),
      ).rejects.toThrow('invitation not found');
    });
  });

  describe('acceptInvitation', () => {
    const body: AcceptInvitationDto = {
      token: 'raw_invitation_token_12345678901234567890',
    };
    const acceptResponse = {
      organizationId: '018f0000-0000-7000-8000-000000000010',
      membershipId: '018f0000-0000-7000-8000-000000000020',
    };

    it('calls organizations.accept(account.id, account.email, body.token, idempotencyKey) and returns { organizationId, membershipId }', async () => {
      const idempotencyKey = 'idem-accept-key';
      mockOrganizationsService.accept.mockResolvedValue(acceptResponse);

      const result = await controller.acceptInvitation(
        mockAccount,
        body,
        idempotencyKey,
      );

      expect(mockOrganizationsService.accept).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.accept).toHaveBeenCalledWith(
        mockAccount.id,
        mockAccount.email,
        body.token,
        idempotencyKey,
      );
      expect(result).toEqual(acceptResponse);
    });

    it('handles omitted idempotency key', async () => {
      mockOrganizationsService.accept.mockResolvedValue(acceptResponse);

      const result = await controller.acceptInvitation(mockAccount, body);

      expect(mockOrganizationsService.accept).toHaveBeenCalledTimes(1);
      expect(mockOrganizationsService.accept).toHaveBeenCalledWith(
        mockAccount.id,
        mockAccount.email,
        body.token,
        undefined,
      );
      expect(result).toEqual(acceptResponse);
    });

    it('propagates errors thrown by organizations.accept', async () => {
      mockOrganizationsService.accept.mockRejectedValue(
        new Error('invalid token'),
      );

      await expect(
        controller.acceptInvitation(mockAccount, body),
      ).rejects.toThrow('invalid token');
    });
  });
});
