"use client";

import { useState } from "react";
import { Button } from "@/components/acres/button";

export function ErrorTrigger() {
  const [shouldThrow, setShouldThrow] = useState(false);

  if (shouldThrow) {
    setShouldThrow(false);
    throw new Error(
      "Synthetic simulated workspace runtime exception for testing error boundaries.",
    );
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="font-serif text-title text-ink">Error Boundary Test Harness</h1>
      <p className="mt-2 text-body text-ink-muted">
        This route provides a controlled mechanism to verify Next.js route error boundaries
        and recovery behavior in automated Playwright journeys.
      </p>
      <div className="mt-6">
        <Button
          variant="primary"
          onClick={() => setShouldThrow(true)}
          className="min-h-12 px-6"
        >
          Trigger Synthetic Error
        </Button>
      </div>
    </div>
  );
}
