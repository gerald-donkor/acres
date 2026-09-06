# 58 - account recovery and mail delivery

## Scope, and why it is next

The committed repository is on `main` at `b8f5c6a` (`feat(auth): accept
invitations securely`). Phases 1 through 4 are implemented, tested, and
hardened. Within Phase 5 (client/backend connection and authenticated shell),
Phase 5A (`prompts/24-authenticated-shell-foundations.md`) established the
authenticated shell and API bridge, and Phase 5B
(`prompts/57-invitation-acceptance-ui.md`) completed the secure, session-bound
invitation acceptance journey.

Per `docs/authenticated-app.md` §9 and `docs/build-plan.md` §6, the remaining
open work in Phase 5 is:
1. Account recovery UI and mail delivery.
2. Invitation issuance/member administration UI and invitation email delivery.
3. Richer authenticated loading boundaries and route-level error files.
4. Production Caddy same-origin routing.

The earliest unbuilt, dependency-safe unit in Phase 5 is **account recovery plus
the provider-neutral mail delivery boundary it depends on** (Phase 5C).

The core database primitive for account tokens (`AccountToken` with
`AccountTokenPurpose.password_recovery`, single-use consumption, cryptographic
SHA-256 hash storage, and expiry) is already implemented and proven in
`server/src/identity/account-tokens.service.ts`. Furthermore, the Acres system
architecture (`docs/system-architecture.md` §§3.2, 4.1, 5.1, 8.1) designates a
provider-neutral mail boundary backed by SMTP with Mailpit for local development
and testing.

This unit implements:
1. **Provider-neutral mail delivery boundary in NestJS (`server/src/mail/`)**:
   a modular mailer abstraction with an in-memory transport for unit/e2e tests,
   an SMTP transport connecting to Mailpit in development, typed configuration,
   and clean HTML/text email composition.
2. **Mailpit local service**: declarative integration into `docker-compose.yml`
   and `.env.example`.
3. **Public account recovery REST endpoints (`server/src/auth/`)**:
   - `POST /api/v1/auth/forgot-password`: strictly rate-limited, CSRF-protected,
     idempotent, anti-enumeration compliant (constant/bounded response,
     generic success copy whether the account exists or not), generating a
     single-use password recovery token and dispatching the recovery email.
   - `POST /api/v1/auth/reset-password`: strictly rate-limited, CSRF-protected,
     idempotent, single-use token consumption, updating the account password
     hash with cost-12 bcrypt, revoking all existing sessions for the account
     (session fixation / theft defense per TM-03), and revoking any remaining
     recovery tokens.
4. **Shared contract updates (`packages/shared/src/auth.ts`)**: typed DTOs and
   API envelopes for `ForgotPasswordInput`, `ResetPasswordInput`, and responses.
5. **Client recovery routes and accessible UI (`client/app/(auth)/`)**:
   - `/forgot-password`: accessible email submission form using `AuthFrame` and
     base-nova shadcn primitives, with polite asynchronous status announcement.
   - `/reset-password`: accessible password reset form accepting token via
     query parameter or input, stripping the bearer token from browser URL
     history on mount to prevent leakage in referrers and logs, with password
     masking, validation feedback, and safe error handling.
   - `/login`: adds a visible, accessible "Forgot password?" affordance.
6. **Browser and integration test evidence**: Supertest e2e suite covering
   anti-enumeration, email delivery, single-use token enforcement, session
   revocation on reset, replay rejection, and Playwright journeys at 375, 800,
   and 1280px.
7. **Documentation updates**: `docs/authenticated-app.md`, `docs/security.md`,
   and `docs/backend.md`.

## Reference material read while preparing this prompt

Repository and product authorities:
- `AGENTS.md` §§0–10: phase control, prompt contract, design invariants,
  skill-loading rules, checks, review/commit flow, verified-source discipline,
  and no-fabrication rules.
- `docs/build-plan.md` §§1, 6, and 14: Phase 5 scope, dependency boundaries,
  security/test exit gates, and open Phase 5 tasks.
- `docs/product.md` §§1–6: persona security, credential management, accessible
  client criteria, and non-enumerating auth behaviors.
