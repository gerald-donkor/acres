"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DashboardFilters } from "@acres/shared";
import { SaveIcon } from "lucide-react";

import { createDashboardView } from "@/lib/api/browser";
import { getApiErrorCopy } from "@/lib/api/envelope";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export function SaveDashboardViewForm({
  organizationId,
  filters,
}: {
  organizationId: string;
  filters: DashboardFilters;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    if (name.length === 0) {
      setError("Name this view before saving it.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      await createDashboardView(organizationId, {
        name,
        filters,
        presentation: { chart: "bar", compareBy: "period" },
      });
      event.currentTarget.reset();
      router.refresh();
    } catch (caught) {
      const copy = getApiErrorCopy(caught);
      setError(`${copy.message} ${copy.action}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="border border-rule p-4">
      <FieldGroup>
        <Field data-invalid={error !== null}>
          <FieldLabel htmlFor="dashboard-view-name">Save current view</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="dashboard-view-name"
              name="name"
              placeholder="Regional comparison"
              disabled={pending}
              aria-invalid={error !== null}
              className="min-h-target"
            />
            <Button type="submit" disabled={pending} className="min-h-target">
              {pending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
              Save View
            </Button>
          </div>
          {error && <FieldError>{error}</FieldError>}
        </Field>
      </FieldGroup>
    </form>
  );
}
