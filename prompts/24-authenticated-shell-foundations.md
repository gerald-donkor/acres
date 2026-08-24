# 24 - authenticated shell foundations

## Scope, and why it is next

The committed repository is on `main` at `739b782` (`feat: version API contracts`).
`docs/build-plan.md` records Phase 3 and Phase 4 as implemented. The earliest
unbuilt phase whose dependencies are committed is therefore Phase 5, "client/backend
connection and authenticated shell."

Implement the first safe Phase 5 slice: the client/API connection layer, the
browser auth forms, active organization selection, and a protected authenticated
application shell. This prompt must produce a real user journey against the
existing Phase 4 Nest API, but it must not pull dashboards, uploads, metrics,
reports, storage, queues, workers, billing, AI, or analytics forward.

The target behavior for this slice:

- `/` remains the measured marketing landing page and keeps its current chrome,
  motion, metadata, image geometry, and anchor behavior.
- Browser traffic for the authenticated app uses same-origin `/api/v1/...`
  calls from the Next app, not direct browser calls to `localhost:3001`.
- Server reads use a server-only typed API client that forwards the request
  cookies and uses `cache: "no-store"` for every user/org read.
- Browser mutations use one shared mutation client that handles credentials,
  `GET /api/v1/auth/csrf`, `x-csrf-token`, idempotency keys where required,
  envelope parsing, duplicate-submit lockout while pending, and request-ID
  display for supportable errors.
- `/login` and `/register` are accessible forms that create a session through
  the real API, refresh CSRF after login/register, and redirect safely into the
  authenticated app.
- `/app` is protected by server-side session resolution. Anonymous users are
  redirected to `/login?returnTo=/app`; a client-only guard is not sufficient.
- Authenticated users see a product shell with account identity, organization
  selection, role-aware navigation affordances, empty/loading/error/session
  expired states, logout, and the current organization's membership role.
- If the user has no organizations, `/app` shows a create-organization empty
  state that creates the organization through `POST /api/v1/organizations` with
  CSRF and an idempotency key.
- If the user has organizations, `/app` selects an active organization
  deterministically, persists that choice in a non-secret client cookie, and
  prevents prior-org cache residue when switching.
- The implementation adds focused browser/E2E coverage for login, register,
  logout, protected redirect, organization creation/switching, CSRF refresh,
  and the three reference viewports: 375, 800, and 1280.
- The implementation records the new authenticated UI build state in a new
  owning docs file and adds its row to `AGENTS.md`.

This prompt is intentionally a foundation slice rather than all of Phase 5. It
builds the shell that later phases need and avoids starting dashboard/product
analytics before ingestion and metrics exist.

## Reference material read while preparing this prompt

Repository and product authority:

- `AGENTS.md` §§2, 2.1, 4-10: phase control, prompt contract, mandatory skills,
  checks, review/commit flow, visual invariants, server/client boundaries, and
  no-fabrication rules.
- `docs/build-plan.md` §§1, 6, and 14: Phase 5 dependency, outcome, non-goals,
  security/failure cases, tests, observability, rollback, documentation owner,
  skill manifest, and sequence gate.
- `docs/backend.md` §§1-8: current Nest/API versions, `/api/v1` route map,
  envelopes, session/CSRF behavior, environment, Prisma role constraints, and
  Phase 4 package caveats.
- `docs/api/contracts.md`: canonical REST routes, required auth/CSRF/idempotency
  headers, old-route removal, and authenticated read-only GraphQL scope.
- `docs/product.md` §§1-7: B2B regional analytics product, roles, current
  organization context, core journeys, V1 boundary, data classifications, and
  open decisions.
- `docs/system-architecture.md` §§2-3.5, 5, 7, and 11: same-origin routing,
  tenant/request flow, modular-monolith boundaries, and client/backend trust
  rules.
- `docs/security.md` §§1, 6-10: session/CSRF, organization isolation, GraphQL
  and future upload boundaries, cached prior-organization data, and security
  acceptance paths.
- `docs/design-system.md`, `docs/components.md`, `docs/polish.md`, and
  `docs/automation.md`: Acres tokens, primitive contracts, accessibility polish,
  and 375/800/1280 measurement/browser recipes.