- `docs/system-architecture.md` §§3.2, 4.1, 5.1, 8.1: API to Mail boundary
  (SMTP/Mailpit, MIT license), notification module responsibilities, REST
  URI versioning, and idempotency scoping.
- `docs/backend.md` §§2–4, 8: shared contracts, JSON envelopes, session/CSRF/
  idempotency behavior, safe errors, and server/client workspace boundaries.
- `docs/security.md` TM-03 & TM-05: session revocation on password change,
  anti-enumeration timing and generic messages, opaque token hashing, and
  rate-limiting controls.
- `docs/authenticated-app.md` §§1–9: auth routes, API bridge, typed clients,
  form/focus conventions, active-organization cookie, shell breakpoints, and
  the exact open Phase 5 work.
- `docs/design-system.md`: existing Acres palette, typography, spacing, radii,
  focus, and responsive tokens.
- `docs/components.md`: Acres/base-nova primitive contracts, `cn()` usage, and
  button/link semantics.
- `docs/skills.md`: locked skill locations, triggers, and Phase 5 manifest.

Implementation and contract evidence inspected:
- `server/src/identity/account-tokens.service.ts`: existing `issue()`,
  `consume()`, and `revoke()` for `AccountTokenPurpose.password_recovery`.
- `server/src/accounts/accounts.service.ts`: `findByEmail()`, `verifyPassword()`,
  and bcrypt hashing.
- `server/src/sessions/sessions.service.ts`: session issuance and revocation.
- `server/src/auth/auth.controller.ts` & `auth.service.ts`: existing auth endpoints,
  guards, and cookie helpers.
- `server/src/config/acres-config.service.ts` & `env.validation.ts`: environment
  configuration schema.
- `client/app/api/v1/[...path]/route.ts`: API bridge with fixed header allowlist.
- `client/lib/api/browser.ts`, `client/lib/api/server.ts`, and `envelope.ts`:
  API client mutations, idempotency generation, and error mapping.
- `client/app/(auth)/login/page.tsx`, `client/app/(auth)/accept-invitation/page.tsx`,
  and `client/components/acres/auth/`: established auth layout and form patterns.
- `docker-compose.yml`: services definition for PostgreSQL, Valkey, Garage, ClamAV.

## SKILLS USED

- `frontend-design` — maintain Acres' restrained, distinctive visual identity
  across account recovery screens without generic templates or status filler.
- `tailwind-design-system` — reuse verified tokens (`--color-brand: #485C11`,
  `--radius-card: 14px`, `--font-crimson-text`, `--font-dm-sans`, `--font-roboto-mono`)
  without introducing unverified Tailwind v4 utilities.
- `tailwind-4-docs` — enforce Tailwind v4 CSS-first token practices and avoid v3
  syntax (`tailwind.config.js` or `theme.extend`).
- `shadcn` — compose existing base-nova/Base UI primitives (`Alert`, `Button`,
  `Field`, `FieldGroup`, `FieldLabel`, `Input`, `Spinner`) without modifying
  the component implementations.
- `web-design-guidelines` — audit UI for 44px touch targets, visible 2px focus
  rings, explicit label associations, pasteable inputs, and zero horizontal overflow.
- `accessibility-compliance` — guarantee WCAG 2.2 AA compliance, keyboard focus
  restoration, polite `aria-live` announcements for async operations, and screen
  reader accessible error summaries.
- `vercel-react-best-practices` — isolate client components to minimal interactive
  form leaves, keep metadata and data fetching server-side, and avoid waterfalls.
- `nestjs-best-practices` — structure `MailModule` and auth additions with clean
  dependency injection, constructor injection, interface tokens, and separation
  of concerns.
- `api-design-principles` — design REST `/api/v1/auth/forgot-password` and
  `/api/v1/auth/reset-password` endpoints adhering to strict HTTP semantics,
  standard envelopes, and idempotency.
- `openapi-spec-generation` — update Nest Swagger decorators to generate valid
  OpenAPI 3.1 specifications matching the server implementation.
- `auth-implementation-patterns` — enforce opaque hashed tokens, short expiry,
  single-use consumption, anti-enumeration defense, and session invalidation.
- `security-best-practices` — implement constant-time timing mitigation for
  unregistered emails, strip recovery tokens from URL query parameters on
  client mount, and enforce cost-12 bcrypt.
