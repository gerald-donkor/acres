"use client";

import { RouteErrorBoundary } from "@/components/acres/app/route-error-boundary";

export default function MembersError({
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
      activeSection="members"
      eyebrow="Member Administration"
      title="Unable to Load Members"
      description="A problem occurred while loading member administration and invitation records. Your workspace access remains intact."
      actionHint="Retry to reconnect to the members directory, or navigate back to the workspace."
      backHref="/app"
      backLabel="Return to Workspace"
    />
  );
}
