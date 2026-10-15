# Authenticated app shell

Status: implemented by `prompts/24-authenticated-shell-foundations.md`.

This is the first Phase 5 client/backend slice. It wires the Next client to the
existing Nest `/api/v1` API, adds browser auth forms, persists a non-secret
active organization preference, and renders the first protected product shell.
It does not add dashboards, uploads, metrics, reports, workers, billing, AI, or
new server contracts.

## 1. Routes

| route                       | current behavior                                                                                                                                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                         | unchanged marketing landing page. The page file now lives in the `(marketing)` route group so marketing chrome is not global.                                                                                                                     |
| `/login`                    | accessible credential form. It issues CSRF, logs in through `POST /api/v1/auth/login`, refreshes CSRF after the session cookie changes, then redirects to a sanitized `returnTo` path.                                                            |
| `/register`                 | accessible account form. It issues CSRF, registers through `POST /api/v1/auth/register`, refreshes CSRF after the session cookie changes, then redirects to a sanitized `returnTo` path.                                                          |
| `/accept-invitation`        | server-session-protected invitation form. Anonymous accounts return through `/login`; authenticated accounts paste a one-time bearer token, accept through the existing secured command, and enter `/app` with the invited organization selected. |
| `/app`                      | server-protected workspace shell. Anonymous users redirect to `/login?returnTo=/app`; authenticated users see organization selection, overview metric cards, or create-organization empty state.                                                  |
| `/app/dashboards`           | saved views, summary metrics, and analytics exploration workspace.                                                                                                                                                                                |
| `/app/reports`              | governed reports library, authoring drafts, and evidence binding.                                                                                                                                                                                 |
| `/app/datasets`             | organization datasets workspace, listing datasets, states, publication versions, and ingestion CTA.                                                                                                                                               |
| `/app/datasets/new`         | new dataset creation form for authorized analysts/admins/owners.                                                                                                                                                                                  |
| `/app/datasets/[datasetId]` | dataset detail, version history, direct file upload, column/metric mapping, live SSE ingestion progress, and validation issues reporting.                                                                                                         |
| `/api/v1/[...path]`         | same-origin Route Handler bridge for browser calls to the Nest API. It forwards only the approved REST surface used by the client.                                                                                                                |

The top-level root layout owns fonts, `<html>`, `<body>`, and the skip link.
Marketing, auth, and app route surfaces each provide the `main-content`
landmark so the skip link still has exactly one target.

## 2. API bridge

`client/app/api/v1/[...path]/route.ts` forwards `GET`, `POST`, `PATCH`, and
`DELETE` to `ACRES_API_ORIGIN`, defaulting to `http://localhost:3001`.
`ACRES_API_ORIGIN` is server-only and is not prefixed with `NEXT_PUBLIC_`.

Forwarded request headers are fixed to:

- `accept`
- `content-type`
- `cookie`
- `x-csrf-token`
- `Idempotency-Key`
- `x-acres-organization-id`

Hop-by-hop headers, request bodies, cookies, passwords, CSRF tokens,
idempotency keys, and emails are not logged by the bridge. The bridge returns
the upstream envelope unchanged, preserves upstream status, forwards
`content-type`, `x-request-id`, and `set-cookie`, and marks responses
`cache-control: no-store`.

`/health`, `/health/ready`, and `/graphql` are intentionally outside this
bridge for this slice.

## 3. API clients

`client/lib/api/envelope.ts` parses the shared `ApiResponse<T>` envelope and
throws `ApiClientError` with stable `code`, `status`, `details`, and
`requestId`. UI copy maps stable server error codes to concrete next steps; UI
does not branch on server message text.

`client/lib/api/server.ts` is used only by Server Components. It calls the Nest
API origin directly, forwards the request cookies from `cookies()`, sends
`x-acres-organization-id` only for organization-scoped reads, and uses
`cache: "no-store"` for every authenticated read. Server helpers cover
organizations, memberships, invitations, audit events, saved dashboard views,
metrics, aggregates, reports, report revisions, evidence, exports, datasets
(`listDatasets`, `getDataset`, `listDatasetVersions`), and ingestion issues
(`listIngestionIssues`).

`client/lib/api/browser.ts` is the browser mutation and read client. It calls
same-origin `/api/v1/*` with `credentials: "include"`, issues CSRF with
`GET /api/v1/auth/csrf`, sends `x-csrf-token` on mutations, refreshes CSRF
after login/register, and attaches unique `crypto.randomUUID()` idempotency keys
on command endpoints. Browser helpers cover auth, organization lifecycle,
members, invitations, uploads (`initiateUpload`, `completeUpload`, `getUpload`,
`cancelUpload`, `getUploadDownload`), datasets (`createDataset`, `updateDataset`,
`getDataset`, `listDatasets`, `listDatasetVersions`), mappings (`createMapping`),
ingestion runs (`startIngestionRun`, `listIngestionIssues`, `cancelIngestionRun`),
dashboard views, reports, revisions (`createReportRevision`, `updateReportRevision`, `submitReportRevisionForReview`, `publishReportRevision`), and exports.
Invitation acceptance uses the same mutation pipeline with a fresh idempotency
key and deliberately omits `x-acres-organization-id`: the invitation-scoped
server transaction establishes the target organization.

