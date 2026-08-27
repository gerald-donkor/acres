import { expect, test } from "@playwright/test";
import {
  createFirstOrganization,
  expectMinTouchTarget,
  expectNoHorizontalScroll,
  registerAccount,
  unique,
} from "./helpers";

// Target width breakpoints (375px mobile, 800px tablet, 1280px desktop)
// Height is standardized to 900px for responsive layout testing
const VIEWPORTS = [
  { name: "Mobile", width: 375, height: 900 },
  { name: "Tablet", width: 800, height: 900 },
  { name: "Desktop", width: 1280, height: 900 },
];

const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? "3101");
const apiURL = process.env.PLAYWRIGHT_API_URL ?? `http://127.0.0.1:${apiPort}`;

test.describe("WCAG 2.2 Accessibility & Responsive Audit", () => {
  for (const vp of VIEWPORTS) {
    test(`marketing and auth routes fit without horizontal scroll at ${vp.name} (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: 900 });

      // Landing page /
      await page.goto("/");
      await expect(page.locator("body")).toBeVisible();
      await expectNoHorizontalScroll(page);

      // Login page /login
      await page.goto("/login");
      await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
      await expectNoHorizontalScroll(page);

      // Register page /register
      await page.goto("/register");
      await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
      await expectNoHorizontalScroll(page);
    });

    test(`authenticated app workspaces fit without horizontal scroll at ${vp.name} (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: 900 });

      await registerAccount(page);
      await createFirstOrganization(page, unique(`Responsive-${vp.name}`));

      // /app (Dashboards)
      await expect(page).toHaveURL(/\/app$/);
      await expectNoHorizontalScroll(page);

      // /app/reports
      await page.getByRole("link", { name: "Reports" }).click();
      await expect(page).toHaveURL(/\/app\/reports$/);
      await expectNoHorizontalScroll(page);

      // /app/reports/new
      await page.getByRole("link", { name: "New Report" }).click();
      await expect(page).toHaveURL(/\/app\/reports\/new$/);
      await expectNoHorizontalScroll(page);

      // /app/datasets
      await page.getByRole("link", { name: "Data Sets" }).click();
      await expect(page).toHaveURL(/\/app\/datasets$/);
      await expectNoHorizontalScroll(page);

      // /app/datasets/new
      await page.getByRole("link", { name: "New Dataset" }).click();
      await expect(page).toHaveURL(/\/app\/datasets\/new$/);
      await expectNoHorizontalScroll(page);
    });
  }

  test("minimum 44x44px touch targets on mobile viewport (375px)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 900 });

    // Login page touch targets
    await page.goto("/login");
    await expectMinTouchTarget(page.getByLabel("Email"), "login email");
    await expectMinTouchTarget(page.getByLabel("Password"), "login password");
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Sign In" }),
      "sign in button",
    );

    // Register page touch targets
    await page.goto("/register");
    await expectMinTouchTarget(
      page.getByLabel("Display Name"),
      "register display name",
    );
    await expectMinTouchTarget(page.getByLabel("Email"), "register email");
    await expectMinTouchTarget(page.getByLabel("Password"), "register password");
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Create Account" }),
      "create account button",
    );

    // Authenticated App touch targets
    await registerAccount(page);
    await createFirstOrganization(page, unique("Touch-Test"));

    await expectMinTouchTarget(
      page.getByLabel("Select Organization"),
      "org selector",
    );
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Sign Out" }),
      "sign out button",
    );
    await expectMinTouchTarget(
      page.getByRole("link", { name: "Dashboards" }),
      "dashboards nav link",
    );
    await expectMinTouchTarget(
      page.getByRole("link", { name: "Reports" }),
      "reports nav link",
    );

    // Reports page touch targets
    await page.getByRole("link", { name: "Reports" }).click();
    await expectMinTouchTarget(
      page.getByRole("link", { name: "New Report" }),
      "new report button",
    );

    // New report form touch targets
    await page.getByRole("link", { name: "New Report" }).click();
    await expectMinTouchTarget(page.getByLabel("Title"), "report title input");
    await expectMinTouchTarget(
      page.getByLabel("Insight heading"),
      "insight heading input",
    );
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Create Draft" }),
      "create draft button",
    );
  });

  test("skip-link landmark exists, receives keyboard focus, and activates #main-content", async ({
    page,
  }) => {
    for (const route of ["/", "/login", "/register"]) {
      await page.goto(route);
      const skipLink = page.locator('a[href="#main-content"]');
      await expect(skipLink).toBeAttached();
      const mainLandmark = page.locator("#main-content");
      await expect(mainLandmark).toBeAttached();

      // Keyboard focus verification
      await page.keyboard.press("Tab");
      await expect(skipLink).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(new RegExp(`${route}#main-content$`));
    }

    await registerAccount(page);
    await createFirstOrganization(page, unique("Skip-Link-Org"));

    const appSkipLink = page.locator('a[href="#main-content"]');
    await expect(appSkipLink).toBeAttached();
    const appMain = page.locator("#main-content");
    await expect(appMain).toBeAttached();
  });

  test("accessible table regions, captions, and screen-reader alternatives", async ({
    page,
  }) => {
    await registerAccount(page);
    const orgName = unique("A11y-Tables");
    await createFirstOrganization(page, orgName);

    await page.getByRole("link", { name: "Reports" }).click();
    await expect(page).toHaveURL(/\/app\/reports$/);

    // Create report draft to verify report revision view semantics
    await page.getByRole("link", { name: "New Report" }).click();
    await page.getByLabel("Title").fill("A11y Survey Report");
    await page.getByLabel("Insight heading").fill("Accessible Semantics");
    await page.getByLabel("Insight body").fill("All data tables must include captions and headers.");
    await page.getByRole("button", { name: "Create Draft" }).click();

    await expect(page).toHaveURL(/\/app\/reports\/[a-zA-Z0-9_-]+$/);

    // Evidence table region and caption verification
    const evidenceRegion = page.locator('[role="region"][aria-labelledby="evidence-table-title"]');
    await expect(evidenceRegion).toBeAttached();
    await expect(evidenceRegion).toHaveAttribute("tabindex", "0");
    await expect(evidenceRegion.locator("caption")).toBeAttached();
    await expect(evidenceRegion.locator("thead")).toBeAttached();
  });

  test("Prometheus telemetry endpoint outputs low-cardinality metrics", async ({
    request,
  }) => {
    // Check NestJS GET /metrics endpoint directly
    const response = await request.get(`${apiURL}/metrics`);
    expect(response.ok()).toBe(true);

    const text = await response.text();
    expect(text).toContain("acres_http_requests_total");
    expect(text).toContain("route_group=");

    // Validate low-cardinality invariant: no raw UUIDs or tokens in route_group labels
    const hasRawUuid = /route_group="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/.test(
      text,
    );
    expect(hasRawUuid).toBe(false);
  });
});
