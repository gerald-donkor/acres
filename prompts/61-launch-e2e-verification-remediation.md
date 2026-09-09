# 61 - launch e2e and multi-tenant browser verification remediation

## Scope, and why it is next

The committed repository is on `main` at `1fb2129` (`feat(auth): add loading
skeletons and route error boundaries`). Phases 1 through 10 are functionally
complete in the codebase, Phase 11A (Gemini free-tier draft preview) is implemented
as a disabled-by-default preview excluded from production, and Phase 12
foundations (12A templates/preflights, 12B telemetry/retention, 12C E2E journeys,
12D launch readiness decision record) are committed.

Per `docs/build-plan.md` §13 and §14, the exit gate for Phase 12 requires:
> complete Playwright/a11y and cross-tenant regression... launch checklist,
> architecture/security updates.

Currently, running the full Playwright suite in `client/` (`npm run test:client:e2e`)
fails across `client/e2e/multi-tenant-isolation.spec.ts` and
`client/e2e/product-journeys.spec.ts`. In Next.js App Router, `/app` is a Server
Component (`client/app/app/page.tsx`) that executes `getDashboardSummary` on the Node.js
server during SSR. Playwright's `page.route("**/graphql", ...)` only intercepts
browser-initiated client requests, not server-side HTTP requests between Next.js and
the NestJS API. Consequently, when test accounts are registered, the SSR query runs
against the real test database where no datasets or metrics are published yet,
causing the page to render the empty state ("No published metrics") and omitting
the `Save current view` form (`SaveDashboardViewForm`). When tests fail to find
these controls and time out, cascade failures or rate limit exhaustion trigger
subsequent connection errors.

This prompt implements **Phase 12E**:
1. **Server-Side Test Harness Intercept for Playwright (`ENABLE_TEST_HARNESS`)**:
   - In `client/lib/api/server.ts`, when `ENABLE_TEST_HARNESS=true` and an incoming request
     header (e.g. `x-playwright-mock-dashboard` or cookie) is supplied by the test context,
     allow server-side `getDashboardSummary` to resolve structured mock summary data
     matching the test scenario, OR provide an internal test-harness bridge route
     allowing tests to establish the mock state for their session.
   - Alternatively, seed deterministic test fixtures directly via the backend API or
     provide a server-side route handler in `client/app/api/test-harness/` active strictly
     when `ENABLE_TEST_HARNESS=true` and `NODE_ENV !== "production"`.
2. **Multi-Tenant Isolation E2E Hardening (`client/e2e/multi-tenant-isolation.spec.ts`)**:
   - Align Tenant A and Tenant B test setups with the Next.js server-side rendering
     data flow so `Save current view`, dashboard metric tables, and report evidence
     render deterministically.
   - Ensure context switching, cross-tenant API negative assertions (403 Forbidden on
     tampered `x-acres-organization-id`), and saved view isolation run reliably.
3. **Product Journeys E2E Hardening (`client/e2e/product-journeys.spec.ts`)**:
   - Fix SSR data flow for populated dashboard tests, view switching, report drafting,
     review publishing, and export queuing.
   - Ensure dataset ingestion and validation issue displays align with API contracts.
4. **Rate Limit & Server Lifecycle Resilience**:
   - Verify `RATE_LIMIT_STRICT_LIMIT` and `RATE_LIMIT_DEFAULT_LIMIT` configurations in
     `playwright.config.ts` prevent registration lockouts across the full 74-test suite.
   - Ensure web servers stay healthy and cleanly handle parallel or sequential runs.
5. **Verification & Exit Evidence**:
   - Execute the complete test suite: `npm run test:client:e2e`.
   - Ensure all 74 tests in 11 files pass cleanly.
   - Update `docs/operations.md`, `docs/authenticated-app.md`, and `docs/build-plan.md`
     with the full green test baseline evidence.

## Reference material read while preparing this prompt

Repository and workflow authority:
- `AGENTS.md` §§2, 2.1, phase-control commands, §§5–10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit rules,
  and no-fabrication rules.
- `docs/build-plan.md` §§6, 10, 11, 13, 14: Phase 5 shell, Phase 9 dashboards,
  Phase 10 reports, Phase 12 launch hardening, required skills, and exit evidence.
