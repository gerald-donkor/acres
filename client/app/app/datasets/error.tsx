"use client";

import { RouteErrorBoundary } from "@/components/acres/app/route-error-boundary";

export default function DatasetsError({
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
      activeSection="datasets"
      eyebrow="Data Ingestion"
      title="Data Sets Unavailable"
      description="A problem occurred while loading dataset versions, schema registries, or file records."
      actionHint="Retry loading the dataset registry, or return to the workspace overview."
      backHref="/app"
      backLabel="Return to Workspace"
    />
  );
}
