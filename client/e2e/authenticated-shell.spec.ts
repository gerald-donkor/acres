import { expect, test, type Page } from "@playwright/test";

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function expectNoHorizontalScroll(page: Page) {
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasOverflow).toBe(false);
}

async function expectMinTouchTarget(
  locator: ReturnType<Page["locator"]>,
  label: string,
) {
  const box = await locator.boundingBox();
  expect(box, `${label} should be visible`).not.toBeNull();
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(44);
}

function appAlert(page: Page) {
  return page.locator('[data-slot="alert"]');
}

async function registerAccount(page: Page) {
  const email = `${unique("account")}@example.com`;
  await page.goto("/register?returnTo=/app");
  await page.getByLabel("Display Name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("a-long-enough-password");
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  return { email };
}

async function createFirstOrganization(page: Page, name = unique("Acme")) {
  await expect(page.getByRole("heading", { name: "Create Organization" })).toBeVisible();
  await page.getByLabel("Organization Name").fill(name);
  await page.getByRole("button", { name: "Create Organization" }).click();
  await expect(page.getByLabel("Current organization")).toHaveText(name);
  return name;
}

test("anonymous app requests redirect to login with returnTo", async ({ page }) => {
  await page.goto("/app");

  await expect(page).toHaveURL(/\/login\?returnTo=\/app$/);
  await expect(page.getByRole("heading", { name: "Sign in to Acres" })).toBeVisible();
});

test("wrong credentials show a generic failure", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${unique("missing")}@example.com`);
  await page.getByLabel("Password").fill("a-long-enough-password");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(appAlert(page)).toContainText("Sign In Failed");
  await expect(appAlert(page)).toContainText(
    "The email or password is not valid.",
  );
});

test("register, create organization, switch organization, and sign out", async ({
  page,
}) => {
  const account = await registerAccount(page);
  const firstOrg = await createFirstOrganization(page, unique("North"));

  await page.getByText("New Organization").click();
  const secondOrg = unique("South");
  await page.getByLabel("Organization Name").fill(secondOrg);
  await page.getByRole("button", { name: "Create Organization" }).click();
  await expect(page.getByLabel("Current organization")).toHaveText(secondOrg);

  await page.getByLabel("Select Organization").selectOption({ label: firstOrg });
  await expect(page.getByLabel("Current organization")).toHaveText(firstOrg);

  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?returnTo=\/app$/);

  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill("a-long-enough-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByLabel("Current organization")).toHaveText(firstOrg);
});

test("create organization sends CSRF and idempotency headers", async ({ page }) => {
  await registerAccount(page);
  let sawHeaders = false;
  const organizationName = unique("Recovered");

  await page.route("**/api/v1/organizations", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    const headers = route.request().headers();
    expect(headers["x-csrf-token"]).toBeTruthy();
    expect(headers["idempotency-key"]).toBeTruthy();

    if (!sawHeaders) {
      sawHeaders = true;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        headers: { "x-request-id": "csrf-test-request" },
        body: JSON.stringify({
          ok: false,
          error: {
            code: "CSRF_INVALID",
            message: "CSRF token invalid.",
            requestId: "csrf-test-request",
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.getByLabel("Organization Name").fill(organizationName);
  await page.getByRole("button", { name: "Create Organization" }).click();

  await expect(appAlert(page)).toContainText("Security Check Failed");
  await expect(appAlert(page)).toContainText("csrf-test-request");
  expect(sawHeaders).toBe(true);

  await page.getByRole("button", { name: "Create Organization" }).click();
  await expect(page.getByLabel("Current organization")).toHaveText(
    organizationName,
  );
});

for (const width of [375, 800, 1280]) {
  test(`core routes fit without horizontal scroll at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
    await expectMinTouchTarget(page.getByLabel("Email"), "login email");
    await expectMinTouchTarget(page.getByLabel("Password"), "login password");
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Sign In" }),
      "sign in button",
    );
    await expectNoHorizontalScroll(page);

    await page.goto("/register");
    await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
    await expectMinTouchTarget(
      page.getByLabel("Display Name"),
      "register display name",
    );
    await expectMinTouchTarget(page.getByLabel("Email"), "register email");
    await expectMinTouchTarget(page.getByLabel("Password"), "register password");
    await expectNoHorizontalScroll(page);

    await registerAccount(page);
    await createFirstOrganization(page, unique(`Viewport-${width}`));
    await expect(page.getByLabel("Select Organization")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible();
    await expectMinTouchTarget(
      page.getByLabel("Select Organization"),
      "organization select",
    );
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Sign Out" }),
      "sign out button",
    );
    await expectNoHorizontalScroll(page);
  });
}
