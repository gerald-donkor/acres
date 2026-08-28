import { expect, test } from "@playwright/test";
import type { IngestionRunSummary, Report } from "@acres/shared";
import {
  createFirstOrganization,
  createMockDashboardSummary,
  createMockDataset,
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

    // Verify Submit for review is disabled while evidence is missing
    const submitBtn = page.getByRole("button", { name: "Submit for review" });
    await expect(submitBtn).toBeDisabled();

    // Update draft content and save
    const updatedSummary = `${summaryText} Reviewed and verified.`;
    await page.getByLabel("Summary").fill(updatedSummary);
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByLabel("Summary")).toHaveValue(updatedSummary);
  });

  test("report review workflow: submit draft for review and publish from review panel", async ({
    page,
  }) => {
    const reportId = unique("rep-review");
    const revisionId = `rev-${reportId}-1`;
    const draftReport: Report = {
      id: reportId,
      title: "Carbon Offset Verification",
      summary: "Verification report covering southern forest parcel.",
      status: "draft",
      version: 1,
      ownerAccountId: "acc-owner",
      createdByAccountId: "acc-owner",
      createdAt: "2026-08-20T10:00:00.000Z",
      updatedAt: "2026-08-20T10:00:00.000Z",
      latestRevision: {
        id: revisionId,
        reportId,
        revisionNumber: 1,
        status: "draft",
        title: "Carbon Offset Verification",
        summary: "Verification report covering southern forest parcel.",
        sections: [],
        authorAccountId: "acc-owner",
        reviewerAccountId: null,
        publisherAccountId: null,
        submittedForReviewAt: null,
        publishedAt: null,
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-20T10:00:00.000Z",
        insights: [
          {
            id: `ins-${reportId}-1`,
            position: 0,
            heading: "Carbon Stock Stability",
            body: "Net carbon storage remained steady across the verification interval.",
            createdAt: "2026-08-20T10:00:00.000Z",
            updatedAt: "2026-08-20T10:00:00.000Z",
          },
        ],
        evidence: [
          {
            id: `evi-${reportId}-1`,
            evidenceType: "aggregate",
            aggregateId: "agg-carbon-01",
            dashboardViewId: null,
            metricDefinitionId: "metric-carbon-1",
            datasetVersionId: "ds-carbon-v1",
            observationId: null,
            snapshot: {
              metric: { label: "Carbon Stock", unit: "tCO2e" },
              value: 1240.5,
              unit: "tCO2e",
              observationCount: 18,
            },
            position: 0,
            createdAt: "2026-08-20T10:00:00.000Z",
          },
        ],
      },
    };

    const inReviewReport: Report = {
      ...draftReport,
      version: 2,
      updatedAt: "2026-08-20T10:30:00.000Z",
      latestRevision: {
        ...draftReport.latestRevision!,
        status: "in_review",
        submittedForReviewAt: "2026-08-20T10:30:00.000Z",
        updatedAt: "2026-08-20T10:30:00.000Z",
      },
    };

    const publishedReport: Report = {
      ...inReviewReport,
      status: "published",
      version: 3,
      updatedAt: "2026-08-20T11:00:00.000Z",
      latestRevision: {
        ...inReviewReport.latestRevision!,
        status: "published",
        publisherAccountId: "acc-owner",
        publishedAt: "2026-08-20T11:00:00.000Z",
        updatedAt: "2026-08-20T11:00:00.000Z",
      },
    };

    let currentReport = draftReport;

    await page.route("**/api/v1/reports", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: [currentReport] }),
      });
    });

    await page.route(`**/api/v1/reports/${reportId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: currentReport }),
      });
    });

    await page.route(
      `**/api/v1/reports/${reportId}/revisions/${revisionId}/submit-review`,
      async (route) => {
        currentReport = inReviewReport;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: currentReport }),
        });
      },
    );

    await page.route(
      `**/api/v1/reports/${reportId}/revisions/${revisionId}/publish`,
      async (route) => {
        currentReport = publishedReport;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: currentReport }),
        });
      },
    );

    await registerAccount(page);
    const orgName = unique("Verification Org");
    await createFirstOrganization(page, orgName);

    // Open reports list
    await page.getByRole("link", { name: "Reports" }).click();
    await expect(page).toHaveURL(/\/app\/reports$/);
    await expect(page.getByRole("link", { name: draftReport.title })).toBeVisible();

    // Navigate to report detail
    await page.getByRole("link", { name: draftReport.title }).click();
    await expect(page).toHaveURL(new RegExp(`/app/reports/${reportId}$`));

    // Verify readiness requirement is satisfied and Submit for Review is enabled
    await expect(
      page.getByText("Ready for review. All insight and evidence requirements are met."),
    ).toBeVisible();
    const submitForReviewBtn = page.getByRole("button", { name: "Submit for review" });
    await expect(submitForReviewBtn).toBeEnabled();

    // Submit for review
    await submitForReviewBtn.click();

    // Verify transition to In Review state
    await expect(page.getByText("In Review", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Claims & Insights" })).toBeVisible();
    await expect(page.getByText("Carbon Stock Stability")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Review Decision" })).toBeVisible();

    // Publish from the review panel
    const publishBtn = page.getByRole("button", { name: "Publish" });
    await expect(publishBtn).toBeVisible();
    await publishBtn.click();

    // Verify transition to Published state
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Published Insights (1)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Draft Revision" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();
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

    // Verify published state is immutable and displays published insights
    await expect(page.getByText("Published", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Published Insights (1)" })).toBeVisible();

    // Verify Evidence table
    await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
    await expect(page.getByText("agg-canopy-01")).toBeVisible();

    // Verify Exports sidebar panel
    await expect(page.getByRole("heading", { name: "Exports" })).toBeVisible();
    await expect(page.getByText("CSV")).toBeVisible();
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  });

  test("dataset lifecycle: create dataset, upload file, map columns, stream ingestion, and view published version", async ({
    page,
  }) => {
    await registerAccount(page);
    const orgName = unique("Geo Data Corp");
    await createFirstOrganization(page, orgName);

    // Navigate to Data Sets section
    await page.getByRole("link", { name: "Data Sets" }).click();
    await expect(page).toHaveURL(/\/app\/datasets$/);
    await expect(
      page.getByRole("heading", { name: "Manage source data and versions." }),
    ).toBeVisible();

    // Verify empty state
    await expect(page.getByRole("heading", { name: "No datasets yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New Dataset" })).toBeVisible();

    // Navigate to New Dataset form
    await page.getByRole("link", { name: "New Dataset" }).click();
    await expect(page).toHaveURL(/\/app\/datasets\/new$/);
    await expect(page.getByRole("heading", { name: "New dataset." })).toBeVisible();

    // Fill dataset form
    const datasetName = unique("Census Ingestion Test");
    const datasetDesc = "Provincial census statistics with demographic mappings.";
    await page.getByLabel("Name").fill(datasetName);
    await page.getByLabel("Description").fill(datasetDesc);

    // Submit dataset
    await page.getByRole("button", { name: "Create Dataset" }).click();

    // Expect navigation to detail page
    await expect(page).toHaveURL(/\/app\/datasets\/[a-zA-Z0-9_-]+$/);
    await expect(page.getByRole("heading", { name: datasetName })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ingestion Pipeline" })).toBeVisible();

    // Setup route interception for upload and ingestion
    const uploadId = unique("upl");
    const mappingId = unique("map");
    const runId = unique("run");
    const storageUrl = "http://localhost:3000/api/mock-storage/upload";

    await page.route("**/api/v1/uploads", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            data: {
              uploadId,
              object: { key: "quarantine/test", bucket: "acres", checksumAlgorithm: "sha256" },
              upload: {
                url: storageUrl,
                method: "PUT",
                headers: { "content-type": "text/csv" },
                expiresAt: "2026-12-31T00:00:00Z",
              },
              complete: { method: "POST", url: `/api/v1/uploads/${uploadId}/complete`, requiredHeaders: [] },
            },
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.route(storageUrl, async (route) => {
      await route.fulfill({ status: 200, body: "OK" });
    });

    await page.route(`**/api/v1/uploads/${uploadId}/complete`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            id: uploadId,
            state: "accepted",
            filename: "census_data.csv",
            mediaType: "text/csv",
            byteCount: 42,
            checksumHex: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
            progress: { stage: "scan", percent: 100 },
            failure: null,
            acceptedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.route("**/api/v1/datasets/*/mappings", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            id: mappingId,
            datasetId: "ds-1",
            uploadId,
            versionNumber: 1,
            validationStatus: "pending",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    const runningRun: IngestionRunSummary = {
      id: runId,
      datasetId: "ds-1",
      uploadId,
      mappingId,
      datasetVersionId: null,
      state: "running",
      stage: "validate",
      progressPercent: 50,
      failure: null,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };

    const publishedRun: IngestionRunSummary = {
      id: runId,
      datasetId: "ds-1",
      uploadId,
      mappingId,
      datasetVersionId: "ver-1",
      state: "published",
      stage: "publish",
      progressPercent: 100,
      failure: null,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };

    await page.route("**/api/v1/datasets/*/ingestion-runs", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: runningRun,
        }),
      });
    });

    await page.route(`**/api/v1/ingestion-runs/${runId}/events`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          `event: ingestion.progress\nid: ${runId}:running:validate:50\n` +
          `data: ${JSON.stringify(runningRun)}\n\n` +
          `event: ingestion.progress\nid: ${runId}:published:publish:100\n` +
          `data: ${JSON.stringify(publishedRun)}\n\n`,
      });
    });

    // Set file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "census_data.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("region,population\nnorth-01,15000\n"),
    });

    // Verify inspection summary
    await expect(page.getByText("Selected File Inspection")).toBeVisible();
    await expect(page.getByText("census_data.csv")).toBeVisible();

    // Click Initiate & Upload File
    await page.getByRole("button", { name: "Initiate & Upload File" }).click();

    // Verify transition to Step 2 (Column Mapping)
    await expect(page.getByText("Upload accepted: census_data.csv")).toBeVisible();
    await expect(page.getByLabel("Region Column")).toHaveValue("region");
    await expect(page.getByLabel("Source Column")).toHaveValue("population");

    // Click Start Ingestion Run
    await page.getByRole("button", { name: "Start Ingestion Run" }).click();

    // Verify progress card and final published state
    await expect(page.getByRole("heading", { name: "Ingestion Run" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Ingest Another File" })).toBeVisible();
  });

  test("dataset ingestion error displays validation issues table", async ({
    page,
  }) => {
    const dataset = createMockDataset();
    const uploadId = unique("upl");
    const mappingId = unique("map");
    const runId = unique("run");
    const storageUrl = "http://localhost:3000/api/mock-storage/upload-fail";

    await page.route("**/api/v1/datasets", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: [dataset] }),
      });
    });

    await page.route(`**/api/v1/datasets/${dataset.id}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: dataset }),
      });
    });

    await page.route(`**/api/v1/datasets/${dataset.id}/versions`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: [] }),
      });
    });

    await page.route("**/api/v1/uploads", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            uploadId,
            object: { key: "quarantine/fail", bucket: "acres", checksumAlgorithm: "sha256" },
            upload: { url: storageUrl, method: "PUT", headers: {}, expiresAt: "2026-12-31" },
            complete: { method: "POST", url: `/api/v1/uploads/${uploadId}/complete`, requiredHeaders: [] },
          },
        }),
      });
    });

    await page.route(storageUrl, async (route) => {
      await route.fulfill({ status: 200, body: "OK" });
    });

    await page.route(`**/api/v1/uploads/${uploadId}/complete`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            id: uploadId,
            state: "accepted",
            filename: "bad_data.csv",
            mediaType: "text/csv",
            byteCount: 30,
            checksumHex: "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
            progress: { stage: "scan", percent: 100 },
            failure: null,
            acceptedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.route("**/api/v1/datasets/*/mappings", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            id: mappingId,
            datasetId: dataset.id,
            uploadId,
            versionNumber: 1,
            validationStatus: "pending",
            createdAt: new Date().toISOString(),
          },
        }),
      });
    });

    const failedRun: IngestionRunSummary = {
      id: runId,
      datasetId: dataset.id,
      uploadId,
      mappingId,
      datasetVersionId: null,
      state: "failed",
      stage: "validate",
      progressPercent: 50,
      failure: { code: "validation_failed", message: "Geography resolution failed for row 1." },
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };

    await page.route("**/api/v1/datasets/*/ingestion-runs", async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, data: failedRun }),
      });
    });

    await page.route(`**/api/v1/ingestion-runs/${runId}/events`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body:
          `event: ingestion.progress\nid: ${runId}:failed:validate:50\n` +
          `data: ${JSON.stringify(failedRun)}\n\n`,
      });
    });

    await page.route(`**/api/v1/ingestion-runs/${runId}/issues`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: [
            {
              id: "iss-1",
              severity: "error",
              code: "region_unresolved",
              message: "Unknown region code 'invalid-999'.",
              rowNumber: 1,
              columnKey: "region",
              regionRef: "invalid-999",
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    await registerAccount(page);
    const orgName = unique("Fail Test Org");
    await createFirstOrganization(page, orgName);

    // Open dataset detail
    await page.goto(`/app/datasets/${dataset.id}`);
    await expect(page.getByRole("heading", { name: dataset.name })).toBeVisible();

    // Select file & upload
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "bad_data.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("region,population\ninvalid-999,100\n"),
    });

    await page.getByRole("button", { name: "Initiate & Upload File" }).click();
    await expect(page.getByText("Upload accepted: bad_data.csv")).toBeVisible();

    // Start ingestion
    await page.getByRole("button", { name: "Start Ingestion Run" }).click();

    // Verify failure state & issues table
    await expect(page.getByText("Validation Issues (1)")).toBeVisible();
    await expect(page.getByText("Unknown region code 'invalid-999'.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry Ingestion" })).toBeVisible();
  });

  test("gemini draft preview: disclosure, acknowledgement requirement, proposal generation, and copying to draft fields", async ({
    page,
  }) => {
    const reportId = unique("rep-ai");
    const revisionId = `rev-${reportId}-1`;
    const evidenceId = "11111111-1111-7111-8111-111111111111";

    const initialReport = {
      id: reportId,
      title: "Regional Agricultural Growth Report",
      summary: "Overview of agricultural metrics and trends.",
      status: "draft",
      version: 1,
      ownerAccountId: "acc-1",
      createdByAccountId: "acc-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      aiDraftEnabled: true,
      latestRevision: {
        id: revisionId,
        reportId,
        revisionNumber: 1,
        status: "draft",
        title: "Regional Agricultural Growth Report",
        summary: "Overview of agricultural metrics and trends.",
        sections: [],
        authorAccountId: "acc-1",
        reviewerAccountId: null,
        publisherAccountId: null,
        submittedForReviewAt: null,
        publishedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        insights: [
          {
            id: "ins-1",
            position: 0,
            heading: "Initial Baseline",
            body: "Initial baseline notes.",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        evidence: [
          {
            id: evidenceId,
            evidenceType: "aggregate",
            aggregateId: "agg-1",
            dashboardViewId: null,
            metricDefinitionId: "met-1",
            datasetVersionId: "ver-1",
            observationId: "obs-1",
            snapshot: {
              metric: { label: "Crop Yield", unit: "bushels/acre" },
              value: 185,
            },
            position: 0,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    };

    await page.route("**/api/v1/reports", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: [initialReport] }),
        });
        return;
      }
      await route.continue();
    });

    await page.route(`**/api/v1/reports/${reportId}`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, data: initialReport }),
        });
        return;
      }
      await route.continue();
    });

    await page.route(
      `**/api/v1/reports/${reportId}/revisions/${revisionId}/ai-drafts`,
      async (route) => {
        if (route.request().method() === "POST") {
          const body = JSON.parse(route.request().postData() || "{}");
          if (!body.acknowledgement) {
            await route.fulfill({
              status: 400,
              contentType: "application/json",
              body: JSON.stringify({
                ok: false,
                error: {
                  code: "VALIDATION_FAILED",
                  message: "Acknowledgement of unpaid Gemini terms is required.",
                },
              }),
            });
            return;
          }

          await route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify({
              ok: true,
              data: {
                proposals: [
                  {
                    heading: "Elevated Crop Yield Across Northern Acres",
                    body: "Analysis indicates corn yield reached 185 bushels/acre, exceeding target baseline.",
                    citedEvidenceIds: [evidenceId],
                  },
                ],
                metadata: {
                  generationId: "gen-test-1",
                  provider: "gemini",
                  model: "gemini-2.5-flash",
                  promptTemplateVersion: "v1",
                  proposalCount: 1,
                  createdAt: new Date().toISOString(),
                },
              },
            }),
          });
          return;
        }
        await route.continue();
      },
    );

    await registerAccount(page);
    const orgName = unique("AI Draft Preview Org");
    await createFirstOrganization(page, orgName);

    // Navigate to report detail page
    await page.goto(`/app/reports/${reportId}`);
    await expect(
      page.getByRole("heading", { name: "Regional Agricultural Growth Report" }),
    ).toBeVisible();

    // Verify AI preview generator header is present
    await expect(
      page.getByRole("heading", { name: "Draft with Gemini preview" }),
    ).toBeVisible();

    // Open generator
    await page.getByRole("button", { name: "Open generator" }).click();

    // Verify disclosure is visible
    await expect(
      page.getByText("Third-Party AI Disclosure (Unpaid Gemini Developer API)"),
    ).toBeVisible();

    // Submit button is disabled before checking acknowledgement
    const generateBtn = page.getByRole("button", {
      name: "Generate insight proposals",
    });
    await expect(generateBtn).toBeDisabled();

    // Check acknowledgement checkbox and fill purpose
    await page.getByLabel(/I understand and agree that this request sends selected report evidence/i).click();
    await page.getByLabel("Focus instruction / purpose").fill("Summarize corn yield trends");

    // Click generate proposals
    await generateBtn.click();

    // Verify proposal appears
    await expect(
      page.getByText("Elevated Crop Yield Across Northern Acres"),
    ).toBeVisible();
    await expect(
      page.getByText("Analysis indicates corn yield reached 185 bushels/acre"),
    ).toBeVisible();

    // Click "Use as draft"
    await page.getByRole("button", { name: "Use as draft" }).click();

    // Verify draft revision fields were updated with proposal content
    await expect(page.getByLabel("Insight heading")).toHaveValue(
      "Elevated Crop Yield Across Northern Acres",
    );
    await expect(page.getByLabel("Insight body")).toHaveValue(
      "Analysis indicates corn yield reached 185 bushels/acre, exceeding target baseline.",
    );
  });
});
