import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/acres/app/app-shell";
import { DatasetDetailWorkspace } from "@/components/acres/app/datasets-workspace";
import { loadDatasetDetailState } from "@/lib/app/datasets-state";

export const metadata: Metadata = {
  title: "Dataset Detail",
};

export default async function DatasetDetailPage({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  const state = await loadDatasetDetailState(
    datasetId,
    `/app/datasets/${datasetId}`,
  );

  if ("error" in state || state.session?.account === null) {
    redirect(`/login?returnTo=/app/datasets/${datasetId}`);
  }

  if (state.activeOrganization === null || state.dataset === null) {
    redirect("/app/datasets");
  }

  return (
    <AppShell
      account={state.session.account}
      organizations={state.organizations}
      activeOrganization={state.activeOrganization}
      activeSection="datasets"
    >
      <DatasetDetailWorkspace
        organization={state.activeOrganization}
        dataset={state.dataset}
        versions={state.versions}
      />
    </AppShell>
  );
}