- `docs/operations.md`: Phase 12C/12D implemented state, Prometheus telemetry,
  launch readiness checklist, and runbooks.
- `docs/authenticated-app.md` §Residual gaps: the documented 10-test client baseline gap.
- `docs/dashboards.md` §Residual gaps: dashboard views and GraphQL contracts.
- `docs/reports.md` §Residual gaps: report evidence and export lifecycle.

Code references:
- `client/app/app/page.tsx`: Server component SSR fetching of dashboard summary.
- `client/lib/api/server.ts`: Server-side API client used during SSR.
- `client/components/acres/app/dashboard-workspace.tsx`: Workspace component rendering empty vs populated dashboard.
- `client/components/acres/app/save-dashboard-view-form.tsx`: Saved view creation form.
- `client/e2e/multi-tenant-isolation.spec.ts`: Multi-tenant isolation test suite.
- `client/e2e/product-journeys.spec.ts`: Product journeys test suite.
- `client/playwright.config.ts`: Playwright webServer and test harness environment settings.

## Measurements and procedure

1. Run focused tests before changes to isolate exact points of failure:
   `npx playwright test e2e/multi-tenant-isolation.spec.ts`
   `npx playwright test e2e/product-journeys.spec.ts`
2. Verify Next.js App Router SSR execution path:
   Confirm whether `client/lib/api/server.ts` `getDashboardSummary` receives test headers or cookies from Playwright.
3. If test harness bridge is used:
   Enforce strict guard: active ONLY when `process.env.ENABLE_TEST_HARNESS === "true"` and `process.env.NODE_ENV !== "production"`. Excluded from production builds.
4. Re-run complete client test command:
   `npm run test:client:e2e`
   Record passing test counts across all 11 test files (target: 74/74 passed).

## Expected impact

- `client/lib/api/server.ts`: support test harness header/cookie for SSR mock data when enabled.
- `client/e2e/helpers.ts`: helper functions to attach test harness headers/cookies.
- `client/e2e/multi-tenant-isolation.spec.ts`: updated test journeys passing deterministically.
- `client/e2e/product-journeys.spec.ts`: updated test journeys passing deterministically.
- `client/playwright.config.ts`: hardened webServer and environment limits.
- `docs/operations.md`: record Phase 12E test evidence and resolution of residual client test gaps.
- `docs/authenticated-app.md`: record updated client test suite passing baseline.
- `docs/build-plan.md`: record Phase 12E evidence.

## Non-goals

- Altering production API contracts or database schema.
- Exposing test harness endpoints in production builds.
- Removing or weakening authentication, CSRF, or multi-tenant isolation checks in tests.
- Live host SSL certificate provisioning (requires operator-owned DNS and keys).

## Checks to run

1. `npm run lint` — client, shared, server workspaces.
2. `npm run typecheck` — all workspaces.
3. `npm run build` — production build of shared, client, and server.
4. `npm run test:server` — server e2e suite (all 6 suites passing).
5. `npm run test:client:e2e` — full client Playwright suite (all 11 files passing).
6. `npm run ops:check` — operations template and security scanning checks.
7. `git diff --check` — ensure clean whitespace.

Documentation owner: `docs/operations.md`, `docs/authenticated-app.md`, and `docs/build-plan.md`.

## SKILLS USED

- `e2e-testing-patterns`: Playwright test isolation, resilient assertions, deterministic test data, and rate limit handling.
- `playwright`: Headless browser execution, network routing, and multi-context test patterns.
- `accessibility-compliance`: WCAG 2.2 AA audit verification, keyboard navigation, and screen reader assertions.
- `web-design-guidelines`: Interface compliance, touch targets, and visual feedback.
- `vercel-react-best-practices`: App Router server component SSR data loading and test harness boundary safety.
- `security-best-practices`: Ensuring test harness is strictly excluded from production and cannot be abused for unauthorized data access.
- `javascript-testing-patterns`: TypeScript test conventions, mock data typing, and assertion patterns.
- `requesting-code-review`: Preparing structured review request for reviewer subagent.
- `receiving-code-review`: Technical verification of code review feedback before commit.
- `caveman-commit`: Formatting commit message for the final implementation commit.
