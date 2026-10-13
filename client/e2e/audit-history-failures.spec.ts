import { randomUUID } from "node:crypto";
import { expect, test as base, type Page } from "@playwright/test";
import { createFirstOrganization, registerAccount } from "./helpers";

type Fault = {
  target: "audit" | "session" | "organizations";
  kind: string;
  sentinel: string;
};
type Evidence = {
  session: number;
  organizations: number;
  hits: number;
  contextAtHit: { session: number; organizations: number };
};
type FaultControl = {
  arm: (fault: Fault) => Promise<void>;
  evidence: () => Promise<Evidence>;
  clear: () => Promise<void>;
};

const test = base.extend<{ faults: FaultControl }>({
  faults: async ({ page, request, baseURL }, provide) => {
    const id = randomUUID();
    const url = `http://127.0.0.1:${process.env.PLAYWRIGHT_AUDIT_PROXY_PORT}/__audit_control`;
    const headers = {
      authorization: `Bearer ${process.env.PLAYWRIGHT_AUDIT_CONTROL_TOKEN}`,
    };
    const control = async (method: string, fault?: Fault) => {
      const response = await request.fetch(url, {
        method,
        headers,
        data: { id, fault },
      });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    await page
      .context()
      .addCookies([{ name: "acres_audit_fault", value: id, url: baseURL! }]);
    try {
      await provide({
        arm: async (fault) => {
          await control("PUT", fault);
        },
        evidence: () => control("POST"),
        clear: async () => {
          await control("DELETE");
        },
      });
    } finally {
      await control("DELETE");
      expect(await control("POST")).toBeNull();
    }
  },
});

// Explicit opt-in provisions an owned proxy + API + Next. Ordinary suites keep
// their existing origin/configuration. Failure responses are simulations only.
test.skip(
  process.env.PLAYWRIGHT_AUDIT_FAULTS !== "true",
  "requires local fault proxy",
);
test.use({ trace: "off" });

const rows = (page: Page) =>
  page.getByRole("list", { name: "Audit events" }).getByRole("listitem");

async function setup(page: Page) {
  await registerAccount(page);
  const name = await createFirstOrganization(page);
  await page.goto("/app/audit");
  await expect(rows(page)).toHaveCount(1);
  const eventId = await rows(page).first().getAttribute("data-audit-event-id");
  expect(eventId).toBeTruthy();
  return { name, eventId };
}

async function recover(
  page: Page,
  faults: FaultControl,
  eventId: string | null,
  boundary = false,
) {
  await faults.clear();
  const retry = boundary
    ? page.getByRole("button", { name: "Try Again", exact: true })
    : page.getByRole("link", { name: /^(Try again|Latest events)$/ });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveAttribute(
    "data-audit-event-id",
    eventId!,
  );
  await expect(
    page.getByText("Organization created", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="error-boundary"]')).toHaveCount(0);
}

for (const [kind, title] of [
  ["FORBIDDEN", "Access restricted"],
  ["NOT_FOUND", "Organization unavailable"],
  ["CURSOR_INVALID", "Page unavailable"],
  ["503", "Unable to load audit history"],
  ["malformed", "Unable to load audit history"],
  ["disconnect", "Unable to load audit history"],
]) {
  test(`simulated audit ${kind} after valid context recovers to real rows`, async ({
    page,
    faults,
    browser,
  }) => {
    const { name, eventId } = await setup(page);
    const sentinel = `private-${randomUUID()}`;
    await faults.arm({ target: "audit", kind, sentinel });
    await page.reload();
    await expect(page.locator('[data-slot="alert"]')).toHaveAttribute(
      "role",
      "alert",
    );
    await expect(page.locator('[data-slot="alert"]')).toContainText(title);
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(sentinel);
    await expect(page.getByLabel("Current organization")).toHaveText(name);
    const evidence = await faults.evidence();
    expect(evidence.contextAtHit.session).toBeGreaterThan(0);
    expect(evidence.contextAtHit.organizations).toBeGreaterThan(0);
    expect(evidence.hits).toBeGreaterThan(0);
    if (kind === "FORBIDDEN") {
      const storageState = await page.context().storageState();
      storageState.cookies = storageState.cookies.filter(
        (cookie) => cookie.name !== "acres_audit_fault",
      );
      const other = await browser.newContext({ storageState });
      try {
        const unaffected = await other.newPage();
        await unaffected.goto(new URL("/app/audit", page.url()).toString());
        await expect(rows(unaffected)).toHaveCount(1);
        await expect(rows(unaffected).first()).toHaveAttribute(
          "data-audit-event-id",
          eventId!,
        );
      } finally {
        await other.close();
      }
    }
    await recover(page, faults, eventId);
  });
}

test("simulated post-context expiry redirects to the local audit login return path", async ({
  page,
  faults,
}) => {
  await setup(page);
  const sentinel = `private-${randomUUID()}`;
  await faults.arm({ target: "audit", kind: "UNAUTHENTICATED", sentinel });
  await page.reload();
  await expect(page).toHaveURL(/\/login\?returnTo=\/app\/audit$/);
  await expect(
    page.getByRole("heading", { name: "Sign in to Acres" }),
  ).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(sentinel);
  const evidence = await faults.evidence();
  expect(evidence.contextAtHit.session).toBeGreaterThan(0);
  expect(evidence.contextAtHit.organizations).toBeGreaterThan(0);
  expect(evidence.hits).toBeGreaterThan(0);
  await faults.clear();
  await page.goto("/app/audit");
  await expect(rows(page)).toHaveCount(1);
});

for (const target of ["session", "organizations"] as const) {
  test(`simulated initial ${target} outage retries through the route boundary`, async ({
    page,
    faults,
  }) => {
    const { eventId } = await setup(page);
    const sentinel = `private-${randomUUID()}`;
    await faults.arm({ target, kind: "malformed", sentinel });
    await page.reload();
    const boundary = page.locator('[data-slot="error-boundary"]');
    await expect(boundary).toHaveAttribute("role", "alert");
    await expect(boundary).toContainText("Unable to load audit history");
    await expect(rows(page)).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(sentinel);
    const evidence = await faults.evidence();
    expect(evidence.hits).toBeGreaterThan(0);
    if (target === "organizations") expect(evidence.session).toBeGreaterThan(0);
    await recover(page, faults, eventId, true);
  });
}
