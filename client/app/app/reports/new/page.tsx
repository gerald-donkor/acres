import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/acres/app/app-shell";
import { ReportsWorkspace } from "@/components/acres/app/reports-workspace";
import { loadReportsState } from "@/lib/app/reports-state";

export const metadata: Metadata = {
  title: "New Report",
};

export default async function NewReportPage() {
  const state = await loadReportsState("/app/reports/new");
  if ("error" in state) throw state.error;
  if (!state.session.authenticated || state.session.account === null) {
    redirect("/login?returnTo=/app/reports/new");
  }
  return (
    <AppShell
      account={state.session.account}
      organizations={state.organizations}
      activeOrganization={state.activeOrganization}
      activeSection="reports"
    >
      {state.activeOrganization ? (
        <ReportsWorkspace
          organization={state.activeOrganization}
          reports={state.reports}
          exports={state.exports}
          mode="new"
        />
      ) : null}
    </AppShell>
  );
}
