import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/acres/app/app-shell";
import { ReportsWorkspace } from "@/components/acres/app/reports-workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { ApiClientError, getApiErrorCopy } from "@/lib/api/envelope";
import { loadReportsState } from "@/lib/app/reports-state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Reports",
};

export default async function ReportsPage() {
  const state = await loadReportsState("/app/reports");
  if ("error" in state) return <AppError error={state.error} />;
  if (!state.session.authenticated || state.session.account === null) {
    redirect("/login?returnTo=/app/reports");
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
            href="/app/reports"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
          >
            Try Again
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  );
}