- `security-threat-model` — address TM-03 (session revocation on password change)
  and TM-05 (credential enumeration protection) directly.
- `secrets-management` — manage SMTP credentials securely via environment
  variables without hardcoding secrets.
- `postgres-best-practices` — reuse existing indexed `AccountToken` schema and
  execute atomic transactions for token consumption and password updates.
- `error-handling-patterns` — map stable server error codes (`INVALID_TOKEN`,
  `EXPIRED_TOKEN`, `RATE_LIMITED`) to actionable, user-friendly UI copy.
- `javascript-testing-patterns` — write deterministic Jest unit and integration
  tests with mocked and memory-based mail transports.
- `e2e-testing-patterns` — write resilient Supertest and Playwright tests with
  explicit waits and isolated database fixtures.
- `playwright` — execute real browser testing across 375, 800, and 1280px viewports
  verifying form submission, token clearing, and responsive layouts.
- `requesting-code-review` — dispatch code reviewer subagent with complete diff,
  SHAs, and requirements upon implementation completion.
- `receiving-code-review` — evaluate feedback with technical rigor and verify
  fixes before committing.
- `caveman-commit` — construct ultra-compressed Conventional Commit message for
  the final commit to `main`.

## Reference deltas

The reference comps (`Desktop.png`, `Tablet.png`, `Mobile.png`, and
`acres-design-system.pdf`) specify the marketing landing page and primitive styles
(pills, buttons, inputs, typography, palette). They do not depict account
recovery screens.

Delta decisions:
1. **Layout & Framing**: Recover password and set new password pages reuse the
   exact geometry established by `/login`, `/register`, and `/accept-invitation`
   via `AuthFrame` (centred card, max width 440px, 14px card radius, white canvas,
   eyebrow in Roboto Mono `#485C11`, Crimson Text display heading, and hairline
   `#E9E9E9` borders).
2. **Token Input vs Link**: While the recovery email provides a direct link
   (`https://<origin>/reset-password?token=<token>`), the reset page also provides
   a manual token field if the query parameter is omitted, and immediately scrubs
   the token from the browser location bar (`history.replaceState`) on mount to
   prevent shoulder surfing, referrer leakage, and browser history persistence.
3. **No Account Enumeration**: The response message on `/forgot-password` does not
   confirm whether an account exists. The UI always displays the same success
   confirmation.

## Breakpoint behaviour

- **375px (Mobile)**:
  - Container width: 343px (16px gutters).
  - Auth card fills container with 16px internal padding.
  - Form fields, inputs, and buttons are 100% width with 48px height (`h-target`),
    exceeding 44px touch target guidelines.
  - Zero horizontal overflow.
- **800px (Tablet)**:
  - Container width: 720px (40px gutters).
  - Auth card centred, fixed width 440px.
  - 24px internal padding.
- **1280px (Desktop)**:
  - Container width: 1200px (40px gutters).
  - Auth card centred, fixed width 440px.
  - 24px internal padding.

## Architecture and subsystem design

### 1. Provider-neutral Mail Subsystem (`server/src/mail/`)

```
                  ┌──────────────────────┐
                  │     MailService      │
                  └──────────┬───────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
┌──────────────────────┐          ┌──────────────────────┐
│   SmtpMailAdapter    │          │  MemoryMailAdapter   │
│ (Mailpit / Prod SMTP)│          │  (Unit / E2E Tests)  │
└──────────────────────┘          └──────────────────────┘
```

- **Interface** (`mail.interface.ts`):
  ```typescript
  export interface MailMessage {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }

  export interface MailTransport {
    send(message: MailMessage): Promise<void>;
  }
  ```
- **Configuration** (`AcresConfigService`):
  - `mailTransport`: `'smtp' | 'memory'` (defaults to `'smtp'` in development/production, `'memory'` in test).
  - `smtpHost`: string (default: `'localhost'`).
  - `smtpPort`: number (default: `1025`).
  - `smtpSecure`: boolean (default: `false`).
  - `smtpUser`: string | undefined.
  - `smtpPass`: string | undefined.
  - `mailFrom`: string (default: `'Acres <no-reply@acres.local>'`).
