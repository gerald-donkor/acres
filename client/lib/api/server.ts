import { cookies } from "next/headers";
import type {
  AccountProfile,
  OrganizationSummary,
  SessionProfile,
} from "@acres/shared";

import { parseApiResponse } from "@/lib/api/envelope";

const API_ORIGIN = process.env.ACRES_API_ORIGIN?.trim() || "http://localhost:3001";

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
