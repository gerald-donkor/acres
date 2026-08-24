export const ORGANIZATION_ROLES = [
  'owner',
  'admin',
  'analyst',
  'viewer',
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export interface OrganizationSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  membership: {
    id: string;
    role: OrganizationRole;
  };
}

export interface OrganizationMember {
  id: string;
  accountId: string;
  email: string;
  displayName: string | null;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: Exclude<OrganizationRole, 'owner'>;
  invitedByAccountId: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface IssuedInvitation extends OrganizationInvitation {
  token: string;
}

export interface CreateOrganizationInput {
  name: string;
}

export interface UpdateOrganizationInput {
  name: string;
}

export interface InviteMemberInput {
  email: string;
  role: Exclude<OrganizationRole, 'owner'>;
}

export interface ChangeMemberRoleInput {
  role: Exclude<OrganizationRole, 'owner'>;
}

export interface TransferOwnershipInput {
  membershipId: string;
}

export interface AcceptInvitationInput {
  token: string;
}