- **Nodemailer Dependency**:
  Install `nodemailer` and `@types/nodemailer` in `server/package.json`. Both are
  permissively licensed (MIT) and align with `docs/system-architecture.md` §4.1.
- **Mailpit Service** (`docker-compose.yml`):
  Add `mailpit` container image `axllent/mailpit:v1.23` with ports `1025` (SMTP)
  and `8025` (Web UI) for inspectable local email delivery.

### 2. Identity and Auth Engine Extensions (`server/src/auth/`, `server/src/accounts/`, `server/src/sessions/`)

1. **`AccountsService.updatePassword(accountId: string, newPassword: string)`**:
   Hashes `newPassword` with `bcrypt(newPassword, BCRYPT_COST)` (cost 12) and
   updates `Account.passwordHash`.
2. **`SessionsService.revokeAllForAccount(accountId: string)`**:
   Sets `revokedAt = new Date()` for all active sessions belonging to `accountId`.
3. **`AuthService.forgotPassword(email: string)`**:
   - Finds account by normalized email.
   - If account is null: executes a dummy bcrypt hash or simulated delay
     (~50-100ms) to ensure response timing does not betray email existence.
   - If account exists:
     - Issues a token using `accountTokensService.issue(account.id, AccountTokenPurpose.password_recovery)`.
     - Builds recovery URL using `${clientOrigin}/reset-password?token=${token}`.
     - Asynchronously sends recovery email via `mailService.send()`.
   - Returns `{ accepted: true }`.
4. **`AuthService.resetPassword(token: string, newPassword: string)`**:
   - Atomically consumes token via `accountTokensService.consume(token, AccountTokenPurpose.password_recovery)`.
   - If null: throws `ApiException.invalidOrExpiredToken()` (400 or 404 with stable code `INVALID_TOKEN`).
   - Updates account password via `accountsService.updatePassword()`.
   - Revokes all existing sessions via `sessionsService.revokeAllForAccount()`.
   - Revokes any remaining recovery tokens for that account.
   - Returns `{ reset: true }`.
5. **Endpoints in `AuthController`**:
   - `@Post('forgot-password')`: `@StrictThrottle()`, `@ApiCsrfHeader()`, `@HttpCode(HttpStatus.OK)`.
   - `@Post('reset-password')`: `@StrictThrottle()`, `@ApiCsrfHeader()`, `@HttpCode(HttpStatus.OK)`.
   - Both commands support `Idempotency-Key` header handling.

### 3. Shared Types (`packages/shared/src/auth.ts`)

- Export `ForgotPasswordInput` (`{ email: string }`).
- Export `ForgotPasswordResult` (`{ accepted: true }`).
- Export `ResetPasswordInput` (`{ token: string; password: string }`).
- Export `ResetPasswordResult` (`{ reset: true }`).

### 4. Client Pages and Components (`client/`)

- `client/lib/api/browser.ts`:
  - `forgotPassword(input: ForgotPasswordInput): Promise<ForgotPasswordResult>`
  - `resetPassword(input: ResetPasswordInput): Promise<ResetPasswordResult>`
- `client/lib/api/envelope.ts`:
  - Map `INVALID_TOKEN` and `TOKEN_EXPIRED` to user-friendly title and actions:
    - Title: "Reset Link Unavailable"
    - Message: "This password reset link is invalid or has expired."
    - Action: "Request a new password reset link to continue."
- `client/app/(auth)/forgot-password/page.tsx`:
  - Server component rendering `AuthFrame` and `ForgotPasswordForm`.
- `client/components/acres/auth/forgot-password-form.tsx`:
  - Accessible form with email field.
  - Submits to `/api/v1/auth/forgot-password`.
  - Upon submission, switches to a confirmed state with clear instructions and
    a link back to `/login`.
- `client/app/(auth)/reset-password/page.tsx`:
  - Reads `token` from `searchParams`.
  - Passes token to `ResetPasswordForm`.
- `client/components/acres/auth/reset-password-form.tsx`:
  - Client component.
  - On `useEffect`, calls `window.history.replaceState({}, '', '/reset-password')`
    to remove `?token=...` from address bar and prevent bearer token leakage.
  - Renders new password input (minimum 8 characters) and password confirmation.
  - Submits to `/api/v1/auth/reset-password`.
  - On success: displays success message and button to sign in.
