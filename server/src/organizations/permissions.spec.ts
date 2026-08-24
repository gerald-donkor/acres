import { OrganizationPolicy } from './permissions';

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
