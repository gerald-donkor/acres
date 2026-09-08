import { expect, test } from "@playwright/test";
import {
  createFirstOrganization,
  expectMinTouchTarget,
  expectNoHorizontalScroll,
  registerAccount,
  unique,
} from "./helpers";

const VIEWPORTS = [
  { name: "Mobile", width: 375, height: 900 },
  { name: "Tablet", width: 800, height: 900 },
  { name: "Desktop", width: 1280, height: 900 },
];

test.describe("Authenticated Loading Skeletons & Error Boundaries", () => {
  test("error boundary displays with accessible alert role, recovery actions, and reset support", async ({
    page,
  }) => {
    await registerAccount(page);
    await createFirstOrganization(page, unique("ErrorTestOrg"));

    // Navigate to synthetic error route
    await page.goto("/app/error-test");
    await expect(page.getByRole("heading", { name: "Error Boundary Test Harness" })).toBeVisible();

    const triggerBtn = page.getByRole("button", { name: "Trigger Synthetic Error" });
    await expect(triggerBtn).toBeVisible();
    await triggerBtn.click();

    // Verify error boundary alert card renders with role="alert"
    const alertCard = page.locator('[data-slot="error-boundary"]');
    await expect(alertCard).toBeVisible();
    await expect(alertCard).toHaveAttribute("role", "alert");
    await expect(alertCard.getByRole("heading", { name: "Workspace Error" })).toBeVisible();
    await expect(
      alertCard.getByText("We encountered an unexpected error loading your authenticated workspace."),
    ).toBeVisible();

    // Verify recovery actions
    const retryBtn = alertCard.getByRole("button", { name: "Try Again" });
    const returnLink = alertCard.getByRole("link", { name: "Return to Workspace" });
    const signOutBtn = alertCard.getByRole("button", { name: "Sign Out" });

    await expect(retryBtn).toBeVisible();
    await expect(returnLink).toBeVisible();
    await expect(signOutBtn).toBeVisible();

    // Check minimum touch targets >= 44x44px
    await expectMinTouchTarget(retryBtn, "retry button");
    await expectMinTouchTarget(returnLink, "return to workspace link");
    await expectMinTouchTarget(signOutBtn, "sign out button");

    // Verify navigation frame remains functional (localized shell preservation)
    const navWorkspace = page.getByRole("link", { name: "Workspace Active" }).or(
      page.getByRole("link", { name: /^Workspace$/ }),
    );
    await expect(navWorkspace.first()).toBeVisible();

    // Verify clicking "Return to Workspace" successfully navigates back to /app
    await returnLink.click();
    await expect(page).toHaveURL(/\/app$/);
  });

  test("reset() button re-renders the component on retry", async ({ page }) => {
    await registerAccount(page);
    await createFirstOrganization(page, unique("ResetRetryOrg"));

    await page.goto("/app/error-test");
    const harnessHeading = page.getByRole("heading", { name: "Error Boundary Test Harness" });
    await expect(harnessHeading).toBeVisible();

    const triggerBtn = page.getByRole("button", { name: "Trigger Synthetic Error" });
    await triggerBtn.click();

    const alertCard = page.locator('[data-slot="error-boundary"]');
    await expect(alertCard).toBeVisible();
    await expect(harnessHeading).not.toBeVisible();

    // Click Try Again to invoke reset()
    const retryBtn = alertCard.getByRole("button", { name: "Try Again" });
    await retryBtn.click();

    // Verify reset clears the error boundary and restores the test harness view
    await expect(alertCard).not.toBeVisible();
    await expect(harnessHeading).toBeVisible();
  });

  test("sign out button in error boundary revokes session and redirects to login", async ({ page }) => {
    await registerAccount(page);
    await createFirstOrganization(page, unique("SignOutErrOrg"));

    await page.goto("/app/error-test");
    await page.getByRole("button", { name: "Trigger Synthetic Error" }).click();

    const alertCard = page.locator('[data-slot="error-boundary"]');
    await expect(alertCard).toBeVisible();

    const signOutBtn = alertCard.getByRole("button", { name: "Sign Out" });
    await signOutBtn.click();

    // Verify redirected to /login
    await expect(page).toHaveURL(/\/login/);

    // Verify session is invalidated: attempting to visit /app redirects back to /login
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?returnTo=(\/app|%2Fapp)/);
  });

  for (const vp of VIEWPORTS) {
    test(`error boundary card fits without horizontal overflow at ${vp.name} (${vp.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: 900 });

      await registerAccount(page);
      await createFirstOrganization(page, unique(`ResponsiveErr-${vp.name}`));

      await page.goto("/app/error-test");
      await page.getByRole("button", { name: "Trigger Synthetic Error" }).click();

      await expect(page.locator('[data-slot="error-boundary"]')).toBeVisible();
      await expectNoHorizontalScroll(page);
    });
  }

  test("loading skeleton declares accessible attributes, single main landmark, and handles reduced-motion", async ({
    page,
  }) => {
    // Test reduced motion media preference emulation
    await page.emulateMedia({ reducedMotion: "reduce" });

    await registerAccount(page);
    await createFirstOrganization(page, unique("ReducedMotionOrg"));

    // Navigate to loading test route rendering MembersLoading
    await page.goto("/app/loading-test");

    // Verify loading skeleton renders accessible attributes
    const skeleton = page.locator('[data-slot="workspace-skeleton"]');
    await expect(skeleton).toBeVisible();
    await expect(skeleton).toHaveAttribute("role", "status");
    await expect(skeleton).toHaveAttribute("aria-busy", "true");

    // Verify table skeleton accessibility
    const tableSkeleton = page.locator('[data-slot="table-skeleton"]').first();
    await expect(tableSkeleton).toBeVisible();
    await expect(tableSkeleton).toHaveAttribute("role", "status");
    await expect(tableSkeleton).toHaveAttribute("aria-busy", "true");

    // Verify WCAG 2.2 landmark uniqueness: exactly one <main> landmark on the page
    const mainCount = await page.locator("main").count();
    expect(mainCount).toBe(1);

    // Verify reduced motion disables animation on skeletons
    const animatedSkeleton = page.locator('[data-slot="skeleton"]').first();
    await expect(animatedSkeleton).toBeVisible();
    const animationName = await animatedSkeleton.evaluate((el) => {
      return window.getComputedStyle(el).animationName;
    });
    expect(["none", ""].includes(animationName)).toBe(true);

    // Verify no horizontal overflow in skeleton layout
    await expectNoHorizontalScroll(page);

    // Navigate to loaded members view
    await page.goto("/app/members");
    await expect(page.getByRole("heading", { name: "Members and access." })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
