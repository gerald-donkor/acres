import Link from "next/link";
import { buttonVariants } from "@/components/acres/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  auditActionLabel,
  auditPageHref,
  type AuditEventConnection,
} from "@/lib/api/audit-history";
import type { AuditNotice } from "@/lib/app/audit-state";

const notices: Record<AuditNotice, { title: string; message: string }> = {
  denied: {
    title: "Access restricted",
    message:
      "Audit history requires an owner or administrator role in this organization.",
  },
  unavailable: {
    title: "Organization unavailable",
    message:
      "Your organization access may have changed. Select another organization or return to the workspace.",
  },
  "invalid-page": {
    title: "Page unavailable",
    message:
      "This audit page is invalid or no longer available. Open the latest events to continue.",
  },
  error: {
    title: "Unable to load audit history",
    message:
      "Audit history is temporarily unavailable. Try again, or return to the workspace.",
  },
};

const timestamp = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
});

export function AuditWorkspace({
  organizationId,
  connection,
  notice,
}: {
  organizationId: string;
  connection: AuditEventConnection | null;
  notice: AuditNotice | null;
}) {
  const next = connection?.pageInfo;
  return (
    <section aria-labelledby="audit-title" className="grid min-w-0 gap-6">
      <header className="grid gap-3 border-b border-rule pb-5">
        <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
          Organization
        </p>
        <h1
          id="audit-title"
          className="font-serif text-title text-ink text-balance"
        >
          Audit history.
        </h1>
        <p className="text-body text-ink-muted">
          Review changes to access, reports and exports. Events appear newest
          first. Times are shown in UTC.
        </p>
      </header>
      {notice ? (
        <Alert>
          <AlertTitle>{notices[notice].title}</AlertTitle>
          <AlertDescription>{notices[notice].message}</AlertDescription>
        </Alert>
      ) : connection?.edges.length ? (
        <ol aria-label="Audit events" className="grid min-w-0 gap-4">
          {connection.edges.map(({ node }) => (
            <li
              key={node.id}
              data-audit-event-id={node.id}
              className="grid min-w-0 gap-3 rounded-card border border-rule p-4 sm:p-6"
            >
              <h2 className="font-serif text-h3 text-ink">
                {auditActionLabel(node.action)}
              </h2>
              <time
                dateTime={node.createdAt}
                className="font-mono text-label text-ink-muted tabular-nums lg:text-label-lg"
              >
                {timestamp.format(new Date(node.createdAt))} UTC
              </time>
              <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
                {[
                  ["Actor account", node.actorAccountId ?? "Not recorded"],
                  ["Target type", node.targetType],
                  ["Target identifier", node.targetId ?? "Not recorded"],
                  ["Event identifier", node.id],
                ].map(([label, value]) => (
                  <div key={label} className="grid min-w-0 gap-1">
                    <dt className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
                      {label}
                    </dt>
                    <dd
                      translate="no"
                      className="font-mono text-label text-ink break-all lg:text-label-lg"
                    >
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No events on this page</EmptyTitle>
            <EmptyDescription>
              Recorded changes to this organization will appear here. Open the
              latest events to check for updates.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <nav aria-label="Audit pagination" className="flex flex-wrap gap-3">
        <Link
          prefetch={false}
          href="/app/audit"
          className={buttonVariants({ variant: "secondary" })}
        >
          {notice === "error" ? "Try again" : "Latest events"}
        </Link>
        {next?.hasNextPage && next.endCursor && !notice ? (
          <Link
            prefetch={false}
            href={auditPageHref(organizationId, next.endCursor)}
            className={buttonVariants({ variant: "secondary" })}
          >
            More events
          </Link>
        ) : null}
        {notice === "denied" || notice === "unavailable" ? (
          <Link
            href="/app"
            className={buttonVariants({ variant: "secondary" })}
          >
            Return to workspace
          </Link>
        ) : null}
      </nav>
    </section>
  );
}
