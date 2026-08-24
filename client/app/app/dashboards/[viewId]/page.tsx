import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/acres/app/app-shell";
import { DashboardWorkspace } from "@/components/acres/app/dashboard-workspace";
import { ApiClientError, getApiErrorCopy } from "@/lib/api/envelope";
import {
  getDashboardSummary,
  getDashboardView,
  getSession,
  listOrganizations,
} from "@/lib/api/server";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveOrganizationId,
} from "@/lib/app/active-organization";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Saved Dashboard",
};

type PageProps = {
  params: Promise<{ viewId: string }>;
};

export default async function SavedDashboardPage({ params }: PageProps) {
  const { viewId } = await params;
  const session = await getSession();
  if (!session.authenticated || session.account === null) {
    redirect(`/login?returnTo=/app/dashboards/${viewId}`);
  }

  const organizations = await listOrganizations();
  const cookieStore = await cookies();
  const preferredId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  const activeId = selectActiveOrganizationId(organizations, preferredId);
  const activeOrganization =
    activeId === null
      ? null
      : organizations.find((organization) => organization.id === activeId) ?? null;

  if (activeOrganization === null) {
    return (
      <AppShell
        account={session.account}
        organizations={organizations}
        activeOrganization={null}
      />
    );
  }

  let dashboardData:
    | {
        view: Awaited<ReturnType<typeof getDashboardView>>;
        summary: Awaited<ReturnType<typeof getDashboardSummary>>;
      }
    | null = null;
  let dashboardError: unknown = null;

  try {
    const view = await getDashboardView(activeOrganization.id, viewId);
    const summary = await getDashboardSummary(activeOrganization.id, view.filters);
    dashboardData = { view, summary };
  } catch (error) {
    dashboardError = error;
  }

  if (dashboardError !== null) {
    const error = dashboardError;
    const copy = getApiErrorCopy(error);
    const requestId = error instanceof ApiClientError ? error.requestId : null;
    return (
      <AppShell
        account={session.account}
        organizations={organizations}
        activeOrganization={activeOrganization}
        activeSection="dashboards"
      >
        <Alert variant="destructive">
          <AlertTitle>{copy.title}</AlertTitle>
          <AlertDescription>
            <p>{copy.message}</p>
            <p>{copy.action}</p>
            {requestId && (
              <p className="font-mono text-label text-ink-muted lg:text-label-lg">
                Request ID: {requestId}
              </p>
            )}
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  if (dashboardData === null) {
    throw new Error("Dashboard data was not loaded.");
  }

  return (
    <AppShell
      account={session.account}
      organizations={organizations}
      activeOrganization={activeOrganization}
      activeSection="dashboards"
    >
      <DashboardWorkspace
        organization={activeOrganization}
        summary={dashboardData.summary}
        filters={dashboardData.view.filters}
        canManageDashboards={activeOrganization.membership.role !== "viewer"}
      />
    </AppShell>
  );
}
