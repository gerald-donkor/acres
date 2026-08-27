import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/acres/app/app-shell";
import { DatasetsWorkspace } from "@/components/acres/app/datasets-workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { ApiClientError, getApiErrorCopy } from "@/lib/api/envelope";
import { loadDatasetsState } from "@/lib/app/datasets-state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Data Sets",
};

export default async function DatasetsPage() {
  const state = await loadDatasetsState("/app/datasets");
  if ("error" in state) return <AppError error={state.error} />;
  if (!state.session.authenticated || state.session.account === null) {
    redirect("/login?returnTo=/app/datasets");
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
        />
      ) : null}
    </AppShell>
  );
}

function AppError({ error }: { error: unknown }) {
  const copy = getApiErrorCopy(error);
  const requestId = error instanceof ApiClientError ? error.requestId : null;
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-page items-center px-4 py-10 md:px-10">
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>{copy.title}</AlertTitle>
        <AlertDescription>
          <p>{copy.message}</p>
          <p>{copy.action}</p>
          {requestId ? (
            <p className="font-mono text-label text-ink-muted lg:text-label-lg">
              Request ID: {requestId}
            </p>
          ) : null}
          <Link
            href="/app/datasets"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
          >
            Try Again
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  );
}
