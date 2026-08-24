import type { Request } from 'express';
import type { OrganizationRole } from '../generated/prisma/enums';

export interface OrganizationContext {
  readonly organizationId: string;
  readonly accountId: string;
  readonly membershipId: string;
  readonly role: OrganizationRole;
  readonly statementTimeoutMs?: number;
}

export interface RequestWithOrganization extends Request {
  organizationContext?: OrganizationContext;
}
