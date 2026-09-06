import { expect, test, type Page } from "@playwright/test";
import {
  createFirstOrganization,
  expectMinTouchTarget,
  expectNoHorizontalScroll,
  registerAccount,
  unique,
} from "./helpers";

test.use({ trace: "off" });

const PASSWORD = "secure-password-123";

async function registerAndGoTo(
  page: Page,
  email: string,
  returnTo: string,
  name = "Test Member",
) {
  await page.goto(`/register?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Display Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace("?", "\\?")}$`));
}

test("owner can invite a member, view pending invitations, and revoke an invitation", async ({
  page,
}) => {
  const ownerEmail = `${unique("owner")}@example.com`;
  const orgName = unique("Member Org");
  const inviteeEmail = `${unique("colleague")}@example.com`;

  await registerAccount(page, { email: ownerEmail });
  await createFirstOrganization(page, orgName);

  // Navigate to Members section
  const membersLink = page.getByRole("link", { name: "Members" });
  await expect(membersLink).toBeVisible();
  await membersLink.click();

  await expect(page).toHaveURL(/\/app\/members$/);
  await expect(
    page.getByRole("heading", { name: "Members and access." }),
  ).toBeVisible();

  // Verify owner is listed in active members
  await expect(page.getByRole("table").getByText(ownerEmail)).toBeVisible();
  await expect(page.getByRole("table").getByText("Owner", { exact: true })).toBeVisible();

  // Fill and submit invite form
  await page.getByLabel("Email Address").fill(inviteeEmail);
  await page.getByLabel("Assigned Role").selectOption("viewer");

  const sendButton = page.getByRole("button", { name: "Send Invitation" });
  await expectMinTouchTarget(sendButton, "Send Invitation button");
  await sendButton.click();

  // Confirmation alert appears
  await expect(page.getByText("Invitation Sent")).toBeVisible();
  await expect(
    page.getByText(`Invitation issued and email dispatched to ${inviteeEmail}.`),
  ).toBeVisible();

  // Pending invitations list displays invitee
  const pendingSection = page.locator("section", {
    has: page.getByRole("heading", { name: "Pending Invitations" }),
  });
  await expect(
    pendingSection.getByRole("table").getByText(inviteeEmail, { exact: true }),
  ).toBeVisible();
  await expect(pendingSection.getByText("1 pending")).toBeVisible();

  // Revoke the pending invitation
  const revokeButton = pendingSection
    .getByRole("table")
    .getByRole("button", {
      name: `Revoke invitation for ${inviteeEmail}`,
    });
  await expectMinTouchTarget(revokeButton, "Revoke invitation button");
  await revokeButton.click();

  // Confirmed revoked and removed from list
  await expect(
    page.getByText(`Pending invitation revoked for ${inviteeEmail}.`),
  ).toBeVisible();
  await expect(page.getByText("No pending invitations")).toBeVisible();
});

test("invitation cycle: accept token, join organization, change role, and revoke member", async ({
  page,
}) => {
  const ownerEmail = `${unique("admin-owner")}@example.com`;
  const orgName = unique("Lifecycle Org");
  const inviteeEmail = `${unique("joiner")}@example.com`;

  await registerAccount(page, { email: ownerEmail });
  await createFirstOrganization(page, orgName);

  await page.goto("/app/members");
  await expect(
    page.getByRole("heading", { name: "Members and access." }),
  ).toBeVisible();

  // Listen for the invitation network response to capture the issued token
  const inviteResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/api/v1/organizations/") &&
      res.url().endsWith("/invitations") &&
      res.request().method() === "POST",
  );

  await page.getByLabel("Email Address").fill(inviteeEmail);
  await page.getByLabel("Assigned Role").selectOption("viewer");
  await page.getByRole("button", { name: "Send Invitation" }).click();

  const inviteResponse = await inviteResponsePromise;
  expect(inviteResponse.ok()).toBe(true);
  const inviteBody = (await inviteResponse.json()) as {
    data: { token: string };
  };
  const invitationToken = inviteBody.data.token;
  expect(invitationToken).toBeDefined();

  // Sign out owner
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Register as the invited user and accept invitation
  await registerAndGoTo(page, inviteeEmail, "/accept-invitation", "Invited Joiner");
  await page.getByLabel("Invitation Token").fill(invitationToken);
  await page.getByRole("button", { name: "Accept Invitation" }).click();

  // Verify joiner is in workspace
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByLabel("Current organization")).toHaveText(orgName);

  // Sign out joiner and log back in as owner
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/app$/);

  // Go to members page
  await page.goto("/app/members");
  await expect(
    page.getByRole("heading", { name: "Members and access." }),
  ).toBeVisible();

  // Joiner is present in active members
  await expect(page.getByRole("table").getByText(inviteeEmail, { exact: true })).toBeVisible();

  // Update joiner's role from Viewer to Analyst
  const roleSelect = page.getByLabel(`Change role for ${inviteeEmail}`).first();
  await expectMinTouchTarget(roleSelect, "Member role select");
  await roleSelect.selectOption("analyst");

  await expect(
    page.getByText(`Role updated to Analyst for ${inviteeEmail}.`),
  ).toBeVisible();

  // Revoke member access
  const revokeMemberButton = page.getByRole("button", {
    name: `Revoke access for ${inviteeEmail}`,
  }).first();
  await expectMinTouchTarget(revokeMemberButton, "Revoke member button");
  await revokeMemberButton.click();

  await expect(
    page.getByText(`Membership access revoked for ${inviteeEmail}.`),
  ).toBeVisible();

  // Active members count should be 1 (only owner)
  await expect(page.getByText("1 member", { exact: true })).toBeVisible();
});

