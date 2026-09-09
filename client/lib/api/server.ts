import { cookies, headers } from "next/headers";
import {
  getDefaultMockDashboardSummary,
  getSessionMocks,
  isTestHarnessActive,
  type TestHarnessMocks,
} from "@/lib/api/test-harness-store";
import type {
  AccountProfile,
  DashboardSummary,
  DashboardView,
  DatasetSummary,
  DatasetVersionSummary,
  ExportRequest,
  OrganizationInvitation,
  OrganizationMember,
  OrganizationSummary,
  Report,
  SessionProfile,
  ValidationIssueSummary,
} from "@acres/shared";

import { parseApiResponse } from "@/lib/api/envelope";

const API_ORIGIN =
  process.env.ACRES_API_ORIGIN?.trim() || "http://localhost:3001";

async function authenticatedHeaders(
  organizationId?: string,
): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const headers = new Headers();
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }
  if (organizationId !== undefined) {
    headers.set("x-acres-organization-id", organizationId);
  }
  headers.set("accept", "application/json");
  return headers;
}

async function apiGet<TData>(
  path: string,
  options: { organizationId?: string } = {},
): Promise<TData> {
  const response = await fetch(new URL(`/api/v1${path}`, API_ORIGIN), {
    method: "GET",
    headers: await authenticatedHeaders(options.organizationId),
    cache: "no-store",
  });
  return parseApiResponse<TData>(response);
}

export function getSession(): Promise<SessionProfile> {
  return apiGet<SessionProfile>("/auth/session");
}

export function getAccount(): Promise<AccountProfile> {
  return apiGet<AccountProfile>("/account");
}

export function listOrganizations(): Promise<OrganizationSummary[]> {
  return apiGet<OrganizationSummary[]>("/organizations");
}

export function getOrganization(id: string): Promise<OrganizationSummary> {
  return apiGet<OrganizationSummary>(`/organizations/${id}`, {
    organizationId: id,
  });
}

export function listMembers(
  organizationId: string,
): Promise<OrganizationMember[]> {
  return apiGet<OrganizationMember[]>(`/organizations/${organizationId}/members`, {
    organizationId,
  });
}

export function listInvitations(
  organizationId: string,
): Promise<OrganizationInvitation[]> {
  return apiGet<OrganizationInvitation[]>(
    `/organizations/${organizationId}/invitations`,
    { organizationId },
  );
}

type GraphqlResponse<TData> = {
  data?: TData;
  errors?: Array<{
    message: string;
    extensions?: { code?: string; requestId?: string };
  }>;
};

type CsrfToken = {
  csrfToken: string;
  headerName: "x-csrf-token";
};

