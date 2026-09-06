"use client";

import Link from "next/link";
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
import { forgotPassword } from "@/lib/api/browser";
import { getApiErrorCopy, isApiClientError } from "@/lib/api/envelope";
import { cn } from "@/lib/utils";

type FormError = {
  title: string;
  message: string;
  action: string;
  requestId: string | null;
};

export function ForgotPasswordForm() {
  const emailId = useId();
  const descriptionId = useId();
  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [error, setError] = useState<FormError | null>(null);

  useEffect(() => {
    if (error !== null) {
      errorRef.current?.focus();
    }
  }, [error]);

  useEffect(() => {
    if (submitted) {
      successRef.current?.focus();
    }
  }, [submitted]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "").trim();
    if (!email) return;

    setPending(true);
    setError(null);

    try {
      await forgotPassword({ email });
      setSubmittedEmail(email);
      setSubmitted(true);
    } catch (caught) {
      const copy = getApiErrorCopy(caught);
      setError({
        ...copy,
        requestId: isApiClientError(caught) ? caught.requestId : null,
      });
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        aria-live="polite"
        className="rounded-card border border-rule bg-canvas p-6 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <h2 className="font-serif text-title text-ink">Check your email</h2>
        <p className="mt-3 text-body text-ink-muted">
          If an account exists for{" "}
          <span className="font-semibold text-ink break-all" translate="no">
            {submittedEmail}
          </span>
          , we have sent instructions and a secure recovery link. Check your inbox and spam folder.
        </p>
        <p className="mt-2 text-ui text-ink-muted">
          The link will expire in 30 minutes.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-target w-full sm:w-auto text-center",
            )}
          >
            Return to Sign In
          </Link>
          <Button
            type="button"
            variant="outline"
            className="h-target w-full sm:w-auto"
            onClick={() => {
              setSubmitted(false);
              setError(null);
            }}
          >
            Send to another address
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-busy={pending}>
      <FieldGroup>
        {error && (
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
              {error.requestId && (
                <p className="font-mono text-label text-ink-muted lg:text-label-lg">
                  Request ID: {error.requestId}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor={emailId}>Email</FieldLabel>
          <Input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            spellCheck={false}
            className="h-target"
            aria-describedby={descriptionId}
            disabled={pending}
            onInput={() => setError(null)}
            required
          />
          <FieldDescription id={descriptionId}>
            We will send a single-use password recovery link to this address.
          </FieldDescription>
        </Field>
        <Button type="submit" size="lg" className="h-12" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {pending ? "Sending Link…" : "Send Reset Link"}
        </Button>
      </FieldGroup>
    </form>
  );
}
