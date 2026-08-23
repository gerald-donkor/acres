# Rate limiting on `/auth/*` and `/forms/contact`

## Scope and why this is next

Not a numbered row of `AGENTS.md` §8.2 — all eight build-sequence steps are
committed (`git log` resolves step 8 at `14f38e5 feat(server): scaffold NestJS
API and shared contracts`, with two later landing-fidelity fixes on top,
`3a139a7` and `d90aa7a`, both matching `prompts/11-…` and `prompts/12-…`). The
working tree is clean and nothing in `prompts/` is uncommitted.

This is the backend's own named next step. `docs/backend.md` §12 ("Deferred,
and why") lists it explicitly: **"rate limiting on `/auth/*` and
`/forms/contact` | named as a real gap in §5 — availability, not only
brute force. The next backend prompt should open with `@nestjs/throttler`."**
§5 spells out the mechanism: every unauthenticated `POST /auth/login` runs a
cost-12 bcrypt comparison *even when the account does not exist* (the timing
defence in §4), `bcryptjs` is pure JavaScript so it competes with the event
loop, and enough concurrent attempts saturate the process and take `/health`
and every other route down with it — an availability failure, not only a
credential-stuffing risk. `packages/shared/src/api.ts` already reserves
`RATE_LIMITED` in `API_ERROR_CODES`, and `ApiExceptionFilter`'s `STATUS_CODES`
map already turns HTTP 429 into that code (`server/src/common/api-exception.filter.ts:17`)
— the contract was written anticipating this prompt; nothing in the envelope
needs to change.

> Citation convention (`AGENTS.md` §8.2): `§N` is a section of `AGENTS.md`,
> "step N" is a row of the §8.2 build sequence, `prompts/NN-…` is a third
> sequence. This file is `prompts/13-…` and is **not** a step — it is a
> deferred item from step 8, resolved per `docs/backend.md` §12.

## Repository state verified while writing this prompt

Read on 2026-08-23, not recalled:

| fact | evidence |
| --- | --- |
| `git status` is clean, `HEAD` is `d90aa7a` | `git status`, `git log --oneline -1` |
| `prompts/` runs 01–12, all committed; no gap | `ls prompts/`, `git log --oneline` |
| `RATE_LIMITED` is already in `API_ERROR_CODES` and `ApiExceptionFilter.STATUS_CODES[429]` already maps to it | `packages/shared/src/api.ts:32`; `server/src/common/api-exception.filter.ts:17` |
| `SecurityModule` is `@Global()`, currently provides only `CsrfService`, and is imported once in `AppModule` | `server/src/security/security.module.ts` |
| `configureApp` in `server/src/app.setup.ts` wires helmet → CORS → cookie-parser → CSRF middleware → validation pipe → envelope interceptor → exception filter, in that order, and both `main.ts` and the e2e `createTestApp` helper call it — a guard registered as a Nest provider (not `app.use`) is picked up by both without further wiring | `server/src/app.setup.ts`, `server/src/main.ts`, `server/test/helpers/test-app.ts` |
| Full route map: `GET /health` (no guard); `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login` (no session guard); `POST /auth/logout`, `GET /auth/session` (session/optional-session guard); `GET /account` (session guard); `GET /regions`, `GET /regions/:slug` (no guard); `POST /forms/contact` (no guard); `GET /jobs/runs` (session guard) | `server/src/*/​*.controller.ts` |
| `AcresConfigService` is the only sanctioned reader of `process.env` outside itself; `HealthService` reading `npm_package_version` is the one named exception | `docs/backend.md` §6 |
| `env.validation.ts`'s `REQUIRED` is `['DATABASE_URL', 'CLIENT_ORIGIN', 'SESSION_SECRET']`; every other variable has a `DEFAULTS` entry and an optional-with-fallback read | `server/src/config/env.validation.ts` |
| `server/test/setup-env.ts` sets all env vars once, in Jest `setupFiles`, before any test's `beforeEach` runs; `server/test/helpers/test-app.ts`'s `createTestApp(prisma)` calls `Test.createTestingModule({ imports: [AppModule] })` fresh per test, so `ConfigModule.forRoot()`'s `validate` re-reads `process.env` on every `compile()` call, not only once for the file | `server/test/setup-env.ts`, `server/test/helpers/test-app.ts` |
| `server/test/api.e2e-spec.ts` is 381 lines, 18 tests, uses a `csrfAgent()` / `csrfTokenFor()` helper pattern and a hand-rolled `PrismaDouble` — no real database | read in full |
| `@nestjs/throttler@6.5.0` (latest at time of writing) declares peer deps `@nestjs/common@^7‖^8‖^9‖^10‖^11`, `@nestjs/core@^7‖^8‖^9‖^10‖^11`, `reflect-metadata@^0.1.13‖^0.2.0` — compatible with this repo's Nest `^11.2.1` and `reflect-metadata@^0.2.2` | `npm view @nestjs/throttler versions --json`, `npm view @nestjs/throttler@latest peerDependencies --json` |

