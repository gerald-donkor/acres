import Link from "next/link";
import type { ExportRequest, OrganizationSummary, Report } from "@acres/shared";
import { FileTextIcon } from "lucide-react";

import {
  CreateReportForm,
  getEvidenceDetails,
  RevisionEditor,
} from "@/components/acres/app/report-actions";
import { ExportStatus } from "@/components/acres/app/export-status";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function ReportsWorkspace({
  organization,
  reports,
  exports,
  mode = "list",
}: {
  organization: OrganizationSummary;
  reports: Report[];
  exports: ExportRequest[];
  mode?: "list" | "new";
}) {
  const canCreate = organization.membership.role !== "viewer";
  return (
    <section aria-labelledby="reports-title" className="grid gap-6">
      <ReportsHeader organization={organization} />
      {mode === "new" && canCreate ? (
        <div className="max-w-3xl border border-rule p-4">
          <h2 className="font-serif text-title text-ink">New draft.</h2>
          <div className="mt-5">
            <CreateReportForm organizationId={organization.id} />
          </div>
        </div>
      ) : null}
      {reports.length === 0 ? (
        <Empty className="border border-rule">
          <EmptyMedia variant="icon">
            <FileTextIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No reports yet</EmptyTitle>
            <EmptyDescription>
              Create a draft from published dashboard evidence, then publish it
              when the claims are ready to freeze.
            </EmptyDescription>
          </EmptyHeader>
          {canCreate ? (
            <EmptyContent>
              <Link
                href="/app/reports/new"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "min-h-target",
                )}
              >
                New Report
              </Link>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <ReportTable reports={reports} canCreate={canCreate} />
          <ExportStatus organizationId={organization.id} exports={exports} />
        </div>
      )}
    </section>
  );
}

export function ReportDetailWorkspace({
  organization,
  report,
  exports,
}: {
  organization: OrganizationSummary;
  report: Report;
  exports: ExportRequest[];
}) {
  const role = organization.membership.role;
  const revision = report.latestRevision;
  return (
    <section aria-labelledby="report-title" className="grid gap-6">
      <div className="border-b border-rule pb-5">
        <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
          Report
        </p>
        <h1 id="report-title" className="mt-2 font-serif text-title text-ink">
          {report.title}
        </h1>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">
          {report.summary ??
            "Draft and published revisions keep every claim tied to evidence."}
        </p>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="grid gap-6">
          {revision ? (
            <RevisionEditor
              organizationId={organization.id}
              report={report}
              canUpdate={role !== "viewer"}
              canPublish={role === "owner" || role === "admin"}
              canExport={role !== "viewer"}
            />
          ) : null}
          <EvidenceTable report={report} />
        </div>
        <ExportStatus
          organizationId={organization.id}
          exports={exports.filter((item) => item.reportId === report.id)}
        />
      </div>
    </section>
  );
}

function ReportsHeader({
  organization,
}: {
  organization: OrganizationSummary;
}) {
  return (
    <div className="border-b border-rule pb-5">
      <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
        Reports
      </p>
      <h1 id="reports-title" className="mt-2 font-serif text-title text-ink">
        Publish evidence-backed work.
      </h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        {organization.name} can draft reports from analytics evidence, publish
        immutable revisions, and queue CSV or PDF artifacts.
      </p>
    </div>
  );
}

function ReportTable({
  reports,
  canCreate,
}: {
  reports: Report[];
  canCreate: boolean;
}) {
  return (
    <div
      role="region"
      aria-labelledby="reports-table-title"
      tabIndex={0}
      className="outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="reports-table-title" className="text-ui text-ink">
          Report Library
        </h2>
        {canCreate ? (
          <Link
            href="/app/reports/new"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "min-h-target",
            )}
          >
            New Report
          </Link>
        ) : null}
      </div>
      <Table>
        <TableCaption>
          Published revisions are immutable; draft edits create updated report
          state before publication.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Report</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Evidence</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((report) => (
            <TableRow key={report.id}>
              <TableCell>
                <Link
                  href={`/app/reports/${report.id}`}
                  className="text-ink underline-offset-4 hover:underline"
                >
                  {report.title}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant={report.status === "published" ? "secondary" : "outline"}>
                  {report.status}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-label text-ink-muted lg:text-label-lg">
                {report.latestRevision?.evidence.length ?? 0} links
              </TableCell>
              <TableCell>{formatDate(report.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EvidenceTable({ report }: { report: Report }) {
  const evidence = report.latestRevision?.evidence ?? [];
  return (
    <div
      role="region"
      aria-labelledby="evidence-table-title"
      tabIndex={0}
      className="outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <h2 id="evidence-table-title" className="mb-3 text-ui text-ink">
        Evidence
      </h2>
      {evidence.length === 0 ? (
        <p className="text-body text-ink-muted">
          No evidence links attached to this revision.
        </p>
      ) : (
        <Table>
          <TableCaption>
            Evidence links store identifiers and a frozen snapshot for
            reproducible exports.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Source / Metric</TableHead>
              <TableHead>Value / Summary</TableHead>
              <TableHead>Dataset</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {evidence.map((item) => {
              const details = getEvidenceDetails(item);
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant="outline">{item.evidenceType}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-label text-ink lg:text-label-lg">
                    {details.label}
                  </TableCell>
                  <TableCell className="text-body text-ink-muted">
                    {details.value !== null ? (
                      <span>
                        {details.value}
                        {details.unit ? ` ${details.unit}` : ""}
                        {details.observationCount !== null
                          ? ` (${details.observationCount} obs)`
                          : ""}
                      </span>
                    ) : (
                      details.chartType ?? "—"
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-label text-ink-muted lg:text-label-lg">
                    {details.datasetVersion ?? item.aggregateId ?? item.dashboardViewId ?? "view"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
