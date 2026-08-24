"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { login } from "@/lib/api/browser";
import { getApiErrorCopy, isApiClientError } from "@/lib/api/envelope";
import { sanitizeReturnTo } from "@/lib/auth/return-to";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type FormError = {
  title: string;
  message: string;
  action: string;
  requestId: string | null;
};

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
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
    setPending(true);
    setError(null);
    try {
      await login({
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      router.replace(sanitizeReturnTo(returnTo));
      router.refresh();
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

  return (
    <form onSubmit={onSubmit} aria-busy={pending}>
      <FieldGroup>
        {error && (
          <Alert
            ref={errorRef}
            tabIndex={-1}
            variant="destructive"
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
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={passwordId}>Password</FieldLabel>
          <Input
            id={passwordId}
            name="password"
            type="password"
            autoComplete="current-password"
            minLength={12}
            className="h-target"
            required
          />
          <FieldDescription>Password managers and paste are supported.</FieldDescription>
          <FieldError />
        </Field>
        <Button type="submit" size="lg" className="h-12" disabled={pending}>
          {pending && <Spinner aria-hidden="true" />}
          Sign In
        </Button>
      </FieldGroup>
    </form>
  );
}
