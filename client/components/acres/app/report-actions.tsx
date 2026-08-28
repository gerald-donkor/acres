"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AiDraftProposal, Report, ReportEvidence } from "@acres/shared";
import {
  CheckCircle2Icon,
  DownloadIcon,
  Edit3Icon,
  FileCheck2Icon,
  FilePlus2Icon,
  FileTextIcon,
  SendIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";

import {
  createExport,
  createReportRevision,
  getExportDownload,
  createReport,
  generateAiDrafts,
  publishReportRevision,
  submitReportRevisionForReview,
  updateReportRevision,
} from "@/lib/api/browser";
import { ApiClientError, getApiErrorCopy } from "@/lib/api/envelope";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ActionError = {
  title: string;
  message: string;
  action: string;
  requestId: string | null;
};

export function CreateReportForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const aggregateId = String(form.get("aggregateId") ?? "").trim();
    startTransition(async () => {
      try {
        const report = await createReport(organizationId, {
          title: String(form.get("title") ?? ""),
          summary: String(form.get("summary") ?? ""),
          insights: [
            {
              heading: String(form.get("insightHeading") ?? ""),
              body: String(form.get("insightBody") ?? ""),
            },
          ],
          evidence: aggregateId ? [{ aggregateId }] : [],
        });
        router.push(`/app/reports/${report.id}`);
        router.refresh();
      } catch (caught) {
        setError(toActionError(caught));
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    });
  }

  return (
    <form onSubmit={onSubmit} aria-busy={isPending} className="grid gap-5">
      {error ? <ActionAlert innerRef={errorRef} error={error} /> : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="report-title">Title</FieldLabel>
          <Input id="report-title" name="title" required maxLength={160} />
        </Field>
        <Field>
          <FieldLabel htmlFor="report-summary">Summary</FieldLabel>
          <Textarea id="report-summary" name="summary" maxLength={1000} />
          <FieldDescription>
            Summarize what this report covers without adding unsupported claims.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="insight-heading">Insight heading</FieldLabel>
          <Input
            id="insight-heading"
            name="insightHeading"
            required
            maxLength={160}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="insight-body">Insight body</FieldLabel>
          <Textarea
            id="insight-body"
            name="insightBody"
            required
            maxLength={4000}
          />
        </Field>
        <Field data-invalid={false}>
          <FieldLabel htmlFor="aggregate-id">Aggregate evidence ID</FieldLabel>
          <Input id="aggregate-id" name="aggregateId" />
          <FieldDescription>
            Use an aggregate ID from the dashboard evidence table.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={isPending} className="min-h-target w-fit">
        <FileTextIcon data-icon="inline-start" aria-hidden="true" />
        Create Draft
      </Button>
    </form>
  );
}

export function RevisionEditor({
  organizationId,
  report,
  canUpdate,
  canPublish,
  canExport,
}: {
  organizationId: string;
  report: Report;
  canUpdate: boolean;
  canPublish: boolean;
  canExport: boolean;
}) {
  const revision = report.latestRevision;
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [statusAnnouncement, setStatusAnnouncement] = useState<string | null>(null);
  const [isEditingInReview, setIsEditingInReview] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState(revision?.title ?? "");
  const [summary, setSummary] = useState(revision?.summary ?? "");
  const [insightHeading, setInsightHeading] = useState(
    revision?.insights[0]?.heading ?? "",
  );
  const [insightBody, setInsightBody] = useState(
    revision?.insights[0]?.body ?? "",
  );

  if (revision === null) return null;
  const revisionId = revision.id;

  const hasInsights = revision.insights.length > 0;
  const hasEvidence = revision.evidence.length > 0;
  const isReady = hasInsights && hasEvidence;
  const isDraft = revision.status === "draft";
  const isInReview = revision.status === "in_review";
  const isPublished = revision.status === "published";
  const isSuperseded = revision.status === "superseded";

  function run(action: () => Promise<unknown>, announcement?: string) {
    startTransition(async () => {
      try {
        setError(null);
        await action();
        if (announcement) {
          setStatusAnnouncement(announcement);
        }
        setIsEditingInReview(false);
        router.refresh();
      } catch (caught) {
        setError(toActionError(caught));
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    });
  }

  function onApplyAiDraft(heading: string, body: string) {
    setInsightHeading(heading);
    setInsightBody(body);
    setStatusAnnouncement("Copied AI proposal to draft insight fields.");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate || isPublished || isSuperseded) return;
    const form = new FormData(event.currentTarget);
    const aggregateId = String(form.get("aggregateId") ?? "").trim();
    run(
      () =>
        updateReportRevision(organizationId, report.id, revisionId, {
          title: title.trim(),
          summary: summary.trim() ? summary.trim() : undefined,
          insights: [
            {
              heading: insightHeading.trim(),
              body: insightBody.trim(),
            },
          ],
          evidence: aggregateId ? [{ aggregateId }] : undefined,
          expectedVersion: report.version,
        }),
      "Draft revision saved.",
    );
  }

  return (
    <div className="grid gap-6">
      {statusAnnouncement ? (
        <div role="status" aria-live="polite" className="sr-only">
          {statusAnnouncement}
        </div>
      ) : null}

      {error ? <ActionAlert innerRef={errorRef} error={error} /> : null}

      {/* Revision Status & Readiness Panel */}
      <RevisionStatusPanel
        revision={revision}
        hasInsights={hasInsights}
        hasEvidence={hasEvidence}
        isReady={isReady}
      />

      {/* State-specific UI */}
      {isDraft || (isInReview && isEditingInReview) ? (
        <div className="grid gap-6">
          {isInReview && isEditingInReview ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
              <p className="text-ui text-ink">Editing In-Review Revision</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditingInReview(false)}
              >
                Cancel editing
              </Button>
            </div>
          ) : null}

          {isDraft && report.aiDraftEnabled ? (
            <AiDraftPanel
              organizationId={organizationId}
              report={report}
              revision={revision}
              canUpdate={canUpdate}
              onApplyDraft={onApplyAiDraft}
            />
          ) : null}

          <form onSubmit={onSubmit} aria-busy={isPending} className="grid gap-5">
            <FieldGroup>
              <Field data-disabled={!canUpdate}>
                <FieldLabel htmlFor="edit-title">Title</FieldLabel>
                <Input
                  id="edit-title"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={!canUpdate}
                  required
                  maxLength={160}
                />
              </Field>
              <Field data-disabled={!canUpdate}>
                <FieldLabel htmlFor="edit-summary">Summary</FieldLabel>
                <Textarea
                  id="edit-summary"
                  name="summary"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  disabled={!canUpdate}
                  maxLength={1000}
                />
              </Field>
              <Field data-disabled={!canUpdate}>
                <FieldLabel htmlFor="edit-insight-heading">Insight heading</FieldLabel>
                <Input
                  id="edit-insight-heading"
                  name="insightHeading"
                  value={insightHeading}
                  onChange={(e) => setInsightHeading(e.target.value)}
                  disabled={!canUpdate}
                  required
                  maxLength={160}
                />
              </Field>
              <Field data-disabled={!canUpdate}>
                <FieldLabel htmlFor="edit-insight-body">Insight body</FieldLabel>
                <Textarea
                  id="edit-insight-body"
                  name="insightBody"
                  value={insightBody}
                  onChange={(e) => setInsightBody(e.target.value)}
                  disabled={!canUpdate}
                  required
                  maxLength={4000}
                />
              </Field>
              <Field data-disabled={!canUpdate}>
                <FieldLabel htmlFor="edit-aggregate-id">
                  Replacement aggregate ID
                </FieldLabel>
                <Input
                  id="edit-aggregate-id"
                  name="aggregateId"
                  disabled={!canUpdate}
                />
                <FieldDescription>
                  Leave blank to keep the current evidence set.
                </FieldDescription>
                {!hasEvidence ? (
                  <FieldError>
                    Publishing requires at least one evidence link.
                  </FieldError>
                ) : null}
              </Field>
            </FieldGroup>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              {canUpdate ? (
                <Button type="submit" disabled={isPending}>
                  <FileCheck2Icon data-icon="inline-start" aria-hidden="true" />
                  Save Draft
                </Button>
              ) : null}

              {canUpdate && isDraft ? (
                <Button
                  type="button"
                  variant="default"
                  disabled={isPending || !isReady}
                  onClick={() =>
                    run(
                      () =>
                        submitReportRevisionForReview(
                          organizationId,
                          report.id,
                          revision.id,
                        ),
                      "Report revision submitted for review.",
                    )
                  }
                >
                  <SendIcon data-icon="inline-start" aria-hidden="true" />
                  Submit for review
                </Button>
              ) : null}

              {canPublish && isDraft ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isPending || !isReady}
                  onClick={() =>
                    run(
                      () =>
                        publishReportRevision(
                          organizationId,
                          report.id,
                          revision.id,
                        ),
                      "Report revision published.",
                    )
                  }
                >
                  <FileCheck2Icon data-icon="inline-start" aria-hidden="true" />
                  Publish
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      ) : isInReview ? (
        <RevisionReviewPanel
          revision={revision}
          canPublish={canPublish}
          canUpdate={canUpdate}
          isPending={isPending}
          onPublish={() =>
            run(
              () =>
                publishReportRevision(
                  organizationId,
                  report.id,
                  revision.id,
                ),
              "Report revision published.",
            )
          }
          onEdit={() => setIsEditingInReview(true)}
        />
      ) : isPublished ? (
        <PublishedRevisionPanel
          revision={revision}
          canUpdate={canUpdate}
          canExport={canExport}
          isPending={isPending}
          onNewRevision={() =>
            run(
              () =>
                createReportRevision(organizationId, report.id, {
                  expectedVersion: report.version,
                }),
              "New draft revision created.",
            )
          }
          onExport={(format) =>
            run(
              () =>
                createExport(organizationId, {
                  revisionId: revision.id,
                  format,
                }),
              `Export ${format.toUpperCase()} requested.`,
            )
          }
        />
      ) : (
        <div className="border border-rule p-4">
          <p className="text-body text-ink-muted">
            This revision is superseded and kept for historical reference.
          </p>
        </div>
      )}
    </div>
  );
}