test("viewer without members.read receives polite permission boundary", async ({
  page,
}) => {
  const ownerEmail = `${unique("owner")}@example.com`;
  const viewerEmail = `${unique("viewer")}@example.com`;
  const orgName = unique("Restricted Org");

  await registerAccount(page, { email: ownerEmail });
  await createFirstOrganization(page, orgName);

  // Get org id and invite viewer directly
  const orgsRes = await page.request.get("/api/v1/organizations");
  const orgsData = (await orgsRes.json()) as { data: Array<{ id: string; name: string }> };
  const org = orgsData.data.find((o) => o.name === orgName)!;

  const csrfRes = await page.request.get("/api/v1/auth/csrf");
  const csrfData = (await csrfRes.json()) as { data: { csrfToken: string; headerName: string } };

  const inviteRes = await page.request.post(`/api/v1/organizations/${org.id}/invitations`, {
    headers: {
      [csrfData.data.headerName]: csrfData.data.csrfToken,
      "Idempotency-Key": crypto.randomUUID(),
      "x-acres-organization-id": org.id,
    },
    data: { email: viewerEmail, role: "viewer" },
  });
  const inviteBody = (await inviteRes.json()) as { data: { token: string } };

  // Sign out owner, sign in as viewer and accept
  await page.getByRole("button", { name: "Sign Out" }).click();
  await registerAndGoTo(page, viewerEmail, "/accept-invitation");
  await page.getByLabel("Invitation Token").fill(inviteBody.data.token);
  await page.getByRole("button", { name: "Accept Invitation" }).click();
  await expect(page).toHaveURL(/\/app$/);

  // In sidebar, "Members" link should not even be visible for viewer
  await expect(page.getByRole("link", { name: "Members" })).not.toBeVisible();

  // Direct navigation to /app/members shows polite permission boundary
  await page.goto("/app/members");
  await expect(page.getByRole("heading", { name: "Access Restricted" })).toBeVisible();
  await expect(
    page.getByText("Managing members and issuing invitations requires an administrator or owner role"),
  ).toBeVisible();

  // No member table or invite form
  await expect(page.getByLabel("Email Address")).not.toBeVisible();
  await expect(page.getByText("Active Members")).not.toBeVisible();

  // Back to workspace button works
  await page.getByRole("link", { name: "Return to Workspace" }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test("members workspace meets responsive and touch target standards at 375px, 800px, and 1280px", async ({
  page,
}) => {
  const email = `${unique("responsive")}@example.com`;
  await registerAccount(page, { email });
  await createFirstOrganization(page, unique("Responsive Org"));

  await page.goto("/app/members");
  await expect(
    page.getByRole("heading", { name: "Members and access." }),
  ).toBeVisible();

  const breakpoints = [
    { width: 375, height: 812, label: "Mobile" },
    { width: 800, height: 1024, label: "Tablet" },
    { width: 1280, height: 900, label: "Desktop" },
  ];

  for (const bp of breakpoints) {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.waitForTimeout(200);

    await expectNoHorizontalScroll(page);

    const emailInput = page.getByLabel("Email Address");
    await expectMinTouchTarget(emailInput, `${bp.label} Email input`);

    const roleSelect = page.getByLabel("Assigned Role");
    await expectMinTouchTarget(roleSelect, `${bp.label} Role select`);

    const sendButton = page.getByRole("button", { name: "Send Invitation" });
    await expectMinTouchTarget(sendButton, `${bp.label} Send button`);
  }
});

