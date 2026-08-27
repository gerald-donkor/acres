# Authenticated app shell

Status: implemented by `prompts/24-authenticated-shell-foundations.md`.

This is the first Phase 5 client/backend slice. It wires the Next client to the
existing Nest `/api/v1` API, adds browser auth forms, persists a non-secret
active organization preference, and renders the first protected product shell.
It does not add dashboards, uploads, metrics, reports, workers, billing, AI, or
new server contracts.

## 1. Routes

| route | current behavior |
| --- | --- |
| `/` | unchanged marketing landing page. The page file now lives in the `(marketing)` route group so marketing chrome is not global. |
| `/login` | accessible credential form. It issues CSRF, logs in through `POST /api/v1/auth/login`, refreshes CSRF after the session cookie changes, then redirects to a sanitized `returnTo` path. |
| `/register` | accessible account form. It issues CSRF, registers through `POST /api/v1/auth/register`, refreshes CSRF after the session cookie changes, then redirects to a sanitized `returnTo` path. |
| `/app` | server-protected workspace shell. Anonymous users redirect to `/login?returnTo=/app`; authenticated users see organization selection or create-organization empty state. |
| `/api/v1/[...path]` | same-origin Route Handler bridge for browser calls to the Nest API. It forwards only the approved REST surface used by the client. |

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
`cache: "no-store"` for every authenticated read.

`client/lib/api/browser.ts` is the only browser mutation client. It calls
same-origin `/api/v1/*` with `credentials: "include"`, issues CSRF with
`GET /api/v1/auth/csrf`, sends `x-csrf-token` on mutations, refreshes CSRF
after login/register, and adds a fresh `crypto.randomUUID()` idempotency key
for create-organization commands.

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

## 9. Open Phase 5 Work

- Account recovery UI and mail delivery.
- Invitation acceptance UI and email flow.
- Richer authenticated loading boundaries and route-level error files.
- Product dataset management, upload mapping, richer job views, report review
  workflow, export progress streaming, and production Caddy same-origin
  routing.
- Production Caddy same-origin routing; this prompt uses the Next Route Handler
  bridge for local/current browser traffic.