function RevisionStatusPanel({
  revision,
  hasInsights,
  hasEvidence,
  isReady,
}: {
  revision: NonNullable<Report["latestRevision"]>;
  hasInsights: boolean;
  hasEvidence: boolean;
  isReady: boolean;
}) {
  const statusLabel =
    revision.status === "in_review"
      ? "In Review"
      : revision.status === "published"
        ? "Published"
        : revision.status === "superseded"
          ? "Superseded"
          : "Draft";

  const badgeVariant =
    revision.status === "published"
      ? "secondary"
      : revision.status === "in_review"
        ? "default"
        : "outline";

  return (
    <div className="border border-rule p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div>
          <h2 className="text-ui text-ink">
            Revision {revision.revisionNumber}
          </h2>
          <p className="font-mono text-label text-ink-muted lg:text-label-lg">
            {revision.title}
          </p>
        </div>
        <Badge variant={badgeVariant}>{statusLabel}</Badge>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
            Insights
          </dt>
          <dd className="mt-0.5 font-medium text-ink">
            {revision.insights.length}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
            Evidence
          </dt>
          <dd className="mt-0.5 font-medium text-ink">
            {revision.evidence.length}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
            Submitted
          </dt>
          <dd className="mt-0.5 font-medium text-ink">
            {formatDate(revision.submittedForReviewAt)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-label uppercase text-ink-muted lg:text-label-lg">
            Published
          </dt>
          <dd className="mt-0.5 font-medium text-ink">
            {formatDate(revision.publishedAt)}
          </dd>
        </div>
      </dl>

      {/* Readiness / Review status callout */}
      <div className="mt-4 border-t border-rule pt-3">
        {revision.status === "draft" ? (
          isReady ? (
            <p className="flex items-center gap-2 text-sm text-brand font-medium">
              <CheckCircle2Icon className="size-4 shrink-0" aria-hidden="true" />
              Ready for review. All insight and evidence requirements are met.
            </p>
          ) : (
            <div className="text-sm text-ink-muted">
              <p className="font-medium text-ink">Readiness Requirements:</p>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                <li className={hasInsights ? "text-brand" : "text-ink-muted"}>
                  {hasInsights
                    ? "At least one insight attached."
                    : "Add at least one insight."}
                </li>
                <li className={hasEvidence ? "text-brand" : "text-ink-muted"}>
                  {hasEvidence
                    ? "At least one evidence link attached."
                    : "Attach at least one evidence link."}
                </li>
              </ul>
            </div>
          )
        ) : revision.status === "in_review" ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <ShieldAlertIcon className="size-4 shrink-0 text-brand" aria-hidden="true" />
            Submitted for review on {formatDate(revision.submittedForReviewAt)}. Verification required before publication.
          </p>
        ) : revision.status === "published" ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <ShieldCheckIcon className="size-4 shrink-0 text-brand" aria-hidden="true" />
            Published revision is frozen as immutable governance evidence.
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            Superseded revision retained for audit lineage.
          </p>
        )}
      </div>
    </div>
  );
}