- `client/public/assets/ui/landing-pages/Desktop.png`: opened as the static
  visual reference for Acres' existing identity and density. The authenticated
  shell does not need pixel matching to the marketing comp, but it must use the
  same palette, type roles, radii, rule weights, and product voice.
- `client/app/layout.tsx`, `client/app/page.tsx`, `client/app/globals.css`,
  `client/components/acres/*`, and `client/components/ui/{button,field,input,
  sidebar,dropdown-menu}.tsx`: current root chrome, landing page, token block,
  Acres primitives, and base-nova shadcn/Base UI APIs.
- `client/next.config.ts`, `client/.env.example`, root `package.json`, and
  `client/package.json`: current scripts, workspace layout, and the absence of
  any client E2E test script.
- `packages/shared/src/{api,accounts,organizations}.ts`: shared response
  envelope, auth/session profiles, organization summaries, roles, invitations,
  and command input shapes.
- `server/src/auth/auth.controller.ts` and
  `server/src/organizations/organizations.controller.ts`: concrete Phase 4
  route headers, guards, status codes, CSRF, and idempotency requirements.

Verified framework and skill references:

- Installed Next 16.3.1 docs:
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
    confirms `proxy.ts` replaces deprecated `middleware.ts`, matcher behavior,
    and the warning not to rely on Proxy alone for auth.
  - `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`
    confirms Route Handler methods and async `params`.
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`
    confirms `cookies()` is async and setting/deleting cookies is limited to
    Server Functions or Route Handlers.
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/headers.md`
    confirms `headers()` is async and read-only.
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md`
    confirms server `fetch` cache semantics and why authenticated reads must
    use `no-store`.
  - `node_modules/next/dist/docs/01-app/02-guides/forms.md` and
    `node_modules/next/dist/docs/01-app/02-guides/server-actions.md` confirm
    form/server-action security requirements. This prompt does not require
    Server Actions; if implementation introduces one, authenticate/authorize
    inside the action and verify the docs again.
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`
    confirms redirect control-flow behavior and the need to constrain return
    paths.
- Tailwind v4 skill:
  - The local docs snapshot was temporarily initialized during prompt prep from
    `tailwindlabs/tailwindcss.com` commit
    `bd868a314bd05ca78acd047e3da289274dd6ccd7` dated 2026-08-11 and showed
    snapshot date 2026-08-24. It was used to verify `@theme`, directives, and
    mobile-first responsive behavior, then removed because skill-generated docs
    are not part of this prompt's repository diff.
  - Implementation must re-run the `tailwind-4-docs` initialization or confirm
    a current snapshot before relying on Tailwind docs; otherwise use only the
    skill's documented limited fallback and state the limitation.
