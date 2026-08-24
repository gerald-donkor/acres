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
