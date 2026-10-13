import { expect, test } from "@playwright/test";
import {
  auditActionLabel,
  auditPageCursor,
  auditPageHref,
  AUDIT_CURSOR_MAX_LENGTH,
} from "@/lib/api/audit-history";
import { parseGraphqlResponse } from "@/lib/api/graphql-response";

const organizationId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";

test("audit pagination binds cursors to the selected organization", () => {
  expect(auditPageCursor({}, organizationId)).toEqual({ valid: true });
  expect(
    auditPageCursor(
      { organization: organizationId, after: "opaque" },
      organizationId,
    ),
  ).toEqual({ valid: true, after: "opaque" });
  expect(
    auditPageCursor({ organization: otherId, after: "opaque" }, organizationId),
  ).toEqual({ valid: true });
  for (const params of [
    { after: "opaque" },
    { organization: organizationId },
    { organization: organizationId, after: "" },
    { organization: organizationId, after: ["a", "b"] },
    { organization: [organizationId], after: "opaque" },
    { organization: "invalid", after: "opaque" },
    {
      organization: organizationId,
      after: "x".repeat(AUDIT_CURSOR_MAX_LENGTH + 1),
    },
  ])
    expect(auditPageCursor(params, organizationId)).toEqual({ valid: false });
});

test("pagination href keeps cursor text inside local query parameters", () => {
  const cursor = "https://example.com/?x=1&after=<script>";
  const url = new URL(
    auditPageHref(organizationId, cursor),
    "https://acres.test",
  );
  expect(url.origin).toBe("https://acres.test");
  expect(url.pathname).toBe("/app/audit");
  expect(url.searchParams.get("after")).toBe(cursor);
  expect(url.searchParams.get("organization")).toBe(organizationId);
});

test("audit labels tolerate future actions and inherited property names", () => {
  expect(auditActionLabel("membership_revoked")).toBe("Member access revoked");
  expect(auditActionLabel("future_action")).toBe("future action");
  expect(auditActionLabel("constructor")).toBe("constructor");
});

test("GraphQL parsing preserves permission/cursor/session codes without upstream text", async () => {
  for (const code of [
    "FORBIDDEN",
    "CURSOR_INVALID",
    "UNAUTHENTICATED",
    "NOT_FOUND",
  ]) {
    await expect(
      parseGraphqlResponse(
        new Response(
          JSON.stringify({
            data: { partial: true },
            errors: [
              {
                message: "private upstream text",
                extensions: { code, requestId: "request-1" },
              },
            ],
          }),
        ),
      ),
    ).rejects.toMatchObject({
      code,
      requestId: "request-1",
      message: "The GraphQL request could not be completed.",
    });
  }
});

test("GraphQL parser accepts successful data and rejects transport/malformed failures", async () => {
  await expect(
    parseGraphqlResponse(new Response(JSON.stringify({ data: { value: 42 } }))),
  ).resolves.toEqual({ value: 42 });
  for (const response of [
    new Response("bad JSON"),
    new Response("null"),
    new Response(JSON.stringify({ data: null })),
    new Response(
      JSON.stringify({ errors: [{ extensions: { code: "UNKNOWN" } }] }),
    ),
    new Response(JSON.stringify({ data: { value: 42 } }), {
      status: 503,
      headers: { "x-request-id": "transport-1" },
    }),
  ])
    await expect(parseGraphqlResponse(response)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
});
