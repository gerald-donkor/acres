import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiClientError } from "@/lib/api/envelope";
import {
  getSession,
  listExports,
  listOrganizations,
  listReports,
} from "@/lib/api/server";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveOrganizationId,
} from "@/lib/app/active-organization";

export async function loadReportsState(returnTo: string) {
  try {
    const session = await getSession();
    if (!session.authenticated || session.account === null) {
      return {
        session,
        organizations: [],
        activeOrganization: null,
        reports: [],
        exports: [],
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
    const [reports, exports] =
      activeOrganization === null
        ? [[], []]
        : await Promise.all([
            listReports(activeOrganization.id),
            listExports(activeOrganization.id),
          ]);
    return { session, organizations, activeOrganization, reports, exports };
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "UNAUTHENTICATED") {
      redirect(`/login?returnTo=${returnTo}`);
    }
    return { error };
  }
}