**The exact `@nestjs/throttler` v6 API — `ThrottlerModule.forRootAsync`'s
shape, the named-throttler array, the `@Throttle()` / `@SkipThrottle()`
decorator signatures, `ThrottlerGuard`'s export path — is not yet verified
from `node_modules`, because the package is not installed in this repository.**
Per `AGENTS.md` §10 rule 2, the implementation **must** install the package
first and then read `node_modules/@nestjs/throttler/dist/*.d.ts` before writing
the wiring below. The shape sketched in this prompt is the package's published
API surface (last confirmed against its README/CHANGELOG for the v5→v6 named-
throttler and `ThrottlerModule.forRootAsync` conventions) and is a **plan to
verify, not a fact to transcribe.** If `node_modules` disagrees with any line
below, the installed source wins and this prompt is stale on that point (§10
rule 8) — note the discrepancy in `docs/backend.md` when recording the work.

## What ships

### 1. Dependency

`npm install @nestjs/throttler@^6.5.0 --workspace=@acres/server`. Record the
resolved version actually installed (`npm ls @nestjs/throttler
--workspace=@acres/server`) in `docs/backend.md`, per this repo's convention of
citing resolved versions, not requested ranges (`docs/backend.md` §1).

### 2. Config — three new optional environment variables

Add to `server/src/config/env.validation.ts`, following the existing
`positiveInt` + `DEFAULTS` pattern exactly (none are in `REQUIRED` — every one
has a safe default so a missing `.env` entry never blocks boot):

| variable | default | meaning |
| --- | --- | --- |
| `RATE_LIMIT_TTL_MS` | `60000` | the sliding window, in milliseconds, both tiers share |
| `RATE_LIMIT_DEFAULT_LIMIT` | `120` | requests per `RATE_LIMIT_TTL_MS` per IP, for every route not named below |
| `RATE_LIMIT_STRICT_LIMIT` | `10` | requests per `RATE_LIMIT_TTL_MS` per IP, for `POST /auth/register`, `POST /auth/login`, `POST /forms/contact` |

Add corresponding fields to the `AcresEnv` interface, wire them through
`validateEnv` with `positiveInt(...)`, add three getters to
`AcresConfigService` (`rateLimitTtlMs`, `rateLimitDefaultLimit`,
`rateLimitStrictLimit`), and document all three in `server/.env.example` in the
same style as the existing entries (a one-line comment above each, grouped
together, e.g. after the `SCHEDULER_ENABLED` block). Add the same three rows to
`docs/backend.md` §6's environment table.

**Why config-driven rather than hard-coded constants:** every other tunable in
this codebase (`SESSION_TTL_DAYS`, `PORT`, …) is an env var with a default, not
a source constant — matching that keeps `AcresConfigService` the single place
this changes, and lets a host override the limit without a code change if the
chosen defaults prove wrong in production traffic.

**Why these particular defaults, stated as a judgement, not a measurement**
(§10 rule 4 — no comp or spec fixes a rate-limit number): `120`/minute on the
default tier is roughly 2 req/s per IP, generous enough that no legitimate
browsing session of the landing page or `/regions` trips it, while still
bounding worst-case load. `10`/minute on the strict tier caps the bcrypt-cost-12
comparisons named in §5 to at most 10 per IP per minute — a real typo-retry
budget for a human, and a hard ceiling on the event-loop cost an attacker can
impose from one address. Both are overridable per §6's env contract if traffic
data later says otherwise.

### 3. `SecurityModule` gains the throttler and its global guard

Extend `server/src/security/security.module.ts` (currently `@Global()`,
providing only `CsrfService`) to also:

- `imports: [ThrottlerModule.forRootAsync({ imports: [AcresConfigModule], inject: [AcresConfigService], useFactory: (config: AcresConfigService) => [{ name: 'default', ttl: config.rateLimitTtlMs, limit: config.rateLimitDefaultLimit }, { name: 'strict', ttl: config.rateLimitTtlMs, limit: config.rateLimitStrictLimit }] })]`
  — **verify this factory shape against `node_modules/@nestjs/throttler`'s
  types before writing it**; the named-throttler array form is what v5/v6
  document, but the exact generic/option names must come from the installed
  `.d.ts`, not this prompt.
