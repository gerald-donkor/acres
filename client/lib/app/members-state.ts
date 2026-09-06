import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiClientError } from "@/lib/api/envelope";
import {
  getSession,
  listInvitations,
  listMembers,
  listOrganizations,
} from "@/lib/api/server";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveOrganizationId,
} from "@/lib/app/active-organization";

export async function loadMembersState(returnTo: string) {
  try {
    const session = await getSession();
    if (!session.authenticated || session.account === null) {
      return {
        session,
        organizations: [],
        activeOrganization: null,
        members: [],
        invitations: [],
        permissionDenied: false,
      };
    }

    const organizations = await listOrganizations();
    const cookieStore = await cookies();
    const preferredId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
    const activeId = selectActiveOrganizationId(organizations, preferredId);
    const activeOrganization =
      activeId === null
        ? null
        : organizations.find((organization) => organization.id === activeId) ??
          null;

    if (activeOrganization === null) {
      return {
        session,
        organizations,
        activeOrganization: null,
        members: [],
        invitations: [],
        permissionDenied: false,
      };
    }

    const role = activeOrganization.membership.role;
    if (role !== "owner" && role !== "admin") {
      return {
        session,
        organizations,
        activeOrganization,
        members: [],
        invitations: [],
        permissionDenied: true,
      };
    }

    const [members, invitations] = await Promise.all([
      listMembers(activeOrganization.id),
      listInvitations(activeOrganization.id),
    ]);

    return {
      session,
      organizations,
      activeOrganization,
      members,
      invitations,
      permissionDenied: false,
    };
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "UNAUTHENTICATED") {
      redirect(`/login?returnTo=${returnTo}`);
    }
    return { error };
  }
}
