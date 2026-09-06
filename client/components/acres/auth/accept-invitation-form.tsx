"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { acceptInvitation } from "@/lib/api/browser";
import { getApiErrorCopy, isApiClientError } from "@/lib/api/envelope";
import { persistActiveOrganization } from "@/lib/app/active-organization";
import { cn } from "@/lib/utils";

const SIGN_IN_PATH = "/login?returnTo=%2Faccept-invitation";

type FormError = {
  code: string | null;
  title: string;
  message: string;
  action: string;
  requestId: string | null;
};

function invitationError(error: unknown): FormError {
  if (isApiClientError(error) && error.code === "NOT_FOUND") {
    return {
      code: error.code,
      title: "Invitation Unavailable",
      message: "This invitation cannot be used by the signed-in account.",
      action:
        "Check the account and token, or ask an organization owner or admin for a new invitation.",
      requestId: error.requestId,
    };
  }

  const copy = getApiErrorCopy(error);
  return {
    code: isApiClientError(error) ? error.code : null,
    ...copy,
    requestId: isApiClientError(error) ? error.requestId : null,
  };
}

export function AcceptInvitationForm({ email }: { email: string }) {
  const router = useRouter();
  const tokenId = useId();
  const descriptionId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  useEffect(() => {
    if (error !== null) {
      errorRef.current?.focus();
    }
  }, [error]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const token = String(formData.get("token") ?? "").trim();
    setPending(true);
    setError(null);

    try {
      const result = await acceptInvitation({ token });
      persistActiveOrganization(result.organizationId);
      router.replace("/app");
      router.refresh();
    } catch (caught) {
      setError(invitationError(caught));
    } finally {
      form.reset();
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} aria-busy={pending}>
      <FieldGroup>
        {error ? (
          <Alert
            ref={errorRef}
            tabIndex={-1}
            variant="destructive"
            aria-live="polite"
            className="outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription>
              <p>{error.message}</p>
              <p>{error.action}</p>
              {error.code === "UNAUTHENTICATED" ? (
                <Link
                  href={SIGN_IN_PATH}
                  className={cn(
                    buttonVariants({ variant: "link" }),
                    "h-auto px-0 text-body",
                  )}
                >
                  Sign In Again
                </Link>
              ) : null}
              {error.requestId ? (
                <p className="font-mono text-label text-ink-muted lg:text-label-lg">
                  Request ID: {error.requestId}
                </p>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <p className="break-all font-mono text-label text-ink-muted lg:text-label-lg">
          Signed in as <span translate="no">{email}</span>
        </p>

        <Field>
          <FieldLabel htmlFor={tokenId}>Invitation Token</FieldLabel>
          <Input
            id={tokenId}
            name="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            minLength={32}
            maxLength={256}
            aria-describedby={descriptionId}
            className="h-target"
            disabled={pending}
            onInput={() => setError(null)}
            required
          />
          <FieldDescription id={descriptionId}>
            Paste the one-time token you received. It can be used only once.
          </FieldDescription>
        </Field>

        <Button type="submit" size="lg" className="h-12" disabled={pending}>
          {pending ? (
            <Spinner data-icon="inline-start" aria-hidden="true" />
          ) : null}
          {pending ? "Accepting…" : "Accept Invitation"}
        </Button>
      </FieldGroup>
    </form>
  );
}