### 3.1 Server-Sent Events (SSE) client

`client/lib/api/sse.ts` implements fetch-based SSE stream consumption (`streamSse` and `parseSseLines`):

- Standard browser `EventSource` cannot send custom headers. `streamSse` uses `fetch()` with `ReadableStream` to inject `x-acres-organization-id`, `accept: text/event-stream`, `credentials: "include"`, and `cache: "no-store"`.
- The parser handles single and multiline `data:` frames, extracts `event` and `id` metadata, ignores heartbeat/comment lines starting with `:`, and cleans up listeners via `AbortSignal`.
- Terminal predicates (`isTerminal`) cleanly close stream readers on terminal events (`succeeded`, `failed`, `cancelled`, `published`).
- Prompt 370: a failed setup/read or normal EOF before terminal state starts bounded REST polling. Export/ingestion helpers pass the combined AbortSignal to each read. Defaults are a 2-second interval and 15-minute polling budget (implementation choices, not production capacity measurements). A terminal predicate continues until completion; callers without one retain a single fallback read. Read failure stops with the existing error callback, including access revocation. Cancellation suppresses stale updates, aborts reads/waits and releases the reader; frames after a terminal event are ignored. This keeps existing status announcements/layout unchanged.
- `client/components/acres/app/export-status.tsx` uses `streamExportProgress` to stream queued/in-flight exports live and announces completion using `<div className="sr-only" aria-live="polite">`.

## 4. Auth behavior

`returnTo` is sanitized by `client/lib/auth/return-to.ts`: only relative paths
starting with `/` are allowed, protocol-relative paths and backslashes are
rejected, and `/app` is the fallback.

Forms use the local base-nova shadcn primitives: `FieldGroup`, `Field`,
`FieldLabel`, `FieldDescription`, `FieldError`, `Input`, `Button`, `Alert`,
and `Spinner`. Inputs have labels, names, native types, autocomplete values,
and paste/password-manager support. Failed submits focus the alert summary and
show the request ID when the API provides one. Pending submits are locked out
and expose `aria-busy`.

Logout posts to `POST /api/v1/auth/logout`, clears the active organization
preference cookie, redirects to `/login`, and refreshes the router.

`/accept-invitation` resolves the session in its Server Component and passes
only the signed-in email to the client form. The invitation token is accepted
only through a password-style, paste-friendly input. It is trimmed at its
edges, submitted in the same-origin JSON body, reset after every attempt, and
never placed in a path, query, fragment, cookie, Web Storage, rendered status,
log, screenshot, or trace. `NOT_FOUND` states share one non-enumerating
“Invitation Unavailable” response; session, CSRF, rate-limit, validation,
network, and unexpected errors retain actionable stable-code handling and safe
request IDs. Failed async submission focuses one polite alert.

## 5. Organization selection

The active organization preference uses the client-controlled
`acres_active_organization` cookie. It is not an authorization claim. `/app`
always asks the API for the current account's accessible organizations and
falls back deterministically to the first organization when the cookie is
missing or stale.

If the account has no organizations, `/app` renders a create-organization empty
state. If the account has organizations, `/app` renders the selected
organization, membership role, role-filtered navigation affordances, and a
compact "New Organization" command for switch testing and future bootstrap
work. The client shell persists the selected organization, including the
deterministic server fallback, into the preference cookie after render.
Organization switching updates the preference cookie and calls
`router.refresh()` so server reads are re-run without a singleton client cache.

## 6. Shell design

The authenticated shell is a restrained product surface, not a marketing page.
It uses existing Acres tokens only, white canvas, hairline rules, DM Sans for
body/UI, Roboto Mono only where the protected workspace shell still uses
status/organization labels, and Crimson Text only for the small workspace
heading. Marketing header/footer are not mounted inside `/app`.

The public auth entry frame at `/login` and `/register` keeps the Acres
wordmark, eyebrow, heading, description, form, and footer action, but it no
longer renders the earlier technical status ledger (`Session`, `API`,
`Tenancy`). That metadata block was intentionally removed after review as
filler copy, and it should not be reintroduced unless the product gains a real
user-facing need for it.

Breakpoints:

- `375px`: compact top shell controls, visible disclosure navigation, 44px
  touch targets, single-column forms and shell content.
- `800px`: persistent navigation column, visible organization/status labels in
  the protected app shell, and 44px work controls.
- `1280px`: same persistent shell inside the existing `max-w-page` container
  with the same minimum work-control target size.

Future surfaces are labelled `Unavailable`; no fake analytics, regions,
dashboards, reports, or dataset values are rendered.

## 7. Tests

Added:

- `client/playwright.config.ts`
- `client/tests/api-helpers.spec.ts`
- `client/e2e/authenticated-shell.spec.ts`
- root `npm run test:client:e2e`

