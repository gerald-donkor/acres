import { expect, test, type Page } from "@playwright/test";

test.use({ trace: "off" });

const PASSWORD = "a-long-enough-password";
const UNAVAILABLE_TOKEN = "synthetic-unavailable-token-value-0001";

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function expectNoHorizontalScroll(page: Page) {
  const hasOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
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

async function registerFor(page: Page, email: string, returnTo: string) {
  await page.goto(`/register?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Display Name").fill("Invitation Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo}$`));
}

async function createOrganization(page: Page, name: string) {
  await page.getByLabel("Organization Name").fill(name);
  await page.getByRole("button", { name: "Create Organization" }).click();
  await expect(page.getByLabel("Current organization")).toHaveText(name);
}

test("anonymous invitation acceptance redirects through sign in", async ({
  page,
}) => {
  await page.goto("/accept-invitation");

  await expect(page).toHaveURL(/\/login\?/);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe(
    "/accept-invitation",
  );
  await expect(
    page.getByRole("heading", { name: "Sign in to Acres" }),
  ).toBeVisible();
});

test("accepts an invitation and selects the invited organization", async ({
  page,
}) => {
  const inviteeEmail = `${unique("invitee")}@example.com`;
  const organizationName = unique("Invited Workspace");

  await registerFor(page, `${unique("inviter")}@example.com`, "/app");
  await createOrganization(page, organizationName);

  const organizationsResponse = await page.request.get("/api/v1/organizations");
  expect(organizationsResponse.ok()).toBe(true);
  const organizationsEnvelope = (await organizationsResponse.json()) as {
    ok: true;
    data: Array<{ id: string; name: string }>;
  };
  const organization = organizationsEnvelope.data.find(
    ({ name }) => name === organizationName,
  );
  expect(organization).toBeDefined();

  const csrfResponse = await page.request.get("/api/v1/auth/csrf");
  expect(csrfResponse.ok()).toBe(true);
  const csrfEnvelope = (await csrfResponse.json()) as {
    ok: true;
    data: { csrfToken: string; headerName: "x-csrf-token" };
  };
  const invitationResponse = await page.request.post(
    `/api/v1/organizations/${organization!.id}/invitations`,
    {
      headers: {
        [csrfEnvelope.data.headerName]: csrfEnvelope.data.csrfToken,
        "Idempotency-Key": crypto.randomUUID(),
        "x-acres-organization-id": organization!.id,
      },
      data: { email: inviteeEmail, role: "viewer" },
    },
  );
  expect(invitationResponse.ok()).toBe(true);
  const invitationEnvelope = (await invitationResponse.json()) as {
    ok: true;
    data: { token: string };
  };
  const invitationToken = invitationEnvelope.data.token;

  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await registerFor(page, inviteeEmail, "/accept-invitation");

  const tokenInput = page.getByLabel("Invitation Token");
  await expect(tokenInput).toHaveAttribute("type", "password");
  await tokenInput.fill(invitationToken);
  await page.getByRole("button", { name: "Accept Invitation" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByLabel("Current organization")).toHaveText(
    organizationName,
  );
  expect(page.url()).not.toContain(invitationToken);
  const persistedToken = await page.evaluate((token) => {
    const localValues = Object.values(localStorage);
    const sessionValues = Object.values(sessionStorage);
    return [...localValues, ...sessionValues, document.cookie].some((value) =>
      value.includes(token),
    );
  }, invitationToken);
  expect(persistedToken).toBe(false);
});

test("unavailable invitation stays generic and refreshes CSRF on retry", async ({
  page,
}) => {
  await registerFor(
    page,
    `${unique("unavailable")}@example.com`,
    "/accept-invitation",
  );

  let acceptanceAttempts = 0;
  let csrfRefreshes = 0;
  let releaseFirstRequest: (() => void) | undefined;
  let markFirstRequestSeen: (() => void) | undefined;
  const firstRequestSeen = new Promise<void>((resolve) => {
    markFirstRequestSeen = resolve;
  });
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/auth/csrf")) csrfRefreshes += 1;
  });
  await page.route("**/api/v1/invitations/accept", async (route) => {
    const headers = route.request().headers();
    expect(headers["x-csrf-token"]).toBeTruthy();
    expect(headers["idempotency-key"]).toBeTruthy();
    expect(headers["x-acres-organization-id"]).toBeUndefined();
    acceptanceAttempts += 1;

    if (acceptanceAttempts === 1) {
      markFirstRequestSeen?.();
      await new Promise<void>((resolve) => {
        releaseFirstRequest = resolve;
      });
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        headers: { "x-request-id": "invitation-csrf-request" },
        body: JSON.stringify({
          ok: false,
          error: {
            code: "CSRF_INVALID",
            message: "CSRF token invalid.",
            requestId: "invitation-csrf-request",
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  const tokenInput = page.getByLabel("Invitation Token");
  await tokenInput.fill(UNAVAILABLE_TOKEN);
  const submit = page.getByRole("button", { name: "Accept Invitation" });
  await submit.click();
  await firstRequestSeen;
  await expect(page.getByRole("button", { name: "Accepting…" })).toBeDisabled();
  await expect(tokenInput).toBeDisabled();
  releaseFirstRequest?.();

  const alert = page.locator('[data-slot="alert"]');
  await expect(alert).toContainText("Security Check Failed");
  await expect(alert).toContainText("invitation-csrf-request");
  await expect(alert).toBeFocused();
  await expect(tokenInput).toHaveValue("");

  await tokenInput.fill(UNAVAILABLE_TOKEN);
  await page.getByRole("button", { name: "Accept Invitation" }).click();

  await expect(alert).toContainText("Invitation Unavailable");
  await expect(alert).toContainText(
    "This invitation cannot be used by the signed-in account.",
  );
  await expect(alert).toBeFocused();
  await expect(tokenInput).toHaveValue("");
  expect(acceptanceAttempts).toBe(2);
  expect(csrfRefreshes).toBeGreaterThanOrEqual(1);
  expect(page.url()).not.toContain(UNAVAILABLE_TOKEN);
});

for (const width of [375, 800, 1280]) {
  test(`invitation acceptance is touch-safe and overflow-free at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await registerFor(
      page,
      `${unique(`viewport-${width}`)}@example.com`,
      "/accept-invitation",
    );

    const tokenInput = page.getByLabel("Invitation Token");
    const submit = page.getByRole("button", { name: "Accept Invitation" });
    await expect(page.getByText(/Signed in as/)).toBeVisible();
    await expectMinTouchTarget(tokenInput, "invitation token");
    await expectMinTouchTarget(submit, "accept invitation button");
    await expectNoHorizontalScroll(page);
  });
}