- `providers: [CsrfService, { provide: APP_GUARD, useClass: ThrottlerGuard }]`
  — registers `ThrottlerGuard` as the **global** guard, so every route is
  covered by the `default` tier unless it opts out or overrides, exactly the
  way `ValidationPipe` and the exception filter are already global in
  `app.setup.ts` but as a Nest-DI guard rather than `app.use` middleware (see
  the "picked up by both without further wiring" fact above — this is why the
  guard is registered as a provider here rather than in `app.setup.ts`).
- keep `exports: [CsrfService]` — nothing needs to inject `ThrottlerGuard` or
  `ThrottlerModule`'s exports directly; the global `APP_GUARD` binding is
  sufficient.

`AcresConfigModule` must therefore be importable into `SecurityModule`'s
`forRootAsync` — check whether `config/config.module.ts` already exports
`AcresConfigService` in a way `forRootAsync`'s `imports` can reach (it is
`@Global()` too, per `docs/backend.md` if that's recorded, or read the file
directly) — if `AcresConfigModule` is already global, `imports` on the
`forRootAsync` call may be unnecessary; verify from the actual file rather than
assuming this paragraph is right.

### 4. Route-level tiers

- **`HealthController`**: add `@SkipThrottle()` at the class level. A liveness
  probe polled every few seconds by a host or load balancer must never 429 —
  that would turn the rate limiter itself into the availability failure §5
  warns about.
- **`AuthController.register` and `AuthController.login`**: add
  `@Throttle({ strict: { limit: config-driven, ttl: config-driven } })` (exact
  decorator argument shape per the installed `.d.ts` — v6 uses a named-record
  argument keyed by throttler name, not a bare `{ limit, ttl }`; verify) at the
  method level on these two routes only.