Unit coverage checks envelope parsing, request ID retention, error copy,
`returnTo` sanitization, and idempotency key generation.

Browser coverage checks anonymous redirect, registration, generic wrong-login
failure, logout protection, no-organization empty state, create organization,
organization switching, CSRF/idempotency headers on create, visible CSRF error
copy, CSRF recovery on a second submit, visible primary controls, 44px minimum
target checks for core controls, and 375/800/1280 horizontal overflow.

The Playwright web server commands expect the app and API to be built first.
They start the built Nest API on `3101` with `TENANCY_ENABLED=true` and the
built Next client on `3100` with `ACRES_API_ORIGIN=http://127.0.0.1:3101`.

## 8. Verification Log

The local database was behind the committed migrations during the first E2E
attempt. Applying the existing migration deploy procedure fixed it:

```text
$ DATABASE_URL='postgresql://acres_app:acres_app_dev_password@localhost:5432/acres?schema=public' DATABASE_MIGRATION_URL='postgresql://acres_migrator:acres_migrator_dev_password@localhost:5432/acres?schema=public' npm run prisma:migrate:deploy --workspace=@acres/server

7 migrations found in prisma/migrations
Applying migration `20260824120000_transport_contracts`
Applying migration `20260824121000_idempotency_expiry_cleanup`
All migrations have been successfully applied.
```

Final verification:

```text
$ git diff --check
```

No output.

```text
$ npm run lint

> acres@0.1.0 lint
> npm run lint --workspace=@acres/client && npm run lint --workspace=@acres/shared && npm run lint --workspace=@acres/server

> @acres/client@0.1.0 lint
> eslint

> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"

> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"
```

```text
$ npm run typecheck

> acres@0.1.0 typecheck
> npm run build --workspace=@acres/shared && npm run typecheck --workspace=@acres/shared && npm run typecheck --workspace=@acres/client && npm run typecheck --workspace=@acres/server

> @acres/shared@0.1.0 build
> tsc -p tsconfig.json

> @acres/shared@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit

> @acres/client@0.1.0 typecheck
> tsc --noEmit

> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit

✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma
```

```text
$ npm run build

> acres@0.1.0 build
> npm run build --workspace=@acres/shared && npm run build --workspace=@acres/client && npm run build --workspace=@acres/server

> @acres/shared@0.1.0 build
> tsc -p tsconfig.json

> @acres/client@0.1.0 build
> next build --webpack

▲ Next.js 16.3.1 (webpack)
✓ Compiled successfully
✓ Generating static pages using 7 workers (13/13)

Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /api/v1/[...path]
├ ƒ /app
├ ƒ /login
├ ƒ /register
└ ○ /sitemap.xml

> @acres/server@0.1.0 build
> prisma generate && nest build

✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma
```

```text
$ npm run test:server

> acres@0.1.0 test:server
> npm run test:e2e --workspace=@acres/server

Test Suites: 3 passed, 3 total
Tests:       68 passed, 68 total
Snapshots:   0 total
```

```text
$ npm run contracts:check

> acres@0.1.0 contracts:check
> npm run contracts:check --workspace=@acres/server

> @acres/server@0.1.0 contracts:check
> prisma generate && nest build && node dist/contracts/generate-contracts.js --check

✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma
```

```text
$ npm run test:client:e2e

> acres@0.1.0 test:client:e2e
> npm run test:e2e --workspace=@acres/client

Running 12 tests using 2 workers
  ✓ tests/api-helpers.spec.ts:7:5 › parses successful API envelopes
  ✓ tests/api-helpers.spec.ts:18:5 › keeps stable API error codes and request IDs
  ✓ tests/api-helpers.spec.ts:42:5 › maps API errors to actionable copy
  ✓ tests/api-helpers.spec.ts:48:5 › sanitizes returnTo paths
  ✓ tests/api-helpers.spec.ts:55:5 › generates unique idempotency keys
  ✓ e2e/authenticated-shell.spec.ts:47:5 › anonymous app requests redirect to login with returnTo
  ✓ e2e/authenticated-shell.spec.ts:54:5 › wrong credentials show a generic failure
  ✓ e2e/authenticated-shell.spec.ts:66:5 › register, create organization, switch organization, and sign out
  ✓ e2e/authenticated-shell.spec.ts:94:5 › create organization sends CSRF and idempotency headers
  ✓ e2e/authenticated-shell.spec.ts:144:7 › core routes fit without horizontal scroll at 375px
  ✓ e2e/authenticated-shell.spec.ts:144:7 › core routes fit without horizontal scroll at 800px
  ✓ e2e/authenticated-shell.spec.ts:144:7 › core routes fit without horizontal scroll at 1280px

  12 passed (15.8s)
```

Phase 12C expands browser testing with dedicated end-to-end suites:

- `client/e2e/product-journeys.spec.ts`: full product journey coverage across dashboards, GraphQL queries, saved views, reports, and async exports.
- `client/e2e/multi-tenant-isolation.spec.ts`: multi-tenant browser isolation, cross-tenant report denial, and header tampering defense.
- `client/e2e/accessibility-responsive.spec.ts`: WCAG 2.2 AA audit across 375/800/1280px viewports, touch targets, and telemetry.

