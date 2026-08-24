import { ORGANIZATION_PERMISSIONS, OrganizationPolicy } from './permissions';
import type { OrganizationRole } from '../generated/prisma/enums';

describe('OrganizationPolicy', () => {
  const roles: OrganizationRole[] = ['owner', 'admin', 'analyst', 'viewer'];

  it('has an explicit answer for every role and permission', () => {
    for (const role of roles) {
      for (const permission of ORGANIZATION_PERMISSIONS) {
        expect(typeof OrganizationPolicy.has(role, permission)).toBe('boolean');
      }
    }
  });

  it('allows owners to do everything and viewers only read safe surfaces', () => {
    for (const permission of ORGANIZATION_PERMISSIONS) {
      expect(OrganizationPolicy.has('owner', permission)).toBe(true);
    }

    expect(OrganizationPolicy.has('viewer', 'organization.read')).toBe(true);
    expect(OrganizationPolicy.has('viewer', 'datasets.read')).toBe(true);
    expect(OrganizationPolicy.has('viewer', 'ingestion.read')).toBe(true);
    expect(OrganizationPolicy.has('viewer', 'members.read')).toBe(false);
    expect(OrganizationPolicy.has('viewer', 'ingestion.run')).toBe(false);
  });

  it('keeps owner assignment out of generic role changes', () => {
    expect(OrganizationPolicy.canAssignRole('owner', 'admin')).toBe(true);
    expect(OrganizationPolicy.canAssignRole('owner', 'owner')).toBe(false);
    expect(OrganizationPolicy.canAssignRole('admin', 'analyst')).toBe(true);
    expect(OrganizationPolicy.canAssignRole('admin', 'admin')).toBe(false);
    expect(OrganizationPolicy.canAssignRole('analyst', 'viewer')).toBe(false);
  });
});
