import { expect, test } from "@playwright/test";

import { parseApiResponse, getApiErrorCopy } from "@/lib/api/envelope";
import { createIdempotencyKey } from "@/lib/api/idempotency";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

test("parses successful API envelopes", async () => {
  const result = await parseApiResponse<{ value: number }>(
    new Response(JSON.stringify({ ok: true, data: { value: 42 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  expect(result).toEqual({ value: 42 });
});

test("keeps stable API error codes and request IDs", async () => {
  await expect(
    parseApiResponse(
      new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "VALIDATION_FAILED",
            message: "Validation failed.",
            details: ["email must be an email"],
            requestId: "req-123",
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    ),
  ).rejects.toMatchObject({
    code: "VALIDATION_FAILED",
    details: ["email must be an email"],
    requestId: "req-123",
    status: 400,
  });
});

test("maps API errors to actionable copy", () => {
  expect(getApiErrorCopy(new Error("offline"))).toMatchObject({
    title: "Network Problem",
  });
});

test("sanitizes returnTo paths", () => {
  expect(sanitizeReturnTo("/app?tab=workspace")).toBe("/app?tab=workspace");
  expect(sanitizeReturnTo("https://example.com/app")).toBe("/app");
  expect(sanitizeReturnTo("//example.com/app")).toBe("/app");
  expect(sanitizeReturnTo("/\\example")).toBe("/app");
});

test("generates unique idempotency keys", () => {
  const first = createIdempotencyKey();
  const second = createIdempotencyKey();

  expect(first).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  expect(second).not.toBe(first);
});

test("calculateSha256 correctly computes SHA-256 hex digest using Web Crypto", async () => {
  const { calculateSha256 } = await import("@/lib/crypto/checksum");
  const encoder = new TextEncoder();
  const data = encoder.encode("hello world");

  const hash = await calculateSha256(data);
  expect(hash).toBe(
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  );

  const blob = new Blob(["hello world"], { type: "text/plain" });
  const blobHash = await calculateSha256(blob);
  expect(blobHash).toBe(
    "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
  );
});

test("browser API helpers attach organization headers and idempotency keys", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; headers: Record<string, string>; body?: unknown }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => {
        headers[key] = value;
      });
    }

    let parsedBody;
    if (typeof init?.body === "string") {
      try {
        parsedBody = JSON.parse(init.body);
      } catch {
        parsedBody = init.body;
      }
    }

    requests.push({
      url,
      method: init?.method ?? "GET",
      headers,
      body: parsedBody,
    });

    if (url.includes("/auth/csrf")) {
      return new Response(
        JSON.stringify({ ok: true, data: { csrfToken: "csrf-test-token", headerName: "x-csrf-token" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/uploads") && init?.method === "POST" && !url.includes("complete")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            uploadId: "upl-123",
            object: { key: "quarantine/123", bucket: "test", checksumAlgorithm: "sha256" },
            upload: { url: "http://storage.local/upload", method: "PUT", headers: {}, expiresAt: "2026-12-31" },
            complete: { method: "POST", url: "/api/v1/uploads/upl-123/complete", requiredHeaders: [] },
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }

    if (url.includes("/datasets") && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            id: "ds-123",
            name: "Test Dataset",
            description: "Test Description",
            state: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            latestVersion: null,
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, data: {} }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const { createDataset, initiateUpload } = await import("@/lib/api/browser");

    const dataset = await createDataset("org-test-1", {
      name: "Test Dataset",
      description: "Test Description",
    });
    expect(dataset.id).toBe("ds-123");

    const lastDatasetReq = requests.find((r) => r.url.endsWith("/datasets"));
    expect(lastDatasetReq?.headers["x-acres-organization-id"]).toBe("org-test-1");
    expect(lastDatasetReq?.headers["x-csrf-token"]).toBe("csrf-test-token");
    expect(lastDatasetReq?.headers["idempotency-key"]).toBeDefined();

    const upload = await initiateUpload("org-test-1", {
      filename: "test.csv",
      mediaType: "text/csv",
      byteCount: 100,
      checksumHex: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    });
    expect(upload.uploadId).toBe("upl-123");

    const lastUploadReq = requests.find((r) => r.url.endsWith("/uploads"));
    expect(lastUploadReq?.headers["x-acres-organization-id"]).toBe("org-test-1");
    expect(lastUploadReq?.headers["idempotency-key"]).toBeDefined();

    const { submitReportRevisionForReview, publishReportRevision, generateAiDrafts } = await import("@/lib/api/browser");

    await submitReportRevisionForReview("org-test-1", "rep-1", "rev-1");
    const lastSubmitReq = requests.find((r) => r.url.endsWith("/reports/rep-1/revisions/rev-1/submit-review"));
    expect(lastSubmitReq?.headers["x-acres-organization-id"]).toBe("org-test-1");
    expect(lastSubmitReq?.headers["x-csrf-token"]).toBe("csrf-test-token");
    expect(lastSubmitReq?.headers["idempotency-key"]).toBeDefined();
    expect(lastSubmitReq?.method).toBe("POST");

    await publishReportRevision("org-test-1", "rep-1", "rev-1");
    const lastPublishReq = requests.find((r) => r.url.endsWith("/reports/rep-1/revisions/rev-1/publish"));
    expect(lastPublishReq?.headers["x-acres-organization-id"]).toBe("org-test-1");
    expect(lastPublishReq?.headers["x-csrf-token"]).toBe("csrf-test-token");
    expect(lastPublishReq?.headers["idempotency-key"]).toBeDefined();
    expect(lastPublishReq?.method).toBe("POST");

    await generateAiDrafts("org-test-1", "rep-1", "rev-1", {
      purpose: "Analyze yield",
      evidenceIds: ["ev-1"],
      acknowledgement: true,
    });
    const lastAiReq = requests.find((r) => r.url.endsWith("/reports/rep-1/revisions/rev-1/ai-drafts"));
    expect(lastAiReq?.headers["x-acres-organization-id"]).toBe("org-test-1");
    expect(lastAiReq?.headers["x-csrf-token"]).toBe("csrf-test-token");
    expect(lastAiReq?.headers["idempotency-key"]).toBeDefined();
    expect(lastAiReq?.method).toBe("POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