`npx next typegen` was also run after the route-group move to refresh
route-aware types:

```text
Generating route types...
✓ Types generated successfully
```

`next build` still hit the previously recorded Turbopack/PostCSS helper
port-binding panic in this environment. Installed Next 16.3 documents
`next build --webpack` as a supported build option, and this prompt changes the
client build script to that option so the required root `npm run build` can
verify the route-group and authenticated shell code path.

### Invitation acceptance evidence — 2026-09-06

Prompt 57 adds one helper test and 6 real-browser cases. The focused helper
case passes `1/1`; the complete helper file passes `8/8`; the invitation suite
passes `6/6`; and the focused server invitation regression passes `3/3` with
111 unrelated cases skipped by the requested name filter. Browser evidence
covers the anonymous return path, CSRF/idempotency headers without organization
context, the real inviter/invitee acceptance journey, active-organization
selection, password masking, pending lockout, CSRF refresh, focused generic
unavailable copy, token clearing/non-persistence, 44px core controls, and no
horizontal overflow at 375/800/1280.

The unchanged full 50-case client command does not currently provide a green
repository-wide baseline. Its first run stopped 19 journeys at the production
strict registration throttle. With test-process-only limits raised to 100
strict / 1000 default, it reached `40 passed, 10 failed`; every invitation and
helper case passed. The remaining failures are outside this slice and reproduce
in existing dashboard, report, dataset, multi-tenant, and accessibility
assertions (including an existing 32px report-title input against a 44px test
and a missing evidence-table caption). Prompt 57 forbids changing those
surfaces, so this record does not claim the full-suite exit gate is closed.

All other required checks passed: contracts, targeted Prettier, lint,
typecheck, production build, operations checks (0 critical production
advisories; 7 moderate and 5 high advisories remain under the existing policy),
token-safety search, and diff checks.

### Account recovery & mail delivery evidence — 2026-09-06

Prompt 58 implements Phase 5C: provider-neutral mail delivery and account
recovery.

1. **Provider-neutral Mail Delivery (`server/src/mail/`)**:
   - `MailModule` exports `MailService` providing HTML/text templated email delivery.
   - `SmtpMailAdapter` connects to Mailpit in development and standard SMTP in production.
   - `MemoryMailAdapter` enables deterministic test execution by storing dispatched messages in memory.
   - `mailpit` container service (`axllent/mailpit:v1.23`) added to `docker-compose.yml` (SMTP: 1025, Web UI: 8025).
2. **Account Recovery REST API**:
   - `POST /api/v1/auth/forgot-password`: strictly throttled (`@StrictThrottle()`), CSRF-protected, idempotent, anti-enumeration compliant (dummy verification delay on missing accounts, returning generic `{ accepted: true }` without sending email), single-use token issuance (`AccountTokenPurpose.password_recovery`), and async mail dispatch.
   - `POST /api/v1/auth/reset-password`: strictly throttled, CSRF-protected, idempotent, atomic single-use token consumption, updating password with cost-12 bcrypt, revoking all active sessions for the account (`revokeAllForAccount`) per TM-03, and revoking outstanding recovery tokens.
3. **Client UI & Security Hygiene**:
   - `/forgot-password`: accessible email submission form within `AuthFrame`, with polite asynchronous announcement (`aria-live="polite"`), clear 30-minute expiry explanation, and return-to-sign-in navigation.
   - `/reset-password`: accessible password reset form within `AuthFrame` validating minimum 12 characters and confirmation matching. On mount, executes `window.history.replaceState({}, '', '/reset-password')` to sanitize the recovery bearer token from browser URL history and prevent referrer leakage. Supports direct token paste if opened without query parameters.
   - `/login`: includes visible, accessible "Forgot password?" link below password field.
4. **Verification Evidence**:
   - Backend Supertest suite `server/test/auth-recovery.e2e-spec.ts` passes 9/9 tests (CSRF enforcement, anti-enumeration, mail dispatch, token consumption, session revocation across all sessions, single-use replay rejection).
   - Client API helper suite `client/tests/api-helpers.spec.ts` passes 9/9 tests (CSRF headers, idempotency keys, error mapping for `INVALID_TOKEN` and `TOKEN_EXPIRED`).
   - Browser Playwright suite `client/e2e/account-recovery.spec.ts` passes 7/7 tests (full recovery flow, URL token scrubbing, manual token fallback, expired token handling, min 44px touch targets and zero horizontal scroll at 375/800/1280px).

### Member administration & invitation issuance evidence — 2026-09-06

Prompt 59 implements Phase 5D: member administration, role updates, member revocation,
and invitation issuance with email delivery.