function RevisionReviewPanel({
  revision,
  canPublish,
  canUpdate,
  isPending,
  onPublish,
  onEdit,
}: {
  revision: NonNullable<Report["latestRevision"]>;
  canPublish: boolean;
  canUpdate: boolean;
  isPending: boolean;
  onPublish: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="grid gap-6">
      {/* Review claims section */}
      <div className="border border-rule p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
          <div>
            <h3 className="text-ui text-ink">Claims & Insights</h3>
            <p className="text-sm text-ink-muted">
              {revision.insights.length} insight{revision.insights.length === 1 ? "" : "s"} submitted for review
            </p>
          </div>
          {canUpdate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={onEdit}
            >
              <Edit3Icon data-icon="inline-start" aria-hidden="true" />
              Edit draft
            </Button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-4">
          {revision.insights.map((insight, idx) => (
            <div key={insight.id} className="border-b border-rule pb-4 last:border-b-0 last:pb-0">
              <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
                Claim {idx + 1}
              </p>
              <h4 className="mt-1 font-serif text-lg font-medium text-ink">
                {insight.heading}
              </h4>
              <p className="mt-2 whitespace-pre-wrap text-body text-ink-muted">
                {insight.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Review actions */}
      <div className="border border-rule p-4">
        <h3 className="text-ui text-ink">Review Decision</h3>
        {canPublish ? (
          <div className="mt-2">
            <p className="text-body text-ink-muted">
              Publishing will permanently freeze this revision as official, immutable evidence for this organization. Governed CSV and PDF exports can be requested once published.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="default"
                disabled={isPending}
                onClick={onPublish}
              >
                <SendIcon data-icon="inline-start" aria-hidden="true" />
                Publish
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <Alert className="border-rule">
              <AlertTitle>Awaiting Publication</AlertTitle>
              <AlertDescription>
                This revision has been submitted for review. An organization Owner or Admin has authority to publish it.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </div>
  );
}

function PublishedRevisionPanel({
  revision,
  canUpdate,
  canExport,
  isPending,
  onNewRevision,
  onExport,
}: {
  revision: NonNullable<Report["latestRevision"]>;
  canUpdate: boolean;
  canExport: boolean;
  isPending: boolean;
  onNewRevision: () => void;
  onExport: (format: "csv" | "pdf") => void;
}) {
  return (
    <div className="grid gap-6">
      {/* Insights */}
      <div className="border border-rule p-4">
        <h3 className="text-ui text-ink border-b border-rule pb-3">
          Published Insights ({revision.insights.length})
        </h3>
        <div className="mt-4 grid gap-4">
          {revision.insights.map((insight, idx) => (
            <div key={insight.id} className="border-b border-rule pb-4 last:border-b-0 last:pb-0">
              <p className="font-mono text-label uppercase text-brand lg:text-label-lg">
                Insight {idx + 1}
              </p>
              <h4 className="mt-1 font-serif text-lg font-medium text-ink">
                {insight.heading}
              </h4>
              <p className="mt-2 whitespace-pre-wrap text-body text-ink-muted">
                {insight.body}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Governed Actions */}
      <div className="flex flex-wrap gap-3">
        {canUpdate ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={onNewRevision}
          >
            <FilePlus2Icon data-icon="inline-start" aria-hidden="true" />
            New Draft Revision
          </Button>
        ) : null}
        {canExport ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onExport("csv")}
            >
              <DownloadIcon data-icon="inline-start" aria-hidden="true" />
              Export CSV
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onExport("pdf")}
            >
              <DownloadIcon data-icon="inline-start" aria-hidden="true" />
              Export PDF
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function ExportDownloadButton({
  organizationId,
  exportId,
}: {
  organizationId: string;
  exportId: string;
}) {
  const errorRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="grid gap-2">
      {error ? <ActionAlert innerRef={errorRef} error={error} /> : null}
      <Button
        type="button"
        variant="link"
        disabled={isPending}
        className="min-h-target w-fit px-0"
        onClick={() =>
          startTransition(async () => {
            try {
              const download = await getExportDownload(organizationId, exportId);
              window.location.assign(download.url);
            } catch (caught) {
              setError(toActionError(caught));
              requestAnimationFrame(() => errorRef.current?.focus());
            }
          })
        }
      >
        <DownloadIcon data-icon="inline-start" aria-hidden="true" />
        Download
      </Button>
    </div>
  );
}

function toActionError(error: unknown): ActionError {
  const copy = getApiErrorCopy(error);
  return {
    ...copy,
    requestId: error instanceof ApiClientError ? error.requestId : null,
  };
}

function ActionAlert({
  error,
  innerRef,
}: {
  error: ActionError;
  innerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <Alert ref={innerRef} tabIndex={-1} variant="destructive">
      <AlertTitle>{error.title}</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        <p>{error.action}</p>
        {error.requestId ? (
          <p className="font-mono text-label text-ink-muted lg:text-label-lg">
            Request ID: {error.requestId}
          </p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function getEvidenceDetails(item: ReportEvidence) {
  const snapshot =
    item.snapshot && typeof item.snapshot === "object" && !Array.isArray(item.snapshot)
      ? (item.snapshot as Record<string, unknown>)
      : {};
  const metric =
    snapshot.metric && typeof snapshot.metric === "object" && !Array.isArray(snapshot.metric)
      ? (snapshot.metric as Record<string, unknown>)
      : {};
  const label =
    (typeof metric.label === "string" && metric.label) ||
    (typeof metric.key === "string" && metric.key) ||
    (typeof snapshot.name === "string" && snapshot.name) ||
    item.aggregateId ||
    item.dashboardViewId ||
    "Evidence";
  const value =
    snapshot.value !== undefined && snapshot.value !== null
      ? String(snapshot.value)
      : null;
  const unit = typeof snapshot.unit === "string" ? snapshot.unit : "";
  const period =
    snapshot.periodStart && snapshot.periodEnd
      ? `${formatDate(String(snapshot.periodStart))} – ${formatDate(String(snapshot.periodEnd))}`
      : null;
  const region =
    typeof snapshot.regionId === "string" ? snapshot.regionId : null;
  const observationCount =
    snapshot.observationCount !== undefined && snapshot.observationCount !== null
      ? Number(snapshot.observationCount)
      : null;
  const datasetVersion =
    (typeof snapshot.datasetVersionId === "string" &&
      snapshot.datasetVersionId) ||
    item.datasetVersionId ||
    null;
  const presentation =
    snapshot.presentation &&
    typeof snapshot.presentation === "object" &&
    !Array.isArray(snapshot.presentation)
      ? (snapshot.presentation as Record<string, unknown>)
      : {};
  const chartType =
    typeof presentation.chart === "string" ? presentation.chart : null;

  return {
    label,
    value,
    unit,
    period,
    region,
    observationCount,
    datasetVersion,
    chartType,
  };
}

export function AiDraftPanel({
  organizationId,
  report,
  revision,
  canUpdate,
  onApplyDraft,
}: {
  organizationId: string;
  report: Report;
  revision: NonNullable<Report["latestRevision"]>;
  canUpdate: boolean;
  onApplyDraft: (heading: string, body: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>(() =>
    revision.evidence.map((e) => e.id),
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [proposals, setProposals] = useState<AiDraftProposal[]>([]);

  if (!report.aiDraftEnabled || !canUpdate || revision.status !== "draft") {
    return null;
  }

  function toggleEvidence(id: string) {
    setSelectedEvidenceIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!acknowledged || !purpose.trim() || selectedEvidenceIds.length === 0) {
      return;
    }
    setIsPending(true);
    setError(null);
    setStatusMessage("Generating draft proposals with Gemini...");
    try {
      const result = await generateAiDrafts(
        organizationId,
        report.id,
        revision.id,
        {
          purpose: purpose.trim(),
          evidenceIds: selectedEvidenceIds,
          acknowledgement: true,
        },
      );
      setProposals(result.proposals);
      setStatusMessage(
        `Generated ${result.proposals.length} proposal(s). Review candidates below.`,
      );
    } catch (err) {
      const apiErr = err instanceof ApiClientError ? err : null;
      setError(
        apiErr?.message ||
          "AI draft generation failed. Please check network connectivity or try again.",
      );
      setStatusMessage(null);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="rounded-card border border-rule bg-page p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-surface text-primary">
            <SparklesIcon className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-serif text-base font-semibold text-ink">
              Draft with Gemini preview
            </h3>
            <p className="text-xs text-ink-muted">
              Generate grounded insight proposals citing attached evidence.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
        >
          {isOpen ? "Hide generator" : "Open generator"}
        </Button>
      </div>

      {isOpen ? (
        <form
          onSubmit={handleGenerate}
          className="mt-5 grid gap-4 border-t border-rule pt-4"
        >
          {/* Plain language disclosure */}
          <div className="rounded-card border border-rule bg-canvas p-4 text-xs leading-relaxed text-ink-muted">
            <p className="mb-1 font-semibold text-ink">
              Third-Party AI Disclosure (Unpaid Gemini Developer API)
            </p>
            <p>
              Selected report evidence and prompt text will be transmitted to
              Google&apos;s unpaid Gemini Developer API. Google may use content
              submitted to this service for model training and product
              improvement, which may involve human review. Do not submit
              confidential organizational metrics or personal data.
            </p>
          </div>

          {/* Explicit Acknowledgement Checkbox */}
          <div className="flex items-start gap-2.5">
            <Checkbox
              id="ai-terms-ack"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(Boolean(checked))}
              className="mt-0.5"
            />
            <label
              htmlFor="ai-terms-ack"
              className="cursor-pointer text-xs leading-snug text-ink select-none"
            >
              I understand and agree that this request sends selected report
              evidence to Google&apos;s unpaid Gemini Developer API.
            </label>
          </div>

          {/* Purpose / Focus Statement */}
          <div className="grid gap-1.5">
            <label
              htmlFor="ai-purpose"
              className="text-xs font-medium text-ink"
            >
              Focus instruction / purpose
            </label>
            <Textarea
              id="ai-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. Highlight regional yield anomalies and water efficiency trends"
              rows={2}
              maxLength={500}
              required
            />
          </div>

          {/* Evidence selection */}
          <div className="grid gap-2">
            <label className="text-xs font-medium text-ink">
              Select attached evidence as context ({selectedEvidenceIds.length}/
              {revision.evidence.length})
            </label>
            {revision.evidence.length === 0 ? (
              <p className="text-xs italic text-ink-muted">
                No evidence items currently attached to this draft revision.
                Attach evidence below before generating proposals.
              </p>
            ) : (
              <div className="grid max-h-40 gap-1.5 overflow-y-auto rounded border border-rule p-2">
                {revision.evidence.map((ev) => {
                  const snap =
                    ev.snapshot && typeof ev.snapshot === "object"
                      ? (ev.snapshot as Record<string, unknown>)
                      : {};
                  const metric =
                    snap.metric && typeof snap.metric === "object"
                      ? (snap.metric as Record<string, unknown>)
                      : {};
                  const label =
                    (typeof metric.label === "string" && metric.label) ||
                    (typeof snap.name === "string" && snap.name) ||
                    `Evidence ${ev.id.slice(0, 8)}`;
                  const isChecked = selectedEvidenceIds.includes(ev.id);
                  return (
                    <div
                      key={ev.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <Checkbox
                        id={`ev-select-${ev.id}`}
                        checked={isChecked}
                        onCheckedChange={() => toggleEvidence(ev.id)}
                      />
                      <label
                        htmlFor={`ev-select-${ev.id}`}
                        className="cursor-pointer truncate"
                      >
                        {label}{" "}
                        <span className="font-mono text-[10px] text-ink-muted">
                          ({ev.id.slice(0, 8)})
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Live Status and Alerts */}
          {statusMessage ? (
            <div
              role="status"
              aria-live="polite"
              className="text-xs font-medium text-primary"
            >
              {statusMessage}
            </div>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <ShieldAlertIcon className="size-4" />
              <AlertTitle>Generation Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {/* Submit Action */}
          <div>
            <Button
              type="submit"
              disabled={
                isPending ||
                !acknowledged ||
                !purpose.trim() ||
                selectedEvidenceIds.length === 0
              }
            >
              {isPending ? "Generating..." : "Generate insight proposals"}
            </Button>
          </div>

          {/* Returned proposals */}
          {proposals.length > 0 ? (
            <div className="mt-4 grid gap-3 border-t border-rule pt-4">
              <h4 className="text-sm font-medium text-ink">
                Candidate Proposals ({proposals.length})
              </h4>
              {proposals.map((p, idx) => (
                <div
                  key={idx}
                  className="rounded-card border border-rule bg-canvas p-4 text-xs grid gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="font-serif text-sm font-semibold text-ink">
                      {p.heading}
                    </h5>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => onApplyDraft(p.heading, p.body)}
                    >
                      Use as draft
                    </Button>
                  </div>
                  <p className="text-xs leading-relaxed text-ink-muted">
                    {p.body}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="font-mono text-[10px] uppercase text-ink-muted">
                      Cites:
                    </span>
                    {p.citedEvidenceIds.map((citeId) => (
                      <Badge
                        key={citeId}
                        variant="outline"
                        className="font-mono text-[10px]"
                      >
                        {citeId.slice(0, 8)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
