import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/acres/app/app-shell";
import {
  getSession,
  listOrganizations,
} from "@/lib/api/server";
import { ApiClientError, getApiErrorCopy } from "@/lib/api/envelope";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveOrganizationId,
} from "@/lib/app/active-organization";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Workspace",
};

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
          {requestId && (
            <p className="font-mono text-label text-ink-muted lg:text-label-lg">
              Request ID: {requestId}
            </p>
          )}
          <a
            href="/app"
            className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
          >
            Try Again
          </a>
        </AlertDescription>
      </Alert>
    </div>
  );
}

export default async function AppPage() {
  let session;
  try {
    session = await getSession();
  } catch (error) {
    return <AppError error={error} />;
  }

  if (!session.authenticated || session.account === null) {
    redirect("/login?returnTo=/app");
  }

  let organizations;
  try {
    organizations = await listOrganizations();
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "UNAUTHENTICATED") {
      redirect("/login?returnTo=/app");
    }
    return <AppError error={error} />;
  }

  const cookieStore = await cookies();
  const preferredId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  const activeId = selectActiveOrganizationId(organizations, preferredId);
  const activeOrganization =
    activeId === null
      ? null
      : organizations.find((organization) => organization.id === activeId) ?? null;

  return (
    <AppShell
      account={session.account}
      organizations={organizations}
      activeOrganization={activeOrganization}
    />
  );
}