- `web-design-guidelines` was fetched fresh from
  `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
  during prompt prep. Implementation must fetch it again before calling the UI
  finished.

## SKILLS USED

- `frontend-design` — authenticated shell visual direction, product voice, and
  avoiding a generic SaaS dashboard look while staying within Acres tokens.
- `tailwind-design-system` — any token/utility/component-system additions and
  responsive UI composition.
- `tailwind-4-docs` — Tailwind v4 `@theme`, directives, variants, responsive
  behavior, and gotchas; initialize the snapshot before relying on it.
- `shadcn` — use and verification of `client/components/ui/` base-nova/Base UI
  components, especially form, sidebar, dropdown, alert, empty, skeleton, toast,
  and dialog primitives.
- `vercel-react-best-practices` — React/Next server/client boundaries, bundle
  size, authenticated data fetching, and avoiding user/org data waterfalls.
- `web-design-guidelines` — required UI completion audit, fetched fresh at
  implementation time.
- `accessibility-compliance` — WCAG 2.2-oriented forms, focus, labels, live
  errors, keyboard navigation, mobile target sizes, and screen-reader states.
- `auth-implementation-patterns` — session-based auth, CSRF, RBAC/organization
  context, and safe logout/session expiry handling.
- `api-design-principles` — typed client contract use, REST semantics, stable
  errors, idempotency, and no route/action naming drift.
- `security-best-practices` — secure-by-default JS/TS, React, and Next client
  work; no secrets in client bundles, no raw HTML sinks, safe redirects, and no
  token storage.
- `playwright` — real-browser acceptance/debugging and screenshots at 375, 800,
  and 1280.
- `e2e-testing-patterns` — reliable journey fixtures and browser tests for auth
  and organization switching.
- `javascript-testing-patterns` — focused unit/integration tests for API clients,
  form state, error mapping, and idempotency helpers.
- `requesting-code-review` — mandatory post-verification reviewer subagent.
- `receiving-code-review` — mandatory technical evaluation of reviewer feedback.
- `caveman-commit` — required Conventional Commit message for the final local
  commit.

Conditional skills deliberately not used:

- `vercel-react-view-transitions` is not required unless implementation adds
  route/state transitions beyond ordinary loading states.
- GSAP skills are not required because this prompt adds no approved GSAP motion.
- `openapi-spec-generation` is not required unless REST contracts are changed;
  the preferred path is to consume the existing Phase 4 routes unchanged.
- `postgres-best-practices` and `sql-optimization-patterns` are not required
  because this prompt must not add migrations or database queries.

## Design direction and breakpoint behavior

This is a product application surface, not a second marketing page. It should be
quiet, dense, and repeatable for work, while still clearly Acres.

Use these design decisions:

- Palette: only existing Acres tokens from `client/app/globals.css`. No raw hex
  in components. White canvas remains the page background. `#485C11`/`brand`
  stays the only chromatic accent. Use hairlines/rules and typography for
  hierarchy before inventing filled panels.
- Type: DM Sans for body/UI, Crimson Text only for intentional product naming
  or a sparse shell headline, Roboto Mono for compact labels/data. Do not use
  large hero-scale type inside the app shell.
- Shape: app panels and repeated items may use `--radius-card`; icon controls
  use `--radius-control`; media radius is not relevant unless a real image is
  added. Do not nest cards inside cards.
- Layout: the app shell may use shadcn `Sidebar`/`Sheet` primitives if their
  Base UI APIs are verified from local files. Keep mobile controls reachable
  and avoid covering focused elements with sticky headers.
- Signature element: use a narrow "region ledger" strip in the shell header
  that shows active organization, role, and request/session status in Roboto
  Mono. It is functional status chrome, not decoration.
- Copy: plain, action-oriented product language. Use "Create Organization",
  "Select Organization", "Sign Out", "Session Expired", "Try Again", not vague
  "Continue" or promotional copy.

Breakpoint behavior:

- 375 px: single-column auth forms; app shell uses a compact top bar plus a
  disclosure/sheet navigation. Touch targets are at least 44 x 44. No text
  overlaps or horizontal page scroll.
- 800 px: auth forms may sit beside a compact product context column; app shell
  may use a collapsible sidebar or two-column layout with the selected
  organization/status visible without opening a menu.
- 1280 px: app shell uses a persistent work navigation column and a content
  region capped for scanability. Keep information dense and restrained; no
  oversized hero section.

Reference deltas:

- The authenticated app does not replicate the marketing landing comp section
  geometry. It derives tokens, type, radii, and voice from the comp, but its
  layout is product-workflow specific.
- Marketing chrome should not appear inside `/app`. Move chrome into a marketing
  route-group layout if needed, but preserve `/` pixels and existing skip-link
  semantics.
- Auth pages can be visually quieter than the comp and should not use decorative
  stock imagery. If an image is used, it must be an existing Acres asset with
  meaningful or decorative `alt` as appropriate.

## Implementation plan

### 1. Re-load references and inspect current APIs

Before writing code:

1. Re-read `AGENTS.md`, this prompt, and every owning docs file named above.
2. Re-read every skill in `## SKILLS USED`; follow each skill's routed
   references that apply to this implementation.
3. Initialize or verify the Tailwind v4 docs snapshot per the `tailwind-4-docs`
   skill before relying on official Tailwind docs. If initialization fails,
   use only the skill fallback and state the limitation in `docs/authenticated-app.md`.
