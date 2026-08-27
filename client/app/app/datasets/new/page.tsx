import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/acres/app/app-shell";
import { DatasetsWorkspace } from "@/components/acres/app/datasets-workspace";
import { loadDatasetsState } from "@/lib/app/datasets-state";

export const metadata: Metadata = {
  title: "New Dataset",
};

export default async function NewDatasetPage() {
  const state = await loadDatasetsState("/app/datasets/new");
  if ("error" in state) throw state.error;
  if (!state.session.authenticated || state.session.account === null) {
    redirect("/login?returnTo=/app/datasets/new");
  }
  return (
    <AppShell
      account={state.session.account}
      organizations={state.organizations}
      activeOrganization={state.activeOrganization}
      activeSection="datasets"
    >
      {state.activeOrganization ? (
        <DatasetsWorkspace
          organization={state.activeOrganization}
          datasets={state.datasets}
          mode="new"
        />
      ) : null}
    </AppShell>
  );
}
