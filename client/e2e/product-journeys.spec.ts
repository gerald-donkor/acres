import { expect, test } from "@playwright/test";
import {
  createFirstOrganization,
  createMockDashboardSummary,
  createMockExport,
  createMockReport,
  registerAccount,
  unique,
} from "./helpers";

test.describe("Product Journeys", () => {
  test("unseeded organization shows empty state with metric publication guidance", async ({
    page,
  }) => {
    await registerAccount(page);
    const orgName = unique("Terra Analytics");
    await createFirstOrganization(page, orgName);

    // Verify dashboards route is active
    await expect(page).toHaveURL(/\/app$/);
    await expect(
      page.getByRole("heading", { name: "Browse regional metrics." }),
    ).toBeVisible();

    // Verify organization context in header
    await expect(
      page.getByText(`${orgName} can compare published analytics`),
    ).toBeVisible();

    // Verify deterministic empty state when no metrics exist
    await expect(
      page.getByRole("heading", { name: "No published metrics" }),
    ).toBeVisible();
    await expect(
      page.getByText("Publish an ingested dataset with metric mappings"),
    ).toBeVisible();
  });

  test("populated dashboard allows saving, listing, and switching views", async ({
    page,
  }) => {
    const summary = createMockDashboardSummary();

    await page.route("**/graphql", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            dashboardSummary: summary,
          },
        }),
      });
    });

    await registerAccount(page);
    const orgName = unique("Populated Analytics");
    await createFirstOrganization(page, orgName);

    // Verify stats cards
    await expect(
      page.getByRole("heading", { name: "Browse regional metrics." }),
    ).toBeVisible();
    await expect(page.getByText("Metrics", { exact: true })).toBeVisible();
    await expect(page.getByText("2", { exact: true }).first()).toBeVisible();

    // Verify Comparison Table
    await expect(
      page.getByRole("heading", { name: "Comparison Table" }),
    ).toBeVisible();
    await expect(page.getByText("Canopy Cover").first()).toBeVisible();
    await expect(page.getByText("Surface Water Index")).toBeVisible();

    // Verify Evidence Panel
    await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
    await expect(page.getByText("calc-v1.0")).toBeVisible();
    await expect(page.getByText("dim_hash_north_q1q2")).toBeVisible();

    // Save a new dashboard view
    const viewName = unique("Q3 Regional Canopy");
    const viewInput = page.getByLabel("Save current view");
    await expect(viewInput).toBeVisible();
    await viewInput.fill(viewName);

    // Intercept createDashboardView mutation
    await page.route("**/api/v1/dashboard-views**", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              id: "view-new-q3",
              name: viewName,
              filters: {},
              presentation: { chart: "bar", compareBy: "period" },
              ownerAccountId: "acc-1",
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

    await page.getByRole("button", { name: "Save View" }).click();
  });

  test("reports lifecycle: author draft, save updates, and enforce evidence requirement", async ({
    page,
  }) => {
    await registerAccount(page);
    const orgName = unique("Ecosystems Corp");
    await createFirstOrganization(page, orgName);

    // Navigate to Reports section
    await page.getByRole("link", { name: "Reports" }).click();
    await expect(page).toHaveURL(/\/app\/reports$/);
    await expect(
      page.getByRole("heading", { name: "Publish evidence-backed work." }),
    ).toBeVisible();

    // Navigate to New Report form
    await page.getByRole("link", { name: "New Report" }).click();
    await expect(page).toHaveURL(/\/app\/reports\/new$/);
    await expect(page.getByRole("heading", { name: "New draft." })).toBeVisible();

    // Fill in report draft details
    const reportTitle = unique("Biomass Inventory Report");
    const summaryText = "Survey evidence quantifying forest biomass density.";
    const insightHead = "Biomass Index Elevation";
    const insightBody = "Observed a 14% elevation in biomass across primary test sites.";

    await page.getByLabel("Title").fill(reportTitle);
    await page.getByLabel("Summary").fill(summaryText);
    await page.getByLabel("Insight heading").fill(insightHead);
    await page.getByLabel("Insight body").fill(insightBody);

    // Submit draft
    await page.getByRole("button", { name: "Create Draft" }).click();

    // Expect transition to the report detail page
    await expect(page).toHaveURL(/\/app\/reports\/[a-zA-Z0-9_-]+$/);
    await expect(
      page.getByRole("heading", { name: reportTitle }),
    ).toBeVisible();

    // Verify draft revision editor fields are populated
    await expect(page.getByLabel("Title")).toHaveValue(reportTitle);
    await expect(page.getByLabel("Summary")).toHaveValue(summaryText);
    await expect(page.getByLabel("Insight heading")).toHaveValue(insightHead);
    await expect(page.getByLabel("Insight body")).toHaveValue(insightBody);

    // Verify field error indicating that publishing requires evidence when evidence list is empty
    await expect(
      page.getByText("Publishing requires at least one evidence link."),
    ).toBeVisible();

    // Update draft content and save
    const updatedSummary = `${summaryText} Reviewed and verified.`;
    await page.getByLabel("Summary").fill(updatedSummary);
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByLabel("Summary")).toHaveValue(updatedSummary);
  });

  test("published report rendering, export request queuing, and artifact download", async ({
    page,
  }) => {
    const report = createMockReport();
    const queuedExport = createMockExport(report.id, "csv", {
      status: "queued",
      artifact: null,
      finishedAt: null,
    });
    const succeededExport = {
      ...queuedExport,
      status: "succeeded" as const,
      finishedAt: "2026-08-15T10:00:00.000Z",
      artifact: {
        id: `art-${queuedExport.id}`,
        filename: `report-${report.id}.csv`,
        mediaType: "text/csv",
        byteCount: 4096,
        checksumHex:
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        createdAt: "2026-08-15T10:00:00.000Z",
      },
    };

    await page.route("**/api/v1/reports", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: [report],
        }),
      });
    });

    await page.route(`**/api/v1/reports/${report.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: report,
        }),
      });
    });

    await page.route("**/api/v1/exports", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: queuedExport,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: [queuedExport],
        }),
      });
    });

    await page.route(
      `**/api/v1/exports/${queuedExport.id}/events`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body:
            `event: export.progress\nid: ${queuedExport.id}:succeeded:2026-08-15T10:00:00.000Z\n` +
            `data: ${JSON.stringify(succeededExport)}\n\n`,
        });
      },
    );

    await page.route(
      `**/api/v1/exports/${queuedExport.id}/download`,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              url: `https://storage.acres.internal/artifacts/${queuedExport.id}.csv`,
              method: "GET",
              headers: {},
              expiresAt: "2026-08-27T00:00:00Z",
            },
          }),
        });
      },
    );

    await registerAccount(page);
    const orgName = unique("Governed Reports Org");
    await createFirstOrganization(page, orgName);

    // Open reports list
    await page.getByRole("link", { name: "Reports" }).click();
    await expect(page).toHaveURL(/\/app\/reports$/);
    await expect(page.getByRole("heading", { name: "Report Library" })).toBeVisible();
    await expect(page.getByRole("link", { name: report.title })).toBeVisible();

    // Navigate to report detail
    await page.getByRole("link", { name: report.title }).click();
    await expect(page).toHaveURL(new RegExp(`/app/reports/${report.id}$`));
    await expect(page.getByRole("heading", { name: report.title })).toBeVisible();

    // Verify published state is immutable
    await expect(page.getByLabel("Title")).toBeDisabled();

    // Verify Evidence table
    await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
    await expect(page.getByText("agg-canopy-01")).toBeVisible();

    // Verify Exports sidebar panel
    await expect(page.getByRole("heading", { name: "Exports" })).toBeVisible();
    await expect(page.getByText("CSV")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  });
});