1. **Invitation Email Delivery (`server/src/mail/`)**:
   - `MailService.sendInvitationEmail`: Dispatches branded HTML and plain-text invitation emails with organization name, assigned role, 24-hour validity, and direct acceptance link (`/accept-invitation?token=...`).
   - `OrganizationsService.invite`: Queries organization metadata and asynchronously sends the invitation email upon token generation without blocking the HTTP response.
2. **Client API Helpers (`client/lib/api/`)**:
   - `listMembers`, `changeMemberRole`, `revokeMember`, `listInvitations`, `inviteMember`, `revokeInvitation` implemented in `client/lib/api/browser.ts` and `client/lib/api/server.ts`.
   - All mutations attach `x-acres-organization-id`, CSRF tokens (`x-csrf-token`), and unique idempotency keys (`Idempotency-Key`).
3. **App Shell Navigation & Route**:
   - App shell navigation activates "Members" (`status: "Active"`, `href: "/app/members"`), filtered strictly to `owner` and `admin` roles.
   - Protected route `/app/members` reads active organization context and verifies `members.read` permission via `client/lib/app/members-state.ts`.
   - Polite permission boundary: Viewers and analysts attempting direct navigation to `/app/members` receive an accessible explanation and a "Return to Workspace" link rather than an abrupt redirect or unstyled error.
4. **Member Administration Workspace (`client/components/acres/app/members-workspace.tsx`)**:
   - Invitation issuance form: Email address input, role select (`viewer`, `analyst`, and `admin` if actor is owner), and submit button with spinner state. Stacked responsive layout on tablet/mobile prevents input squishing.
   - Active members table (desktop/tablet) and stacked cards (mobile): Displays name, email, "You" badge for the current account, role badges, joined dates, role modification dropdown for non-owners, and destructive access revocation button.
   - Pending invitations table (desktop/tablet) and stacked cards (mobile): Lists active invitations with expiration dates and one-click revocation.
   - Live announcements (`aria-live="polite"`) for action outcomes (invitation issued, role updated, member revoked, invitation revoked).
5. **Responsive & Touch Floor Compliance**:
   - Minimum 44px touch targets on all inputs, selects, and action buttons via `NativeSelect` `size="target"` and `min-h-target`.
   - Zero horizontal scroll verified across 375px, 800px, and 1280px viewports.
6. **Verification Evidence**:
   - `server/test/organizations.e2e-spec.ts`: 7/7 passed (CSRF defense, mail delivery via `MemoryMailAdapter`, listing members/invitations, role change, and revocations).
   - `client/tests/api-helpers.spec.ts`: 10/10 passed (all member administration and invitation helper functions).
   - `client/e2e/member-administration.spec.ts`: 4/4 passed (owner invite/view/revoke flow, full invitation cycle with token accept, role change, and member revocation, permission boundary for viewer, and responsive 375/800/1280px touch target audit).

### Authenticated loading skeletons & route error boundaries evidence — 2026-09-08

Prompt 60 implements Phase 5E: accessible route error boundaries, streaming loading skeletons, and localized error recovery.

1. **Shared Accessible Route Error Boundary (`client/components/acres/app/route-error-boundary.tsx`)**:
   - Standardizes error recovery across the authenticated application with `role="alert"`, `aria-live="assertive"`, and `data-slot="error-boundary"`.
   - Styled in brand tokens: Crimson Text display heading, DM Sans plain-language copy, and Roboto Mono error digest and request ID.
   - Primary 48px pill action button invoking Next.js `reset()` for in-place re-render and retry.
   - Secondary navigation affordances ("Return to Workspace" -> `/app` and "Sign Out" -> `/login`) meeting the >=44x44px touch target floor.
   - Multiple rendering modes: `mode="workspace"` (retains persistent shell chrome for localized retries without destroying navigation), `mode="standalone"`, and `mode="auth"`.
2. **Route-Level Error Boundaries (`error.tsx`)**:
   - `client/app/app/error.tsx`: Root authenticated shell error boundary catching uncaught runtime exceptions in the workspace.
   - `client/app/app/members/error.tsx`: Member administration error boundary providing localized retry without destroying the AppShell.
   - `client/app/app/dashboards/error.tsx`: Dashboards error boundary for visualization/GraphQL fetch errors.
   - `client/app/app/datasets/error.tsx`: Datasets error boundary for upload/table view errors.
   - `client/app/app/reports/error.tsx`: Reports error boundary for document drafting/export errors.
   - `client/app/(auth)/error.tsx`: Auth layout boundary catching token or form processing errors.
3. **Shared Accessible Skeleton Components (`client/components/acres/app/workspace-skeleton.tsx`)**:
   - `WorkspaceHeaderSkeleton`: eyebrow, heading, description, and action pill placeholders.
   - `TableSkeleton`: responsive table view on desktop/tablet and stacked card view on mobile, preventing horizontal overflow down to 375px.
   - `CardGridSkeleton`: responsive 2, 3, or 4 column card grid with header, stat value, and sparkline/trend placeholders.
   - `WorkspaceShellSkeleton`: persistent AppShell skeleton matching loaded geometry to ensure zero layout shift.
   - Accessibility & Reduced Motion: all skeleton containers declare `role="status"` and `aria-busy="true"`, with screen-reader announcements (`<span className="sr-only">`). Skeletons honor `prefers-reduced-motion: reduce` with static low-contrast styling.
