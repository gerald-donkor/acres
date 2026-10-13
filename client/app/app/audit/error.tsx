"use client";

import { RouteErrorBoundary } from "@/components/acres/app/route-error-boundary";

export default function AuditError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteErrorBoundary
      error={error}
      reset={retry}
      activeSection="audit"
      eyebrow="Audit history"
      title="Unable to load audit history"
      description="Audit history is temporarily unavailable."
      actionHint="Try again, or return to the workspace."
      backHref="/app"
      backLabel="Return to workspace"
    />
  );
}
