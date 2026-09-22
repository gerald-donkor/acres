# 160 — gate CI on client Playwright acceptance

## Scope and why this is next

The committed baseline is `4de43a1` on `main`, with a clean worktree before
this prompt was written. Prompt 159 is committed; 159 was the highest existing
prompt number. All ordered product phases have implementation records through
Phase 12K. This is the next dependency-safe Phase 12 verification step: the
client Playwright suite exists and passed locally in the Phase 12E record, but
`.github/workflows/ci.yml` never invokes `npm run test:client:e2e`. The Phase 12
exit gate requires browser journeys, accessibility, responsive, and tenant
isolation regressions. Make those tests a required part of the existing `checks`
job, so a failure prevents its dependent Docker job.

This work does not claim operator launch approval. The production host,
operator values, and hosted CI result are separate evidence.

## Reference material read

- `AGENTS.md` §§2, 2.1, 4–10; `docs/build-plan.md` Phase 12 (§13),
  sequence gates (§14), and Phase 12E/K records (§§17, 22).
- `docs/operations.md` “Phase 12C Browser & E2E Verification” and “CI State”;
  `docs/authenticated-app.md` Phase 12E test-harness record; `docs/automation.md`
  browser and production-build recipes; `docs/launch-checklist.md` exit gate.
- `.github/workflows/ci.yml`: existing `checks` order, PostgreSQL 18/PostGIS
  service, roles, migrations, privilege hardening, server E2E, geography and
  analytics plan gates, dependent Docker job, SHA-pinned actions.
- Root and client `package.json`, `package-lock.json`,
  `client/playwright.config.ts`, the 11 files under `client/e2e/` and
  `client/tests/`, `client/e2e/helpers.ts`, and
  `client/app/api/test-harness/mock/route.ts`. The client script is
  `npm run test:client:e2e`; `@playwright/test` is already a client dev
  dependency, and the config targets Desktop Chrome/Chromium headless.
- Installed Next 16.3 guide at
  `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`: test a
  production build with `next start`, with `webServer` managing startup.
