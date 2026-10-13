import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import type { OrganizationSummary } from "@acres/shared";
import {
  createFirstOrganization,
  expectMinTouchTarget,
  expectNoHorizontalScroll,
  registerAccount,
  unique,
} from "./helpers";

// Audit responses come from the real API/database; no SSR mocks or routes.
test.use({ trace: "off" });

async function command(
  page: Page,
  path: string,
  data: unknown,
  organizationId?: string,
  method = "POST",
) {
  const csrf = await (await page.request.get("/api/v1/auth/csrf")).json();
  const response = await page.request.fetch(`/api/v1${path}`, {
    method,
    headers: {
      [csrf.data.headerName]: csrf.data.csrfToken,
      "Idempotency-Key": crypto.randomUUID(),
      ...(organizationId ? { "x-acres-organization-id": organizationId } : {}),
    },
    data,
  });
  expect(response.status(), `${method} ${path}`).toBeLessThan(300);
  return (await response.json()).data;
}

async function organizations(page: Page): Promise<OrganizationSummary[]> {
  return (await (await page.request.get("/api/v1/organizations")).json()).data;
}

const events = (page: Page) =>
  page.getByRole("list", { name: "Audit events" }).getByRole("listitem");
const eventIds = (page: Page) =>
  events(page).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-audit-event-id")),
  );

test("anonymous and no-organization entry states", async ({ page }) => {
  await page.goto("/app/audit");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await registerAccount(page);
  await expect(
    page.getByRole("heading", { name: "Create Organization" }),
  ).toBeVisible();
  await page.goto("/app/audit");
  await expect(
    page.getByRole("heading", { name: "Create Organization" }),
  ).toBeVisible();
});

test("owner reads real events, paginates and switches tenants safely", async ({
  page,
}) => {
  await registerAccount(page);
  await createFirstOrganization(page);
  const [org] = await organizations(page);
  const second = await command(page, "/organizations", {
    name: unique("Other audit org"),
  });
  for (let n = 0; n < 22; n++) {
    await command(
      page,
      `/organizations/${org.id}`,
      { name: `${org.name} ${n}` },
      org.id,
      "PATCH",
    );
  }
  await page.goto("/app/audit");
  await expect(
    page.getByRole("heading", { name: "Audit history." }),
  ).toBeVisible();
  await expect(events(page)).toHaveCount(20);
  await expect(events(page).first().getByRole("heading")).toHaveText(
    "Organization updated",
  );
  const firstIds = await eventIds(page);
  const more = page.getByRole("link", { name: "More events" });
  await expectMinTouchTarget(more, "More events");
  await more.focus();
  await expect(more).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/after=/);
  await expect(events(page)).toHaveCount(3);
  const olderUrl = page.url();
  const olderIds = await eventIds(page);
  expect(olderIds.every((id) => !firstIds.includes(id))).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Organization created", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(events(page)).toHaveCount(3);
  expect(await eventIds(page)).toEqual(olderIds);
  await page.goBack();
  await expect(events(page)).toHaveCount(20);
  await page.goto(olderUrl);
  await expect(events(page)).toHaveCount(3);
  await page.getByLabel("Select Organization").selectOption(second.id);
  await expect(events(page)).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Organization created", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Page unavailable", { exact: true })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(/\/app\/audit$/);
  await page.getByLabel("Select Organization").selectOption(org.id);
  await expect(events(page)).toHaveCount(20);
  await page.getByLabel("Select Organization").selectOption(second.id);
  await expect(events(page)).toHaveCount(1);
  // Relabeling a foreign signed cursor as the active tenant must be rejected.
  const foreign = new URL(olderUrl);
  foreign.searchParams.set("organization", second.id);
  await page.goto(foreign.toString());
  await expect(
    page.getByText("Page unavailable", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Latest events" }).click();
  await expect(page).toHaveURL(/\/app\/audit$/);
  await expect(events(page)).toHaveCount(1);
});

for (const role of ["admin", "analyst", "viewer"] as const) {
  test(`${role} audit access is enforced by page and GraphQL`, async ({
    page,
  }) => {
    await registerAccount(page);
    await createFirstOrganization(page);
    const [org] = await organizations(page);
    const invitee = `${unique(role)}@example.com`;
    const invitation = await command(
      page,
      `/organizations/${org.id}/invitations`,
      { email: invitee, role },
      org.id,
    );
    await page.getByRole("button", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await registerAccount(page, { email: invitee });
    await expect(
      page.getByRole("heading", { name: "Create Organization" }),
    ).toBeVisible();
    await command(page, "/invitations/accept", { token: invitation.token });
    await page.goto("/app/audit");
    const allowed = role === "admin";
    if (allowed) {
      await expect(events(page)).toHaveCount(3);
      await expect(
        page.getByRole("heading", { name: "Invitation issued", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Invitation accepted", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Audit history Active" }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText("Access restricted", { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Audit history Active" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("list", { name: "Audit events" }),
      ).toHaveCount(0);
    }
    await expect(page.locator("body")).not.toContainText(invitation.token);
    const csrf = await (await page.request.get("/api/v1/auth/csrf")).json();
    const apiURL =
      process.env.PLAYWRIGHT_API_URL ??
      `http://127.0.0.1:${process.env.PLAYWRIGHT_API_PORT ?? "3101"}`;
    const result = await (
      await page.request.post(`${apiURL}/graphql`, {
        headers: {
          [csrf.data.headerName]: csrf.data.csrfToken,
          "x-acres-organization-id": org.id,
        },
        data: {
          operationName: "AuditAccess",
          query:
            "query AuditAccess { organizationAuditEvents { edges { node { id } } } }",
        },
      })
    ).json();
    if (allowed)
      expect(result.data.organizationAuditEvents.edges).toHaveLength(3);
    else expect(result.errors[0].extensions.code).toBe("FORBIDDEN");
  });
}

test("invalid pages recover, and records fit all reference viewports", async ({
  page,
}) => {
  await registerAccount(page);
  await createFirstOrganization(page);
  const [org] = await organizations(page);
  for (const query of [
    "after=bad",
    `organization=${org.id}&after=bad`,
    `organization=${org.id}&after=a&after=b`,
  ]) {
    await page.goto(`/app/audit?${query}`);
    await expect(
      page.getByText("Page unavailable", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Latest events" }).click();
    await expect(events(page)).toHaveCount(1);
  }
  await mkdir("../output/playwright", { recursive: true });
  for (const width of [375, 800, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalScroll(page);
    await expectMinTouchTarget(
      page.getByRole("link", { name: "Latest events" }),
      "Latest events",
    );
    await page.screenshot({
      path: `../output/playwright/audit-history-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 640, height: 450 });
  await expectNoHorizontalScroll(page);
});
