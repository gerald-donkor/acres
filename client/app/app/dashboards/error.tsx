"use client";

import { RouteErrorBoundary } from "@/components/acres/app/route-error-boundary";

export default function DashboardsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {

  return (
    <RouteErrorBoundary
      error={error}
      reset={reset}
      mode="workspace"
      activeSection="dashboards"
      eyebrow="Analytics & Dashboards"
      title="Dashboard Unavailable"
      description="Unable to load dashboard metrics, aggregate snapshots, or saved views."
      actionHint="Retry the analytics query, or return to the workspace overview."
      backHref="/app"
      backLabel="Return to Workspace"
    />
  );
}
