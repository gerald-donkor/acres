"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";
import type { OrganizationSummary } from "@acres/shared";

import { persistActiveOrganization } from "@/lib/app/active-organization";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
}: {
  organizations: OrganizationSummary[];
  activeOrganizationId: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(activeOrganizationId);
  const [pending, startTransition] = useTransition();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextId = event.currentTarget.value;
    if (nextId === activeOrganizationId) return;
    setSelectedId(nextId);
    persistActiveOrganization(nextId);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid gap-1">
      <label
        htmlFor="active-organization"
        className="font-mono text-label uppercase text-ink-muted lg:text-label-lg"
      >
        Select Organization
      </label>
      <NativeSelect
        id="active-organization"
        value={pending ? selectedId : activeOrganizationId}
        onChange={onChange}
        aria-busy={pending}
        className="w-full [&_[data-slot=native-select]]:h-target"
      >
        {organizations.map((organization) => (
          <NativeSelectOption key={organization.id} value={organization.id}>
            {organization.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {pending && (
        <p className="font-mono text-label text-ink-muted lg:text-label-lg">
          Switching organization...
        </p>
      )}
    </div>
  );
}
