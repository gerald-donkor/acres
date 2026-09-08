"use client";

import { RouteErrorBoundary } from "@/components/acres/app/route-error-boundary";

export default function AuthError({
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
      mode="auth"
      eyebrow="Authentication"
      title="Authentication Error"
      description="An error occurred during authentication processing or verification."
      actionHint="Select Try Again to retry, or return to the sign in page."
      backHref="/login"
      backLabel="Return to Sign In"
      showSignOut={false}
    />
  );
}