- Official Playwright [browser installation](https://playwright.dev/docs/browsers)
  and [CI guidance](https://playwright.dev/docs/ci), checked during planning:
  install the browser matching the package version with
  `npx playwright install --with-deps chromium`, then run the existing test
  script. CI guidance recommends one worker for reproducibility.
- The `github-actions-templates`, `deployment-pipeline-design`,
  `e2e-testing-patterns`, `playwright`, `accessibility-compliance`,
  `web-design-guidelines`, `requesting-code-review`,
  `receiving-code-review`, and `caveman-commit` skills.

## Measured baseline and acceptance criteria

- The Phase 12E record reports 74/74 browser tests across 11 files. Treat
  that as historical evidence: use the current `--list` and a real run to
  establish the count and result at execution time. Do not hard-code 74 as a
  CI pass condition; Playwright's exit status is the gate.
- `client/playwright.config.ts` defaults to client port 3100 and API port 3101,
  uses the production `next start`, and starts Nest against the migrated `acres`
  database through `acres_app`. The existing `checks` job already creates and
  migrates `acres` and hardens runtime privileges before the browser step.
- The same config enables `ENABLE_TEST_HARNESS=true` only on its local Next
  `webServer` process. Keep the flag confined to this test invocation; the
  production launch profile continues to require it off. Do not set
  `PLAYWRIGHT_BASE_URL` in CI because that disables both configured web servers.
- CI must install Chromium and its Ubuntu system dependencies using the
  package already installed by `npm ci`; it must not fetch a different
  Playwright npm version or add a new action without a pinned SHA.
- Use one Playwright worker in CI to keep database mutations and SSR harness
  state reproducible. Preserve the current local worker behavior.
- The browser test step must run after migrations, privilege hardening,
  server E2E, and both plan gates in `checks`; a nonzero exit fails the job.
  Do not use `continue-on-error`, selective test files, retries that conceal
  persistent failures, or a separate green-status-only job.

## Expected impact and implementation

1. In `.github/workflows/ci.yml`, after `Run analytics query-plan evidence`,
   add a named install step with
   `npx playwright install --with-deps chromium`, then a named browser step
   running `npm run test:client:e2e`. Keep both in `checks`, after the existing
   `npm run build`. Preserve current triggers, permissions, SHA-pinned actions,
   database service and role setup, the Docker dependency, and all existing
   gates. The Playwright config already supplies the local database URL,
   server ports, and harness flag; avoid duplicating them in workflow env.
2. In `client/playwright.config.ts`, set
   `workers: process.env.CI ? 1 : undefined` at top level. Leave test matching,
   `fullyParallel`, production webServer commands, ports, trace policy,
   timeouts, and `reuseExistingServer: !process.env.CI` intact. If a CI run
   reveals a real startup or isolation fault, diagnose that fault before
   modifying the config or tests; document any additional targeted fix.
3. Update `docs/operations.md` “CI State” with the new install/browser order,
   test-harness confinement, actual local verification, and hosted-run status.
   Update `docs/authenticated-app.md` only if execution changes its test
   harness contract or recorded baseline. Update `docs/build-plan.md` only if
   new verification evidence changes the Phase 12 exit record; do not imply
   launch sign-off from a local run.
4. Self-verify, request and evaluate code review per §2.1, then commit the
   approved scope locally on `main` using `caveman-commit`. Do not push.

## Failure, security, and compatibility cases

- A missing browser, missing OS dependency, server startup timeout,
  unavailable/unmigrated `acres`, non-owner database privilege problem,
  assertion failure, or browser crash must fail CI. Do not mask any class with
  a skipped suite or `continue-on-error`.
- Tests must use only the disposable CI database and local `127.0.0.1`
  servers; no production backend, external test deployment, provider token,
  or repository secret is needed. Retain the existing test-only harness guard
  and verify it stays disabled by default outside its webServer process.
- CI tests run against the existing production build. If the test harness
  relies on build-time behavior, verify that from code and an actual run
  before proposing any flag change. Do not enable the harness in a production
  image or operator launch profile.
- Adding a gate changes CI acceptance only; no app route, UI, API contract,
  schema, migration, production process, or deployment action should change.
  Rollback is removal of this install/run gate and its CI-only worker setting
  if demonstrated to be unsuitable, with the reason documented.

## Non-goals

- No new browser suite, selector rewrite, test-data redesign, browser matrix,
  sharding, artifact upload, retry policy, action upgrade, deployment workflow,
  or production secret.
- No visual change or new comp measurement. The existing responsive suite
  covers 375, 800, and 1280 CSS-pixel widths; run that suite as part of the
  full test command.
- No operator launch approval, new SLO, or hosted-run success claim before a
  hosted run is observed.

## Verification and review

- Parse `.github/workflows/ci.yml` with installed `js-yaml`; assert install
  precedes browser tests, both follow migrations/server E2E/plan gates in
  `checks`, the command is the root `test:client:e2e` script, and `docker`
  still has `needs: checks`. Structural verification is enough for the small
  YAML change; do not add a test that merely mirrors the YAML text.
- Run `npm run test:client:e2e -- --list` and the full
  `npm run test:client:e2e` against the local migrated disposable `acres`
  database and production build. If necessary, follow `docs/backend.md` for
  local DB setup and migrations; never point the suite at production. Capture
  the actual count, pass/fail output, and exit status. Distinguish local
  evidence from a GitHub-hosted run. Check for stale 3100/3101 listeners per
  `docs/automation.md` before interpreting startup failures.
- Run `npm run lint`, `npm run typecheck`, `npm run build`,
  `npm run contracts:check`, `npm run test:server`, and `git diff --check`;
  quote their actual outputs. `npm run build` must precede browser tests.
  Only add further tests to resolve a concrete failure.
- Inspect all changed files and final diff. Request Stage 1 review with
  `requesting-code-review`, the prompt, changed paths, check evidence,
  `BASE_SHA=4de43a1`, current `HEAD_SHA`, and working diff. Evaluate each
  finding with `receiving-code-review`; fix valid findings and reverify, with
  re-review if startup/data-flow/security behavior changes materially.
  Stage only scoped paths, inspect staged diff, commit locally, and leave
  unrelated changes untouched.

## SKILLS USED

- `github-actions-templates` — least-privilege GitHub Actions test gate.
- `deployment-pipeline-design` — gate ordering before the dependent Docker job.
- `e2e-testing-patterns` — deterministic browser acceptance and failure review.
- `playwright` — real-browser execution and failure inspection.
- `accessibility-compliance` — evaluate responsive/a11y suite failures if found.
- `web-design-guidelines` — UI completion audit if browser failures expose a
  real interface defect.
- `nestjs-best-practices` — only if browser startup investigation requires a
  Nest server code change.
- `postgres-best-practices` — only if the browser gate exposes an actual
  database role, migration, or isolation defect.
- `vercel-react-best-practices` — only if a client component must change to
  resolve an actual browser failure.
- `requesting-code-review` — Stage 1 reviewer subagent after self-verification.
- `receiving-code-review` — Stage 2 technical evaluation and fixes.
- `caveman-commit` — required local commit message.
