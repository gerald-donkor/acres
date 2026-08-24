"use client";

import type {
  CreateOrganizationInput,
  CreateDashboardViewInput,
  DashboardView,
  LoginInput,
  OrganizationSummary,
  RegisterAccountInput,
  SessionProfile,
} from "@acres/shared";

import { isApiClientError, parseApiResponse } from "@/lib/api/envelope";
import { createIdempotencyKey } from "@/lib/api/idempotency";

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
