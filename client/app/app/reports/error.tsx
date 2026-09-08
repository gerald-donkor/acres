"use client";

import { RouteErrorBoundary } from "@/components/acres/app/route-error-boundary";

export default function ReportsError({
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
      activeSection="reports"
      eyebrow="Evidence & Reporting"
      title="Reports Unavailable"
      description="Unable to load report drafts, immutable revisions, or export artifacts."
      actionHint="Retry to reload reporting documents, or return to the workspace overview."
      backHref="/app"
      backLabel="Return to Workspace"
    />
  );
}