4. Run shadcn project inspection from inside `client/` and read docs for any
   installed component you use in auth/app shell composition. At minimum verify
   Base UI APIs for `button`, `field`, `input`, `dropdown-menu`, `sidebar`,
   `sheet`, `alert`, `empty`, `skeleton`, `toast`, and any additional component
   touched.
5. Re-check installed Next docs for any file convention used: route groups,
   Route Handlers, `proxy.ts`, `cookies()`, `headers()`, `fetch`, redirects,
   and any Server Action if introduced.
6. Inspect `docs/api/openapi.json` and `packages/shared/src/*` before deciding
   any client-side type. Do not duplicate API semantics from memory.

### 2. Add the same-origin API bridge

Add a local/current Next same-origin bridge for the browser:

- Add `ACRES_API_ORIGIN` to `client/.env.example`, defaulting in code to
  `http://localhost:3001` for local development. Do not use `NEXT_PUBLIC_` for
  this value.
- Implement a catch-all Route Handler under `client/app/api/v1/[...path]/route.ts`
  or a verified equivalent that forwards `GET`, `POST`, `PATCH`, and `DELETE`
  to `${ACRES_API_ORIGIN}/api/v1/...`.
- Preserve method, body, content type, cookies, and safe headers needed by the
  API: `x-csrf-token`, `Idempotency-Key`, and `x-acres-organization-id`.
- Do not forward hop-by-hop headers. Do not log cookies, CSRF tokens,
  idempotency keys, request bodies, emails, passwords, or invitation tokens.
- Preserve upstream status, JSON body, `x-request-id`, and `set-cookie` behavior.
  Verify this in a real browser because cookie forwarding through Route
  Handlers is the critical point of this bridge.
- Return the API's envelope unchanged; the bridge must not invent a second
  envelope or translate stable error codes.
- Keep `/health`, `/health/ready`, and `/graphql` out of this bridge unless a
  concrete UI read needs them in this prompt. GraphQL UI consumption is a
  non-goal for this slice.

If a verified Next rewrite is a better fit than a Route Handler after reading
the current docs, use it only if it preserves Set-Cookie, request headers, and
error bodies under tests. Record the decision and evidence in
`docs/authenticated-app.md`.

### 3. Add typed API clients

Create a small client API layer, not a broad SDK:

- `client/lib/api/envelope.ts`: parse `ApiResponse<T>`, expose stable error
  mapping by `ApiErrorCode`, retain `requestId`, and provide user-facing copy
  with concrete next steps.
- `client/lib/api/server.ts`: server-only functions for `getSession()`,
  `listOrganizations()`, `getOrganization(id)`, and any other initial shell
  read. Use `headers()`/`cookies()` asynchronously, forward only required
  cookies/headers, and set `cache: "no-store"` on authenticated reads.
- `client/lib/api/browser.ts`: browser mutation helpers for csrf issuance,
  login, register, logout, create organization, switch organization state, and
  optional invitation acceptance if the route is included.
- `client/lib/api/idempotency.ts`: generate `crypto.randomUUID()` keys in the
  browser for create-organization and invitation-accept commands. Never reuse
  one key for different bodies.
- Keep all secrets and privileged configuration server-only. No `process.env`
  reads in `"use client"` modules except public site metadata already in place.
- Keep client modules as leaves. Do not export constants/types from `"use client"`
  modules that server files need.

### 4. Restructure app layouts without moving marketing geometry

If necessary, split root layout responsibilities:

- Root layout keeps fonts, `<html>`, `<body>`, skip link, and `<main
  id="main-content">`.
- Marketing route group owns `SiteHeader`, `CondensedNav`, `MobileNavigation`,
  and `SiteFooter` for `/` and marketing-style `not-found` behavior.
- Auth/app route groups own their own restrained shell chrome and must not mount
  marketing footer inside `/app`.
- Preserve `/` URL and existing anchor IDs. Run a visual sanity screenshot of
  `/` at 1280 to confirm the route-group change did not visibly move the
  marketing page.

Do not delete the existing marketing components or rewrite landing sections.

### 5. Build auth pages

Add:

- `/login`
- `/register`
- optionally `/invitations/accept` only if it can be completed against the
  existing `POST /api/v1/invitations/accept` route without email delivery.

Form requirements:

