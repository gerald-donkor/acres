# 57 - invitation acceptance UI

## Scope, and why it is next

The committed repository is on `main` at `f9e1aa9` (`test(auth): prove
membership lifecycles`). Phases 3 and 4 are implemented, and Prompt 56 closes
the remaining Phase 3 membership and invitation lifecycle evidence with real
HTTP/PostgreSQL tests. The earliest incomplete build-plan phase is therefore
Phase 5, client/backend connection and authenticated shell.

Implement the next dependency-safe Phase 5 slice: a secure, accessible browser
journey for an authenticated account to accept an existing invitation and enter
the invited organization. The backend already owns and proves the relevant
contract:

- `POST /api/v1/invitations/accept` requires an active session, CSRF token, and
  `Idempotency-Key`;
- the request body is `{ token: string }`, with a 32–256 character bound;
- success returns `{ organizationId, membershipId }`;
- unavailable, expired, revoked, accepted, wrong-recipient, and guessed tokens
  all retain the same safe `404 NOT_FOUND` behavior;
- acceptance is single-use, recipient-bound, transactionally audited, and safe
  under concurrent submission.

This slice must add:

- a new `/accept-invitation` route in the existing auth route group;
- server-side session resolution before showing the acceptance form;
- a focused client form that accepts a pasted invitation token, uses the shared
  browser mutation pipeline, and never treats client state as authorization;
- safe, invitation-specific error copy without weakening the server's
  non-enumerating response contract;
- active-organization preference update and navigation to `/app` after success;
- unit/browser evidence for auth redirect, CSRF/idempotency headers, successful
  acceptance, unavailable-token handling, responsive layout, focus, and token
  non-persistence; and
- precise current-state documentation updates.

The invitation token is deliberately **not** accepted through a URL path,
query parameter, fragment, cookie, Web Storage, hidden field persisted across
navigation, or server-rendered prop. The account signs in first and then pastes
the token into the form. This prevents the bearer value from entering request
logs, referrers, browser history, analytics, server-component payloads, route
prefetches, screenshots, or client persistence. It also avoids inventing the
future email-link format before Acres has an approved mail provider, canonical
production origin, and delivery contract.

This is Phase 5B, not a declaration that all Phase 5 work is complete. Account
recovery, invitation issuance/member administration UI, email delivery, richer
authenticated route-level loading/error boundaries, and production Caddy
same-origin proof remain separately scoped.

## Reference material read while preparing this prompt

Repository and product authorities:

- `AGENTS.md` §§0–10: phase control, prompt contract, design invariants,
  skill-loading rules, checks, review/commit flow, verified-source discipline,
  and no-fabrication rules.
- `docs/build-plan.md` §§1, 4, 6, and 14: completed Phase 3 invitation policy,
  Phase 5 dependency/outcome/security/test/exit contract, and sequence gates.
- `docs/product.md` §§1–6: organization membership roles, the create-or-join
  journey, contact-PII/credential handling, accessible client criteria, and the
  V1 invitation boundary.
- `docs/backend.md` §§2–4 and the current organization route records: shared
  contracts, JSON envelopes, session/CSRF/idempotency behavior, safe errors,
  and server/client workspace boundaries.
- `docs/system-architecture.md` §§3, 5–8, and 11: same-origin browser traffic,
  identity/organization module ownership, hashed single-use tokens, active
  organization selection, no shared caching for tenant data, and the still-
  unimplemented mail adapter boundary.
- `docs/security.md` §§1–9 and TM-02 through TM-05: token/PII assets, browser/API
  trust boundaries, invitation replay and recipient binding, session/CSRF
  controls, non-enumeration, redaction, and remaining delivery/recovery work.
- `docs/authenticated-app.md` §§1–9: existing auth/app route groups, API bridge,
  typed clients, form/focus conventions, active-organization cookie, shell
  breakpoints, Playwright harness, and the exact open Phase 5 work.
- `docs/design-system.md`: existing Acres palette, typography, spacing, radii,
  focus, and responsive tokens. No new token is needed for this slice.
- `docs/components.md`: Acres/base-nova primitive contracts, `cn()` usage, and
  button/link semantics. No primitive API is changed by this slice.
- `docs/skills.md`: locked skill locations, triggers, and the Phase 5 manifest.

Implementation and contract evidence inspected:

