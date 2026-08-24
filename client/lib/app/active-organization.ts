export const ACTIVE_ORGANIZATION_COOKIE = "acres_active_organization";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function cookieValue(id: string): string {
  return encodeURIComponent(id);
}

export function activeOrganizationCookie(id: string): string {
  return `${ACTIVE_ORGANIZATION_COOKIE}=${cookieValue(id)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

export function clearedActiveOrganizationCookie(): string {
  return `${ACTIVE_ORGANIZATION_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

export function persistActiveOrganization(id: string): void {
  document.cookie = activeOrganizationCookie(id);
}

export function clearActiveOrganization(): void {
  document.cookie = clearedActiveOrganizationCookie();
}

export function selectActiveOrganizationId<TOrganization extends { id: string }>(
  organizations: TOrganization[],
  preferredId: string | undefined,
): string | null {
  if (organizations.length === 0) {
    return null;
  }
  const preferred = organizations.find((organization) => organization.id === preferredId);
  return preferred?.id ?? organizations[0].id;
}
