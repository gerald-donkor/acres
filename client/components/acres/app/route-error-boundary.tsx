"use client";

import Link from "next/link";
import { useEffect } from "react";
import {
  AlertTriangleIcon,
  BarChart3Icon,
  BriefcaseBusinessIcon,
  DatabaseIcon,
  FileTextIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
} from "lucide-react";

import { Button } from "@/components/acres/button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { LogoutButton } from "@/components/acres/app/logout-button";
import { isApiClientError, getApiErrorCopy } from "@/lib/api/envelope";
import { cn } from "@/lib/utils";

export interface RouteErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  actionHint?: string;
  eyebrow?: string;
  backHref?: string;
  backLabel?: string;
  showSignOut?: boolean;
  mode?: "workspace" | "standalone" | "auth" | "inline";
  activeSection?: "workspace" | "datasets" | "dashboards" | "reports" | "members";
  className?: string;
}

const navItems = [
  {
    label: "Workspace",
    href: "/app",
    icon: BriefcaseBusinessIcon,
    section: "workspace" as const,
  },
  {
    label: "Data Sets",
    href: "/app/datasets",
    icon: DatabaseIcon,
    section: "datasets" as const,
  },
  {
    label: "Dashboards",
    href: "/app/dashboards",
    icon: BarChart3Icon,
    section: "dashboards" as const,
  },
  {
    label: "Reports",
    href: "/app/reports",
    icon: FileTextIcon,
    section: "reports" as const,
  },
  {
    label: "Members",
    href: "/app/members",
    icon: ShieldCheckIcon,
    section: "members" as const,
  },
];

export function RouteErrorBoundary({
  error,
  reset,
  title: customTitle,
  description: customDescription,
  actionHint: customActionHint,
  eyebrow = "Application Notice",
  backHref = "/app",
  backLabel = "Return to Workspace",
  showSignOut = true,
  mode = "workspace",
  activeSection = "workspace",
  className,
}: RouteErrorBoundaryProps) {
  useEffect(() => {
    // Log technical error safely to console for debugging
    console.error("[RouteErrorBoundary caught error]:", error);
  }, [error]);

  const apiErrorCopy = isApiClientError(error) ? getApiErrorCopy(error) : null;
  const title =
    customTitle ?? apiErrorCopy?.title ?? "Something went wrong";
  const description =
    customDescription ??
    apiErrorCopy?.message ??
    "An unexpected error occurred while rendering this view. Your session and saved data are protected.";
  const actionHint =
    customActionHint ??
    apiErrorCopy?.action ??
    "Try retrying the action, or return to the workspace.";
  const requestId = isApiClientError(error) ? error.requestId : null;
  const digest = error.digest ?? null;

  const cardContent = (
    <div
      role="alert"
      data-slot="error-boundary"
      aria-live="assertive"
      className={cn(
        "w-full max-w-xl rounded-[14px] border border-rule bg-canvas p-6 sm:p-8 shadow-xs",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand">
          {mode === "auth" ? (
            <ShieldAlertIcon className="size-5" aria-hidden="true" />
          ) : (
            <AlertTriangleIcon className="size-5" aria-hidden="true" />
          )}
        </div>
        <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
          {eyebrow}
        </p>
      </div>

      <h1 className="mt-4 font-serif text-title sm:text-h2 text-ink">
        {title}
      </h1>

      <p className="mt-3 text-body text-ink-muted">{description}</p>
      {actionHint && (
        <p className="mt-1 text-body text-ink-muted">{actionHint}</p>
      )}

      {(digest || requestId) && (
        <dl className="mt-5 space-y-1.5 rounded-control border border-rule bg-muted/40 p-3.5 font-mono text-label text-ink-muted lg:text-label-lg">
          {digest && (
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-ink font-semibold">Error Digest:</dt>
              <dd className="select-all font-mono text-ink-muted break-all">
                {digest}
              </dd>
            </div>
          )}
          {requestId && (
            <div className="flex flex-wrap items-center gap-2">
              <dt className="text-ink font-semibold">Request ID:</dt>
              <dd className="select-all font-mono text-ink-muted break-all">
                {requestId}
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button
          variant="primary"
          onClick={() => reset()}
          className="h-12 min-h-12 w-full px-6 sm:w-auto"
        >
          <RotateCcwIcon className="size-4" data-icon="inline-start" aria-hidden="true" />
          Try Again
        </Button>

        {backHref && (
          <Link
            href={backHref}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "min-h-target min-w-target w-full px-5 text-center sm:w-auto",
            )}
          >
            {backLabel}
          </Link>
        )}

        {showSignOut && (
          <LogoutButton
            variant="ghost"
            className="min-h-target min-w-target w-full px-4 justify-center text-ink-muted hover:text-ink sm:w-auto"
          />
        )}
      </div>
    </div>
  );

  if (mode === "inline") {
    return cardContent;
  }

  if (mode === "auth") {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-page items-center justify-center px-4 py-10 md:px-10">
        <div className="w-full max-w-md">
          <div className="mb-6">
            <Link
              href="/"
              className="text-wordmark font-sans text-ink outline-none focus-visible:rounded-control focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              translate="no"
            >
              Acres
            </Link>
          </div>
          {cardContent}
        </div>
      </div>
    );
  }

  if (mode === "standalone") {
    return (
      <div className="flex min-h-svh flex-col bg-canvas text-ink">
        <header className="sticky top-0 z-40 border-b border-rule bg-canvas/95 px-4 py-4 backdrop-blur md:px-10">
          <div className="mx-auto flex max-w-page items-center justify-between gap-4">
            <Link
              href="/"
              className="text-wordmark font-sans text-ink outline-none focus-visible:rounded-control focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              translate="no"
            >
              Acres
            </Link>
            <Badge variant="outline">System Recovery</Badge>
          </div>
        </header>
        <div className="mx-auto flex flex-1 w-full max-w-page items-center justify-center px-4 py-10 md:px-10">
          {cardContent}
        </div>
      </div>
    );
  }

  // mode === "workspace" (Localized retry within preserved AppShell chrome)
  return (
    <div className="flex min-h-svh flex-col bg-canvas text-ink">
      <header className="sticky top-0 z-40 border-b border-rule bg-canvas/95 px-4 py-4 backdrop-blur md:px-10">
        <div className="mx-auto grid max-w-page gap-4">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <Link
              href="/"
              className="shrink-0 text-wordmark font-sans outline-none focus-visible:rounded-control focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              translate="no"
            >
              Acres
            </Link>
            <Badge variant="outline">Authenticated</Badge>
          </div>
          <div className="border-t border-rule pt-3 font-mono text-label text-ink-muted lg:text-label-lg">
            <span>Workspace Recovery Mode</span>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-page flex-1 gap-6 px-4 py-6 md:grid-cols-[16rem_minmax(0,1fr)] md:px-10 md:py-8">
        <aside className="order-last grid content-start gap-5 border-t border-rule pt-5 md:order-first md:border-r md:border-t-0 md:pt-0 md:pr-6 md:pb-0">
          <nav aria-label="Application" className="grid gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.section === activeSection;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    buttonVariants({
                      variant: active ? "secondary" : "ghost",
                      size: "lg",
                    }),
                    "h-target justify-between gap-3",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon aria-hidden="true" className="size-4" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {active && <Badge variant="secondary">Active</Badge>}
                </Link>
              );
            })}
          </nav>
          {showSignOut && <LogoutButton />}
        </aside>

        <div className="flex min-w-0 items-center justify-center py-4">
          {cardContent}
        </div>
      </div>
    </div>
  );
}