export async function graphqlPost<TData>(
  query: string,
  variables: Record<string, unknown>,
  organizationId: string,
): Promise<TData> {
  const headers = new Headers(await authenticatedHeaders(organizationId));
  const csrf = await csrfTokenForServer(headers);
  headers.set("content-type", "application/json");
  headers.set(csrf.headerName, csrf.csrfToken);
  const response = await fetch(new URL("/graphql", API_ORIGIN), {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const payload = (await response.json()) as GraphqlResponse<TData>;
  if (!response.ok || payload.errors?.length) {
    const first = payload.errors?.[0];
    throw new Error(
      first?.message ?? `GraphQL request failed: ${response.status}`,
    );
  }
  if (payload.data === undefined) {
    throw new Error("GraphQL response did not include data.");
  }
  return payload.data;
}

async function csrfTokenForServer(headers: Headers): Promise<CsrfToken> {
  const response = await fetch(new URL("/api/v1/auth/csrf", API_ORIGIN), {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const token = await parseApiResponse<CsrfToken>(response);
  const responseHeaders = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies =
    responseHeaders.getSetCookie?.() ??
    [responseHeaders.get("set-cookie")].filter((value) => value !== null);
  const csrfCookies = setCookies.map(cookiePairFromSetCookie).filter(Boolean);
  if (csrfCookies.length > 0) {
    headers.set("cookie", mergeCookieHeader(headers.get("cookie"), csrfCookies));
  }
  return token;
}

function cookiePairFromSetCookie(value: string): string {
  return value.split(";", 1)[0] ?? "";
}

function mergeCookieHeader(
  existing: string | null,
  replacements: string[],
): string {
  const replacementNames = new Set(
    replacements
      .map((cookie) => cookie.split("=", 1)[0]?.trim())
      .filter((name): name is string => Boolean(name)),
  );
  const retained =
    existing
      ?.split(";")
      .map((cookie) => cookie.trim())
      .filter((cookie) => {
        const name = cookie.split("=", 1)[0]?.trim();
        return name !== undefined && !replacementNames.has(name);
      }) ?? [];
  return [...retained, ...replacements].join("; ");
}

const DASHBOARD_SUMMARY_QUERY = /* GraphQL */ `
  query DashboardSummary(
    $metricId: String
    $regionId: String
    $datasetVersionId: String
    $dimensionHash: String
    $periodStart: String
    $periodEnd: String
  ) {
    dashboardSummary(
      metricId: $metricId
      regionId: $regionId
      datasetVersionId: $datasetVersionId
      dimensionHash: $dimensionHash
      periodStart: $periodStart
      periodEnd: $periodEnd
    ) {
      metrics {
        id
        key
        label
        description
        valueType
        canonicalUnit
        allowedAggregation
        calculationVersion
        status
        createdAt
        updatedAt
      }
      aggregates {
        id
        datasetVersionId
        regionId
        metric {
          id
          key
          label
          description
          valueType
          canonicalUnit
          allowedAggregation
          calculationVersion
          status
          createdAt
          updatedAt
        }
        aggregateType
        periodStart
        periodEnd
        value {
          type
          value
        }
        unit
        dimensionHash
        observationCount
        datasetVersionIds
        createdAt
      }
      savedViews {
        id
        name
        description
        ownerAccountId
        status
        createdAt
        updatedAt
        filters {
          metricId
          regionId
          datasetVersionId
          dimensionHash
          periodStart
          periodEnd
        }
        presentation {
          chart
          compareBy
        }
      }
    }
  }
`;

async function getTestHarnessState(): Promise<{
  enabled: boolean;
  mockDashboard: boolean;
  mocks?: Partial<TestHarnessMocks>;
}> {
  if (!isTestHarnessActive()) {
    return { enabled: false, mockDashboard: false };
  }
  try {
    const [headerStore, cookieStore] = await Promise.all([
      headers(),
      cookies(),
    ]);
    const mockDashboardHeader = headerStore.get("x-playwright-mock-dashboard");
    const mockDashboardCookie = cookieStore.get("x-playwright-mock-dashboard")?.value;
    const mockDashboard =
      mockDashboardHeader === "true" ||
      mockDashboardHeader === "populated" ||
      mockDashboardCookie === "true" ||
      mockDashboardCookie === "populated";

    const sessionId =
      headerStore.get("x-acres-test-session") ??
      cookieStore.get("x-acres-test-session")?.value;

    const mocks = sessionId ? getSessionMocks(sessionId) : undefined;
    return { enabled: true, mockDashboard, mocks };
  } catch {
    return { enabled: false, mockDashboard: false };
  }
}

export async function getDashboardSummary(
  organizationId: string,
  filters: Record<string, string | undefined> = {},
): Promise<DashboardSummary> {
  const harness = await getTestHarnessState();
  if (harness.enabled) {
    if (harness.mocks?.dashboardSummary) {
      return harness.mocks.dashboardSummary;
    }
    if (harness.mockDashboard) {
      return getDefaultMockDashboardSummary();
    }
  }
  const data = await graphqlPost<{ dashboardSummary: DashboardSummary }>(
    DASHBOARD_SUMMARY_QUERY,
    filters,
    organizationId,
  );
  return data.dashboardSummary;
}

export function listDashboardViews(
  organizationId: string,
): Promise<DashboardView[]> {
  return apiGet<DashboardView[]>("/dashboard-views", { organizationId });
}

export function getDashboardView(
  organizationId: string,
  viewId: string,
): Promise<DashboardView> {
  return apiGet<DashboardView>(`/dashboard-views/${viewId}`, {
    organizationId,
  });
}

export async function listReports(organizationId: string): Promise<Report[]> {
  const harness = await getTestHarnessState();
  if (harness.enabled && harness.mocks?.reports) {
    return harness.mocks.reports;
  }
  return apiGet<Report[]>("/reports", { organizationId });
}

export async function getReport(
  organizationId: string,
  reportId: string,
): Promise<Report> {
  const harness = await getTestHarnessState();
  if (harness.enabled) {
    if (harness.mocks?.report && (harness.mocks.report.id === reportId || !reportId)) {
      return harness.mocks.report;
    }
    if (harness.mocks?.reports) {
      const found = harness.mocks.reports.find((r) => r.id === reportId);
      if (found) return found;
    }
  }
  return apiGet<Report>(`/reports/${reportId}`, { organizationId });
}

export async function listExports(
  organizationId: string,
): Promise<ExportRequest[]> {
  const harness = await getTestHarnessState();
  if (harness.enabled && harness.mocks?.exports) {
    return harness.mocks.exports;
  }
  return apiGet<ExportRequest[]>("/exports", { organizationId });
}

export async function listDatasets(
  organizationId: string,
): Promise<DatasetSummary[]> {
  const harness = await getTestHarnessState();
  if (harness.enabled && harness.mocks?.datasets) {
    return harness.mocks.datasets;
  }
  return apiGet<DatasetSummary[]>("/datasets", { organizationId });
}

export async function getDataset(
  organizationId: string,
  datasetId: string,
): Promise<DatasetSummary> {
  const harness = await getTestHarnessState();
  if (harness.enabled) {
    if (harness.mocks?.dataset && (harness.mocks.dataset.id === datasetId || !datasetId)) {
      return harness.mocks.dataset;
    }
    if (harness.mocks?.datasets) {
      const found = harness.mocks.datasets.find((d) => d.id === datasetId);
      if (found) return found;
    }
  }
  return apiGet<DatasetSummary>(`/datasets/${datasetId}`, { organizationId });
}

export async function listDatasetVersions(
  organizationId: string,
  datasetId: string,
): Promise<DatasetVersionSummary[]> {
  const harness = await getTestHarnessState();
  if (harness.enabled && harness.mocks?.versions) {
    return harness.mocks.versions;
  }
  return apiGet<DatasetVersionSummary[]>(`/datasets/${datasetId}/versions`, {
    organizationId,
  });
}

export function listIngestionIssues(
  organizationId: string,
  runId: string,
): Promise<ValidationIssueSummary[]> {
  return apiGet<ValidationIssueSummary[]>(`/ingestion-runs/${runId}/issues`, {
    organizationId,
  });
}
