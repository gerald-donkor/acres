"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  IngestionRunSummary,
  UploadStatus,
  ValidationIssueSummary,
} from "@acres/shared";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  FileUpIcon,
  LayersIcon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  XCircleIcon,
} from "lucide-react";

import {
  cancelIngestionRun,
  completeUpload,
  createDataset,
  createMapping,
  initiateUpload,
  listIngestionIssues,
  startIngestionRun,
  streamIngestionRunProgress,
} from "@/lib/api/browser";
import { ApiClientError, getApiErrorCopy } from "@/lib/api/envelope";
import { calculateSha256 } from "@/lib/crypto/checksum";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type ActionError = {
  title: string;
  message: string;
  action: string;
  requestId: string | null;
};

function toActionError(caught: unknown): ActionError {
  const copy = getApiErrorCopy(caught);
  return {
    title: copy.title,
    message: copy.message,
    action: copy.action,
    requestId: caught instanceof ApiClientError ? caught.requestId : null,
  };
}

function ActionAlert({
  innerRef,
  error,
}: {
  innerRef: React.RefObject<HTMLDivElement | null>;
  error: ActionError;
}) {
  return (
    <div
      ref={innerRef}
      tabIndex={-1}
      role="alert"
      aria-live="assertive"
      className="outline-none"
    >
      <Alert variant="destructive">
        <AlertTitle>{error.title}</AlertTitle>
        <AlertDescription>
          <p>{error.message}</p>
          <p className="mt-1">{error.action}</p>
          {error.requestId && (
            <p className="mt-2 font-mono text-label text-ink-muted lg:text-label-lg">
              Request ID: {error.requestId}
            </p>
          )}
        </AlertDescription>
      </Alert>
    </div>
  );
}

