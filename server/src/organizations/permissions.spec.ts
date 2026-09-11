import type { OrganizationRole } from '../generated/prisma/enums';
import { OrganizationPolicy, type OrganizationPermission } from './permissions';

const administrationPermissions = [
  'organization.update',
  'members.read',
  'members.invite',
  'members.change_role',
  'members.revoke',
  'ownership.transfer',
  'invitations.read',
  'invitations.revoke',
  'audit.read',
  'jobs.read',
] as const satisfies readonly OrganizationPermission[];

const assignmentMatrix = {
  owner: ['admin', 'analyst', 'viewer'],
  admin: ['analyst', 'viewer'],
  analyst: [],
  viewer: [],
} as const satisfies Record<OrganizationRole, readonly OrganizationRole[]>;

describe('OrganizationPolicy administration permissions', () => {
  it.each([
    ['owner', administrationPermissions],
    [
      'admin',
      administrationPermissions.filter(
        (permission) => permission !== 'ownership.transfer',
      ),
    ],
    ['analyst', []],
    ['viewer', []],
  ] as const)('enforces the %s administration matrix', (role, allowed) => {
    for (const permission of administrationPermissions) {
      expect(OrganizationPolicy.has(role, permission)).toBe(
        allowed.includes(permission as never),
      );
    }
  });

  it.each(['analyst', 'viewer'] as const)(
    'keeps %s organization access read-only',
    (role) => {
      expect(OrganizationPolicy.has(role, 'organization.read')).toBe(true);
      expect(OrganizationPolicy.has(role, 'organization.update')).toBe(false);
    },
  );

  it.each(
    Object.entries(assignmentMatrix) as [
      OrganizationRole,
      readonly OrganizationRole[],
    ][],
  )('enforces the %s role-assignment matrix', (actorRole, allowed) => {
    for (const targetRole of Object.keys(
      assignmentMatrix,
    ) as OrganizationRole[]) {
      expect(OrganizationPolicy.canAssignRole(actorRole, targetRole)).toBe(
        allowed.includes(targetRole),
      );
    }
  });
});

describe('OrganizationPolicy report and export permissions', () => {
  it('allows owners and admins to publish reports', () => {
    expect(OrganizationPolicy.has('owner', 'reports.publish')).toBe(true);
    expect(OrganizationPolicy.has('admin', 'reports.publish')).toBe(true);
  });

  it('allows analysts to author and export without publishing', () => {
    expect(OrganizationPolicy.has('analyst', 'reports.create')).toBe(true);
    expect(OrganizationPolicy.has('analyst', 'reports.update')).toBe(true);
    expect(OrganizationPolicy.has('analyst', 'exports.create')).toBe(true);
    expect(OrganizationPolicy.has('analyst', 'reports.publish')).toBe(false);
  });

  it('keeps viewers read-only for published reports and completed exports', () => {
    expect(OrganizationPolicy.has('viewer', 'reports.read')).toBe(true);
    expect(OrganizationPolicy.has('viewer', 'exports.read')).toBe(true);
    expect(OrganizationPolicy.has('viewer', 'reports.create')).toBe(false);
    expect(OrganizationPolicy.has('viewer', 'exports.create')).toBe(false);
  });
});
