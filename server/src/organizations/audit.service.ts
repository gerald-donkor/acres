import { Injectable } from '@nestjs/common';
import type { AuditAction } from '../generated/prisma/enums';
import type { TenantTransactionClient } from '../prisma/tenant-transaction.service';

const allowedDetailsByAction = {
  organization_created: [],
  organization_updated: [],
  membership_role_changed: ['oldRole', 'newRole'],
  membership_revoked: [],
  ownership_transferred: ['previousOwnerMembershipId'],
  invitation_issued: ['role'],
  invitation_revoked: [],
  invitation_accepted: ['membershipId'],
} satisfies Record<AuditAction, string[]>;

@Injectable()
export class AuditService {
  async append(
    tx: TenantTransactionClient,
    input: {
      organizationId: string;
      actorAccountId: string | null;
      action: AuditAction;
      targetType: string;
      targetId?: string | null;
      details?: Record<string, string> | null;
    },
  ): Promise<void> {
    await tx.auditEvent.create({
      data: {
        organizationId: input.organizationId,
        actorAccountId: input.actorAccountId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        details: this.detailsFor(input.action, input.details),
      },
    });
  }

  private detailsFor(
    action: AuditAction,
    details: Record<string, string> | null | undefined,
  ): Record<string, string> | undefined {
    if (details === null || details === undefined) return undefined;
    const allowed = allowedDetailsByAction[action];
    const sanitized = Object.fromEntries(
      allowed
        .filter((key) => Object.hasOwn(details, key))
        .map((key) => [key, details[key]]),
    );
    return Object.keys(sanitized).length === 0 ? undefined : sanitized;
  }
}