4. **Route-Level Loading Skeletons (`loading.tsx`)**:
   - `client/app/app/loading.tsx`: Overview workspace skeleton with ledger, dl key details, and quick action cards.
   - `client/app/app/members/loading.tsx`: Members workspace skeleton with invite card and member/invitation tables.
   - `client/app/app/dashboards/loading.tsx`: Dashboards workspace skeleton with summary stats, chart card, and observations table.
   - `client/app/app/datasets/loading.tsx`: Datasets workspace skeleton with registry table and action pill.
   - `client/app/app/reports/loading.tsx`: Reports workspace skeleton with drafts/exports table and action pill.
5. **Verification Evidence**:
   - Unit tests `client/tests/loading-error-boundaries.spec.ts`: 4/4 passed (ApiClientError recognition, error copy mapping, digest preservation).
   - Browser Playwright tests `client/e2e/loading-error-boundaries.spec.ts`: 7/7 passed (error boundary display on synthetic test route, reset retry recovery, min 44px touch targets, zero horizontal scroll across 375/800/1280px viewports, and reduced-motion handling).
   - Full Playwright E2E suite (`npm run test:client:e2e`): all 74 tests across 11 files passed cleanly with 0 failures, verified with server-side SSR test harness bridge (`ENABLE_TEST_HARNESS=true`).

## 9. Phase 12E Verification & Test Harness Record

- **Server-Side Test Harness**: `client/lib/api/test-harness-store.ts`, route handler `client/app/api/test-harness/mock`, and `client/lib/api/server.ts` provide session-scoped SSR mock resolution when `ENABLE_TEST_HARNESS=true` is enabled during Playwright runs. Strictly excluded in production without the explicit flag.
- **Client E2E Suite Baseline**: 74/74 tests passing across all 11 suites including `multi-tenant-isolation.spec.ts`, `product-journeys.spec.ts`, `accessibility-responsive.spec.ts`, and `members-management.spec.ts`.
- **Phase 5 Production Ingress Verified (Phase 12G)**: Production Caddy same-origin routing is fully verified via automated route evaluator (`scripts/ops/verify-caddy-routing.js`), unit tests (`verify-caddy-routing.spec.js`, 10/10 passing), and deployment promotion drill (`scripts/ops/run-deployment-drill.sh`). Confirms `@api path /api/* /graphql /health /health/ready` proxies to `api:3001` with `X-Forwarded-Host` and `X-Forwarded-Proto`, `@objects path /acres-quarantine/*` proxies to `garage:3900` with `header_up Host {host}` preserving S3 SigV4 signatures, Next fallback proxies to `next:3000`, and edge security headers are enforced. Local/dev browser traffic continues using the Next Route Handler bridge (`client/app/api/v1/[...path]/route.ts`).

## Organization audit history — Prompt 358, 2026-10-13

`/app/audit` adds the audit portion of product journey 3.9. Owners and admins
can open **Audit history** from the application navigation. Analysts/viewers
receive an explicit access boundary on direct navigation; the existing API
still enforces `audit.read`, active membership and forced RLS. Accounts without
an organization retain the existing creation flow. No mutation, new transport
endpoint, schema, dependency or production configuration was added.

The Server Component page and `audit-workspace.tsx` render newest-first records
from the existing `organizationAuditEvents` connection. The query selects only
event/action/target/actor identifiers and timestamps, never raw details JSON,
emails, invitation tokens or job failure text. Times use `Intl.DateTimeFormat`
in UTC. Action labels tolerate future actions; identifiers wrap and remain
selectable. Shared event types remain authoritative.

`audit-history.ts` owns the query and local connection type, safe local
pagination hrefs, labels and URL validation. The API supplies its default page
size (20 capped by `GRAPHQL_MAX_FIRST`). Pagination carries `organization` and
`after`; the server only applies a cursor for the selected organization.
Duplicate/missing/empty/overlong parameters produce a restart state. The
2048-character cursor bound is a defensive **UI judgment**, not an existing
backend per-cursor maximum. `OrganizationSwitcher` receives an optional,
strictly typed `/app/audit` reset href only on this section; switching away and
back clears pagination. Back navigation and reload preserve ordinary pages.

The server API client uses the existing authenticated, CSRF-protected,
`no-store` GraphQL POST and explicitly sends `OrganizationAuditHistory` as the
operation name (required outside development). `graphql-response.ts` preserves
recognized shared error codes/request IDs and masks upstream text. The new
state loader redirects expired sessions and supplies safe denied,
organization-unavailable, invalid-page and temporary-error copy. Loading uses
the existing reduced-motion-aware skeleton; unexpected failures use the
shared error boundary with the installed Next `retry` prop. Only the new error
boundary needs a client directive; records, pagination and initial reads remain
server rendered.

### Visual and interaction evidence

