"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOutIcon } from "lucide-react";

import { logout } from "@/lib/api/browser";
import { getApiErrorCopy, isApiClientError } from "@/lib/api/envelope";
import { clearActiveOrganization } from "@/lib/app/active-organization";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onLogout() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await logout();
      clearActiveOrganization();
      router.replace("/login");
      router.refresh();
    } catch (caught) {
      const copy = getApiErrorCopy(caught);
      const requestId = isApiClientError(caught) ? caught.requestId : null;
      setError(
        `${copy.message} ${copy.action}${requestId ? ` Request ID: ${requestId}` : ""}`,
      );
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Sign Out Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-target justify-start"
        onClick={onLogout}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <Spinner aria-hidden="true" />
        ) : (
          <LogOutIcon aria-hidden="true" />
        )}
        Sign Out
      </Button>
    </div>
  );
}
