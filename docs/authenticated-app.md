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
- If stream connection fails or the server returns an initial non-200 status, `fallbackPoll` performs a single REST read to keep UI updated.
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

## 9. Open Phase 5 Work

- Richer authenticated loading boundaries and route-level error files.
- Production Caddy same-origin routing; current local/dev browser traffic routes via the Next Route Handler bridge.