- `client/components/acres/auth/login-form.tsx`:
  - Adds `<Link href="/forgot-password">Forgot password?</Link>` below password field.

## Step-by-step implementation plan

1. **Infrastructure & Dependencies**:
   - Add `mailpit` service to `docker-compose.yml`.
   - Install `nodemailer` and `@types/nodemailer` in `server/`.
   - Update `server/src/config/env.validation.ts` and `acres-config.service.ts`
     with SMTP and mail transport keys.
2. **Mail Module Implementation**:
   - Create `server/src/mail/mail.interface.ts`.
   - Implement `SmtpMailAdapter` and `MemoryMailAdapter`.
   - Implement `MailService` and register in `MailModule`.
   - Import `MailModule` into `AppModule`.
   - Write unit tests in `server/src/mail/mail.service.spec.ts`.
3. **Backend Auth & Account Updates**:
   - Add `updatePassword` in `server/src/accounts/accounts.service.ts`.
   - Add `revokeAllForAccount` in `server/src/sessions/sessions.service.ts`.
   - Create DTOs `ForgotPasswordDto` and `ResetPasswordDto` in `server/src/auth/dto/`.
   - Add `forgotPassword` and `resetPassword` methods to `AuthService`.
   - Add `@Post('forgot-password')` and `@Post('reset-password')` to `AuthController`.
   - Update `packages/shared/src/auth.ts` and `packages/shared/src/index.ts`.
   - Run `npm run contracts:generate` and check drift.
   - Write unit and e2e tests in `server/test/auth-recovery.e2e-spec.ts`.
4. **Client API Bridge & Error Handling**:
   - Add mutation methods in `client/lib/api/browser.ts`.
   - Add error code mapping in `client/lib/api/envelope.ts`.
   - Write unit tests in `client/tests/api-helpers.spec.ts`.
5. **Client UI & Route Implementation**:
   - Create `client/app/(auth)/forgot-password/page.tsx`.
   - Create `client/components/acres/auth/forgot-password-form.tsx`.
   - Create `client/app/(auth)/reset-password/page.tsx`.
   - Create `client/components/acres/auth/reset-password-form.tsx`.
   - Add "Forgot password?" affordance to `client/components/acres/auth/login-form.tsx`.
6. **Browser Verification & Playwright Tests**:
   - Create `client/e2e/account-recovery.spec.ts` testing the complete flow.
   - Verify viewports at 375, 800, and 1280px.
   - Verify URL sanitization (token stripped from URL bar).
   - Verify screen reader live regions and keyboard focus order.
7. **Documentation Updates**:
   - Update `docs/authenticated-app.md` recording Phase 5C completion.
   - Update `docs/security.md` reflecting closed TM-03 / TM-05 recovery work.
   - Update `docs/backend.md` with mailer and recovery endpoints.
   - Update `docs/build-plan.md` Phase 5 section.
8. **Self-Verification, Review & Commit**:
   - Run formatting, linting, typecheck, contract check, unit tests, and build.
   - Dispatch code review subagent via `requesting-code-review`.
   - Evaluate findings via `receiving-code-review`.
   - Commit locally with `caveman-commit`.

## Detailed file-by-file changes