export function CreateDatasetForm({
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
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();

    startTransition(async () => {
      try {
        const dataset = await createDataset(organizationId, {
          name,
          description: description || undefined,
        });
        router.push(`/app/datasets/${dataset.id}`);
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
          <FieldLabel htmlFor="dataset-name">Name</FieldLabel>
          <Input
            id="dataset-name"
            name="name"
            required
            maxLength={160}
            placeholder="e.g. Regional Housing Starts"
          />
          <FieldDescription>
            A descriptive title for this regional dataset.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="dataset-description">Description</FieldLabel>
          <Textarea
            id="dataset-description"
            name="description"
            maxLength={1000}
            placeholder="e.g. Quarterly housing supply file imported from the regional planning office."
          />
          <FieldDescription>
            Optional operational context, source provider, or collection method.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="default"
          size="lg"
          disabled={isPending}
          className="min-h-target"
        >
          {isPending ? (
            <>
              <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
              Creating dataset...
            </>
          ) : (
            <>
              <DatabaseIcon aria-hidden="true" className="size-4" />
              Create Dataset
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  geojson: "application/geo+json",
  json: "application/json",
};

function resolveMediaType(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext in EXTENSION_MEDIA_TYPES) {
    return EXTENSION_MEDIA_TYPES[ext];
  }
  if (file.type && Object.values(EXTENSION_MEDIA_TYPES).includes(file.type)) {
    return file.type;
  }
  return "text/csv";
}

type StepState = "select" | "upload" | "map" | "ingest" | "complete";

export function DatasetIngestionWorkflow({
  organizationId,
  datasetId,
}: {
  organizationId: string;
  datasetId: string;
}) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<ActionError | null>(null);

  // Workflow state
  const [step, setStep] = useState<StepState>("select");
  const [file, setFile] = useState<File | null>(null);
  const [mediaType, setMediaType] = useState<string>("text/csv");
  const [checksumHex, setChecksumHex] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);

  // Run state
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [run, setRun] = useState<IngestionRunSummary | null>(null);
  const [issues, setIssues] = useState<ValidationIssueSummary[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(false);

  // Subscription cleanup
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      setChecksumHex(null);
      return;
    }

    setFile(selected);
    const resolvedType = resolveMediaType(selected);
    setMediaType(resolvedType);

    setIsHashing(true);
    try {
      const hash = await calculateSha256(selected);
      setChecksumHex(hash);
    } catch (err) {
      setError(toActionError(err));
    } finally {
      setIsHashing(false);
    }
  }

  async function handleUpload() {
    if (!file || !checksumHex) return;
    setError(null);
    setIsUploading(true);

    try {
      // 1. Initiate upload
      const initiated = await initiateUpload(organizationId, {
        filename: file.name,
        mediaType,
        byteCount: file.size,
        checksumHex,
      });

      // 2. Direct PUT upload
      const putHeaders: Record<string, string> = {
        ...initiated.upload.headers,
      };
      if (!putHeaders["content-type"]) {
        putHeaders["content-type"] = mediaType;
      }

      const putResponse = await fetch(initiated.upload.url, {
        method: initiated.upload.method,
        headers: putHeaders,
        body: file,
      });

      if (!putResponse.ok) {
        throw new Error(
          `Storage upload failed with status ${putResponse.status}`,
        );
      }

      // 3. Complete upload
      const completed = await completeUpload(
        organizationId,
        initiated.uploadId,
        {
          byteCount: file.size,
          checksumHex,
        },
      );

      setUploadStatus(completed);
      setStep("map");
    } catch (err) {
      setError(toActionError(err));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setIsUploading(false);
    }
  }

  async function handleStartIngestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uploadStatus) return;
    setError(null);
    setIsStartingRun(true);

    const form = new FormData(event.currentTarget);
    const regionColumn = String(form.get("regionColumn") ?? "").trim();
    const metricColumn = String(form.get("metricColumn") ?? "").trim();
    const metricKey = String(form.get("metricKey") ?? "").trim();
    const metricLabel = String(form.get("metricLabel") ?? "").trim();
    const metricValueType = String(form.get("metricValueType") ?? "numeric");
    const metricUnit = String(form.get("metricUnit") ?? "").trim();
    const metricAggregation = String(form.get("metricAggregation") ?? "sum");
    const periodColumn = String(form.get("periodColumn") ?? "").trim();
    const dimensionColumnsRaw = String(
      form.get("dimensionColumns") ?? "",
    ).trim();
    const parsedDimensions = dimensionColumnsRaw
      ? dimensionColumnsRaw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const dimensionColumns =
      parsedDimensions.length > 0 ? parsedDimensions : undefined;

    try {
      // 1. Create mapping
      const mapping = await createMapping(organizationId, datasetId, {
        uploadId: uploadStatus.id,
        mapping: {
          regionColumn: regionColumn || undefined,
          metrics: metricColumn
            ? [
                {
                  column: metricColumn,
                  key: metricKey || metricColumn,
                  label: metricLabel || undefined,
                  valueType: metricValueType,
                  unit: metricUnit || "unit",
                  aggregation: metricAggregation,
                  periodColumn: periodColumn || undefined,
                  dimensionColumns,
                },
              ]
            : undefined,
        },
      });

      // 2. Start ingestion run
      const startedRun = await startIngestionRun(organizationId, datasetId, {
        uploadId: uploadStatus.id,
        mappingId: mapping.id,
      });

      setRun(startedRun);
      setStep("ingest");

      // 3. Subscribe to SSE events
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }

      unsubscribeRef.current = streamIngestionRunProgress(
        organizationId,
        startedRun.id,
        {
          onUpdate: (updatedRun) => {
            setRun(updatedRun);
            if (
              updatedRun.state === "published" ||
              updatedRun.state === "failed" ||
              updatedRun.state === "cancelled"
            ) {
              if (updatedRun.state === "published") {
                router.refresh();
              }
              if (updatedRun.state === "failed") {
                loadIssues(updatedRun.id);
              }
            }
          },
          onError: (streamErr) => {
            setError(toActionError(streamErr));
          },
        },
      );
    } catch (err) {
      setError(toActionError(err));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setIsStartingRun(false);
    }
  }

  async function loadIssues(runId: string) {
    setIsLoadingIssues(true);
    try {
      const fetchedIssues = await listIngestionIssues(organizationId, runId);
      setIssues(fetchedIssues);
    } catch (err) {
      setError(toActionError(err));
    } finally {
      setIsLoadingIssues(false);
    }
  }

  async function handleCancelRun() {
    if (!run) return;
    try {
      const cancelled = await cancelIngestionRun(organizationId, run.id);
      setRun(cancelled);
    } catch (err) {
      setError(toActionError(err));
    }
  }

  function handleReset() {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setStep("select");
    setFile(null);
    setChecksumHex(null);
    setUploadStatus(null);
    setRun(null);
    setIssues([]);
    setError(null);
  }

  return (
    <div className="grid gap-6">
      {error ? <ActionAlert innerRef={errorRef} error={error} /> : null}

      {/* Stepper overview */}
      <div className="flex flex-wrap items-center gap-2 border-b border-rule pb-4 font-mono text-label text-ink-muted lg:text-label-lg">
        <span
          className={step === "select" ? "font-bold text-brand" : "text-ink"}
        >
          1. Select File
        </span>
        <span>→</span>
        <span className={step === "map" ? "font-bold text-brand" : "text-ink"}>
          2. Column Mapping
        </span>
        <span>→</span>
        <span
          className={step === "ingest" ? "font-bold text-brand" : "text-ink"}
        >
          3. Ingestion & Validation
        </span>
      </div>

      {/* Step 1: Select & Upload File */}
      {step === "select" && (
        <div className="grid gap-5">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="source-file">Source File</FieldLabel>
              <Input
                id="source-file"
                type="file"
                accept=".csv,.xlsx,.geojson,.json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/geo+json,application/json"
                onChange={handleFileChange}
                disabled={isUploading}
              />
              <FieldDescription>
                Accepted formats: CSV, XLSX, GeoJSON, and JSON (max 50 MB).
              </FieldDescription>
            </Field>
          </FieldGroup>

          {file && (
            <div className="border border-rule p-4">
              <h3 className="text-ui text-ink">Selected File Inspection</h3>
              <dl className="mt-3 grid gap-2 font-mono text-label text-ink-muted lg:text-label-lg">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>Filename:</dt>
                  <dd className="text-ink">{file.name}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>Size:</dt>
                  <dd className="text-ink">{formatBytes(file.size)}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>Media Type:</dt>
                  <dd className="text-ink">{mediaType}</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt>SHA-256 Checksum:</dt>
                  <dd className="text-ink truncate max-w-xs md:max-w-md">
                    {isHashing ? "Computing..." : checksumHex}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="default"
              size="lg"
              onClick={handleUpload}
              disabled={!file || !checksumHex || isHashing || isUploading}
              className="min-h-target"
            >
              {isUploading ? (
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                  Uploading to quarantine storage...
                </>
              ) : (
                <>
                  <FileUpIcon aria-hidden="true" className="size-4" />
                  Initiate & Upload File
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Configure Mapping */}
      {step === "map" && uploadStatus && (
        <form onSubmit={handleStartIngestion} className="grid gap-5">
          <div className="flex items-center justify-between border border-rule p-3">
            <div className="flex items-center gap-2">
              <CheckCircle2Icon
                aria-hidden="true"
                className="size-4 text-brand"
              />
              <span className="text-body font-medium text-ink">
                Upload accepted: {uploadStatus.filename}
              </span>
            </div>
            <Badge variant="secondary">{uploadStatus.state}</Badge>
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="region-col">Region Column</FieldLabel>
              <Input
                id="region-col"
                name="regionColumn"
                defaultValue="region"
                placeholder="e.g. region or region_code"
                required
              />
              <FieldDescription>
                Column in source file containing region codes, ISO identifiers,
                or matched aliases.
              </FieldDescription>
            </Field>

            <div className="border-t border-rule pt-4">
              <h3 className="font-medium text-ui text-ink">
                Metric Mapping (Optional)
              </h3>
              <p className="text-body text-ink-muted">
                Map columns to regional analytical metrics.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="metric-col">Source Column</FieldLabel>
                <Input
                  id="metric-col"
                  name="metricColumn"
                  defaultValue="population"
                  placeholder="e.g. population"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="metric-key">Metric Key</FieldLabel>
                <Input
                  id="metric-key"
                  name="metricKey"
                  defaultValue="population"
                  placeholder="e.g. population"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="metric-label">Display Label</FieldLabel>
                <Input
                  id="metric-label"
                  name="metricLabel"
                  defaultValue="Population"
                  placeholder="e.g. Total Population"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="metric-type">Value Type</FieldLabel>
                <NativeSelect id="metric-type" name="metricValueType">
                  <option value="numeric">numeric</option>
                  <option value="text">text</option>
                  <option value="boolean">boolean</option>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="metric-unit">Unit</FieldLabel>
                <Input
                  id="metric-unit"
                  name="metricUnit"
                  defaultValue="people"
                  placeholder="e.g. people, %, index"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="metric-agg">Aggregation</FieldLabel>
                <NativeSelect id="metric-agg" name="metricAggregation">
                  <option value="sum">sum</option>
                  <option value="avg">avg</option>
                  <option value="min">min</option>
                  <option value="max">max</option>
                  <option value="count">count</option>
                  <option value="latest">latest</option>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="period-col">Period Column</FieldLabel>
                <Input
                  id="period-col"
                  name="periodColumn"
                  placeholder="e.g. year, date, quarter (optional)"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="dim-cols">Dimension Columns</FieldLabel>
                <Input
                  id="dim-cols"
                  name="dimensionColumns"
                  placeholder="e.g. segment, category (optional)"
                />
              </Field>
            </div>
          </FieldGroup>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="default"
              size="lg"
              disabled={isStartingRun}
              className="min-h-target"
            >
              {isStartingRun ? (
                <>
                  <Loader2Icon
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                  Starting Ingestion Run...
                </>
              ) : (
                <>
                  <PlayIcon aria-hidden="true" className="size-4" />
                  Start Ingestion Run
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={handleReset}
              className="min-h-target"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Step 3: Ingestion Progress & Results */}
      {step === "ingest" && run && (
        <div className="grid gap-6">
          <div className="border border-rule p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LayersIcon aria-hidden="true" className="size-4 text-brand" />
                <h3 className="text-ui text-ink">Ingestion Run</h3>
              </div>
              <Badge
                variant={
                  run.state === "published"
                    ? "secondary"
                    : run.state === "failed"
                      ? "destructive"
                      : "outline"
                }
              >
                {run.state}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="flex justify-between text-body text-ink-muted">
                <span>Stage: {run.stage}</span>
                <span className="font-mono">{run.progressPercent}%</span>
              </div>
              <Progress
                value={run.progressPercent}
                aria-label="Ingestion progress"
              />
              <div aria-live="polite" className="sr-only">
                Ingestion run {run.state}, stage {run.stage},{" "}
                {run.progressPercent} percent complete.
              </div>
            </div>

            <dl className="mt-4 grid gap-2 border-t border-rule pt-3 font-mono text-label text-ink-muted lg:text-label-lg">
              <div className="flex flex-wrap justify-between gap-2">
                <dt>Run ID:</dt>
                <dd className="text-ink">{run.id}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt>Created:</dt>
                <dd className="text-ink">
                  {new Date(run.createdAt).toLocaleTimeString()}
                </dd>
              </div>
              {run.failure && (
                <div className="flex flex-wrap justify-between gap-2 text-destructive">
                  <dt>Failure:</dt>
                  <dd>{run.failure.message ?? run.failure.code}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {(run.state === "queued" || run.state === "running") && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleCancelRun}
                  className="min-h-target"
                >
                  <XCircleIcon aria-hidden="true" className="size-4" />
                  Cancel Run
                </Button>
              )}
              {run.state === "published" && (
                <Button
                  type="button"
                  variant="default"
                  size="lg"
                  onClick={handleReset}
                  className="min-h-target"
                >
                  <CheckCircle2Icon aria-hidden="true" className="size-4" />
                  Ingest Another File
                </Button>
              )}
              {(run.state === "failed" || run.state === "cancelled") && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={handleReset}
                  className="min-h-target"
                >
                  <RotateCcwIcon aria-hidden="true" className="size-4" />
                  Retry Ingestion
                </Button>
              )}
            </div>
          </div>

          {/* Validation issues if any */}
          {isLoadingIssues && (
            <div className="flex items-center gap-2 border border-rule p-4 text-body text-ink-muted">
              <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
              <span>Loading validation issues...</span>
            </div>
          )}
          {issues.length > 0 && (
            <div
              role="region"
              aria-labelledby="issues-table-title"
              tabIndex={0}
              className="border border-rule p-4 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3
                  id="issues-table-title"
                  className="flex items-center gap-2 text-ui text-ink"
                >
                  <AlertCircleIcon
                    aria-hidden="true"
                    className="size-4 text-destructive"
                  />
                  Validation Issues ({issues.length})
                </h3>
              </div>
              <Table>
                <TableCaption>
                  Issues reported during parser inspection and geography/metric
                  validation.
                </TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severity</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Row / Col / Region</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {issues.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell>
                        <Badge
                          variant={
                            issue.severity === "error"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {issue.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-label text-ink-muted">
                        {issue.code}
                      </TableCell>
                      <TableCell className="text-ink">{issue.message}</TableCell>
                      <TableCell className="font-mono text-label text-ink-muted">
                        {[
                          issue.rowNumber !== null &&
                          issue.rowNumber !== undefined
                            ? `Row ${issue.rowNumber}`
                            : null,
                          issue.columnKey ? `Col ${issue.columnKey}` : null,
                          issue.regionRef
                            ? `Region ${issue.regionRef}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
