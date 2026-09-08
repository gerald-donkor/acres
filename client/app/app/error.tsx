"use client";

import { RouteErrorBoundary } from "@/components/acres/app/route-error-boundary";

export default function AppRootError({
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
      activeSection="workspace"
      eyebrow="Workspace Shell"
      title="Workspace Error"
      description="We encountered an unexpected error loading your authenticated workspace. Your session and data are secure."
      actionHint="Select Try Again to reload the workspace, or return to the overview."
      backHref="/app"
      backLabel="Return to Workspace"
    />
  );
}
