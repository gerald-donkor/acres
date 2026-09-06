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
import { resetPassword } from "@/lib/api/browser";
import { getApiErrorCopy, isApiClientError } from "@/lib/api/envelope";
import { cn } from "@/lib/utils";

type FormError = {
  code?: string | null;
  title: string;
  message: string;
  action: string;
  requestId: string | null;
};

export function ResetPasswordForm({ initialToken = "" }: { initialToken?: string }) {
  const tokenId = useId();
  const passwordId = useId();
  const confirmPasswordId = useId();
  const tokenDescId = useId();
  const passwordDescId = useId();
  const confirmDescId = useId();

  const errorRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("token")) {
      window.history.replaceState(window.history.state, "", "/reset-password");
    }
  }, []);

  useEffect(() => {
    if (error !== null) {
      errorRef.current?.focus();
    }
  }, [error]);

  useEffect(() => {
    if (success) {
      successRef.current?.focus();
    }
  }, [success]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmedToken = token.trim();
    if (!trimmedToken) {
      setError({
        title: "Token Required",
        message: "A password reset token is required.",
        action: "Enter the token from your reset email or request a new link.",
        requestId: null,
      });
      return;
    }

    if (password.length < 12) {
      setError({
        title: "Password Too Short",
        message: "Your new password must be at least 12 characters long.",
        action: "Enter a password with 12 or more characters.",
        requestId: null,
      });
      return;
    }

    if (password !== confirmPassword) {
      setError({
        title: "Passwords Do Not Match",
        message: "The new password and confirmation password do not match.",
        action: "Please verify both fields and try again.",
        requestId: null,
      });
      return;
    }

    setPending(true);
    setError(null);

    try {
      await resetPassword({
        token: trimmedToken,
        password,
      });
      setSuccess(true);
      setToken("");
      setPassword("");
      setConfirmPassword("");
    } catch (caught) {
      const copy = getApiErrorCopy(caught);
      setError({
        code: isApiClientError(caught) ? caught.code : null,
        ...copy,
        requestId: isApiClientError(caught) ? caught.requestId : null,
      });
    } finally {
      setPending(false);
    }
  }

  if (success) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        aria-live="polite"
        className="rounded-card border border-rule bg-canvas p-6 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <h2 className="font-serif text-title text-ink">Password Reset Successful</h2>
        <p className="mt-3 text-body text-ink-muted">
          Your account password has been updated. For security, all active sessions on other devices have been signed out.
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-target w-full text-center",
            )}
          >
            Sign In with New Password
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} aria-busy={pending} noValidate>
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
              {(error.code === "INVALID_TOKEN" || error.code === "TOKEN_EXPIRED") && (
                <div className="mt-2">
                  <Link
                    href="/forgot-password"
                    className={cn(
                      buttonVariants({ variant: "link" }),
                      "h-auto px-0 text-body text-brand",
                    )}
                  >
                    Request a new password reset link
                  </Link>
                </div>
              )}
              {error.requestId && (
                <p className="font-mono text-label text-ink-muted lg:text-label-lg">
                  Request ID: {error.requestId}
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!initialToken && (
          <Field>
            <FieldLabel htmlFor={tokenId}>Reset Token</FieldLabel>
            <Input
              id={tokenId}
              name="token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="h-target"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                if (error) setError(null);
              }}
              aria-describedby={tokenDescId}
              disabled={pending}
              required
            />
            <FieldDescription id={tokenDescId}>
              Paste the single-use recovery token from your email.
            </FieldDescription>
          </Field>
        )}

        <Field>
          <FieldLabel htmlFor={passwordId}>New Password</FieldLabel>
          <Input
            id={passwordId}
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            className="h-target"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            aria-describedby={passwordDescId}
            disabled={pending}
            required
          />
          <FieldDescription id={passwordDescId}>
            Use at least 12 characters. Password managers and paste are supported.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor={confirmPasswordId}>Confirm New Password</FieldLabel>
          <Input
            id={confirmPasswordId}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            className="h-target"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (error) setError(null);
            }}
            aria-describedby={confirmDescId}
            disabled={pending}
            required
          />
          <FieldDescription id={confirmDescId}>
            Re-enter your new password to confirm.
          </FieldDescription>
        </Field>

        <Button type="submit" size="lg" className="h-12" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" aria-hidden="true" />}
          {pending ? "Resetting Password…" : "Reset Password"}
        </Button>
      </FieldGroup>
    </form>
  );
}
