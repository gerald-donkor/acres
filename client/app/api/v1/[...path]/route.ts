import type { NextRequest } from "next/server";

const API_ORIGIN = process.env.ACRES_API_ORIGIN?.trim() || "http://localhost:3001";
const SAFE_REQUEST_HEADERS = [
  "accept",
  "content-type",
  "cookie",
  "idempotency-key",
  "x-acres-organization-id",
  "x-csrf-token",
] as const;
const SAFE_RESPONSE_HEADERS = ["content-type", "x-request-id"] as const;

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

function upstreamUrl(path: string[] | undefined, search: string): URL {
  const pathname = (path ?? []).map(encodeURIComponent).join("/");
  return new URL(`/api/v1/${pathname}${search}`, API_ORIGIN);
}

function requestHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const name of SAFE_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }

  const setCookie =
    "getSetCookie" in upstream.headers
      ? (upstream.headers as Headers & { getSetCookie: () => string[] }).getSetCookie()
      : [];
  for (const cookie of setCookie) {
    headers.append("set-cookie", cookie);
  }

  headers.set("cache-control", "no-store");
  return headers;
}

async function bridge(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const url = upstreamUrl(path, request.nextUrl.search);
  const method = request.method.toUpperCase();
  const body =
    method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const upstream = await fetch(url, {
    method,
    headers: requestHeaders(request),
    body,
    cache: "no-store",
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders(upstream),
  });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = bridge;
export const POST = bridge;
export const PATCH = bridge;
export const DELETE = bridge;
