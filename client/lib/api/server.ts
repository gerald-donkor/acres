import { cookies } from "next/headers";
import type {
  AccountProfile,
  DashboardSummary,
  DashboardView,
  OrganizationSummary,
  SessionProfile,
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

export async function getDashboardSummary(
  organizationId: string,
  filters: Record<string, string | undefined> = {},
): Promise<DashboardSummary> {
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
