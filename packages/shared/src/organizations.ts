export const ORGANIZATION_ROLES = [
  "owner",
  "admin",
  "analyst",
  "viewer",
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export function isOrganizationRole(role: string): role is OrganizationRole {
  return (ORGANIZATION_ROLES as readonly string[]).includes(role);
}

export const INVITATION_ROLES = [
  "admin",
  "analyst",
  "viewer",
] as const;

export type InvitationRole = (typeof INVITATION_ROLES)[number];

export function isInvitationRole(role: string): role is InvitationRole {
  return (INVITATION_ROLES as readonly string[]).includes(role);
}

export const ORGANIZATION_HEADER_NAME = "x-acres-organization-id" as const;
export type OrganizationHeaderName = typeof ORGANIZATION_HEADER_NAME;

export const ORGANIZATION_PERMISSIONS = [
  "organization.read",
  "organization.update",
  "members.read",
  "members.invite",
  "members.change_role",
  "members.revoke",
  "ownership.transfer",
  "invitations.read",
  "invitations.revoke",
  "audit.read",
  "uploads.read",
  "uploads.create",
  "datasets.read",
  "datasets.create",
  "datasets.update",
  "ingestion.read",
  "ingestion.run",
  "ingestion.cancel",
  "analytics.read",
  "dashboards.manage",
  "reports.read",
  "reports.create",
  "reports.update",
  "reports.publish",
  "exports.create",
  "exports.read",
  "jobs.read",
] as const;

export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

export const AUDIT_ACTIONS = [
  "organization_created",
  "organization_updated",
  "invitation_issued",
  "invitation_revoked",
  "invitation_accepted",
  "membership_role_changed",
  "membership_revoked",
  "ownership_transferred",
  "report_published",
  "export_requested",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

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
  role: InvitationRole;
  invitedByAccountId: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export interface OrganizationAuditEvent {
  id: string;
  action: AuditAction;
  targetType: string;
  targetId: string | null;
  actorAccountId: string | null;
  createdAt: string;
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
  role: InvitationRole;
}

export interface ChangeMemberRoleInput {
  role: InvitationRole;
}

export interface TransferOwnershipInput {
  membershipId: string;
}

export interface AcceptInvitationInput {
  token: string;
}

export interface AcceptInvitationResult {
  organizationId: string;
  membershipId: string;
}
