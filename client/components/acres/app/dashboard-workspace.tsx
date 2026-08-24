import Link from "next/link";
import type {
  DashboardFilters,
  DashboardSummary,
  OrganizationSummary,
} from "@acres/shared";
import { BarChart3Icon } from "lucide-react";

import { DashboardChart } from "@/components/acres/app/dashboard-chart";
import { SaveDashboardViewForm } from "@/components/acres/app/save-dashboard-view-form";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
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

export function DashboardWorkspace({
  organization,
  summary,
  filters,
  canManageDashboards,
}: {
  organization: OrganizationSummary;
  summary: DashboardSummary;
  filters: DashboardFilters;
  canManageDashboards: boolean;
}) {
  if (summary.metrics.length === 0) {
    return (
      <section aria-labelledby="dashboard-title" className="grid gap-6">
        <DashboardHeader organization={organization} />
        <Empty className="border border-rule">
          <EmptyMedia variant="icon">
            <BarChart3Icon aria-hidden="true" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No published metrics</EmptyTitle>
            <EmptyDescription>
              Publish an ingested dataset with metric mappings before dashboards
              can show values.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  return (
    <section aria-labelledby="dashboard-title" className="grid gap-6">
      <DashboardHeader organization={organization} />
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryStat label="Metrics" value={summary.metrics.length} />
        <SummaryStat label="Aggregates" value={summary.aggregates.length} />
        <SummaryStat label="Saved Views" value={summary.savedViews.length} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="grid min-w-0 gap-6">
          <DashboardChart aggregates={summary.aggregates} />
          <AggregateTable aggregates={summary.aggregates} />
        </div>
        <aside className="grid content-start gap-4">
          {canManageDashboards ? (
            <SaveDashboardViewForm
              organizationId={organization.id}
              filters={filters}
            />
          ) : null}
          <SavedViews views={summary.savedViews} />
          <EvidencePanel summary={summary} />
        </aside>
      </div>
    </section>
  );
}

function DashboardHeader({
  organization,
}: {
  organization: OrganizationSummary;
}) {
  return (
    <div className="border-b border-rule pb-5">
      <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
        Dashboards
      </p>
      <h1 id="dashboard-title" className="mt-2 font-serif text-title text-ink">
        Browse regional metrics.
      </h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        {organization.name} can compare published analytics with metric
        definitions, units, calculation versions, quality, and evidence kept in
        view.
      </p>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <dl className="border border-rule p-4">
      <dt className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
        {label}
      </dt>
      <dd className="mt-2 font-serif text-stat text-ink">{value}</dd>
    </dl>
  );
}

function AggregateTable({
  aggregates,
}: {
  aggregates: DashboardSummary["aggregates"];
}) {
  return (
    <div
      role="region"
      aria-labelledby="aggregate-table-title"
      tabIndex={0}
      className="outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <h2 id="aggregate-table-title" className="mb-3 text-ui text-ink">
        Comparison Table
      </h2>
      <Table>
        <TableCaption>
          Every row keeps its metric definition, unit, calculation version, and
          evidence identifiers.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Metric</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Aggregation</TableHead>
            <TableHead>Evidence</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {aggregates.map((aggregate) => (
            <TableRow key={aggregate.id}>
              <TableCell>{aggregate.metric.label}</TableCell>
              <TableCell className="font-mono">
                {String(aggregate.value.value)} {aggregate.unit}
              </TableCell>
              <TableCell>{aggregate.periodStart.slice(0, 10)}</TableCell>
              <TableCell>
                <Badge variant="outline">{aggregate.aggregateType}</Badge>
              </TableCell>
              <TableCell className="font-mono text-label text-ink-muted lg:text-label-lg">
                {aggregate.observationCount} obs · {aggregate.datasetVersionId}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SavedViews({ views }: { views: DashboardSummary["savedViews"] }) {
  return (
    <div className="border border-rule p-4">
      <h2 className="text-ui text-ink">Saved Views</h2>
      <div className="mt-3 grid gap-2">
        {views.length === 0 ? (
          <p className="text-body text-ink-muted">No saved views yet.</p>
        ) : (
          views.map((view) => (
            <Link
              key={view.id}
              href={`/app/dashboards/${view.id}`}
              className="min-h-target border border-rule p-3 text-body text-ink outline-none hover:bg-brand-soft focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {view.name}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function EvidencePanel({ summary }: { summary: DashboardSummary }) {
  const first = summary.aggregates[0];
  return (
    <div className="border border-rule p-4">
      <h2 className="text-ui text-ink">Evidence</h2>
      {first ? (
        <dl className="mt-3 grid gap-3 text-body">
          <div>
            <dt className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
              Calculation
            </dt>
            <dd>{first.metric.calculationVersion}</dd>
          </div>
          <div>
            <dt className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
              Unit
            </dt>
            <dd>{first.unit}</dd>
          </div>
          <div>
            <dt className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
              Dimension Hash
            </dt>
            <dd className="break-all">{first.dimensionHash}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-body text-ink-muted">
          No aggregate rows match the current filters.
        </p>
      )}
    </div>
  );
}
