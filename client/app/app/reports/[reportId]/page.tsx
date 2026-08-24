import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/acres/app/app-shell";
import { ReportDetailWorkspace } from "@/components/acres/app/reports-workspace";
import { ApiClientError } from "@/lib/api/envelope";
import {
  getReport,
  getSession,
  listExports,
  listOrganizations,
} from "@/lib/api/server";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveOrganizationId,
} from "@/lib/app/active-organization";

export const metadata: Metadata = {
  title: "Report",
};

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const session = await getSession().catch((error) => {
    if (error instanceof ApiClientError && error.code === "UNAUTHENTICATED") {
      redirect(`/login?returnTo=/app/reports/${reportId}`);
    }
    throw error;
  });
  if (!session.authenticated || session.account === null) {
    redirect(`/login?returnTo=/app/reports/${reportId}`);
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
    redirect("/app/reports");
  }
  const [report, exports] = await Promise.all([
    getReport(activeOrganization.id, reportId),
    listExports(activeOrganization.id),
  ]);
  return (
    <AppShell
      account={session.account}
      organizations={organizations}
      activeOrganization={activeOrganization}
      activeSection="reports"
    >
      <ReportDetailWorkspace
        organization={activeOrganization}
        report={report}
        exports={exports}
      />
    </AppShell>
  );
}