- Use shadcn/Base UI form primitives: `FieldGroup`, `Field`, `FieldLabel`,
  `FieldDescription`, `FieldError`, `Input`, `Button`, `Alert`/`Toast` as
  appropriate. Do not hand-roll raw div form stacks.
- Every input has a label, `name`, `autocomplete`, and correct `type`.
  Email fields use `type="email"`, `autocomplete="email"`, and
  `spellCheck={false}`. Passwords use appropriate current/new password
  autocomplete values. Do not block paste.
- Use native HTML validation where useful and server-envelope validation/error
  mapping for API failures. Focus the first invalid field or the error summary
  after failed submit.
- Submit buttons remain enabled until request start, then show a spinner and
  `aria-busy`; duplicate submits are blocked while the request is pending.
- On successful login/register, immediately refresh CSRF by calling
  `GET /api/v1/auth/csrf` again because the token is bound to the session
  cookie value.
- Implement `returnTo` safely: allow only same-origin relative paths beginning
  with `/`; default to `/app`; reject protocol-relative or absolute external
  URLs.
- Do not reveal account existence beyond the API's generic
  `INVALID_CREDENTIALS` behavior.

### 6. Build the protected app shell

Add `/app` as the first authenticated product route:

- Server-side read current session. If anonymous, redirect to
  `/login?returnTo=/app`.
- Server-side read organizations. If the API returns `UNAUTHENTICATED`, clear
  stale client shell state where possible and redirect to login. If it returns
  `FORBIDDEN`/`NOT_FOUND` for a selected org, fall back to the first accessible
  organization or the no-org empty state.
- Persist active organization ID in a non-secret cookie such as
  `acres_active_organization` from a Route Handler or client-controlled cookie.
  It is a preference, never an authorization claim. Every server/API read must
  re-authorize through the API.
- Organization switch clears any org-scoped client state and refetches from the
  server/API. Do not use a global singleton cache keyed only by route.
- Role-aware navigation hides unavailable affordances for usability, but every
  forbidden command still depends on the server's authorization.
- Provide shell states:
  - loading skeletons for session/org reads;
  - empty state with "Create Organization" for a signed-in account with no orgs;
  - error state with request ID and "Try Again" for dependency/API failure;
  - session-expired state that links to login;
  - offline/network failure state in the browser mutation client;
  - successful logout back to `/login`.
- The initial content can be a concise "Workspace" overview with account,
  active organization, role, and links/placeholders for future datasets,
  dashboards, reports, and audit/job surfaces. It must state future surfaces as
  unavailable/empty, not fake data.

### 7. Tests and browser evidence

Add client E2E infrastructure only if it is not already present:

- Prefer `@playwright/test` for committed browser tests. Add root/client scripts
  such as `test:client:e2e` only in the same change that adds the tests.
- Use the existing real Nest API and real PostgreSQL test harness where
  practical. Do not mock the auth/session/organization boundary for the main
  journey tests.
- Provide deterministic test setup: create unique emails/org names per run,
  clean up through DB/test helpers where available, and avoid tests depending
  on order.
- Cover:
  - anonymous `/app` redirects to `/login?returnTo=/app`;
  - register creates a session and reaches `/app`;
  - login with wrong credentials shows generic failure and does not reveal
    account existence;
  - logout revokes the session and protects `/app`;
  - no-org user sees create-organization empty state;
  - create organization sends CSRF and Idempotency-Key, then displays active org;
  - organization switching does not show prior-org data;
  - stale CSRF or missing CSRF produces a visible, recoverable error;
  - 375/800/1280 layouts have no horizontal scroll, overlapping text, or hidden
    primary controls.
- Use role/label selectors before test IDs. Add `data-testid` only when a
  semantic selector would be unstable or ambiguous.

Also add focused unit tests for pure helpers: envelope parsing, returnTo
sanitization, idempotency key creation, and API error copy mapping.

### 8. Documentation updates

Create `docs/authenticated-app.md` and add its row to the `AGENTS.md` project
notes table in the same implementation commit.

`docs/authenticated-app.md` must record:

- exact routes added and what each one does;
- the same-origin API bridge decision and how cookies/CSRF/set-cookie were
  verified;
