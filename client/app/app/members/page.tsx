import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { ShieldAlertIcon } from "lucide-react";

import { AppShell } from "@/components/acres/app/app-shell";
import { MembersWorkspace } from "@/components/acres/app/members-workspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { ApiClientError, getApiErrorCopy } from "@/lib/api/envelope";
import { loadMembersState } from "@/lib/app/members-state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Members",
};

export default async function MembersPage() {
  const state = await loadMembersState("/app/members");
  if ("error" in state) return <AppError error={state.error} />;

  if (!state.session.authenticated || state.session.account === null) {
    redirect("/login?returnTo=/app/members");
  }

  if (state.permissionDenied) {
    return (
      <AppShell
        account={state.session.account}
        organizations={state.organizations}
        activeOrganization={state.activeOrganization}
        activeSection="members"
      >
        <div className="mx-auto max-w-xl rounded-[14px] border border-rule bg-card p-8 text-center shadow-xs">
          <ShieldAlertIcon className="mx-auto size-10 text-brand" aria-hidden="true" />
          <h2 className="mt-3 font-serif text-title text-ink">
            Access Restricted
          </h2>
          <p className="mt-2 text-body text-ink-muted">
            Managing members and issuing invitations requires an administrator
            or owner role in this organization.
          </p>
          <div className="mt-6">
            <Link
              href="/app"
              className={cn(buttonVariants({ variant: "outline" }), "min-h-target px-6")}
            >
              Return to Workspace
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      account={state.session.account}
      organizations={state.organizations}
      activeOrganization={state.activeOrganization}
      activeSection="members"
    >
      {state.activeOrganization ? (
        <MembersWorkspace
          organization={state.activeOrganization}
          currentAccount={state.session.account}
          initialMembers={state.members}
          initialInvitations={state.invitations}
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
            href="/app/members"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
          >
            Try Again
          </Link>
        </AlertDescription>
      </Alert>
    </div>
  );
}