- `server/src/organizations/organizations.controller.ts`,
  `server/src/organizations/dto.ts`, and
  `server/src/organizations/organizations.service.ts` for the existing
  authenticated acceptance contract and safe state checks.
- `packages/shared/src/organizations.ts` for `AcceptInvitationInput` and the
  missing client-facing success-result type.
- `docs/api/openapi.json` and `server/src/contracts/generate-contracts.ts` for
  the generated route contract.
- `client/app/api/v1/[...path]/route.ts` for the fixed same-origin bridge header
  allowlist and `no-store` response behavior.
- `client/lib/api/browser.ts`, `client/lib/api/server.ts`,
  `client/lib/api/envelope.ts`, `client/lib/api/idempotency.ts`,
  `client/lib/auth/return-to.ts`, and
  `client/lib/app/active-organization.ts` for the existing session, mutation,
  error, idempotency, safe-return, and organization-preference helpers.
- `client/app/(auth)/layout.tsx`, `client/app/(auth)/login/page.tsx`,
  `client/app/(auth)/register/page.tsx`,
  `client/components/acres/auth/auth-frame.tsx`, `login-form.tsx`, and
  `register-form.tsx` for the established auth page composition and form-state
  behavior.
- `client/components/ui/alert.tsx`, `button.tsx`, `field.tsx`, `input.tsx`, and
  `spinner.tsx` for the local shadcn base-nova/Base UI APIs that the form may
  compose without modifying them.
- `client/tests/api-helpers.spec.ts`,
  `client/e2e/authenticated-shell.spec.ts`, and
  `client/playwright.config.ts` for current browser-client and real-journey test
  conventions.
- `prompts/24-authenticated-shell-foundations.md` and
  `prompts/56-phase-3-membership-invitation-lifecycle-evidence.md` for the
  original Phase 5 slice boundary and the immediately preceding server evidence.