The PDF button region at x=0/y=1700, 1260×680 at 72 dpi was inspected. There is
no authenticated audit comp: the record layout is a product design judgment
using existing tokens and chrome, with no marketing-layout change. Screenshots
were captured under `output/playwright/audit-history-{375,800,1280}.png` and all
three inspected; the final artifacts were moved to `/tmp/acres-358-browser/`
to keep generated screenshots out of the source commit. At 375 the records
stack; at 800/1280 metadata uses two columns inside the existing persistent
shell. Real-browser assertions prove no horizontal overflow at those widths
(and a reduced 640×450 viewport) and pagination targets at least 44×44.
Keyboard Enter activates the focused pagination link. No manual screen-reader,
actual browser zoom or complete WCAG conformance claim is made.

### Verification

All commands below ran from the repository root against the final code.
Selected actual output (unrelated output omitted):

```text
$ npx --no-install prettier --check <Prompt 358 changed code and prompt paths>
Checking formatting...
All matched files use Prettier code style!

$ git diff --check
(no output)

$ npm run lint
> @acres/client@0.1.0 lint
> eslint
> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"

$ npm run typecheck
> @acres/shared@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
> @acres/client@0.1.0 typecheck
> tsc --noEmit
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma

$ npm run build
▲ Next.js 16.3.8 (webpack)
✓ Compiled successfully in 6.9s
✓ Generating static pages using 7 workers (23/23) in 1345ms
├ ƒ /app/audit
> @acres/server@0.1.0 build
> prisma generate && nest build
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma

$ npm run contracts:check
> prisma generate && nest build && node dist/contracts/generate-contracts.js --check
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma

$ PLAYWRIGHT_CLIENT_PORT=3380 PLAYWRIGHT_API_PORT=3381 npm run test:e2e --workspace=@acres/client -- e2e/audit-history.spec.ts tests/audit-history.spec.ts --workers=1
11 passed (19.6s)

$ npm run test --workspace=@acres/server -- --runInBand --testPathPatterns='cursor-codec.spec.ts|pagination.spec.ts|acres.resolver.spec.ts'
Test Suites: 3 passed, 3 total
Tests:       90 passed, 90 total

$ npm run test:e2e --workspace=@acres/server -- --runInBand --testPathPatterns=api.e2e-spec.ts --testNamePattern=GraphQL
Test Suites: 1 passed, 1 total
Tests:       66 skipped, 10 passed, 76 total
```

Each final command exited 0. The build initially hit the documented sandbox
`Could not parse output from TypeScript's --showConfig` failure; subprocess
escalation passed. The selected API regression initially failed with socket
`listen EPERM`; the identical command passed with local socket access. The
shadcn CLI initially hit sandbox DNS `EAI_AGAIN`; escalation returned the
official component documentation links, which were fetched. Tailwind's
uninitialized local snapshot remains a documented limitation; the existing
skill fallback and repository utilities were used, with no license acceptance
or dependency install.

The first browser run was 1 passed/5 failed: it exposed the real timestamp
cursor defect recorded in `backend.md` and registration/logout test races.
After repair, 5 passed/1 failed identified an immediate read before a reloaded
page finished streaming. Explicit UI waits fixed those test races. The final
11-case run uses real local API/PostgreSQL audit data, no intercepted audit
responses or SSR mocks. It proves >20 real events, distinct pages, reload/back,
both-direction tenant switching, foreign signed cursor rejection, admin access,
analyst/viewer GraphQL denial, anonymous/no-org states and token non-rendering.
No whole-release/database-suite/production acceptance is implied.

The independent read-only reviewer found no Critical/Important issues and
approved completion. One nonblocking coverage opportunity remains: direct
simulation of session expiry, post-context permission revocation, organization
disappearance, query outage and unexpected-boundary retry. Parser code tests
and live role/cursor cases do not substitute for those race/failure cases.

### Remaining scope and local inspection

Scheduled job history remains a separate slice: `/jobs/runs` currently exposes
global scheduled-run metadata and needs a scope/safe-presentation decision
before a tenant UI exposes it. Existing ingestion/export progress is unchanged.
This prompt does not close Phase 12 production evidence or launch approval.

With the existing local database/environment configured, run
`npm run dev:server` and `npm run dev:client` in separate terminals. Sign in as
an organization owner/admin, select the organization and open
`http://localhost:3000/app/audit`. Use More events/Latest events to inspect
pagination. Revert this prompt's client files and codec repair together to roll
back; the cursor wire format and existing schema/contracts remain compatible.

## Audit history failure acceptance — Prompt 359, 2026-10-13

Baseline `e1b63c9`. Added nine browser cases in
`client/e2e/audit-history-failures.spec.ts` and a test-owned HTTP proxy in
`client/e2e/support/audit-fault-proxy.mjs`. Application code, schema, API
contracts and successful audit behavior are unchanged; no product defect was
found. This closes the direct **simulated** race/failure coverage opportunity
recorded in Prompt 358, not actual infrastructure outage or production recovery
acceptance.

