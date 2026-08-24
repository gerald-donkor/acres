import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const rootDir = path.resolve(__dirname, "..");
const clientPort = Number(process.env.PLAYWRIGHT_CLIENT_PORT ?? "3100");
const apiPort = Number(process.env.PLAYWRIGHT_API_PORT ?? "3101");
const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${clientPort}`;
const apiURL = process.env.PLAYWRIGHT_API_URL ?? `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  testDir: ".",
  testMatch: ["e2e/**/*.spec.ts", "tests/**/*.spec.ts"],
  fullyParallel: false,
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
            "SCHEDULER_ENABLED=false TENANCY_ENABLED=true " +
            "INVITATION_TTL_HOURS=24 ACCOUNT_TOKEN_TTL_MINUTES=30 " +
            "npm run start:server",
          cwd: rootDir,
          url: `${apiURL}/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command:
            `PORT=${clientPort} ACRES_API_ORIGIN=${apiURL} ` +
            "npm run start --workspace=@acres/client",
          cwd: rootDir,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
