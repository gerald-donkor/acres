import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";

const rootDir = path.resolve(__dirname, "..");
const clientPort = Number(process.env.PLAYWRIGHT_CLIENT_PORT ?? "3100");
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? "3101");
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${clientPort}`;
const apiURL = process.env.PLAYWRIGHT_API_URL ?? `http://127.0.0.1:${apiPort}`;
const auditFaults = process.env.PLAYWRIGHT_AUDIT_FAULTS === "true";
const auditProxyPort = Number(
  process.env.PLAYWRIGHT_AUDIT_PROXY_PORT ?? "3102",
);
const auditProxyURL = `http://127.0.0.1:${auditProxyPort}`;
if (auditFaults) {
  if (process.env.PLAYWRIGHT_BASE_URL)
    throw new Error("Audit fault tests require owned local servers");
  process.env.PLAYWRIGHT_AUDIT_CONTROL_TOKEN ??= randomUUID();
  process.env.PLAYWRIGHT_AUDIT_PROXY_PORT = String(auditProxyPort);
}

export default defineConfig({
  testDir: ".",
  testMatch: ["e2e/**/*.spec.ts", "tests/**/*.spec.ts"],
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : [
        {
          command:
            `PORT=${apiPort} CLIENT_ORIGIN=${baseURL} ` +
            "DATABASE_URL='postgresql://acres_app:acres_app_dev_password@localhost:5432/acres?schema=public' " +
            "SESSION_SECRET='test-secret-that-is-at-least-32-characters' " +
            "CSRF_SECRET='test-distinct-csrf-secret-at-least-32-characters' " +
            "SCHEDULER_ENABLED=false TENANCY_ENABLED=true " +
            "RATE_LIMIT_STRICT_LIMIT=1000 RATE_LIMIT_DEFAULT_LIMIT=5000 " +
            "INVITATION_TTL_HOURS=24 ACCOUNT_TOKEN_TTL_MINUTES=30 " +
            "MAIL_TRANSPORT=memory " +
            "npm run start:server",
          cwd: rootDir,
          url: `${apiURL}/health`,
          reuseExistingServer: !process.env.CI && !auditFaults,
          timeout: 120_000,
        },
        ...(auditFaults
          ? [
              {
                command: "node e2e/support/audit-fault-proxy.mjs",
                cwd: __dirname,
                env: {
                  PLAYWRIGHT_API_URL: apiURL,
                  PLAYWRIGHT_AUDIT_PROXY_PORT: String(auditProxyPort),
                  PLAYWRIGHT_AUDIT_CONTROL_TOKEN:
                    process.env.PLAYWRIGHT_AUDIT_CONTROL_TOKEN!,
                },
                url: `${auditProxyURL}/__audit_ready`,
                reuseExistingServer: false,
              },
            ]
          : []),
        {
          command:
            `PORT=${clientPort} ACRES_API_ORIGIN=${auditFaults ? auditProxyURL : apiURL} ENABLE_TEST_HARNESS=true ` +
            "npm run start --workspace=@acres/client",
          cwd: rootDir,
          url: baseURL,
          reuseExistingServer: !process.env.CI && !auditFaults,
          timeout: 120_000,
        },
      ],
});