- server-only versus client API client boundaries;
- auth, logout, CSRF refresh, returnTo, idempotency, and organization-selection
  behavior;
- shell layout and breakpoint behavior;
- accessibility and browser evidence;
- tests/checks run with exact output;
- open Phase 5 work left for later prompts.

Update `docs/backend.md`, `docs/security.md`, `docs/product.md`, and
`docs/system-architecture.md` only where current implemented state changed.
Do not turn target future dashboard/upload claims into current-state claims.

## Non-goals

- No database schema migration.
- No server route, GraphQL schema, OpenAPI contract, RLS policy, or permission
  semantic change unless a client blocker proves the existing contract is
  unusable. If that happens, stop and explain before expanding the scope.
- No dashboards, charts, saved views, metrics, ingestion, uploads, storage,
  queues, workers, reports, exports, billing, SMTP delivery, SSO, SCIM, custom
  roles, public sharing, or AI.
- No generated SDK. Use a small typed client over the existing shared contracts.
- No new design system, no Tailwind config file, no raw hex/pixel/radius values
  in components.
- No GSAP or route-transition work.
- No fake analytics, fake regions beyond what the existing API returns, fake
  reports, or invented customer/product data.

## Security and failure cases

Verify and test these explicitly:

- Client bundle contains no API origin secret, database URL, session secret,
  CSRF token persistence, raw cookies, or privileged config.
- Browser code stores no session token. Auth remains cookie-backed and
  server-revocable.
- `returnTo` cannot redirect to an external URL.
- Every browser mutation uses CSRF after initial issue and refreshes CSRF after
  login/register.
- Idempotency keys are present for commands that require them and are not reused
  across different bodies.
- Active organization cookie is treated only as preference; server/API remains
  authoritative.
- Prior organization data does not persist after switching organizations.
- Error UI does not show stack traces, SQL/Prisma messages, cookies, tokens,
  passwords, invitation tokens, or raw response bodies.
- Password fields permit paste and password managers.
- Session expiry/revocation redirects safely without a hydration mismatch.
- API offline/slow responses leave the form usable and explain the next step.

## Verification commands and required evidence

Run and quote real output:

```bash
git diff --check
npm run lint
npm run typecheck
npm run build
npm run test:server
npm run contracts:check
```

If a client E2E script is added, run and quote it too:

```bash
npm run test:client:e2e
```

Run a real local journey against the built client and server. Use the repo's
current local DB procedure from `docs/backend.md`; do not silently switch to a
mock API. At minimum prove:

```bash
# terminal 1
npm run start:server

# terminal 2, after npm run build
ACRES_API_ORIGIN=http://localhost:3001 npm run start
```

Then use Playwright or `@playwright/test` to capture/verify `/login`, `/register`,
`/app`, and `/` at 375, 800, and 1280. Save disposable artifacts under
`output/playwright/` if needed and do not commit them unless the repo already
tracks that evidence pattern.

Before requesting review, inspect:

```bash
git diff --stat
git diff --check
git status --short
```

Then run the mandatory two-stage review:

1. Use `requesting-code-review` to dispatch a reviewer subagent with the prompt,
   base/head SHAs, changed files, checks run, browser evidence, and known
   limitations.
2. Use `receiving-code-review` to verify feedback against the code and prompt,
   fix valid issues, rerun affected checks, and request re-review if changes
   are significant.

Finally stage only the approved files, inspect the staged diff, and commit on
`main` with a message produced by `caveman-commit`. Do not push.

## Exit evidence

The prompt is complete only when:

- `/`, `/login`, `/register`, and `/app` work in a browser against the real API.
- Anonymous users cannot access `/app` by refresh, direct URL, or back/forward.
- Register/login/logout/session and create/switch organization journeys pass.
- The app shell is responsive at 375, 800, and 1280 with accessible focus,
  labels, errors, and touch targets.
- No marketing landing geometry regression is visible from the route-group or
  layout work.
- `docs/authenticated-app.md` and the `AGENTS.md` docs index row exist.
- Required repository checks, server tests, contract check, and client E2E tests
  pass or any impossible check is reported with the concrete blocker.
- Code review is complete and the work is committed locally to `main`.
