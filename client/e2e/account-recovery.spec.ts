import { expect, test } from "@playwright/test";
import {
  appAlert,
  expectMinTouchTarget,
  expectNoHorizontalScroll,
} from "./helpers";

test.use({ trace: "off" });

test("navigates from login to forgot password and submits recovery request", async ({
  page,
}) => {
  await page.goto("/login");

  const forgotLink = page.getByRole("link", { name: "Forgot password?" });
  await expect(forgotLink).toBeVisible();
  await forgotLink.click();

  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(
    page.getByRole("heading", { name: "Reset your password" }),
  ).toBeVisible();

  let forgotPasswordCalled = false;
  await page.route("**/api/v1/auth/forgot-password", async (route) => {
    forgotPasswordCalled = true;
    const body = route.request().postDataJSON();
    expect(body.email).toBe("recovery-user@example.com");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { accepted: true } }),
    });
  });

  const emailInput = page.getByLabel("Email");
  await emailInput.fill("recovery-user@example.com");

  const submitButton = page.getByRole("button", { name: "Send Reset Link" });
  await submitButton.click();

  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await expect(page.getByText("recovery-user@example.com")).toBeVisible();
  await expect(page.getByText("The link will expire in 30 minutes.")).toBeVisible();
  expect(forgotPasswordCalled).toBe(true);

  const switchButton = page.getByRole("button", {
    name: "Send to another address",
  });
  await switchButton.click();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Send Reset Link" }),
  ).toBeVisible();
});

test("reset password scrubs token from URL bar and validates password input", async ({
  page,
}) => {
  const syntheticToken = "synthetic-valid-token-value-0001";
  await page.goto(`/reset-password?token=${syntheticToken}`);

  // URL must be sanitized on mount via replaceState
  await expect(page).toHaveURL(/\/reset-password$/);
  expect(page.url()).not.toContain(syntheticToken);

  // Since token was in query params, manual token input is hidden
  await expect(page.getByLabel("Reset Token")).not.toBeVisible();
  await expect(page.getByLabel("New Password", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Confirm New Password")).toBeVisible();

  // Test password too short
  await page.getByLabel("New Password", { exact: true }).fill("short123");
  await page.getByLabel("Confirm New Password").fill("short123");
  await page.getByRole("button", { name: "Reset Password" }).click();

  const alert = appAlert(page);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Password Too Short");

  // Test password mismatch
  await page.getByLabel("New Password", { exact: true }).fill("CorrectPassword123!");
  await page.getByLabel("Confirm New Password").fill("MismatchPassword123!");
  await page.getByRole("button", { name: "Reset Password" }).click();

  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Passwords Do Not Match");

  // Test successful submission
  let resetCalled = false;
  await page.route("**/api/v1/auth/reset-password", async (route) => {
    resetCalled = true;
    const body = route.request().postDataJSON();
    expect(body.token).toBe(syntheticToken);
    expect(body.password).toBe("CorrectPassword123!");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { reset: true } }),
    });
  });

  await page.getByLabel("Confirm New Password").fill("CorrectPassword123!");
  await page.getByRole("button", { name: "Reset Password" }).click();

  await expect(
    page.getByRole("heading", { name: "Password Reset Successful" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Your account password has been updated. For security, all active sessions on other devices have been signed out.",
    ),
  ).toBeVisible();
  expect(resetCalled).toBe(true);

  const signInLink = page.getByRole("link", {
    name: "Sign In with New Password",
  });
  await expect(signInLink).toBeVisible();
  await signInLink.click();
  await expect(page).toHaveURL(/\/login$/);
});

test("reset password accepts manual token entry when query param is absent", async ({
  page,
}) => {
  await page.goto("/reset-password");

  // When no query parameter is provided, token field must be visible
  const tokenInput = page.getByLabel("Reset Token");
  await expect(tokenInput).toBeVisible();

  let resetCalled = false;
  await page.route("**/api/v1/auth/reset-password", async (route) => {
    resetCalled = true;
    const body = route.request().postDataJSON();
    expect(body.token).toBe("manual-token-777");
    expect(body.password).toBe("NewValidPassword123!");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { reset: true } }),
    });
  });

  await tokenInput.fill("manual-token-777");
  await page.getByLabel("New Password", { exact: true }).fill("NewValidPassword123!");
  await page.getByLabel("Confirm New Password").fill("NewValidPassword123!");
  await page.getByRole("button", { name: "Reset Password" }).click();

  await expect(
    page.getByRole("heading", { name: "Password Reset Successful" }),
  ).toBeVisible();
  expect(resetCalled).toBe(true);
});

test("reset password handles expired or invalid tokens safely", async ({
  page,
}) => {
  await page.goto("/reset-password?token=expired-token-123");

  await page.route("**/api/v1/auth/reset-password", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "TOKEN_EXPIRED",
          message: "The provided token has expired or is invalid.",
          requestId: "req-expired-test",
        },
      }),
    });
  });

  await page.getByLabel("New Password", { exact: true }).fill("NewValidPassword123!");
  await page.getByLabel("Confirm New Password").fill("NewValidPassword123!");
  await page.getByRole("button", { name: "Reset Password" }).click();

  const alert = appAlert(page);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Reset Link Unavailable");
  await expect(alert).toContainText("req-expired-test");
  await expect(alert).toBeFocused();

  const retryLink = page.getByRole("link", {
    name: "Request a new password reset link",
  });
  await expect(retryLink).toBeVisible();
  await retryLink.click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});

for (const width of [375, 800, 1280]) {
  test(`recovery views are touch-safe and overflow-free at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });

    // Forgot password view
    await page.goto("/forgot-password");
    await expectNoHorizontalScroll(page);
    await expectMinTouchTarget(page.getByLabel("Email"), "email input");
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Send Reset Link" }),
      "send reset link button",
    );

    // Reset password view (with token)
    await page.goto("/reset-password?token=viewport-test-token");
    await expectNoHorizontalScroll(page);
    await expectMinTouchTarget(
      page.getByLabel("New Password", { exact: true }),
      "new password input",
    );
    await expectMinTouchTarget(
      page.getByLabel("Confirm New Password"),
      "confirm password input",
    );
    await expectMinTouchTarget(
      page.getByRole("button", { name: "Reset Password" }),
      "reset password button",
    );
  });
}
