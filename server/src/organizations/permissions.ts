import { SetMetadata } from '@nestjs/common';
import type { OrganizationRole } from '../generated/prisma/enums';

export const ORGANIZATION_PERMISSION_KEY = Symbol('organizationPermission');

export const ORGANIZATION_PERMISSIONS = [
  'organization.read',
  'organization.update',
  'members.read',
  'members.invite',
  'members.change_role',
  'members.revoke',
  'ownership.transfer',
  'invitations.read',
  'invitations.revoke',
  'audit.read',
  'uploads.read',
  'uploads.create',
] as const;

export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

const rolePermissions = {
  owner: new Set<OrganizationPermission>(ORGANIZATION_PERMISSIONS),
  admin: new Set<OrganizationPermission>([
    'organization.read',
    'organization.update',
    'members.read',
    'members.invite',
    'members.change_role',
    'members.revoke',
    'invitations.read',
    'invitations.revoke',
    'audit.read',
    'uploads.read',
    'uploads.create',
  ]),
  analyst: new Set<OrganizationPermission>([
    'organization.read',
    'uploads.read',
    'uploads.create',
  ]),
  viewer: new Set<OrganizationPermission>([
    'organization.read',
    'uploads.read',
  ]),
} satisfies Record<OrganizationRole, ReadonlySet<OrganizationPermission>>;

export function RequiresOrganizationPermission(
  permission: OrganizationPermission,
) {
  return SetMetadata(ORGANIZATION_PERMISSION_KEY, permission);
}

export class OrganizationPolicy {
  static has(
    role: OrganizationRole,
    permission: OrganizationPermission,
  ): boolean {
    return rolePermissions[role].has(permission);
  }

  static canAssignRole(
    actorRole: OrganizationRole,
    targetRole: OrganizationRole,
  ): boolean {
    if (targetRole === 'owner') return false;
    if (actorRole === 'owner') return true;
    if (actorRole === 'admin') return targetRole !== 'admin';
    return false;
  }
}