- **`AuthController.csrf` and `AuthController.session`** (both `GET`) and
  **`AuthController.logout`**: stay on the `default` tier, unchanged. Reasoning
  to record in `docs/backend.md`, since it is a deliberate narrowing of
  `docs/backend.md` §12's literal "`/auth/*`" wording: `GET /auth/csrf` is a
  cheap, no-bcrypt read that the double-submit flow requires **before every
  mutation** (§5 — "a client must re-read `GET /auth/csrf` after `POST
  /auth/login`"), so a strict per-minute cap on it would break a legitimate
  multi-submission session (e.g. a mistyped password retried twice, each retry
  needing a fresh CSRF read) well before it stopped an attacker. `logout`
  requires an active session already and carries no bcrypt cost. Rate-limiting
  the two routes that actually run the expensive comparison is what closes the
  named availability gap; rate-limiting the cheap reads around them would only
  add false-positive lockouts.
- **`FormsController.contact`**: add the same `@Throttle({ strict: {...} })`
  at the method level. This is the literal second half of `docs/backend.md`
  §12's line and needs no narrowing — it is the only route on that controller.
- Everything else (`RegionsController`'s two routes, `AccountsController`,
  `JobsController`) stays on the global `default` tier with no per-route
  decorator.

### 5. Tests — extend `server/test/api.e2e-spec.ts` and its helper

- **`server/test/helpers/test-app.ts`**: give `createTestApp` an optional
  second parameter, `envOverrides?: Partial<Record<string, string>>`, applied
  to `process.env` immediately before `Test.createTestingModule(...).compile()`
  and restored (previous values, not deleted) immediately after `app.init()`
  resolves — inside a `try/finally` so a compile failure still restores the
  environment. This is safe because `ConfigModule.forRoot()`'s `validate` runs
  fresh on every `compile()` call (confirmed in the facts table above), so a
  per-test override actually takes effect and does not leak into the next
  test.
- **`server/test/setup-env.ts`**: add `RATE_LIMIT_TTL_MS`, generous enough
  (e.g. matching the real default, `60000`) and `RATE_LIMIT_DEFAULT_LIMIT` /
  `RATE_LIMIT_STRICT_LIMIT` set **high** (e.g. `1000`) as the suite-wide
  default, so the 18 existing tests — several of which call `GET /auth/csrf`
  or `POST /auth/register` more than once per test via the `csrfAgent()` /
  `csrfTokenFor()` helpers — are not incidentally throttled. State this choice
  explicitly in `docs/backend.md`: the suite-wide default is deliberately
  loose; the throttling behaviour itself is tested with a **per-test**
  low-limit override via the new `envOverrides` parameter, not by lowering the
  suite default.
- **New tests, in a new `describe('rate limiting', …)` block**, each building
  its own app via `createTestApp(prisma, { RATE_LIMIT_STRICT_LIMIT: '2', RATE_LIMIT_TTL_MS: '60000' })`
  (or similarly small numbers — pick values that make the assertions
  unambiguous) and closing it in that test/`afterEach`:
  1. `POST /forms/contact` with a valid body, sent `RATE_LIMIT_STRICT_LIMIT + 1`
     times from the same agent: the first N succeed with `201`, the last
     answers `429` with the envelope
     `{"ok":false,"error":{"code":"RATE_LIMITED", "message": string}}` — assert
     the exact `code`, not just the status.
  2. `POST /auth/login` with a wrong password, sent past the strict limit:
     same 429/`RATE_LIMITED` assertion, confirming the login route (the actual
     bcrypt-cost route named in §5) is covered.
  3. `GET /auth/csrf` sent well past the *strict* limit (e.g.
     `RATE_LIMIT_STRICT_LIMIT + 5` times) still returns `200` every time in
     the same low-strict-limit app instance — proves csrf issuance rides the
     `default` tier, not `strict`, per the narrowing decision in §4 above.
  4. `GET /health` sent past the *default* limit (build a third app instance
     with `RATE_LIMIT_DEFAULT_LIMIT` set low, e.g. `'2'`) still returns `200`
     every time — proves `@SkipThrottle()` on `HealthController` actually
     exempts it.
- Do **not** lower `RATE_LIMIT_DEFAULT_LIMIT` for the whole file — only for
  the one test in point 4, via its own `envOverrides`.

### 6. `docs/backend.md`

Record the work in the existing file — this is a deferred item from step 8
being resolved, not a new numbered step, so it does not get a new
`docs/` file (`AGENTS.md`'s index table names `docs/backend.md` as owning
`server/`). Edits:

- §1 (Resolved versions): add the `@nestjs/throttler` row with its resolved
  version and one line on why (closes the named availability gap).
- §5 (CSRF — what protects what): the paragraph ending "…nothing enforces it
  today" is now false. Rewrite it to state what tier covers what, and keep the
  bcrypt-cost mechanism explanation — that part is still accurate and is the
  reason the strict tier exists.
- §6 (Environment): add the three new rows to the variable table.
- §9 (Tests): update the test count (18 → 18 + however many were added) and
  add a paragraph describing the new `describe('rate limiting', …)` block and
  the `envOverrides` test helper.
- §12 (Deferred, and why): remove the "rate limiting on `/auth/*` and
  `/forms/contact`" row — it is no longer deferred. If the class-level `GET
  /auth/csrf`/`session`/`logout` narrowing (§4 above) should itself be
  recorded as a residual/accepted scope note rather than a silent deviation,
  add a one-line row for it here rather than leaving `docs/backend.md` §12
  looking like the literal wording was followed unmodified.

**Do not touch `AGENTS.md`.** Nothing in it is stale because of this change —
§8.2's table has no row for this work (it is explicitly a step-8 deferred
item, not a step), and no index-row edit is needed since `docs/backend.md`
already owns `server/`.

## Reference material read

No visual reference — this is a backend-only change. Read for this prompt:
`AGENTS.md` §§2, 5–10 (especially §10 rules 2, 4, 5, 8 — verify the API from
`node_modules`, state judgement calls as judgements, never assert what's built
from `prompts/`, fix stale lines in the same change); `docs/backend.md` in
full, particularly §§4–6, 9, 12 quoted above.

## Breakpoint behaviour

None. No `client/` file changes at all in this prompt — the entire change is
`server/`, `packages/shared` is untouched (the `RATE_LIMITED` code it exports
already exists), and no route response shape changes for a successful request.
The landing page is byte-identical at 375, 800 and 1280 CSS px because nothing
under `client/` is touched.

## Expected impact

- `server/` gains a new dependency (`@nestjs/throttler`), three new env vars
  (all optional, all defaulted, so no existing `.env` breaks), a global
  `ThrottlerGuard`, and per-route `@Throttle()` / `@SkipThrottle()` decorators
  on five routes total (register, login, contact strict; health skip).
- Every route not explicitly decorated is now also subject to the `default`
  tier's generous per-IP cap, which is a behavioural change even where no
  decorator was added — call this out plainly rather than implying only the
  named routes are affected.
- A client that floods `/auth/login` or `/forms/contact` now gets `429` +
  `RATE_LIMITED` instead of an unbounded stream of `200`/`401` responses each
  paying the bcrypt cost.
- No change to any successful response's shape, status code, or the existing
  18 e2e tests' expected outcomes (the suite-wide rate-limit env vars are set
  loose specifically so none of them newly fail).

## Non-goals

- No new database table, no persistence of throttle state — `@nestjs/throttler`'s
  default in-memory storage is sufficient for a single-instance deployment;
  distributed/multi-instance rate-limit storage (Redis-backed) is not built
  and is not implied as needed — `docs/backend.md` §10/§7 already establish
  this deployment is single-process for the scheduler, and the same
  constraint applies here without a new note unless the implementer finds
  otherwise.
- No IP-allowlisting, no per-account (as opposed to per-IP) limiting, no
  CAPTCHA, no account lockout after N failed logins — none of those were named
  in the docs/backend.md §12 gap and are not built here.
- No change to `packages/shared` — `RATE_LIMITED` already exists in
  `API_ERROR_CODES`.
- No change to any `client/` file.
- No Dockerfile, CI, or Terraform change — still deferred per `AGENTS.md`
  §8.2 and `docs/backend.md` §12.
- No first Prisma migration, no seed data — still deferred, unrelated to this
  gap.

## SKILLS USED

- `nestjs-best-practices` — load before writing the `ThrottlerModule`
  wiring and the `APP_GUARD` provider; this touches module composition,
  provider scope (`@Global()`), and guard registration, which is exactly its
  surface (`AGENTS.md` §4).
- `requesting-code-review` — dispatch the reviewer subagent after all checks
  below pass, with this prompt, `BASE_SHA` (`d90aa7a`), `HEAD_SHA`, and every
  command's exact output (§2 step 11, §2.1).
- `receiving-code-review` — verify every finding against the actual installed
  `@nestjs/throttler` API and this prompt's Non-goals before changing
  anything; push back with the installed `.d.ts` as evidence where a finding
  assumes a different API shape than what npm actually resolved.
- `caveman-commit` — write the commit message (§3, §7). Mandatory, no
  exceptions.

No UI, styling, Tailwind, shadcn, GSAP, motion, or accessibility surface
changes in this prompt, so `frontend-design`, the Tailwind skills, `shadcn`,
the GSAP skills, `web-design-guidelines` and `vercel-react-view-transitions`
are not needed. `vercel-react-best-practices` is not needed — no `client/`
file changes.

## Checks to run

From the repository root. **Quote the real output** in `docs/backend.md` and
in the implementation reply (§6, §10 rule 3).

```bash
npm install
npm run lint
npm run typecheck
npm run build
npm run test:server
```

Then confirm `npm ls @nestjs/throttler --workspace=@acres/server` and quote the
resolved version for `docs/backend.md` §1.

Then the manual smoke test — start the server detached, poll for `/health`,
then prove the strict tier trips on a real HTTP round trip (not just the e2e
suite):

```bash
npm run start:server > /tmp/acres-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do curl -fsS http://localhost:3001/health && break; sleep 1; done

# fire past the default RATE_LIMIT_STRICT_LIMIT (10) with bad credentials
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"nobody@example.com","password":"wrong-password"}'
done

kill "$SERVER_PID"
```

Quote the sequence of status codes — expect ten `401`s (or however many the
default env resolves to) followed by `429`s once the strict limit is
exhausted. If port 3001 is occupied, follow `docs/automation.md`'s port
guidance and say which port was used instead.

Then the diff review:

```bash
git diff --check
git status --short
git diff --stat
```

Confirm from `git status --short` that only `server/`, `docs/backend.md` and
`package-lock.json` changed — no `client/` file, no `packages/shared/` file
other than what `npm install` may touch in its lockfile.

## Review and commit

Mandatory two-stage loop (§2 steps 11–14, §2.1, §3):

1. **`requesting-code-review`** — dispatch the reviewer subagent with: what
   was built ("Rate limiting via `@nestjs/throttler` on `/auth/register`,
   `/auth/login` and `/forms/contact`, a global default tier on every other
   route, `@SkipThrottle()` on `/health`, three new env vars, and the
   `docs/backend.md` update closing the §12 gap"); requirements (this prompt
   file and `docs/backend.md` §§5, 12); `BASE_SHA` `d90aa7a` and the current
   `HEAD_SHA`; every check above with its exact output, including the manual
   curl sequence.
2. **`receiving-code-review`** — verify each finding against the actually
   installed `@nestjs/throttler` types and this prompt's Non-goals before
   changing anything. Push back with technical reasoning where a finding is
   wrong. Fix blocking issues first, re-run the affected checks, and request a
   **re-review** if any fix changes which routes carry which tier or touches
   the global guard registration.

Then commit to `main` with a message written by **`caveman-commit`**. Do not
push.
