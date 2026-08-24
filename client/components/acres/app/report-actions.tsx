"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Report } from "@acres/shared";
import {
  DownloadIcon,
  FileCheck2Icon,
  FilePlus2Icon,
  FileTextIcon,
  SendIcon,
} from "lucide-react";

import {
  createExport,
  createReportRevision,
  getExportDownload,
  createReport,
  publishReportRevision,
  updateReportRevision,
} from "@/lib/api/browser";
import { ApiClientError, getApiErrorCopy } from "@/lib/api/envelope";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
  const [isPending, startTransition] = useTransition();

  if (revision === null) return null;
  const immutable = revision.status === "published" || !canUpdate;
  const revisionId = revision.id;

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (caught) {
        setError(toActionError(caught));
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    });
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (immutable) return;
    const form = new FormData(event.currentTarget);
    const aggregateId = String(form.get("aggregateId") ?? "").trim();
    run(() =>
      updateReportRevision(organizationId, report.id, revisionId, {
        title: String(form.get("title") ?? ""),
        summary: String(form.get("summary") ?? ""),
        insights: [
          {
            heading: String(form.get("insightHeading") ?? ""),
            body: String(form.get("insightBody") ?? ""),
          },
        ],
        evidence: aggregateId ? [{ aggregateId }] : undefined,
        expectedVersion: report.version,
      }),
    );
  }

  return (
    <div className="grid gap-5">
      {error ? <ActionAlert innerRef={errorRef} error={error} /> : null}
      <form onSubmit={onSubmit} aria-busy={isPending} className="grid gap-5">
        <FieldGroup>
          <Field data-disabled={immutable}>
            <FieldLabel htmlFor="edit-title">Title</FieldLabel>
            <Input
              id="edit-title"
              name="title"
              defaultValue={revision.title}
              disabled={immutable}
              required
              maxLength={160}
            />
          </Field>
          <Field data-disabled={immutable}>
            <FieldLabel htmlFor="edit-summary">Summary</FieldLabel>
            <Textarea
              id="edit-summary"
              name="summary"
              defaultValue={revision.summary ?? ""}
              disabled={immutable}
              maxLength={1000}
            />
          </Field>
          <Field data-disabled={immutable}>
            <FieldLabel htmlFor="edit-insight-heading">Insight heading</FieldLabel>
            <Input
              id="edit-insight-heading"
              name="insightHeading"
              defaultValue={revision.insights[0]?.heading ?? ""}
              disabled={immutable}
              required
              maxLength={160}
            />
          </Field>
          <Field data-disabled={immutable}>
            <FieldLabel htmlFor="edit-insight-body">Insight body</FieldLabel>
            <Textarea
              id="edit-insight-body"
              name="insightBody"
              defaultValue={revision.insights[0]?.body ?? ""}
              disabled={immutable}
              required
              maxLength={4000}
            />
          </Field>
          <Field data-disabled={immutable}>
            <FieldLabel htmlFor="edit-aggregate-id">Replacement aggregate ID</FieldLabel>
            <Input id="edit-aggregate-id" name="aggregateId" disabled={immutable} />
            <FieldDescription>
              Leave blank to keep the current evidence set.
            </FieldDescription>
            {revision.evidence.length === 0 ? (
              <FieldError>Publishing requires at least one evidence link.</FieldError>
            ) : null}
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap gap-3">
          {canUpdate ? (
            <Button type="submit" disabled={isPending || immutable}>
              <FileCheck2Icon data-icon="inline-start" aria-hidden="true" />
              Save Draft
            </Button>
          ) : null}
          {canPublish ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isPending || revision.status === "published"}
              onClick={() =>
                run(() =>
                  publishReportRevision(organizationId, report.id, revision.id),
                )
              }
            >
              <SendIcon data-icon="inline-start" aria-hidden="true" />
              Publish
            </Button>
          ) : null}
          {canUpdate && revision.status === "published" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={isPending}
              onClick={() =>
                run(() =>
                  createReportRevision(organizationId, report.id, {
                    expectedVersion: report.version,
                  }),
                )
              }
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
                disabled={isPending || revision.status !== "published"}
                onClick={() =>
                  run(() =>
                    createExport(organizationId, {
                      revisionId: revision.id,
                      format: "csv",
                    }),
                  )
                }
              >
                <DownloadIcon data-icon="inline-start" aria-hidden="true" />
                Export CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending || revision.status !== "published"}
                onClick={() =>
                  run(() =>
                    createExport(organizationId, {
                      revisionId: revision.id,
                      format: "pdf",
                    }),
                  )
                }
              >
                <DownloadIcon data-icon="inline-start" aria-hidden="true" />
                Export PDF
              </Button>
            </>
          ) : null}
        </div>
      </form>
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
