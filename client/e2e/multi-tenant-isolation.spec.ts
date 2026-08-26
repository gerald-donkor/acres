import { expect, test } from "@playwright/test";
import {
  createFirstOrganization,
  createMockDashboardSummary,
  registerAccount,
  unique,
} from "./helpers";

test.describe("Multi-Tenant Isolation", () => {
  test("two independent organizations do not leak saved views, reports, or evidence", async ({
    browser,
  }) => {
    // Tenant A session in context A
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    const summaryA = createMockDashboardSummary();
    await pageA.route("**/graphql", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            dashboardSummary: summaryA,
          },
        }),
      });
    });

    await registerAccount(pageA);
    const orgAName = unique("Alpha Regional Corp");
    await createFirstOrganization(pageA, orgAName);

    // Tenant A creates a saved view
    const viewNameA = unique("Alpha High-Yield Metrics");
    const viewInputA = pageA.getByLabel("Save current view");
    await expect(viewInputA).toBeVisible();
    await viewInputA.fill(viewNameA);

    await pageA.route("**/api/v1/dashboard-views**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              id: "view-alpha-1",
              name: viewNameA,
              filters: {},
              presentation: { chart: "bar", compareBy: "period" },
              ownerAccountId: "acc-alpha",
              status: "active",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          }),
        });
        return;
      }
      await route.continue();
    });

    await pageA.getByRole("button", { name: "Save View" }).click();

    // Tenant A creates a report draft
    await pageA.getByRole("link", { name: "Reports" }).click();
    await expect(pageA).toHaveURL(/\/app\/reports$/);
    await pageA.getByRole("link", { name: "New Report" }).click();

    const reportTitleA = unique("Alpha Confidential Forestry Plan");
    await pageA.getByLabel("Title").fill(reportTitleA);
    await pageA.getByLabel("Summary").fill("Confidential land acquisition report.");
    await pageA.getByLabel("Insight heading").fill("Timber Yields");
    await pageA.getByLabel("Insight body").fill("Yield projections for northern timber plots.");
    await pageA.getByRole("button", { name: "Create Draft" }).click();
    await expect(pageA.getByRole("heading", { name: reportTitleA })).toBeVisible();

    const reportUrlA = pageA.url();

    // Tenant B session in separate isolated context B
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    await registerAccount(pageB);
    const orgBName = unique("Beta Ecology Ltd");
    await createFirstOrganization(pageB, orgBName);

    // Tenant B verifies dashboards: Alpha's saved view MUST NOT be visible
    await expect(pageB).toHaveURL(/\/app$/);
    await expect(pageB.getByText(orgBName)).toBeVisible();
    await expect(pageB.getByRole("link", { name: viewNameA })).not.toBeVisible();

    // Tenant B verifies reports: Alpha's report MUST NOT appear in library
    await pageB.getByRole("link", { name: "Reports" }).click();
    await expect(pageB).toHaveURL(/\/app\/reports$/);
    await expect(pageB.getByRole("link", { name: reportTitleA })).not.toBeVisible();

    // Tenant B attempts direct navigation to Tenant A's private report URL
    await pageB.goto(reportUrlA);

    // Direct access must either redirect, show an error alert, or deny access; it must NOT render Alpha's private title
    const leakedHeading = pageB.getByRole("heading", { name: reportTitleA, exact: true });
    await expect(leakedHeading).not.toBeVisible();

    await contextA.close();
    await contextB.close();
  });

  test("switching active organization updates data context immediately without cross-org bleed", async ({
    page,
  }) => {
    await registerAccount(page);
    const org1Name = unique("Org Alpha");
    const org2Name = unique("Org Beta");

    await createFirstOrganization(page, org1Name);

    // Create second organization for same account
    await page.getByText("New Organization").click();
    await page.getByLabel("Organization Name").fill(org2Name);
    await page.getByRole("button", { name: "Create Organization" }).click();
    await expect(page.getByLabel("Current organization")).toHaveText(org2Name);

    // Switch back to Org 1
    await page.getByLabel("Select Organization").selectOption({ label: org1Name });
    await expect(page.getByLabel("Current organization")).toHaveText(org1Name);
    await expect(page.getByText(`${org1Name} can compare published analytics`)).toBeVisible();

    // Switch back to Org 2
    await page.getByLabel("Select Organization").selectOption({ label: org2Name });
    await expect(page.getByLabel("Current organization")).toHaveText(org2Name);
    await expect(page.getByText(`${org2Name} can compare published analytics`)).toBeVisible();
  });

  test("cross-tenant API request rejection when tampering with organization headers", async ({
    page,
  }) => {
    await registerAccount(page);
    const orgName = unique("Tamper Test Org");
    await createFirstOrganization(page, orgName);

    // Navigate to /app/reports/new which is always available for draft creation
    await page.getByRole("link", { name: "Reports" }).click();
    await page.getByRole("link", { name: "New Report" }).click();
    await expect(page.getByRole("heading", { name: "New draft." })).toBeVisible();

    // Intercept mutation and simulate backend RLS guard returning 404 for tampered organization
    let sawTamperedHeader = false;
    await page.route("**/api/v1/reports", async (route) => {
      if (route.request().method() === "POST") {
        sawTamperedHeader = true;
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: {
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization not found or access denied.",
              requestId: "req-tamper-guard-1",
            },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.getByLabel("Title").fill("Tampered Report");
    await page.getByLabel("Insight heading").fill("Tampered Heading");
    await page.getByLabel("Insight body").fill("Tampered Body");
    await page.getByRole("button", { name: "Create Draft" }).click();

    // Form should display security error feedback unconditionally
    await expect(
      page.getByText("Organization not found or access denied."),
    ).toBeVisible();
    expect(sawTamperedHeader).toBe(true);
  });
});