| file | changes |
| --- | --- |
| `docker-compose.yml` | Add `mailpit` service (image `axllent/mailpit:v1.23`, ports `1025:1025`, `8025:8025`). |
| `server/package.json` | Add `nodemailer` and `@types/nodemailer`. |
| `server/src/config/env.validation.ts` | Add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `MAIL_TRANSPORT`. |
| `server/src/config/acres-config.service.ts` | Add typed getters for mail and SMTP configuration. |
| `server/src/mail/mail.interface.ts` | Define `MailMessage`, `MailTransport`, and injection token `MAIL_TRANSPORT`. |
| `server/src/mail/adapters/smtp-mail.adapter.ts` | Implement SMTP transporter using `nodemailer`. |
| `server/src/mail/adapters/memory-mail.adapter.ts` | Implement in-memory mailer storing sent messages for tests. |
| `server/src/mail/mail.service.ts` | High-level mail service composing recovery and notification templates. |
| `server/src/mail/mail.module.ts` | Dynamic/factory-provided mail module exporting `MailService`. |
| `server/src/app.module.ts` | Register `MailModule`. |
| `server/src/accounts/accounts.service.ts` | Add `updatePassword(accountId, newPassword)`. |
| `server/src/sessions/sessions.service.ts` | Add `revokeAllForAccount(accountId)`. |
| `server/src/auth/dto/forgot-password.dto.ts` | DTO validating `email`. |
| `server/src/auth/dto/reset-password.dto.ts` | DTO validating `token` and `password`. |
| `server/src/auth/auth.service.ts` | Add `forgotPassword` and `resetPassword` handling. |
| `server/src/auth/auth.controller.ts` | Expose `POST /auth/forgot-password` and `POST /auth/reset-password`. |
| `packages/shared/src/auth.ts` | Export `ForgotPasswordInput`, `ForgotPasswordResult`, `ResetPasswordInput`, `ResetPasswordResult`. |
| `client/lib/api/browser.ts` | Add `forgotPassword` and `resetPassword` mutation helpers. |
| `client/lib/api/envelope.ts` | Add error mapping for `INVALID_TOKEN` and recovery failures. |
| `client/app/(auth)/forgot-password/page.tsx` | Route page for forgot password. |
| `client/components/acres/auth/forgot-password-form.tsx` | Form component for requesting reset link. |
| `client/app/(auth)/reset-password/page.tsx` | Route page for resetting password with token. |
| `client/components/acres/auth/reset-password-form.tsx` | Form component for new password submission with URL hygiene. |
| `client/components/acres/auth/login-form.tsx` | Add link to `/forgot-password`. |
| `server/test/auth-recovery.e2e-spec.ts` | E2E tests for recovery endpoints, token usage, and session revocation. |
| `client/tests/api-helpers.spec.ts` | Tests for recovery client API helpers and error mappings. |
| `client/e2e/account-recovery.spec.ts` | Playwright tests for complete recovery journey and responsive layouts. |
| `docs/authenticated-app.md` | Document Phase 5C implementation and updated open work. |
| `docs/security.md` | Update threat matrix entries TM-03 and TM-05. |
| `docs/backend.md` | Document mailer module and recovery REST endpoints. |
| `docs/build-plan.md` | Record Phase 5C evidence. |

## Verification, test plan & exit criteria

The implementation is verified when:
1. **Contract check**:
   `npm run contracts:check` runs cleanly and OpenAPI spec accurately describes
   `/api/v1/auth/forgot-password` and `/api/v1/auth/reset-password`.
2. **Typecheck & Linting**:
   `npm run lint` and `npm run typecheck` pass across `@acres/shared`,
   `@acres/client`, and `@acres/server` with zero warnings or errors.
3. **Build**:
   `npm run build` succeeds for all three workspaces.
4. **Backend Server Tests**:
   `npm run test:server` and dedicated recovery e2e suite pass 100%:
   - Submitting unregistered email returns HTTP 200 with identical message and
     sends no email.
   - Submitting registered email returns HTTP 200 and sends email with valid token.
   - Using valid token resets password, updates hash to cost-12 bcrypt, and revokes
     all existing active sessions for that account.
   - Old password cannot log in; new password logs in successfully.
   - Reusing the token or submitting an expired token fails with safe `400`/`404`.
5. **Client Browser Tests**:
   - Playwright suite `client/e2e/account-recovery.spec.ts` passes against running
     test server.
   - Full recovery journey succeeds from `/forgot-password` through `/reset-password`
     to `/login`.
   - Query parameter token is sanitized from URL bar on mount.
   - No horizontal overflow at 375px, 800px, 1280px.
   - Accessible keyboard navigation and 44px minimum target sizes.
6. **Documentation**:
   - `docs/authenticated-app.md`, `docs/security.md`, `docs/backend.md`, and
     `docs/build-plan.md` accurately record the implemented state.
7. **Code Review**:
   - Two-stage code review loop dispatched via `requesting-code-review` and
     resolved via `receiving-code-review`.
8. **Git Commit**:
   - Final work committed to `main` with Conventional Commit message via
     `caveman-commit`.
