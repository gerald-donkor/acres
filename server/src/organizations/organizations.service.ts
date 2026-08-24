import { Injectable, Logger } from '@nestjs/common';
import type {
  IssuedInvitation,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationSummary,
} from '@acres/shared';
import type { OrganizationRole } from '../generated/prisma/enums';
import { ApiException } from '../common/api-exception';
import { uuidV7 } from '../common/ids';
import { hashToken, issueRawToken } from '../common/tokens';
import { AcresConfigService } from '../config/acres-config.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import {
  TenantTransactionService,
  type TenantTransactionClient,
} from '../prisma/tenant-transaction.service';
import { OrganizationPolicy, type OrganizationPermission } from './permissions';
import type { OrganizationContext } from './organization-context';
import { AuditService } from './audit.service';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly tenants: TenantTransactionService,
    private readonly audit: AuditService,
    private readonly config: AcresConfigService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private ensureEnabled(): void {
    if (!this.config.tenancyEnabled) {
      throw ApiException.notReady();
    }
  }

  async list(accountId: string): Promise<OrganizationSummary[]> {
    this.ensureEnabled();
    return this.tenants.accountScoped(accountId, async (tx) => {
      const memberships = await tx.membership.findMany({
        where: { accountId, revokedAt: null },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      });
      return memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        createdAt: membership.organization.createdAt.toISOString(),
        updatedAt: membership.organization.updatedAt.toISOString(),
        membership: { id: membership.id, role: membership.role },
      }));
    });
  }

  async create(
    accountId: string,
    name: string,
    idempotencyKey?: string,
  ): Promise<OrganizationSummary> {
    this.ensureEnabled();
    return this.tenants.accountScoped(accountId, async (tx) => {
      return this.idempotency.run(
        tx,
        {
          key: idempotencyKey,
          accountId,
          organizationId: null,
          operation: 'organizations.create',
          requestBody: { name },
          responseStatus: 201,
        },
        async () => {
          const organizationId = uuidV7();
          await tx.$executeRaw`
            SELECT set_config('acres.organization_id', ${organizationId}, true)
          `;
          const organization = await tx.organization.create({
            data: { id: organizationId, name },
          });
          const membership = await tx.membership.create({
            data: { organizationId: organization.id, accountId, role: 'owner' },
          });
          await this.audit.append(tx, {
            organizationId: organization.id,
            actorAccountId: accountId,
            action: 'organization_created',
            targetType: 'organization',
            targetId: organization.id,
          });
          return {
            id: organization.id,
            name: organization.name,
            createdAt: organization.createdAt.toISOString(),
            updatedAt: organization.updatedAt.toISOString(),
            membership: { id: membership.id, role: membership.role },
          };
        },
      );
    });
  }

  async get(context: OrganizationContext): Promise<OrganizationSummary> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        const actor = await this.requirePermission(
          tx,
          context,
          'organization.read',
        );
        const organization = await tx.organization.findUnique({
          where: { id: context.organizationId },
        });
        if (organization === null)
          throw ApiException.notFound('Organization not found.');
        return {
          id: organization.id,
          name: organization.name,
          createdAt: organization.createdAt.toISOString(),
          updatedAt: organization.updatedAt.toISOString(),
          membership: { id: actor.id, role: actor.role },
        };
      },
      { statementTimeoutMs: context.statementTimeoutMs },
    );
  }

  async update(
    context: OrganizationContext,
    name: string,
  ): Promise<OrganizationSummary> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        const actor = await this.requirePermission(
          tx,
          context,
          'organization.update',
        );
        const organization = await tx.organization.update({
          where: { id: context.organizationId },
          data: { name },
        });
        await this.audit.append(tx, {
          organizationId: context.organizationId,
          actorAccountId: context.accountId,
          action: 'organization_updated',
          targetType: 'organization',
          targetId: context.organizationId,
        });
        return {
          id: organization.id,
          name: organization.name,
          createdAt: organization.createdAt.toISOString(),
          updatedAt: organization.updatedAt.toISOString(),
          membership: { id: actor.id, role: actor.role },
        };
      },
    );
  }

  async members(context: OrganizationContext): Promise<OrganizationMember[]> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        await this.requirePermission(tx, context, 'members.read');
        const rows = await tx.membership.findMany({
          where: { organizationId: context.organizationId },
          include: { account: true },
          orderBy: { createdAt: 'asc' },
        });
        return rows.map((row) => ({
          id: row.id,
          accountId: row.accountId,
          email: row.account.email,
          displayName: row.account.displayName,
          role: row.role,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          revokedAt: row.revokedAt?.toISOString() ?? null,
        }));
      },
      { statementTimeoutMs: context.statementTimeoutMs },
    );
  }

  async membersPage(
    context: OrganizationContext,
    take: number,
    afterId?: string,
  ): Promise<OrganizationMember[]> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        await this.requirePermission(tx, context, 'members.read');
        const rows = await tx.membership
          .findMany({
            where: { organizationId: context.organizationId },
            include: { account: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
            take,
          })
          .catch((error: unknown) => {
            if (isMissingCursor(error)) throw ApiException.cursorInvalid();
            throw error;
          });
        return rows.map((row) => ({
          id: row.id,
          accountId: row.accountId,
          email: row.account.email,
          displayName: row.account.displayName,
          role: row.role,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
          revokedAt: row.revokedAt?.toISOString() ?? null,
        }));
      },
      { statementTimeoutMs: context.statementTimeoutMs },
    );
  }

  async changeMemberRole(
    context: OrganizationContext,
    membershipId: string,
    role: Exclude<OrganizationRole, 'owner'>,
  ): Promise<OrganizationMember> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        const actor = await this.requirePermission(
          tx,
          context,
          'members.change_role',
        );
        if (!OrganizationPolicy.canAssignRole(actor.role, role)) {
          throw ApiException.forbidden();
        }
        const target = await this.activeMembership(tx, context, membershipId);
        if (target.role === 'owner' || target.accountId === actor.accountId) {
          throw ApiException.conflict(
            'That membership cannot be changed here.',
          );
        }
        const updated = await tx.membership.update({
          where: { id: membershipId },
          data: { role },
          include: { account: true },
        });
        await this.audit.append(tx, {
          organizationId: context.organizationId,
          actorAccountId: context.accountId,
          action: 'membership_role_changed',
          targetType: 'membership',
          targetId: membershipId,
          details: { oldRole: target.role, newRole: role },
        });
        return this.memberDto(updated);
      },
    );
  }

  async revokeMember(
    context: OrganizationContext,
    membershipId: string,
  ): Promise<{ revoked: true }> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        await this.requirePermission(tx, context, 'members.revoke');
        const target = await this.activeMembership(tx, context, membershipId);
        if (target.role === 'owner') {
          throw ApiException.conflict(
            'Owners can only leave through ownership transfer.',
          );
        }
        await tx.membership.update({
          where: { id: membershipId },
          data: { revokedAt: new Date() },
        });
        await this.audit.append(tx, {
          organizationId: context.organizationId,
          actorAccountId: context.accountId,
          action: 'membership_revoked',
          targetType: 'membership',
          targetId: membershipId,
        });
        return { revoked: true };
      },
    );
  }

  async transferOwnership(
    context: OrganizationContext,
    membershipId: string,
    idempotencyKey?: string,
  ): Promise<{ transferred: true }> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        return this.idempotency.run(
          tx,
          {
            key: idempotencyKey,
            accountId: context.accountId,
            organizationId: context.organizationId,
            operation: 'organizations.transferOwnership',
            requestBody: { membershipId },
            responseStatus: 200,
          },
          async () => {
            const actor = await this.requirePermission(
              tx,
              context,
              'ownership.transfer',
            );
            const target = await this.activeMembership(
              tx,
              context,
              membershipId,
            );
            if (target.accountId === actor.accountId) {
              throw ApiException.conflict('Choose another active member.');
            }
            await tx.$executeRaw`SELECT 1 FROM "Organization" WHERE id = ${context.organizationId} FOR UPDATE`;
            await tx.membership.update({
              where: { id: membershipId },
              data: { role: 'owner' },
            });
            await tx.membership.update({
              where: { id: context.membershipId },
              data: { role: 'admin' },
            });
            await this.audit.append(tx, {
              organizationId: context.organizationId,
              actorAccountId: context.accountId,
              action: 'ownership_transferred',
              targetType: 'membership',
              targetId: membershipId,
              details: { previousOwnerMembershipId: context.membershipId },
            });
            return { transferred: true };
          },
        );
      },
    );
  }

  async invitations(
    context: OrganizationContext,
  ): Promise<OrganizationInvitation[]> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        await this.requirePermission(tx, context, 'invitations.read');
        const rows = await tx.invitation.findMany({
          where: { organizationId: context.organizationId },
          orderBy: { createdAt: 'desc' },
        });
        return rows.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          email: row.email,
          role: row.role as Exclude<OrganizationRole, 'owner'>,
          invitedByAccountId: row.invitedByAccountId,
          expiresAt: row.expiresAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
          acceptedAt: row.acceptedAt?.toISOString() ?? null,
          revokedAt: row.revokedAt?.toISOString() ?? null,
        }));
      },
      { statementTimeoutMs: context.statementTimeoutMs },
    );
  }

  async invitationsPage(
    context: OrganizationContext,
    take: number,
    afterId?: string,
  ): Promise<OrganizationInvitation[]> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        await this.requirePermission(tx, context, 'invitations.read');
        const rows = await tx.invitation
          .findMany({
            where: { organizationId: context.organizationId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
            take,
          })
          .catch((error: unknown) => {
            if (isMissingCursor(error)) throw ApiException.cursorInvalid();
            throw error;
          });
        return rows.map((row) => ({
          id: row.id,
          organizationId: row.organizationId,
          email: row.email,
          role: row.role as Exclude<OrganizationRole, 'owner'>,
          invitedByAccountId: row.invitedByAccountId,
          expiresAt: row.expiresAt.toISOString(),
          createdAt: row.createdAt.toISOString(),
          acceptedAt: row.acceptedAt?.toISOString() ?? null,
          revokedAt: row.revokedAt?.toISOString() ?? null,
        }));
      },
      { statementTimeoutMs: context.statementTimeoutMs },
    );
  }

  async auditEvents(context: OrganizationContext): Promise<
    Array<{
      id: string;
      action: string;
      targetType: string;
      targetId: string | null;
      actorAccountId: string | null;
      createdAt: string;
    }>
  > {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        await this.requirePermission(tx, context, 'audit.read');
        const rows = await tx.auditEvent.findMany({
          where: { organizationId: context.organizationId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: this.config.graphqlMaxFirst + 1,
        });
        return rows.map((row) => ({
          id: row.id,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          actorAccountId: row.actorAccountId,
          createdAt: row.createdAt.toISOString(),
        }));
      },
      { statementTimeoutMs: context.statementTimeoutMs },
    );
  }

  async auditEventsPage(
    context: OrganizationContext,
    take: number,
    afterId?: string,
  ): Promise<
    Array<{
      id: string;
      action: string;
      targetType: string;
      targetId: string | null;
      actorAccountId: string | null;
      createdAt: string;
    }>
  > {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        await this.requirePermission(tx, context, 'audit.read');
        const rows = await tx.auditEvent
          .findMany({
            where: { organizationId: context.organizationId },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
            take,
          })
          .catch((error: unknown) => {
            if (isMissingCursor(error)) throw ApiException.cursorInvalid();
            throw error;
          });
        return rows.map((row) => ({
          id: row.id,
          action: row.action,
          targetType: row.targetType,
          targetId: row.targetId,
          actorAccountId: row.actorAccountId,
          createdAt: row.createdAt.toISOString(),
        }));
      },
      { statementTimeoutMs: context.statementTimeoutMs },
    );
  }

  async invite(
    context: OrganizationContext,
    email: string,
    role: Exclude<OrganizationRole, 'owner'>,
    idempotencyKey?: string,
  ): Promise<IssuedInvitation> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        return this.idempotency.run(
          tx,
          {
            key: idempotencyKey,
            accountId: context.accountId,
            organizationId: context.organizationId,
            operation: 'organizations.invite',
            requestBody: { email, role },
            responseStatus: 201,
          },
          async () => {
            const token = issueRawToken();
            const tokenHash = hashToken(token);
            const expiresAt = new Date(
              Date.now() + this.config.invitationTtlHours * 60 * 60 * 1000,
            );
            const actor = await this.requirePermission(
              tx,
              context,
              'members.invite',
            );
            if (!OrganizationPolicy.canAssignRole(actor.role, role)) {
              throw ApiException.forbidden();
            }
            await tx.invitation.updateMany({
              where: {
                organizationId: context.organizationId,
                email,
                acceptedAt: null,
                revokedAt: null,
                expiresAt: { lte: new Date() },
              },
              data: { revokedAt: new Date() },
            });
            const row = await tx.invitation
              .create({
                data: {
                  organizationId: context.organizationId,
                  email,
                  role,
                  tokenHash,
                  invitedByAccountId: context.accountId,
                  expiresAt,
                },
              })
              .catch((error: unknown) => {
                if (isUniqueConflict(error)) {
                  throw ApiException.conflict(
                    'A live invitation already exists.',
                  );
                }
                throw error;
              });
            await this.audit.append(tx, {
              organizationId: context.organizationId,
              actorAccountId: context.accountId,
              action: 'invitation_issued',
              targetType: 'invitation',
              targetId: row.id,
              details: { role },
            });
            this.logger.log('Invitation issued');
            return { ...this.invitationDto(row), token };
          },
        );
      },
    );
  }

  async revokeInvitation(
    context: OrganizationContext,
    invitationId: string,
  ): Promise<{ revoked: true }> {
    this.ensureEnabled();
    return this.tenants.organizationScoped(
      context.accountId,
      context.organizationId,
      async (tx) => {
        await this.requirePermission(tx, context, 'invitations.revoke');
        const row = await tx.invitation.findFirst({
          where: { id: invitationId, organizationId: context.organizationId },
        });
        if (row === null) throw ApiException.notFound('Invitation not found.');
        if (row.acceptedAt !== null) {
          throw ApiException.conflict(
            'Accepted invitations cannot be revoked.',
          );
        }
        if (row.revokedAt === null) {
          await tx.invitation.update({
            where: { id: invitationId },
            data: { revokedAt: new Date() },
          });
          await this.audit.append(tx, {
            organizationId: context.organizationId,
            actorAccountId: context.accountId,
            action: 'invitation_revoked',
            targetType: 'invitation',
            targetId: invitationId,
          });
        }
        return { revoked: true };
      },
    );
  }

  async accept(
    accountId: string,
    accountEmail: string,
    token: string,
    idempotencyKey?: string,
  ) {
    this.ensureEnabled();
    const tokenHash = hashToken(token);
    const now = new Date();
    return this.tenants.invitationScoped(accountId, tokenHash, async (tx) => {
      return this.idempotency.run(
        tx,
        {
          key: idempotencyKey,
          accountId,
          organizationId: null,
          operation: 'invitations.accept',
          requestBody: { tokenHash },
          responseStatus: 200,
        },
        async () => {
          const invitation = await tx.invitation.findUnique({
            where: { tokenHash },
          });
          if (
            invitation === null ||
            invitation.acceptedAt !== null ||
            invitation.revokedAt !== null ||
            invitation.expiresAt.getTime() <= now.getTime() ||
            invitation.email !== accountEmail.toLowerCase()
          ) {
            throw ApiException.notFound('Invitation not found.');
          }
          await tx.$executeRaw`
            SELECT set_config('acres.organization_id', ${invitation.organizationId}, true)
          `;
          const accepted = await tx.invitation.updateMany({
            where: {
              id: invitation.id,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: now },
            },
            data: { acceptedAt: now, acceptedByAccountId: accountId },
          });
          if (accepted.count !== 1) {
            throw ApiException.notFound('Invitation not found.');
          }
          const existing = await tx.membership.findUnique({
            where: {
              organizationId_accountId: {
                organizationId: invitation.organizationId,
                accountId,
              },
            },
          });
          if (existing?.revokedAt === null) {
            throw ApiException.conflict(
              'The account is already an active member.',
            );
          }
          const membership =
            existing === null
              ? await tx.membership.create({
                  data: {
                    organizationId: invitation.organizationId,
                    accountId,
                    role: invitation.role,
                  },
                })
              : await tx.membership.update({
                  where: { id: existing.id },
                  data: { role: invitation.role, revokedAt: null },
                });
          await this.audit.append(tx, {
            organizationId: invitation.organizationId,
            actorAccountId: accountId,
            action: 'invitation_accepted',
            targetType: 'invitation',
            targetId: invitation.id,
            details: { membershipId: membership.id },
          });
          return {
            organizationId: invitation.organizationId,
            membershipId: membership.id,
          };
        },
      );
    });
  }

  private async activeMembership(
    tx: TenantTransactionClient,
    context: OrganizationContext,
    membershipId: string,
  ) {
    const membership = await tx.membership.findFirst({
      where: {
        id: membershipId,
        organizationId: context.organizationId,
        revokedAt: null,
      },
      include: { account: true },
    });
    if (membership === null)
      throw ApiException.notFound('Membership not found.');
    return membership;
  }

  private async requirePermission(
    tx: TenantTransactionClient,
    context: OrganizationContext,
    permission: OrganizationPermission,
  ) {
    const membership = await tx.membership.findFirst({
      where: {
        id: context.membershipId,
        organizationId: context.organizationId,
        accountId: context.accountId,
        revokedAt: null,
      },
    });
    if (membership === null) {
      throw ApiException.notFound('Organization not found.');
    }
    if (!OrganizationPolicy.has(membership.role, permission)) {
      this.logger.warn(`Permission denied inside transaction: ${permission}`);
      throw ApiException.forbidden();
    }
    return membership;
  }

  private memberDto(row: {
    id: string;
    accountId: string;
    role: OrganizationRole;
    createdAt: Date;
    updatedAt: Date;
    revokedAt: Date | null;
    account: { email: string; displayName: string | null };
  }): OrganizationMember {
    return {
      id: row.id,
      accountId: row.accountId,
      email: row.account.email,
      displayName: row.account.displayName,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    };
  }

  private invitationDto(row: {
    id: string;
    organizationId: string;
    email: string;
    role: OrganizationRole;
    invitedByAccountId: string;
    expiresAt: Date;
    createdAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
  }): OrganizationInvitation {
    return {
      id: row.id,
      organizationId: row.organizationId,
      email: row.email,
      role: row.role as Exclude<OrganizationRole, 'owner'>,
      invitedByAccountId: row.invitedByAccountId,
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
    };
  }
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function isMissingCursor(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2025'
  );
}
