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

test("maps API errors to actionable copy", async () => {
  const { ApiClientError } = await import("@/lib/api/envelope");
  expect(getApiErrorCopy(new Error("offline"))).toMatchObject({
    title: "Network Problem",
  });
  expect(
    getApiErrorCopy(
      new ApiClientError({
        code: "INVALID_TOKEN",
        message: "Invalid token",
        status: 400,
      }),
    ),
  ).toMatchObject({
    title: "Reset Link Unavailable",
  });
  expect(
    getApiErrorCopy(
      new ApiClientError({
        code: "TOKEN_EXPIRED",
        message: "Token expired",
        status: 400,
      }),
    ),
  ).toMatchObject({
    title: "Reset Link Unavailable",
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

test("accept invitation sends the secured command without organization context", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{
    url: string;
    init?: RequestInit;
  }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });

    if (url.endsWith("/auth/csrf")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            csrfToken: "csrf-invitation-test",
            headerName: "x-csrf-token",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          organizationId: "018f0000-0000-7000-8000-000000000001",
          membershipId: "018f0000-0000-7000-8000-000000000002",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  let clearBrowserSessionState: (() => Promise<unknown>) | undefined;
  try {
    const { acceptInvitation, logout } = await import("@/lib/api/browser");
    clearBrowserSessionState = logout;
    const token = "synthetic-invitation-token-value-0001";
    const result = await acceptInvitation({ token });
    const request = requests.find(({ url }) =>
      url.endsWith("/invitations/accept"),
    );
    const headers = new Headers(request?.init?.headers);

    expect(result).toEqual({
      organizationId: "018f0000-0000-7000-8000-000000000001",
      membershipId: "018f0000-0000-7000-8000-000000000002",
    });
    expect(request?.url).toBe("/api/v1/invitations/accept");
    expect(request?.init?.method).toBe("POST");
    expect(request?.init?.credentials).toBe("include");
    expect(request?.init?.cache).toBe("no-store");
    expect(request?.init?.body).toBe(JSON.stringify({ token }));
    expect(headers.get("x-csrf-token")).toBe("csrf-invitation-test");
    expect(headers.get("idempotency-key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(headers.has("x-acres-organization-id")).toBe(false);
  } finally {
    try {
      await clearBrowserSessionState?.();
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
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
  const requests: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: unknown;
  }> = [];

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
        JSON.stringify({
          ok: true,
          data: { csrfToken: "csrf-test-token", headerName: "x-csrf-token" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (
      url.includes("/uploads") &&
      init?.method === "POST" &&
      !url.includes("complete")
    ) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            uploadId: "upl-123",
            object: {
              key: "quarantine/123",
              bucket: "test",
              checksumAlgorithm: "sha256",
            },
            upload: {
              url: "http://storage.local/upload",
              method: "PUT",
              headers: {},
              expiresAt: "2026-12-31",
            },
            complete: {
              method: "POST",
              url: "/api/v1/uploads/upl-123/complete",
              requiredHeaders: [],
            },
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

    return new Response(JSON.stringify({ ok: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const { createDataset, initiateUpload } = await import("@/lib/api/browser");

    const dataset = await createDataset("org-test-1", {
      name: "Test Dataset",
      description: "Test Description",
    });
    expect(dataset.id).toBe("ds-123");

    const lastDatasetReq = requests.find((r) => r.url.endsWith("/datasets"));
    expect(lastDatasetReq?.headers["x-acres-organization-id"]).toBe(
      "org-test-1",
    );
    expect(lastDatasetReq?.headers["x-csrf-token"]).toBe("csrf-test-token");
    expect(lastDatasetReq?.headers["idempotency-key"]).toBeDefined();

    const upload = await initiateUpload("org-test-1", {
      filename: "test.csv",
      mediaType: "text/csv",
      byteCount: 100,
      checksumHex:
        "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
    });
    expect(upload.uploadId).toBe("upl-123");

    const lastUploadReq = requests.find((r) => r.url.endsWith("/uploads"));
    expect(lastUploadReq?.headers["x-acres-organization-id"]).toBe(
      "org-test-1",
    );
    expect(lastUploadReq?.headers["idempotency-key"]).toBeDefined();

    const {
      submitReportRevisionForReview,
      publishReportRevision,
      generateAiDrafts,
    } = await import("@/lib/api/browser");

    await submitReportRevisionForReview("org-test-1", "rep-1", "rev-1");
    const lastSubmitReq = requests.find((r) =>
      r.url.endsWith("/reports/rep-1/revisions/rev-1/submit-review"),
    );
    expect(lastSubmitReq?.headers["x-acres-organization-id"]).toBe(
      "org-test-1",
    );
    expect(lastSubmitReq?.headers["x-csrf-token"]).toBe("csrf-test-token");
    expect(lastSubmitReq?.headers["idempotency-key"]).toBeDefined();
    expect(lastSubmitReq?.method).toBe("POST");

    await publishReportRevision("org-test-1", "rep-1", "rev-1");
    const lastPublishReq = requests.find((r) =>
      r.url.endsWith("/reports/rep-1/revisions/rev-1/publish"),
    );
    expect(lastPublishReq?.headers["x-acres-organization-id"]).toBe(
      "org-test-1",
    );
    expect(lastPublishReq?.headers["x-csrf-token"]).toBe("csrf-test-token");
    expect(lastPublishReq?.headers["idempotency-key"]).toBeDefined();
    expect(lastPublishReq?.method).toBe("POST");

    await generateAiDrafts("org-test-1", "rep-1", "rev-1", {
      purpose: "Analyze yield",
      evidenceIds: ["ev-1"],
      acknowledgement: true,
    });
    const lastAiReq = requests.find((r) =>
      r.url.endsWith("/reports/rep-1/revisions/rev-1/ai-drafts"),
    );
    expect(lastAiReq?.headers["x-acres-organization-id"]).toBe("org-test-1");
    expect(lastAiReq?.headers["x-csrf-token"]).toBe("csrf-test-token");
    expect(lastAiReq?.headers["idempotency-key"]).toBeDefined();
    expect(lastAiReq?.method).toBe("POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("forgot password and reset password send commands with csrf and idempotency", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{
    url: string;
    init?: RequestInit;
  }> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });

    if (url.endsWith("/auth/csrf")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            csrfToken: "csrf-recovery-test",
            headerName: "x-csrf-token",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith("/auth/forgot-password")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            accepted: true,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith("/auth/reset-password")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            reset: true,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const { forgotPassword, resetPassword, refreshCsrfToken } = await import(
      "@/lib/api/browser"
    );
    await refreshCsrfToken();

    const forgotResult = await forgotPassword({ email: "user@example.com" });
    expect(forgotResult).toEqual({ accepted: true });
    const forgotReq = requests.find((r) =>
      r.url.endsWith("/auth/forgot-password"),
    );
    expect(forgotReq?.url).toBe("/api/v1/auth/forgot-password");
    expect(forgotReq?.init?.method).toBe("POST");
    const forgotHeaders = new Headers(forgotReq?.init?.headers);
    expect(forgotHeaders.get("x-csrf-token")).toBe("csrf-recovery-test");
    expect(forgotHeaders.get("idempotency-key")).toBeDefined();
    expect(forgotHeaders.has("x-acres-organization-id")).toBe(false);

    const resetResult = await resetPassword({
      token: "test-token-123456",
      password: "NewStrongPassword123!",
    });
    expect(resetResult).toEqual({ reset: true });
    const resetReq = requests.find((r) =>
      r.url.endsWith("/auth/reset-password"),
    );
    expect(resetReq?.url).toBe("/api/v1/auth/reset-password");
    expect(resetReq?.init?.method).toBe("POST");
    const resetHeaders = new Headers(resetReq?.init?.headers);
    expect(resetHeaders.get("x-csrf-token")).toBe("csrf-recovery-test");
    expect(resetHeaders.get("idempotency-key")).toBeDefined();
    expect(resetHeaders.has("x-acres-organization-id")).toBe(false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("member administration helpers issue correct paths, methods, and headers", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{
    url: string;
    init?: RequestInit;
  }> = [];

  const orgId = "018f0000-0000-7000-8000-000000000010";
  const membershipId = "018f0000-0000-7000-8000-000000000020";
  const invitationId = "018f0000-0000-7000-8000-000000000030";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });

    if (url.endsWith("/auth/csrf")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            csrfToken: "csrf-members-test",
            headerName: "x-csrf-token",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith(`/organizations/${orgId}/members`)) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: [
            {
              id: membershipId,
              accountId: "acc-1",
              email: "member@example.com",
              displayName: "Member One",
              role: "viewer",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              revokedAt: null,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith(`/organizations/${orgId}/members/${membershipId}`) && init?.method === "PATCH") {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            id: membershipId,
            accountId: "acc-1",
            email: "member@example.com",
            displayName: "Member One",
            role: "analyst",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
            revokedAt: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith(`/organizations/${orgId}/members/${membershipId}`) && init?.method === "DELETE") {
      return new Response(
        JSON.stringify({ ok: true, data: { revoked: true } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith(`/organizations/${orgId}/invitations`) && init?.method === "POST") {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            id: invitationId,
            organizationId: orgId,
            email: "invited@example.com",
            role: "viewer",
            invitedByAccountId: "acc-admin",
            expiresAt: "2026-01-02T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            acceptedAt: null,
            revokedAt: null,
            token: "invite-token-abc",
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith(`/organizations/${orgId}/invitations`) && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: [
            {
              id: invitationId,
              organizationId: orgId,
              email: "invited@example.com",
              role: "viewer",
              invitedByAccountId: "acc-admin",
              expiresAt: "2026-01-02T00:00:00.000Z",
              createdAt: "2026-01-01T00:00:00.000Z",
              acceptedAt: null,
              revokedAt: null,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (url.endsWith(`/organizations/${orgId}/invitations/${invitationId}`) && init?.method === "DELETE") {
      return new Response(
        JSON.stringify({ ok: true, data: { revoked: true } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const {
      listMembers,
      changeMemberRole,
      revokeMember,
      listInvitations,
      inviteMember,
      revokeInvitation,
      refreshCsrfToken,
    } = await import("@/lib/api/browser");

    await refreshCsrfToken();

    // 1. listMembers
    const members = await listMembers(orgId);
    expect(members).toHaveLength(1);
    expect(members[0].email).toBe("member@example.com");
    const listMemReq = requests.find((r) => r.url === `/api/v1/organizations/${orgId}/members`);
    expect(listMemReq).toBeDefined();
    expect(new Headers(listMemReq?.init?.headers).get("x-acres-organization-id")).toBe(orgId);

    // 2. changeMemberRole
    const changed = await changeMemberRole(orgId, membershipId, "analyst");
    expect(changed.role).toBe("analyst");
    const patchReq = requests.find((r) => r.url === `/api/v1/organizations/${orgId}/members/${membershipId}`);
    expect(patchReq?.init?.method).toBe("PATCH");
    expect(JSON.parse(patchReq?.init?.body as string)).toEqual({ role: "analyst" });
    const patchHeaders = new Headers(patchReq?.init?.headers);
    expect(patchHeaders.get("x-csrf-token")).toBe("csrf-members-test");
    expect(patchHeaders.get("x-acres-organization-id")).toBe(orgId);

    // 3. revokeMember
    const revokedMem = await revokeMember(orgId, membershipId);
    expect(revokedMem).toEqual({ revoked: true });
    const delMemReq = requests.find(
      (r) => r.url === `/api/v1/organizations/${orgId}/members/${membershipId}` && r.init?.method === "DELETE",
    );
    expect(delMemReq).toBeDefined();
    expect(new Headers(delMemReq?.init?.headers).get("x-acres-organization-id")).toBe(orgId);

    // 4. listInvitations
    const invitations = await listInvitations(orgId);
    expect(invitations).toHaveLength(1);
    expect(invitations[0].email).toBe("invited@example.com");
    const listInvReq = requests.find(
      (r) => r.url === `/api/v1/organizations/${orgId}/invitations` && (!r.init?.method || r.init.method === "GET"),
    );
    expect(listInvReq).toBeDefined();
    expect(new Headers(listInvReq?.init?.headers).get("x-acres-organization-id")).toBe(orgId);

    // 5. inviteMember
    const invitation = await inviteMember(orgId, { email: "invited@example.com", role: "viewer" });
    expect(invitation.token).toBe("invite-token-abc");
    const postInvReq = requests.find(
      (r) => r.url === `/api/v1/organizations/${orgId}/invitations` && r.init?.method === "POST",
    );
    expect(postInvReq).toBeDefined();
    expect(JSON.parse(postInvReq?.init?.body as string)).toEqual({
      email: "invited@example.com",
      role: "viewer",
    });
    const postInvHeaders = new Headers(postInvReq?.init?.headers);
    expect(postInvHeaders.get("x-csrf-token")).toBe("csrf-members-test");
    expect(postInvHeaders.get("x-acres-organization-id")).toBe(orgId);
    expect(postInvHeaders.get("idempotency-key")).toBeDefined();

    // 6. revokeInvitation
    const revokedInv = await revokeInvitation(orgId, invitationId);
    expect(revokedInv).toEqual({ revoked: true });
    const delInvReq = requests.find(
      (r) => r.url === `/api/v1/organizations/${orgId}/invitations/${invitationId}` && r.init?.method === "DELETE",
    );
    expect(delInvReq).toBeDefined();
    expect(new Headers(delInvReq?.init?.headers).get("x-acres-organization-id")).toBe(orgId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
