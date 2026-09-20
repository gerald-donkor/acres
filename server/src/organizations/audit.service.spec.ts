import { Test, type TestingModule } from '@nestjs/testing';
import type { TenantTransactionClient } from '../prisma/tenant-transaction.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let mockTx: {
    auditEvent: {
      create: jest.Mock;
    };
  };

  const orgId = '018f0000-0000-7000-8000-000000000001';
  const actorId = '018f0000-0000-7000-8000-000000000002';

  beforeEach(async () => {
    mockTx = {
      auditEvent: {
        create: jest.fn().mockResolvedValue({ id: 'audit-event-1' }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  it('creates an audit event with null targetId when targetId is not provided', async () => {
    await service.append(mockTx as unknown as TenantTransactionClient, {
      organizationId: orgId,
      actorAccountId: actorId,
      action: 'organization_created',
      targetType: 'organization',
    });

    expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
      data: {
        organizationId: orgId,
        actorAccountId: actorId,
        action: 'organization_created',
        targetType: 'organization',
        targetId: null,
        details: undefined,
      },
    });
  });

  it('creates an audit event with null actorAccountId for system actions', async () => {
    await service.append(mockTx as unknown as TenantTransactionClient, {
      organizationId: orgId,
      actorAccountId: null,
      action: 'organization_created',
      targetType: 'organization',
      targetId: orgId,
    });

    expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
      data: {
        organizationId: orgId,
        actorAccountId: null,
        action: 'organization_created',
        targetType: 'organization',
        targetId: orgId,
        details: undefined,
      },
    });
  });

  describe('details sanitization by action', () => {
    it.each([
      ['organization_created'],
      ['organization_updated'],
      ['membership_revoked'],
      ['invitation_revoked'],
    ] as const)('strips all details for %s action', async (action) => {
      await service.append(mockTx as unknown as TenantTransactionClient, {
        organizationId: orgId,
        actorAccountId: actorId,
        action,
        targetType: 'target',
        targetId: 'id-1',
        details: { foo: 'bar', secret: '123' },
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          actorAccountId: actorId,
          action,
          targetType: 'target',
          targetId: 'id-1',
          details: undefined,
        },
      });
    });

    it('retains oldRole and newRole for membership_role_changed and strips others', async () => {
      await service.append(mockTx as unknown as TenantTransactionClient, {
        organizationId: orgId,
        actorAccountId: actorId,
        action: 'membership_role_changed',
        targetType: 'membership',
        targetId: 'mem-1',
        details: {
          oldRole: 'viewer',
          newRole: 'admin',
          extraToken: 'should-be-removed',
        },
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          actorAccountId: actorId,
          action: 'membership_role_changed',
          targetType: 'membership',
          targetId: 'mem-1',
          details: {
            oldRole: 'viewer',
            newRole: 'admin',
          },
        },
      });
    });

    it('retains previousOwnerMembershipId for ownership_transferred', async () => {
      await service.append(mockTx as unknown as TenantTransactionClient, {
        organizationId: orgId,
        actorAccountId: actorId,
        action: 'ownership_transferred',
        targetType: 'membership',
        targetId: 'mem-2',
        details: {
          previousOwnerMembershipId: 'mem-1',
          secretKey: 'strip-this',
        },
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          actorAccountId: actorId,
          action: 'ownership_transferred',
          targetType: 'membership',
          targetId: 'mem-2',
          details: {
            previousOwnerMembershipId: 'mem-1',
          },
        },
      });
    });

    it('retains role for invitation_issued and strips token details', async () => {
      await service.append(mockTx as unknown as TenantTransactionClient, {
        organizationId: orgId,
        actorAccountId: actorId,
        action: 'invitation_issued',
        targetType: 'invitation',
        targetId: 'inv-1',
        details: {
          role: 'analyst',
          token: 'raw-secret-token',
          tokenHash: 'sha256-hash',
        },
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          actorAccountId: actorId,
          action: 'invitation_issued',
          targetType: 'invitation',
          targetId: 'inv-1',
          details: {
            role: 'analyst',
          },
        },
      });
    });

    it('retains membershipId for invitation_accepted', async () => {
      await service.append(mockTx as unknown as TenantTransactionClient, {
        organizationId: orgId,
        actorAccountId: actorId,
        action: 'invitation_accepted',
        targetType: 'invitation',
        targetId: 'inv-1',
        details: {
          membershipId: 'mem-accepted-1',
          randomField: 'filtered',
        },
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          actorAccountId: actorId,
          action: 'invitation_accepted',
          targetType: 'invitation',
          targetId: 'inv-1',
          details: {
            membershipId: 'mem-accepted-1',
          },
        },
      });
    });

    it('retains reportId for report_published', async () => {
      await service.append(mockTx as unknown as TenantTransactionClient, {
        organizationId: orgId,
        actorAccountId: actorId,
        action: 'report_published',
        targetType: 'ReportRevision',
        targetId: 'rev-1',
        details: {
          reportId: 'rep-1',
          author: 'hidden',
        },
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          actorAccountId: actorId,
          action: 'report_published',
          targetType: 'ReportRevision',
          targetId: 'rev-1',
          details: {
            reportId: 'rep-1',
          },
        },
      });
    });

    it('retains format and reportId for export_requested', async () => {
      await service.append(mockTx as unknown as TenantTransactionClient, {
        organizationId: orgId,
        actorAccountId: actorId,
        action: 'export_requested',
        targetType: 'ExportRequest',
        targetId: 'exp-1',
        details: {
          format: 'pdf',
          reportId: 'rep-1',
          extraPayload: 'omit',
        },
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          actorAccountId: actorId,
          action: 'export_requested',
          targetType: 'ExportRequest',
          targetId: 'exp-1',
          details: {
            format: 'pdf',
            reportId: 'rep-1',
          },
        },
      });
    });

    it('returns undefined details when details input is null or undefined', async () => {
      await service.append(mockTx as unknown as TenantTransactionClient, {
        organizationId: orgId,
        actorAccountId: actorId,
        action: 'membership_role_changed',
        targetType: 'membership',
        targetId: 'mem-1',
        details: null,
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          actorAccountId: actorId,
          action: 'membership_role_changed',
          targetType: 'membership',
          targetId: 'mem-1',
          details: undefined,
        },
      });

      await service.append(mockTx as unknown as TenantTransactionClient, {
        organizationId: orgId,
        actorAccountId: actorId,
        action: 'membership_role_changed',
        targetType: 'membership',
        targetId: 'mem-1',
        details: undefined,
      });

      expect(mockTx.auditEvent.create).toHaveBeenLastCalledWith({
        data: {
          organizationId: orgId,
          actorAccountId: actorId,
          action: 'membership_role_changed',
          targetType: 'membership',
          targetId: 'mem-1',
          details: undefined,
        },
      });
    });

    it('returns undefined details when none of the allowed keys match', async () => {
      await service.append(mockTx as unknown as TenantTransactionClient, {
        organizationId: orgId,
        actorAccountId: actorId,
        action: 'membership_role_changed',
        targetType: 'membership',
        targetId: 'mem-1',
        details: {
          unrelatedKey: 'some-value',
        },
      });

      expect(mockTx.auditEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          actorAccountId: actorId,
          action: 'membership_role_changed',
          targetType: 'membership',
          targetId: 'mem-1',
          details: undefined,
        },
      });
    });
  });
});
