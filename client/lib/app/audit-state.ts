import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiClientError } from "@/lib/api/envelope";
import {
  getSession,
  listOrganizations,
  listOrganizationAuditEvents,
} from "@/lib/api/server";
import {
  auditPageCursor,
  type AuditPageParams,
  type AuditEventConnection,
} from "@/lib/api/audit-history";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveOrganizationId,
} from "./active-organization";

export type AuditNotice = "denied" | "unavailable" | "invalid-page" | "error";

export async function loadAuditState(params: AuditPageParams) {
  // Let initial session/organization outages reach the route error boundary.
  // Query errors below preserve the authenticated shell and offer safe copy.
  const session = await getSession().catch((error: unknown) => {
    if (error instanceof ApiClientError && error.code === "UNAUTHENTICATED") {
      redirect("/login?returnTo=/app/audit");
    }
    throw error;
  });
  if (!session.authenticated || session.account === null) {
    redirect("/login?returnTo=/app/audit");
  }
  const [organizations, cookieStore] = await Promise.all([
    listOrganizations().catch((error: unknown) => {
      if (error instanceof ApiClientError && error.code === "UNAUTHENTICATED") {
        redirect("/login?returnTo=/app/audit");
      }
      throw error;
    }),
    cookies(),
  ]);
  const activeId = selectActiveOrganizationId(
    organizations,
    cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value,
  );
  const activeOrganization =
    organizations.find((organization) => organization.id === activeId) ?? null;
  const context = {
    account: session.account,
    organizations,
    activeOrganization,
  };
  if (activeOrganization === null)
    return { ...context, notice: null, connection: null };
  if (!["owner", "admin"].includes(activeOrganization.membership.role)) {
    return { ...context, notice: "denied" as const, connection: null };
  }
  const page = auditPageCursor(params, activeOrganization.id);
  if (!page.valid)
    return { ...context, notice: "invalid-page" as const, connection: null };

  let connection: AuditEventConnection | null = null;
  let notice: AuditNotice | null = null;
  let sessionExpired = false;
  try {
    connection = await listOrganizationAuditEvents(
      activeOrganization.id,
      page.after,
    );
  } catch (error) {
    if (error instanceof ApiClientError) {
      sessionExpired = error.code === "UNAUTHENTICATED";
      notice =
        error.code === "FORBIDDEN"
          ? "denied"
          : error.code === "CURSOR_INVALID"
            ? "invalid-page"
            : error.code === "NOT_FOUND"
              ? "unavailable"
              : "error";
    } else {
      notice = "error";
    }
  }
  if (sessionExpired) redirect("/login?returnTo=/app/audit");
  return { ...context, connection, notice };
}
