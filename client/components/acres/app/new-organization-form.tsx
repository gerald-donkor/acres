"use client";

import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { createOrganization } from "@/lib/api/browser";
import { getApiErrorCopy, isApiClientError } from "@/lib/api/envelope";
import { persistActiveOrganization } from "@/lib/app/active-organization";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type FormError = {
  title: string;
  message: string;
  action: string;
  requestId: string | null;
};

export function NewOrganizationForm() {
  const router = useRouter();
  const nameId = useId();
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

    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const organization = await createOrganization({
        name: String(formData.get("name") ?? ""),
      });
      persistActiveOrganization(organization.id);
      router.refresh();
    } catch (caught) {
      const copy = getApiErrorCopy(caught);
      setError({
        ...copy,
        requestId: isApiClientError(caught) ? caught.requestId : null,
      });
      setPending(false);
    }
  }

  return (
    <details className="border-t border-rule pt-4">
      <summary className="flex h-target cursor-pointer list-none items-center justify-between font-mono text-label uppercase text-ink-muted outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:text-label-lg">
        New Organization
        <PlusIcon aria-hidden="true" className="size-4" />
      </summary>
      <form className="mt-3" onSubmit={onSubmit} aria-busy={pending}>
        <FieldGroup className="gap-3">
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
            <FieldLabel htmlFor={nameId}>Organization Name</FieldLabel>
            <Input
              id={nameId}
              name="name"
              autoComplete="organization"
              minLength={2}
              className="h-target"
              required
            />
          </Field>
          <Button type="submit" className="h-target" disabled={pending}>
            {pending && <Spinner aria-hidden="true" />}
            Create Organization
          </Button>
        </FieldGroup>
      </form>
    </details>
  );
}
