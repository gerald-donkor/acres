"use client";

import type {
  AiDraftProposalsResult,
  ColumnMappingSummary,
  CompleteUploadInput,
  CreateAiDraftInput,
  CreateDatasetInput,
  CreateDashboardViewInput,
  CreateExportInput,
  CreateMappingInput,
  CreateOrganizationInput,
  CreateReportInput,
  CreateRevisionInput,
  DashboardView,
  DatasetSummary,
  DatasetVersionSummary,
  ExportDownload,
  ExportRequest,
  IngestionRunSummary,
  InitiateUploadInput,
  InitiateUploadResult,
  LoginInput,
  OrganizationSummary,
  RegisterAccountInput,
  Report,
  SessionProfile,
  StartIngestionRunInput,
  UpdateDatasetInput,
  UpdateRevisionInput,
  UploadDownload,
  UploadStatus,
  ValidationIssueSummary,
} from "@acres/shared";

import { isApiClientError, parseApiResponse } from "@/lib/api/envelope";
import { createIdempotencyKey } from "@/lib/api/idempotency";
import { streamSse } from "@/lib/api/sse";

type CsrfToken = {
  csrfToken: string;
  headerName: "x-csrf-token";
};

let csrfToken: CsrfToken | null = null;

async function apiFetch<TData>(
  path: string,
  init: RequestInit & { organizationId?: string } = {},
): Promise<TData> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (init.organizationId !== undefined) {
    headers.set("x-acres-organization-id", init.organizationId);
  }

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  return parseApiResponse<TData>(response);
}

export async function refreshCsrfToken(): Promise<CsrfToken> {
  csrfToken = await apiFetch<CsrfToken>("/auth/csrf", { method: "GET" });
  return csrfToken;
}

async function csrfHeaders(): Promise<Headers> {
  const token = csrfToken ?? (await refreshCsrfToken());
  const headers = new Headers();
  headers.set(token.headerName, token.csrfToken);
  return headers;
}

