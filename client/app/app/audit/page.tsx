import type { Metadata } from "next";
import { AppShell } from "@/components/acres/app/app-shell";
import { AuditWorkspace } from "@/components/acres/app/audit-workspace";
import type { AuditPageParams } from "@/lib/api/audit-history";
import { loadAuditState } from "@/lib/app/audit-state";

export const metadata: Metadata = { title: "Audit history" };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<AuditPageParams>;
}) {
  const state = await loadAuditState(await searchParams);
  return (
    <AppShell
      account={state.account}
      organizations={state.organizations}
      activeOrganization={state.activeOrganization}
      activeSection="audit"
    >
      {state.activeOrganization ? (
        <AuditWorkspace
          organizationId={state.activeOrganization.id}
          connection={state.connection}
          notice={state.notice}
        />
      ) : null}
    </AppShell>
  );
}
