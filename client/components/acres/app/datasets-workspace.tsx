import Link from "next/link";
import type { DatasetSummary, DatasetVersionSummary, OrganizationSummary } from "@acres/shared";
import { DatabaseIcon } from "lucide-react";

import {
  CreateDatasetForm,
  DatasetIngestionWorkflow,
} from "@/components/acres/app/dataset-actions";
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

export function DatasetsWorkspace({
  organization,
  datasets,
  mode = "list",
}: {
  organization: OrganizationSummary;
  datasets: DatasetSummary[];
  mode?: "list" | "new";
}) {
  const canCreate = organization.membership.role !== "viewer";

  return (
    <section aria-labelledby="datasets-title" className="grid gap-6">
      <DatasetsHeader organization={organization} />
      {mode === "new" && canCreate ? (
        <div className="max-w-3xl border border-rule p-4">
          <h2 className="font-serif text-title text-ink">New dataset.</h2>
          <div className="mt-5">
            <CreateDatasetForm organizationId={organization.id} />
          </div>
        </div>
      ) : null}
      {datasets.length === 0 ? (
        <Empty className="border border-rule">
          <EmptyMedia variant="icon">
            <DatabaseIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No datasets yet</EmptyTitle>
            <EmptyDescription>
              {canCreate
                ? "Upload and publish regional data files to generate analytics metrics and evidence."
                : "No datasets have been uploaded or published for this organization."}
            </EmptyDescription>
          </EmptyHeader>
          {canCreate ? (
            <EmptyContent>
              <Link
                href="/app/datasets/new"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "min-h-target",
                )}
              >
                New Dataset
              </Link>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <DatasetTable datasets={datasets} canCreate={canCreate} />
      )}
    </section>
  );
}

export function DatasetDetailWorkspace({
  organization,
  dataset,
  versions,
}: {
  organization: OrganizationSummary;
  dataset: DatasetSummary;
  versions: DatasetVersionSummary[];
}) {
  const role = organization.membership.role;
  const canManage = role !== "viewer";

  return (
    <section aria-labelledby="dataset-title" className="grid gap-6">
      <div className="border-b border-rule pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
              Dataset
            </p>
            <h1 id="dataset-title" className="mt-2 font-serif text-title text-ink">
              {dataset.name}
            </h1>
          </div>
          <Badge variant={dataset.state === "active" ? "secondary" : "outline"}>
            {dataset.state}
          </Badge>
        </div>
        <p className="mt-3 max-w-2xl text-body text-ink-muted">
          {dataset.description ??
            "Uploaded source data, column mappings, and immutable published versions."}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="grid gap-6">
          <VersionsTable versions={versions} />
          {canManage ? (
            <div className="border border-rule p-4">
              <h2 className="text-ui text-ink">Ingestion Pipeline</h2>
              <p className="mt-1 text-body text-ink-muted">
                Upload a CSV, XLSX, GeoJSON, or JSON file, configure column and
                metric mappings, and publish an immutable version.
              </p>
              <div className="mt-5">
                <DatasetIngestionWorkflow
                  organizationId={organization.id}
                  datasetId={dataset.id}
                />
              </div>
            </div>
          ) : (
            <div className="border border-rule p-4">
              <h2 className="text-ui text-ink">Ingestion Management</h2>
              <p className="mt-2 text-body text-ink-muted">
                Your viewer role has read-only access to datasets and published
                versions. Managing uploads, column mappings, and ingestion runs
                requires analyst, admin, or owner membership.
              </p>
            </div>
          )}
        </div>

        <aside className="grid content-start gap-4">
          <div className="border border-rule p-4">
            <h2 className="text-ui text-ink">Dataset Ledger</h2>
            <dl className="mt-4 grid gap-3 font-mono text-label text-ink-muted lg:text-label-lg">
              <div>
                <dt>ID</dt>
                <dd className="truncate text-ink">{dataset.id}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd className="text-ink">{dataset.state}</dd>
              </div>
              <div>
                <dt>Published Versions</dt>
                <dd className="text-ink">{versions.length}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd className="text-ink">{formatDate(dataset.createdAt)}</dd>
              </div>
              <div>
                <dt>Last Updated</dt>
                <dd className="text-ink">{formatDate(dataset.updatedAt)}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </section>
  );
}

function DatasetsHeader({
  organization,
}: {
  organization: OrganizationSummary;
}) {
  return (
    <div className="border-b border-rule pb-5">
      <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
        Data Sets
      </p>
      <h1 id="datasets-title" className="mt-2 font-serif text-title text-ink">
        Manage source data and versions.
      </h1>
      <p className="mt-3 max-w-2xl text-body text-ink-muted">
        {organization.name} can upload source files (CSV, XLSX, GeoJSON, JSON),
        configure column and metric mappings, and publish immutable dataset
        versions.
      </p>
    </div>
  );
}

function DatasetTable({
  datasets,
  canCreate,
}: {
  datasets: DatasetSummary[];
  canCreate: boolean;
}) {
  return (
    <div
      role="region"
      aria-labelledby="datasets-table-title"
      tabIndex={0}
      className="outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="datasets-table-title" className="text-ui text-ink">
          Dataset Library
        </h2>
        {canCreate ? (
          <Link
            href="/app/datasets/new"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "min-h-target",
            )}
          >
            New Dataset
          </Link>
        ) : null}
      </div>
      <Table>
        <TableCaption>
          Published versions are immutable. Ingestion runs validate regional
          geography and metric definitions before publication.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Dataset</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Latest Version</TableHead>
            <TableHead>Published</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {datasets.map((dataset) => (
            <TableRow key={dataset.id}>
              <TableCell>
                <Link
                  href={`/app/datasets/${dataset.id}`}
                  className="text-ink underline-offset-4 hover:underline"
                >
                  {dataset.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge
                  variant={dataset.state === "active" ? "secondary" : "outline"}
                >
                  {dataset.state}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-label text-ink-muted lg:text-label-lg">
                {dataset.latestVersion
                  ? `v${dataset.latestVersion.versionNumber}`
                  : "No versions"}
              </TableCell>
              <TableCell>
                {dataset.latestVersion
                  ? formatDate(dataset.latestVersion.publishedAt)
                  : "—"}
              </TableCell>
              <TableCell>{formatDate(dataset.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function VersionsTable({
  versions,
}: {
  versions: DatasetVersionSummary[];
}) {
  return (
    <div
      role="region"
      aria-labelledby="versions-table-title"
      tabIndex={0}
      className="outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="versions-table-title" className="text-ui text-ink">
          Published Versions
        </h2>
        <Badge variant="outline">{versions.length} versions</Badge>
      </div>
      {versions.length === 0 ? (
        <div className="border border-rule p-4 text-body text-ink-muted">
          No published versions yet. Run the ingestion workflow below to publish
          version 1.
        </div>
      ) : (
        <Table>
          <TableCaption>
            Published versions are frozen snapshots with deterministic source
            checksums.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Checksum</TableHead>
              <TableHead>Published</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((version) => (
              <TableRow key={version.id}>
                <TableCell className="font-mono font-medium text-ink">
                  v{version.versionNumber}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      version.publicationStatus === "published"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {version.publicationStatus}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-label text-ink-muted lg:text-label-lg">
                  {version.checksumHex
                    ? `${version.checksumHex.slice(0, 12)}…`
                    : "—"}
                </TableCell>
                <TableCell>{formatDate(version.publishedAt)}</TableCell>
              </TableRow>
            ))}
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