async function apiMutation<TData>(
  path: string,
  body?: unknown,
  init: {
    method?: "POST" | "PATCH" | "DELETE";
    idempotencyKey?: string;
    organizationId?: string;
  } = {},
): Promise<TData> {
  const headers = await csrfHeaders();
  if (init.idempotencyKey !== undefined) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }

  try {
    return await apiFetch<TData>(path, {
      method: init.method ?? "POST",
      headers,
      organizationId: init.organizationId,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (isApiClientError(error) && error.code === "CSRF_INVALID") {
      csrfToken = null;
    }
    throw error;
  }
}

export async function login(input: LoginInput): Promise<SessionProfile> {
  const session = await apiMutation<SessionProfile>("/auth/login", input);
  await refreshCsrfToken();
  return session;
}

export async function register(
  input: RegisterAccountInput,
): Promise<SessionProfile> {
  const session = await apiMutation<SessionProfile>("/auth/register", input);
  await refreshCsrfToken();
  return session;
}

export async function logout(): Promise<{ signedOut: true }> {
  const result = await apiMutation<{ signedOut: true }>("/auth/logout");
  csrfToken = null;
  return result;
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<OrganizationSummary> {
  return apiMutation<OrganizationSummary>("/organizations", input, {
    idempotencyKey: createIdempotencyKey(),
  });
}

export async function createDashboardView(
  organizationId: string,
  input: CreateDashboardViewInput,
): Promise<DashboardView> {
  return apiMutation<DashboardView>("/dashboard-views", input, {
    organizationId,
    idempotencyKey: createIdempotencyKey(),
  });
}

export async function createReport(
  organizationId: string,
  input: CreateReportInput,
): Promise<Report> {
  return apiMutation<Report>("/reports", input, {
    organizationId,
    idempotencyKey: createIdempotencyKey(),
  });
}

export async function updateReportRevision(
  organizationId: string,
  reportId: string,
  revisionId: string,
  input: UpdateRevisionInput,
): Promise<Report> {
  return apiMutation<Report>(
    `/reports/${reportId}/revisions/${revisionId}`,
    input,
    {
      method: "PATCH",
      organizationId,
    },
  );
}

export async function createReportRevision(
  organizationId: string,
  reportId: string,
  input: CreateRevisionInput,
): Promise<Report> {
  return apiMutation<Report>(`/reports/${reportId}/revisions`, input, {
    organizationId,
    idempotencyKey: createIdempotencyKey(),
  });
}

export async function submitReportRevisionForReview(
  organizationId: string,
  reportId: string,
  revisionId: string,
): Promise<Report> {
  return apiMutation<Report>(
    `/reports/${reportId}/revisions/${revisionId}/submit-review`,
    {},
    {
      organizationId,
      idempotencyKey: createIdempotencyKey(),
    },
  );
}

export async function publishReportRevision(
  organizationId: string,
  reportId: string,
  revisionId: string,
): Promise<Report> {
  return apiMutation<Report>(
    `/reports/${reportId}/revisions/${revisionId}/publish`,
    {},
    {
      organizationId,
      idempotencyKey: createIdempotencyKey(),
    },
  );
}

export async function generateAiDrafts(
  organizationId: string,
  reportId: string,
  revisionId: string,
  input: CreateAiDraftInput,
): Promise<AiDraftProposalsResult> {
  return apiMutation<AiDraftProposalsResult>(
    `/reports/${reportId}/revisions/${revisionId}/ai-drafts`,
    input,
    {
      organizationId,
      idempotencyKey: createIdempotencyKey(),
    },
  );
}

export async function createExport(
  organizationId: string,
  input: CreateExportInput,
): Promise<ExportRequest> {
  return apiMutation<ExportRequest>("/exports", input, {
    organizationId,
    idempotencyKey: createIdempotencyKey(),
  });
}

export async function getExport(
  organizationId: string,
  exportId: string,
): Promise<ExportRequest> {
  return apiFetch<ExportRequest>(`/exports/${exportId}`, {
    method: "GET",
    organizationId,
  });
}

export function streamExportProgress(
  organizationId: string,
  exportId: string,
  options: {
    signal?: AbortSignal;
    onUpdate: (exportRequest: ExportRequest) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  return streamSse<ExportRequest>(`/exports/${exportId}/events`, {
    organizationId,
    signal: options.signal,
    onMessage: (data) => options.onUpdate(data),
    onError: options.onError,
    fallbackPoll: () => getExport(organizationId, exportId),
    isTerminal: (data) =>
      data.status === "succeeded" ||
      data.status === "failed" ||
      data.status === "cancelled",
  });
}

export async function getExportDownload(
  organizationId: string,
  exportId: string,
): Promise<ExportDownload> {
  return apiFetch<ExportDownload>(`/exports/${exportId}/download`, {
    method: "GET",
    organizationId,
  });
}

export async function getIngestionRun(
  organizationId: string,
  runId: string,
): Promise<IngestionRunSummary> {
  return apiFetch<IngestionRunSummary>(`/ingestion-runs/${runId}`, {
    method: "GET",
    organizationId,
  });
}

export function streamIngestionRunProgress(
  organizationId: string,
  runId: string,
  options: {
    signal?: AbortSignal;
    onUpdate: (run: IngestionRunSummary) => void;
    onError?: (error: unknown) => void;
  },
): () => void {
  return streamSse<IngestionRunSummary>(`/ingestion-runs/${runId}/events`, {
    organizationId,
    signal: options.signal,
    onMessage: (data) => options.onUpdate(data),
    onError: options.onError,
    fallbackPoll: () => getIngestionRun(organizationId, runId),
    isTerminal: (data) =>
      data.state === "published" ||
      data.state === "failed" ||
      data.state === "cancelled",
  });
}

export async function initiateUpload(
  organizationId: string,
  input: InitiateUploadInput,
): Promise<InitiateUploadResult> {
  return apiMutation<InitiateUploadResult>("/uploads", input, {
    organizationId,
    idempotencyKey: createIdempotencyKey(),
  });
}

export async function completeUpload(
  organizationId: string,
  uploadId: string,
  input: CompleteUploadInput,
): Promise<UploadStatus> {
  return apiMutation<UploadStatus>(`/uploads/${uploadId}/complete`, input, {
    organizationId,
    idempotencyKey: createIdempotencyKey(),
  });
}

export async function getUpload(
  organizationId: string,
  uploadId: string,
): Promise<UploadStatus> {
  return apiFetch<UploadStatus>(`/uploads/${uploadId}`, {
    method: "GET",
    organizationId,
  });
}

export async function cancelUpload(
  organizationId: string,
  uploadId: string,
): Promise<UploadStatus> {
  return apiMutation<UploadStatus>(
    `/uploads/${uploadId}`,
    {},
    {
      method: "DELETE",
      organizationId,
      idempotencyKey: createIdempotencyKey(),
    },
  );
}

export async function getUploadDownload(
  organizationId: string,
  uploadId: string,
): Promise<UploadDownload> {
  return apiFetch<UploadDownload>(`/uploads/${uploadId}/download`, {
    method: "GET",
    organizationId,
  });
}

export async function createDataset(
  organizationId: string,
  input: CreateDatasetInput,
): Promise<DatasetSummary> {
  return apiMutation<DatasetSummary>("/datasets", input, {
    organizationId,
    idempotencyKey: createIdempotencyKey(),
  });
}

export async function updateDataset(
  organizationId: string,
  datasetId: string,
  input: UpdateDatasetInput,
): Promise<DatasetSummary> {
  return apiMutation<DatasetSummary>(`/datasets/${datasetId}`, input, {
    method: "PATCH",
    organizationId,
  });
}

export async function getDataset(
  organizationId: string,
  datasetId: string,
): Promise<DatasetSummary> {
  return apiFetch<DatasetSummary>(`/datasets/${datasetId}`, {
    method: "GET",
    organizationId,
  });
}

export async function listDatasets(
  organizationId: string,
): Promise<DatasetSummary[]> {
  return apiFetch<DatasetSummary[]>("/datasets", {
    method: "GET",
    organizationId,
  });
}

export async function listDatasetVersions(
  organizationId: string,
  datasetId: string,
): Promise<DatasetVersionSummary[]> {
  return apiFetch<DatasetVersionSummary[]>(`/datasets/${datasetId}/versions`, {
    method: "GET",
    organizationId,
  });
}

export async function createMapping(
  organizationId: string,
  datasetId: string,
  input: CreateMappingInput,
): Promise<ColumnMappingSummary> {
  return apiMutation<ColumnMappingSummary>(
    `/datasets/${datasetId}/mappings`,
    input,
    {
      organizationId,
      idempotencyKey: createIdempotencyKey(),
    },
  );
}

export async function startIngestionRun(
  organizationId: string,
  datasetId: string,
  input: StartIngestionRunInput,
): Promise<IngestionRunSummary> {
  return apiMutation<IngestionRunSummary>(
    `/datasets/${datasetId}/ingestion-runs`,
    input,
    {
      organizationId,
      idempotencyKey: createIdempotencyKey(),
    },
  );
}

export async function listIngestionIssues(
  organizationId: string,
  runId: string,
): Promise<ValidationIssueSummary[]> {
  return apiFetch<ValidationIssueSummary[]>(`/ingestion-runs/${runId}/issues`, {
    method: "GET",
    organizationId,
  });
}

export async function cancelIngestionRun(
  organizationId: string,
  runId: string,
): Promise<IngestionRunSummary> {
  return apiMutation<IngestionRunSummary>(
    `/ingestion-runs/${runId}`,
    {},
    {
      method: "DELETE",
      organizationId,
    },
  );
}