Verified framework/design references:

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`:
  pages are Server Components by default and request-time props are promises.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`:
  server redirects throw, use replace semantics outside Server Actions, and
  belong outside a `try` block.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`
  and `error.md`: route-segment loading/error boundaries remain a separate open
  Phase 5 unit; `error.tsx` is necessarily a Client Component.
- `client/public/assets/ui/landing-pages/Mobile.png`, opened at its native
  375px reference width: Acres' white canvas, restrained green accent, serif
  naming, sans UI copy, mono labels, rounded controls, and 16px mobile gutter
  remain the visual source. The reference contains no authenticated invitation
  screen, so it supplies the system language rather than invented page geometry.
- The current Web Interface Guidelines source was fetched during prompt
  preparation. Relevant rules are semantic form controls, visible focus,
  labeled inputs, paste support, focused actionable errors, `aria-live` for
  asynchronous feedback, specific labels, 44px touch targets, and no horizontal
  overflow.
- The local Tailwind v4 docs snapshot is older than one week and the vendored
  skill directory is read-only in this workspace. Prompt preparation therefore
  used the skill's bundled `references/gotchas.md` and
  `references/engineering-playbook.md` fallback. At implementation time, do not
  introduce an unverified utility or variant: use only utilities already present
  in the inspected Acres auth components unless a fresh authorized Tailwind v4
  source is available.

No comp crop provides invitation-screen measurements. Reuse the already
implemented auth-frame geometry and tokens exactly rather than manufacturing a
new layout system. Browser verification at 375, 800, and 1280px is the evidence
for this product-specific surface.

## SKILLS USED

- `frontend-design` — keep the invitation task specific, restrained, and free
  of decorative status filler while matching Acres' established visual voice.
- `tailwind-design-system` — preserve the existing token hierarchy and avoid
  raw values or one-off design primitives; no `@theme` change is expected.
- `tailwind-4-docs` — verify any Tailwind v4 utility/variant not already proven
  in the neighboring auth components; use the documented fallback if the stale
  snapshot cannot be refreshed lawfully.
- `shadcn` — verify and correctly compose the local base-nova/Base UI `Alert`,
  `Button`, `Field`, `Input`, and `Spinner` APIs without editing the primitives.
- `vercel-react-best-practices` — keep session reads server-side, isolate the
  smallest interactive client leaf, avoid extra waterfalls, and prevent server-
  only imports from entering the client bundle.
- `web-design-guidelines` — perform the required final UI audit for semantic
  controls, copy, focus, async feedback, touch targets, and overflow.
- `accessibility-compliance` — implement WCAG 2.2-oriented labels, focus order,
  announcements, keyboard flow, zoom/responsive behavior, and error recovery.
- `auth-implementation-patterns` — preserve server-authoritative session and
  recipient authorization, CSRF, opaque token handling, and active-organization
  semantics.
- `api-design-principles` — consume the existing versioned REST command and
  stable envelope unchanged, with typed input/result and idempotent command use.
- `security-best-practices` — keep the bearer token out of URLs/storage/logs,
  keep credentials same-origin, avoid unsafe sinks, and retain non-enumerating
  errors.
- `error-handling-patterns` — distinguish unavailable invitation, expired
  session, CSRF refresh, rate limiting, network failure, and unexpected failure
  with actionable UI while preserving request IDs.
- `playwright` — inspect and exercise the real built browser flow at 375, 800,
  and 1280px, including focus and overflow evidence.
- `e2e-testing-patterns` — build an independent real-browser invitation journey
  with public HTTP setup, deterministic waits, and isolated unique fixtures.
- `javascript-testing-patterns` — extend client helper/form behavior tests with
  semantic assertions and exact request evidence.
- `requesting-code-review` — dispatch the mandatory reviewer after complete
  self-verification with requirements, changed paths, checks, and exact SHAs.
- `receiving-code-review` — verify each finding against the approved contract
  and codebase before fixes; request follow-up review for material auth/data-flow
  changes.
- `caveman-commit` — generate the terse Conventional Commit message for the
  required final local commit.

`vercel-react-view-transitions` and all GSAP skills are not required because
this slice adds no approved route/state animation. `openapi-spec-generation` is
not required because the public endpoint, DTO, status codes, and generated
contract do not change. `nestjs-best-practices`, `postgres-best-practices`, and
`security-threat-model` are not required because no server, schema, RLS, or new
trust-boundary implementation is planned. If implementation evidence requires
any such change, stop: that exceeds this prompt rather than conditionally
pulling backend work into a client slice.

## Design direction

This page is a short identity-bound command, not a marketing landing page, a
wizard, or a dashboard. Reuse `AuthFrame` so the task feels like part of login
and registration:

- eyebrow: `Organization Access`;
- page title: `Accept an invitation`;
- description: explain that the invitation must match the signed-in account;
- show one concise line, `Signed in as <email>`, immediately before the token
  field so the recipient binding is understandable without a technical ledger;
- field label: `Invitation Token`;
- field description: ask the user to paste the token they received and state
  that it is used once;
- primary action: `Accept Invitation`;
- pending action: spinner plus `Accepting…`;
- footer: `Want to return without accepting?` with an `Open Workspace` link to
  `/app`.

Use existing Acres tokens only: white canvas, DM Sans for UI/body copy, Crimson
Text for the page heading supplied by `AuthFrame`, Roboto Mono only for the
small signed-in account line if that matches the existing auth type role, brand
green as the single accent, existing rules/radii/focus colors, and the existing
48px submit control. Do not add a card inside the auth frame, a progress stepper,
an illustration, a badge, a success confetti state, a technical status ledger,
or new motion.

The token control is a native password-style input composed through the local
`Input` primitive. It must support paste, use `name="token"`,
`autoComplete="off"`, `spellCheck={false}`, `minLength={32}`,
`maxLength={256}`, `required`, and the existing `h-target` touch size. Do not
add a show/hide toggle: this is a paste-oriented one-time bearer value, and the
toggle adds exposure and interaction cost without an approved need.

## Reference deltas

- None of the static references contains an authenticated invitation screen.
  The route intentionally reuses the measured token/type/radius/gutter system
  and the implemented auth-frame layout rather than claiming new comp geometry.
- The page does not put the token directly in an email-style link. This is an
  intentional security/product delta until mail delivery, canonical origin,
  URL format, and referrer/telemetry handling are approved together.
- The route includes a functional signed-in-account sentence. It is not the
  removed `Session / API / Tenancy` status ledger: it tells the user which email
  the server will bind to the invitation and directly prevents a common wrong-
  account failure.
- No entrance, success, or route-transition animation is added because the
  references provide no motion evidence for this product surface.

## Breakpoint behaviour

- **375px:** use the existing auth layout's single-column form with 16px page
  gutters. The token field and primary action fill the available form width;
  every interactive target is at least 44px high; the account email wraps or
  breaks safely; there is no horizontal page scroll at 200% zoom-equivalent
  conditions.
- **800px:** use the existing two-column `AuthFrame`. The Acres/context panel
  remains visible, the form stays capped at `max-w-md`, and the acceptance task
  remains vertically centered without adding a third panel or status ledger.
- **1280px:** preserve the same two-column auth frame within `max-w-page`; do not
  widen the form, promote the heading to hero scale, or create dashboard chrome.

## Expected file impact

Required:

- Add `client/app/(auth)/accept-invitation/page.tsx` as the server page with
  route metadata, session resolution, safe redirect, and `AuthFrame`
  composition.
- Add `client/components/acres/auth/accept-invitation-form.tsx` as the focused
  Client Component for token submission, accessible errors, organization
  preference persistence, and post-success navigation.
- Update `client/lib/api/browser.ts` with one `acceptInvitation()` helper using
  the existing `apiMutation()` path, CSRF token, and a fresh idempotency key.
- Update `packages/shared/src/organizations.ts` with an
  `AcceptInvitationResult` interface matching the already-generated success
  payload; retain the existing `AcceptInvitationInput`.
- Update `client/tests/api-helpers.spec.ts` with exact request-path/body/header
  evidence for the browser helper.
- Update `client/e2e/authenticated-shell.spec.ts` or add one narrowly named
  invitation E2E file if isolation is clearer. Use the existing Playwright
  harness and real same-origin API/DB.
- Update `docs/authenticated-app.md` with the route, token-handling decision,
  test evidence, and narrowed remaining Phase 5 work.
- Update `docs/build-plan.md` Phase 5 with a dated evidence note that this slice
  implements invitation acceptance UI but not delivery/recovery/full exit.
- Update `docs/security.md` TM-02/TM-03 wording only as needed to record that the
  client acceptance path is present, token values are not persisted in browser
  location/storage, and mail delivery/recovery remain open.

Conditional only when directly required by the approved implementation:

- Add a small invitation-specific pure error-copy helper under
  `client/lib/auth/` or beside the form if it makes unit testing and consistent
  non-enumeration clearer than inline branching.
- Add focused tests for that pure helper in the existing Playwright-discovered
  `client/tests/` suite.

Do not edit `client/components/ui/*`, `client/app/globals.css`, `client/next.config.ts`,
the API bridge allowlist, server files, Prisma files/migrations, generated
OpenAPI/SDL, dependencies, production templates, or unrelated docs. If a
required behavior cannot be implemented without one of those changes, stop and
request a separate prompt instead of expanding scope.

## Route and API impact

New browser route:

- `GET /accept-invitation`
  - server-resolves `GET /api/v1/auth/session` with `cache: "no-store"` through
    the existing server client;
  - redirects anonymous sessions to
    `/login?returnTo=%2Faccept-invitation` using the existing safe relative
    return path;
  - renders the acceptance form only for an authenticated account;
  - includes `metadata.title = "Accept Invitation"` and `robots` noindex/follow
    behavior appropriate for an authenticated account command;
  - never accepts or reflects a token through page props, params, or search
    params.

Existing API consumed unchanged:

- `POST /api/v1/invitations/accept`
  - body: `{ token }`;
  - headers: same-origin session cookie, current `x-csrf-token`, and a unique
    `Idempotency-Key`;
  - no `x-acres-organization-id` header, because the token establishes the
    target organization inside the server's invitation-scoped transaction;
  - success: `{ organizationId, membershipId }`;
  - safe errors and status codes remain exactly as generated.

No public REST/GraphQL/OpenAPI contract changes. The shared result interface is
a client compile-time description of the existing response, not a new server
field or transport promise.

## Detailed behavior and edge cases

### Server page and auth handoff

1. Keep `page.tsx` a Server Component. Resolve `getSession()` before rendering
   account-specific content.
2. Call `redirect()` outside any `try/catch`, matching the installed Next 16.3
   contract so a redirect sentinel is never mistaken for an application error.
3. If session resolution itself fails, render a restrained `AuthFrame` error
   state with the existing safe error-copy/request-ID convention and a normal
   navigation link to retry or sign in. Do not serialize the original exception,
   headers, cookies, or internal API origin to the Client Component.
4. If the session is anonymous, redirect to login with the fixed literal return
   path `/accept-invitation`. Do not propagate arbitrary query state.
5. Pass only the signed-in display email required by the UI to the client form;
   do not pass the session expiry, cookie, account ID, or server error object.

### Form submission

1. Use an uncontrolled form and `FormData`, following the existing login and
   register forms. Trim leading/trailing whitespace from the pasted token before
   the request, but never normalize case or characters within it.
2. Prevent duplicate submission while pending. Disable the input and submit
   button only after submission starts, expose `aria-busy`, and keep button
   copy/state specific.
3. Call `acceptInvitation({ token })`; that helper delegates to the existing
   `apiMutation()` and attaches a newly generated idempotency key.
4. On success, call `persistActiveOrganization(organizationId)` and then
   `router.replace("/app")` plus the established refresh behavior so the server
   re-reads organization membership. Do not trust the cookie as authorization;
   `/app` still resolves accessible organizations from the API.
5. Clear the token from the form as soon as the request settles. Ensure the raw
   value is not copied into React error state, success state, URL state, logs,
   analytics, DOM text, ARIA announcements, request-ID copy, or documentation.
6. On `NOT_FOUND`, show one invitation-specific, non-enumerating state such as
   `Invitation Unavailable`, explain that the token may no longer be usable for
   this signed-in account, and direct the user to check the account/token or ask
   an organization owner/admin for a new invitation. Do not distinguish wrong
   recipient, expiry, revocation, prior acceptance, or a guessed token.
7. On `UNAUTHENTICATED`, show `Session Expired` and a safe link to
   `/login?returnTo=%2Faccept-invitation`. Never preserve the pasted token across
   that navigation.
8. On `CSRF_INVALID`, preserve the existing browser client's token reset and
   tell the user to submit again; the next attempt must fetch fresh CSRF state.
9. On `RATE_LIMITED`, network failure, validation failure, or unexpected server
   failure, show actionable copy and the safe request ID when available. Never
   show the server stack/message as raw markup.
10. Move focus to the alert summary after an asynchronous failure. The alert
    must be keyboard reachable with the established visible focus treatment and
    announced without duplicating nested live-region output. After the user
    dismisses/retries by editing or submitting, preserve a logical focus order.

### Browser/token safety

- The token may exist only transiently in the password-style input, the local
  submit handler variable, and the same-origin JSON request body required by the
  server. It must not survive navigation or reload.
- No `localStorage`, `sessionStorage`, IndexedDB, cookie, URL, `window.name`,
  clipboard write, or hidden persistence is allowed.
- Do not log request bodies or errors that contain the input. Do not include the
  raw token in test names, assertion messages, snapshots, screenshots, docs, or
  completion output.
- Keep React's normal string escaping. No `dangerouslySetInnerHTML`, manual DOM
  HTML insertion, dynamic destination, external fetch, or third-party script.
- Keep the same-origin Route Handler bridge and its fixed header allowlist. Do
  not forward `host`, `x-forwarded-*`, authorization, or arbitrary request
  headers.

## Non-goals

- No SMTP/mail provider, Mailpit runtime, notification module, template,
  sender/domain/DNS choice, delivery retry, bounce/complaint flow, canonical
  production origin, or generated email link.
- No token in a URL, QR code, clipboard-copy control, persisted draft, autofill
  cache, or deep-link format.
- No account recovery/password reset/email verification route or UI, no
  revoke-all-sessions behavior, and no new identity endpoint.
- No invitation issuance, resend, revoke, member list, role-management, or
  ownership-transfer UI.
- No new server route, DTO, response field, error code, rate limit, permission,
  role, RLS policy, audit event, database migration, or GraphQL operation.
- No changes to auth cookie/CSRF/idempotency semantics, return-path allowlist,
  active-organization authorization, or API bridge scope.
- No new component library primitive, token, raw color, typeface, radius,
  breakpoint, icon, illustration, motion, view transition, GSAP code, or
  dependency.
- No claim that Phase 5, email delivery, account recovery, TM-02, TM-03, TM-04,
  TM-05, or launch readiness is fully complete.

## Implementation sequence

1. Re-read this approved prompt, `AGENTS.md`, every owning doc listed above,
   every skill in `SKILLS USED`, and each routed reference required for the
   actual files being edited before writing code.
2. Re-check `git status --short`, current branch, `git log -1`, and prompt 57's
   approved scope. Preserve unrelated user changes and stop if the target paths
   cannot be isolated.
3. Re-verify local Next 16.3 page/redirect/metadata conventions from
   `node_modules/next/dist/docs/`. Inspect the exact local shadcn components
   again and run the shadcn project/docs inspection required by its skill before
   composing them. Do not refresh or accept a third-party docs license without
   user authorization.
4. Add `AcceptInvitationResult` to the shared organization contracts and export
   it through the existing shared index path. Do not duplicate the shape in the
   component.
5. Add `acceptInvitation()` to `client/lib/api/browser.ts` beside other
   organization commands. Reuse `apiMutation()` and `createIdempotencyKey()`;
   do not expose or broaden internal helpers.
6. Extend `client/tests/api-helpers.spec.ts` first. Mock the CSRF and acceptance
   envelopes, invoke the public helper with a synthetic non-secret placeholder,
   and assert the exact relative path, POST method, JSON body, CSRF header,
   unique idempotency header, credentials/no-store behavior inherited from the
   client, and absence of an organization header. Run this focused test before
   adding UI.
7. Add `accept-invitation-form.tsx` using the established auth-form structure,
   local base-nova components, uncontrolled input, pending lockout, focused
   alert, safe request ID, local invitation error mapping, token clearing, active
   organization persistence, and replace navigation.
8. Add the server route page under `(auth)`. Resolve the session, redirect
   anonymous users with the fixed return path, handle session-read failure
   without leaking internals, and compose `AuthFrame` with the exact content and
   authenticated email described above.
9. Add real-browser coverage. Prefer a separate
   `client/e2e/invitation-acceptance.spec.ts` if that keeps fixture setup and
   secret-handling review isolated; otherwise extend the authenticated-shell
   suite without coupling tests.
10. Build the successful E2E fixture only through public same-origin HTTP/UI:
    create a unique inviter account, create an organization, fetch its ID from
    the authorized organizations endpoint, issue one viewer invitation for a
    preselected unique invitee email using CSRF and idempotency headers, retain
    the returned raw token only in a local test variable, sign out, create/sign
    in the matching invitee, visit `/accept-invitation`, paste the token, submit,
    and prove `/app` selects the invited organization. Do not seed Prisma
    directly, print the token, or assert on a token hash.
11. Add browser cases for anonymous redirect/return, an unavailable synthetic
    token, focused actionable error, retry after a synthetic first
    `CSRF_INVALID` response if existing coverage does not already prove the new
    form's path, 44px core controls, no horizontal overflow at 375/800/1280, and
    absence of token text from the URL and browser storage. Disable or tightly
    control trace/screenshot capture for the success case if the tooling would
    otherwise persist request bodies containing the ephemeral raw token; do not
    weaken global debugging for unrelated suites.
12. Run the page in a real browser via the established Playwright configuration.
    Inspect initial, pending, unavailable, and success-navigation states; verify
    keyboard-only operation, visible focus, alert announcement/focus, paste,
    long email/token containment, zoom, and all three target viewports. Store any
    non-sensitive visual artifacts only under `output/playwright/` and never
    commit them.
13. Perform the current Web Interface Guidelines audit against every changed UI
    file. Fix all applicable findings before declaring the surface finished.
14. Inspect all changed files and run the complete verification matrix. Do not
    record counts before commands finish, and never paste a real raw invitation
    token into command output or docs.
15. Update `docs/authenticated-app.md`, `docs/build-plan.md`, and the narrowly
    relevant `docs/security.md` rows with the exact date, commands, test counts,
    behavior proven, token non-persistence decision, and remaining Phase 5/mail/
    recovery boundaries.
16. Complete the mandatory two-stage review. Dispatch a reviewer subagent using
    `requesting-code-review` with the approved prompt, changed paths, security
    invariants, browser evidence, actual checks, and exact `BASE_SHA`/`HEAD_SHA`.
    Apply `receiving-code-review` to verify each finding against the code and
    contract before changing anything. Request follow-up review for material
    auth, token-flow, navigation, shared-contract, or accessibility changes.
17. Stage only approved paths, inspect the staged diff and `git diff --check`,
    use `caveman-commit` to generate the message, commit locally on `main`, and
    do not push.

## Verification plan

Run from the repository root and quote real output in the completion response.
Record exact relevant counts in the owning docs.

1. Focused client helper test using the final exact test title:

   ```bash
   npm run test:e2e --workspace=@acres/client -- tests/api-helpers.spec.ts --grep "accept invitation"
   ```

   If the final title differs, adjust only the grep text so the new helper case
   runs and report the exact command.

2. Focused invitation browser suite:

   ```bash
   npm run test:e2e --workspace=@acres/client -- e2e/invitation-acceptance.spec.ts
   ```

   If the cases are added to the existing authenticated-shell suite instead,
   use `--grep` with the final invitation titles. The real PostgreSQL/API/client
   prerequisite is mandatory. An unavailable database is a failed prerequisite,
   not a skipped or mocked pass.

3. Full client browser/unit suite:

   ```bash
   npm run test:client:e2e
   ```

4. Existing server lifecycle regression, because the UI consumes its most
   security-sensitive invitation behavior:

   ```bash
   npm run test:e2e --workspace=@acres/server -- --runInBand --testNamePattern='invitation lifecycle|single-use invitation'
   ```

5. Contract drift and targeted formatting:

   ```bash
   npm run contracts:check
   npx prettier --check packages/shared/src/organizations.ts client/lib/api/browser.ts client/app/'(auth)'/accept-invitation/page.tsx client/components/acres/auth/accept-invitation-form.tsx client/tests/api-helpers.spec.ts client/e2e/invitation-acceptance.spec.ts docs/authenticated-app.md docs/build-plan.md docs/security.md
   ```

   If the implementation uses the existing E2E file or adds a small error-copy
   helper/test, substitute/add the actual approved path rather than formatting
   unrelated files.

6. Repository static and production checks:

   ```bash
   npm run lint
   npm run typecheck
   npm run build
   npm run ops:check
   ```

7. Token-safety and scope inspection. Use patterns that identify storage/URL
   mechanisms without printing any live fixture value:

   ```bash
   rg -n "localStorage|sessionStorage|URLSearchParams|searchParams|location\\.(search|hash)|document\\.cookie" client/app/'(auth)'/accept-invitation client/components/acres/auth/accept-invitation-form.tsx
   rg -n "acceptInvitation|invitations/accept" packages/shared/src client/lib client/app client/components client/tests client/e2e
   git diff --check
   git diff -- packages/shared/src/organizations.ts client/lib/api/browser.ts client/app/'(auth)'/accept-invitation client/components/acres/auth/accept-invitation-form.tsx client/tests/api-helpers.spec.ts client/e2e docs/authenticated-app.md docs/build-plan.md docs/security.md
   git status --short
   ```

   The first `rg` should have no token-bearing persistence/location use in the
   new surface. A match for the existing active-organization cookie helper is
   acceptable only through its imported function; the token itself must never
   be passed to that helper.

8. Real-browser acceptance at the three contract widths, using the established
   Playwright suite and additional CLI screenshots only when they cannot expose
   a token:

   - 375 × 900;
   - 800 × 900;
   - 1280 × 900.

   Confirm no horizontal scroll, minimum 44px input/button/link targets where
   required, correct single/two-column auth geometry, visible focus, password-
   masked token input, focused safe error, no raw token in the address bar, and
   successful active-organization selection after acceptance.

## Completion and rollback evidence

The implementation is complete only when:

- `/accept-invitation` is server-session protected and anonymous visits return
  through the existing sanitized login/register flow;
- the form submits the existing typed command with CSRF and a fresh idempotency
  key, without an organization header;
- a matching authenticated account can accept a real single-use invitation and
  enter `/app` with the invited organization selected;
- unavailable token states remain indistinguishable in UI copy and reveal no
  recipient, expiry, revocation, prior-use, or existence detail;
- expired-session, CSRF, rate, validation, network, and unexpected failures have
  accessible next steps and safe request-ID handling;
- the raw invitation token never enters URLs, persistence, logs, screenshots,
  docs, snapshots, or rendered error/success text;
- the page is keyboard-operable, announced correctly, focus-visible, paste-
  friendly, touch-safe, zoom-safe, and overflow-free at 375/800/1280;
- all focused/full client, focused server regression, contract, formatting,
  lint, typecheck, build, operations, and diff checks pass;
- the mandatory review loop is complete with every valid blocking/important
  finding resolved; and
- docs describe the exact evidence without claiming email delivery, recovery,
  member administration UI, all Phase 5 work, or launch readiness.

Rollback is one revert of the resulting commit. It removes the additive route,
client helper/result type, tests, and documentation evidence together. No
database rollback, data rewrite, server rollback, generated-contract rollback,
or dependency change is expected. Invitations accepted while the feature was
deployed remain valid memberships because rollback removes only the browser
entry point, not the existing server-side organization state or contract.