`PLAYWRIGHT_AUDIT_FAULTS=true` opts into three owned local processes: real API,
loopback proxy, then Next. API readiness uses the real origin; only Next's API
origin goes through the proxy. Existing default configuration stays unchanged,
and the new suite skips without this explicit opt-in. External browser targets
and existing-server reuse are excluded in fault mode. The proxy accepts only
an HTTP upstream at 127.0.0.1 and is never imported or started by app scripts.
A generated control token protects rule installation/inspection/removal. Rules
use a unique cookie UUID per test, not account/session tokens; traces are off.
Rules and counters reset when armed, and fixture teardown removes the rule and
asserts absence. Owned proxy shutdown closes connections and clears memory.

Real registration, organization creation and audit reads establish each test's
initial state. Faults simulate UNAUTHENTICATED, FORBIDDEN, NOT_FOUND and
CURSOR_INVALID on the audit operation, transport 503, malformed JSON and socket
disconnect, plus malformed initial session/organization reads. Audit fault
counters capture successful context requests **at the first fault**, proving
these failures occur after context loading. Partial data accompanying errors
is rejected. Tests assert safe notices, zero audit rows and no upstream
sentinel text, then keyboard-activate retry/restart and recover the exact real
event identifier. The expiry case checks the local login return path, clears
the simulated fault and reads real events again; it does not revoke a real
session. A separate unmarked browser context with the same real identity
remains unaffected while a FORBIDDEN rule is armed.

### Verification and reproduction

All following final checks exited 0. Selected actual output:

```text
$ npx --no-install prettier --check client/playwright.config.ts client/e2e/audit-history-failures.spec.ts client/e2e/support/audit-fault-proxy.mjs
Checking formatting...
All matched files use Prettier code style!

$ node --check client/e2e/support/audit-fault-proxy.mjs
(no output)

$ npm run lint
> @acres/client@0.1.0 lint
> eslint
> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"

$ npm run build
▲ Next.js 16.3.8 (webpack)
✓ Compiled successfully in 5.6s
✓ Generating static pages using 7 workers (23/23) in 951ms
> @acres/server@0.1.0 build
> prisma generate && nest build
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 531ms

$ npm run typecheck
> @acres/shared@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
> @acres/client@0.1.0 typecheck
> tsc --noEmit
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 936ms

$ npm run contracts:check
> prisma generate && nest build && node dist/contracts/generate-contracts.js --check
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 490ms

$ PLAYWRIGHT_AUDIT_FAULTS=true PLAYWRIGHT_CLIENT_PORT=3390 PLAYWRIGHT_API_PORT=3391 PLAYWRIGHT_AUDIT_PROXY_PORT=3392 npm run test:e2e --workspace=@acres/client -- tests/audit-history.spec.ts e2e/audit-history.spec.ts e2e/audit-history-failures.spec.ts --workers=1
20 passed (46.9s)

$ PLAYWRIGHT_AUDIT_FAULTS=true PLAYWRIGHT_CLIENT_PORT=3390 PLAYWRIGHT_API_PORT=3391 PLAYWRIGHT_AUDIT_PROXY_PORT=3392 npm run test:e2e --workspace=@acres/client -- e2e/audit-history-failures.spec.ts --workers=2 --repeat-each=2
18 passed (35.3s)

$ npm run test:e2e --workspace=@acres/client -- tests/audit-history.spec.ts --list
Total: 5 tests in 1 file

$ git diff --check
(no output)
```

Commands used `mise exec node@26.11.0 --` because the default Node shim had no
version selected. Before starting services, listeners were checked; after both
browser runs, `ss -ltnp | rg ':339[012]\b'` returned no listeners. Each run used
the existing local development database. The first restricted production build
failed with `Could not parse output from TypeScript's --showConfig`; the exact
build passed with subprocess access. Browser/socket checks also used permitted
local process access. An initial lint failure mistook Playwright's fixture
callback named `use` for a React hook; renaming it `provide` fixed it. The first
browser run had **6 failed / 14 passed (47.3s)** because the broad alert selector
also matched Next's route announcer. Scoping to the existing alert slot fixed
all six; no runtime change was needed. Expected server-side ApiClientError logs
occur during the initial-context fault cases. No raw upstream error text is
rendered.

Independent read-only review found no findings and inspected the recorded
20/20 and repeated 18/18 results without rerunning them. Final diff review,
formatting and whitespace checks pass. Screenshots produced by the unchanged
responsive audit suite were moved to `/tmp/acres-359-browser/`, outside the
commit. There is no new visual surface or comp comparison in this change.

This evidence does not establish live permission revocation, real API/worker or
storage/queue outage recovery, whole-release acceptance, a fresh security audit,
or launch approval. Scheduled job history retains its separate scope decision.
Ordinary revert removes only test infrastructure/configuration and this record;
no migration or data rollback is needed. Manual inspection remains
`npm run dev:server` plus `npm run dev:client`, owner/admin sign-in, then
`http://localhost:3000/app/audit`. Run the explicit opt-in commands above to
inspect simulated failure behavior.
