# Prompt 389 — scanner create-failure cause and owner-gated rebuild

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Inspected baseline: `4551988` on `main` (`docs(ops): record failed scanner
builder create`), worktree clean when this prompt was prepared. This prompt
file alone proves nothing; resolve state from the repository and `git log`.

`docs/vercel-deployment.md` ("Scanner candidate rebuild — Prompt 388") names
the next gate: "an owner-side read-only check of the Hobby Sandbox allowance
and any create-path cause in the dashboard, then only if allowance remains, a
separately authorized single rebuild." Prompt 388's one live attempt failed at
`builder-create` / `provider_failed`, and `docs/operations.md` (Prompt 388
"Interpretation") records the cause as **unknown** because `buildStep` maps
every exception there to `provider_failed` with no further shape: a provider
rejection (quota, rate limit, plan limit, 5xx), a transport failure and an
authorization rejection all project identically.

A second blind rebuild would very likely end in the same unreadable receipt.
So this prompt has three stages, in order, each gated by the one before:

- **A — local diagnostics (no cloud calls).** Extend the builder's safe
  failure projection with an allowlisted provider-error shape (error class,
  HTTP status, lower-snake provider code), reusing the contract
  `errorShape()` in `scripts/vercel/probe-platform.js:898` already applies to
  scanner probes. Raise the live producer's OIDC remaining-lifetime floor to
  cover the whole watchdog window. Tests, review, commit.
- **B — owner allowance report (read-only, by the user).** The agent cannot
  read Sandbox usage: `vercel usage --json` returned "Billing cost data is
  unavailable" in Prompt 388, the Vercel MCP server failed to connect this
  session, and browser automation is a last resort that is not authorized
  here. The user reads the dashboard and reports the figures listed in §B.
- **C — at most one live rebuild**, only if B shows headroom on every listed
  quota and the user then answers yes to the exact §C question in the same
  session. Success → offline handoff bundle only. Failure → record the new
  safe shape and stop.

**Time pressure (does not relax any gate).** Baseline
`snap_Feg5m9jpsGpejVjjh6ZAlzrMJIkA` expires `2026-10-24T14:29:39.778Z`; its
CVD signatures are already past the 48 h policy, so the deployed preview
scanner is expected to fail closed as `scanner_unavailable` until a fresh
candidate is adopted. The `preview.env` OIDC token recorded in Prompt 388
expired at `2026-10-18T10:00:24Z` and must be re-pulled before any live call.

**Approval of this prompt authorizes:** stage A's local code/test/doc change
and its commit; read-only provider inspection (exact snapshot IDs, project
sandbox listing, `whoami`, `project inspect`) before and after stage C; one
`vercel env pull --environment=preview --yes` refresh into the existing 0700
secrets directory; and — only after the stage C confirmation — exactly one
live cadence-producer invocation (its builder sandbox and its existing
clean/EICAR smoke sandbox) on the fixed free-tier preview target, plus
offline handoff validation. It does **not** authorize env-variable writes,
deployment, browser/application acceptance, snapshot deletion or retirement,
a second rebuild, workflow dispatch, production, paid usage, plan changes,
credential rotation, Chrome automation, or a push.

## Reference material read

- `AGENTS.md` §§2, 3, 5–7, 10; memory `vercel-migration-resume`.
- `docs/vercel-deployment.md`: "Resume here", fixed target, Sandbox pricing
  paragraphs (Hobby: 5 active-CPU hours, 5,000 creations, 10 concurrent,
  45-minute sessions per month; 15 GB lifetime Snapshot Storage; usage past
  quota **pauses** rather than bills — read 2026-09-10/2026-10-15, to be
  re-read live in stage B), Prompts 386–388 sections.
- `docs/operations.md` Prompt 388 record (target/pre-run state, custody
  `prompt388-20261017T220154Z`, the single invocation, receipt SHA-256
  `e71e0d07…a521f4`, interpretation).
- `infra/vercel/runbooks/managed-operations.md` §5 (preparation,
  `build_failure` fields, Prompt 388 lessons: check OIDC `exp` locally, pass
  only `VERCEL_OIDC_TOKEN` + fixed target vars, cached CLI fallback).
- `prompts/388-bounded-scanner-candidate-rebuild.md` (§§1–4b are the live
  procedure reused verbatim by stage C).
- Source read this session:
  - `scripts/vercel/build-scanner-snapshot.js:72-139` — `FAILURE_STEPS`,
    `FAILURE_KINDS`, `BuildError`, the `failures` WeakMap,
    `projectBuildFailure()`, `buildStep()`; `:340` `buildSnapshot(config,
    sdk, …)`; `:368-382` the builder `Sandbox.create` call (image
    `vercel/sandbox/node:24`, `config.region`, 2 vCPU, `BUILDER_TIMEOUT_MS`,
    `BUILDER_EGRESS`, `persistent: false`).
  - `scripts/vercel/rebuild-scanner-cadence.js:326-334` — the only place
    `receipt.build_failure` is set (`stage === "build"`).
  - `scripts/vercel/probe-platform.js:51` `OIDC_MIN_REMAINING_MS = 30 *
    60_000`; `:74-78` the expiry check in `sandboxTarget`; `:91`
    `credentialsFor`; `:898-907` `errorShape()`.
  - `scripts/vercel/rebuild-scanner-cadence.spec.js:1440-1475` (the
    build-failure scenario table asserting `build_failure` by `deepEqual` and
    the credential-canary leak check), `:1490` (success/skip/simulation
    receipts gain no `build_failure`).
  - `scripts/vercel/probe-platform.spec.js:607-631` (the existing
    "type, status and code only" test, the pattern to mirror).
  - `node_modules/@vercel/sandbox` **3.8.0**:
    `dist/api-client/api-error.d.ts` — `class APIError<E> extends Error {
    response: Response; json?: E; text?: string; … }` (message is
    `response.statusText`), `class StreamError extends Error { code: string;
    sessionId: string }`; both exported from `dist/index.d.ts`.

## SKILLS USED

- `error-handling-patterns` — the provider-error taxonomy, keeping primary
  and cleanup outcomes independent, never letting diagnostics change status.
- `secrets-management` — OIDC custody (0700/0600), names-only listing, no
  token, message, body or `text` ever crossing the receipt/CLI boundary.
- `javascript-testing-patterns` — extend the `node:test` suites with fakes for
  each error class and a leak canary.
- `vercel:vercel-sandbox` — confirm `APIError`/`StreamError` shape and
  create-path behaviour against the installed SDK and current docs.
- `vercel:vercel-cli` — read-only `whoami`/`project inspect` and the one
  `env pull` refresh, verified from the installed CLI's `--help`.
- `deployment-pipeline-design` — the A → B → C gate ordering and
  stop-on-failure with no retry loop.
- `requesting-code-review` — independent review of stage A's diff and the
  stage C record.
- `receiving-code-review` — verify findings against source before acting.
- `caveman-commit` — the stage A commit and the stage C record commit.

No skill owns the Vercel usage dashboard; stage B is the user's read.

## A. Local diagnostics (no cloud calls)

### A.1 Safe provider-error shape — `scripts/vercel/build-scanner-snapshot.js`

Add a classifier next to `projectBuildFailure`, used only when a step's kind
is `provider_failed`. It may read **only** these, each inside its own
`try`/`catch` (a getter may throw), and never `message`, `stack`, `text`,
`cause` or any other property:

| output field      | source                                                                                            | allowed values                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `provider_error`  | `instanceof sdk.APIError` → `api_error`; `instanceof sdk.StreamError` → `stream_error`; `error.name` in {`AbortError`,`TimeoutError`} → `timeout`; `instanceof TypeError` → `transport`; else `other` | `api_error`, `stream_error`, `timeout`, `transport`, `other`; `null` when kind ≠ `provider_failed`        |
| `provider_status` | `api_error` only: `error.response.status`                                                         | integer 100–599, else `null`                                                                              |
| `provider_code`   | `api_error`: `error.json?.error?.code`; `stream_error`: `error.code`                              | string matching `/^[a-z][a-z0-9_]{0,59}$/`, else `null`                                                   |

- Guard each `instanceof` with `typeof sdk?.APIError === "function"` (and the
  same for `StreamError`) so test fakes without the classes classify as
  `other`/`transport`, never throw.
- `buildStep` needs the SDK classes: pass them in a module-level setter or a
  closure created inside `buildSnapshot(config, sdk, …)`. Do **not** read
  `sdk` from module scope in a way that changes how the CLI loads it at
  `:559`. The classification is captured at the moment `buildStep` wraps the
  raw error, stored in the existing `failures` WeakMap state, and the raw
  error is then dropped as today.
- `BuildError`s thrown directly (validation, command, `builder-delete`) carry
  the three fields as `null`.
- `projectBuildFailure()` emits `provider_error`, `provider_status`,
  `provider_code` after the existing four keys, defaulting to `null` for an
  unknown error. The standalone builder CLI's failure output gains the same
  fields; its suppression of raw errors is unchanged.
- **The `provider_code` path is a judgement**, recorded as such: Vercel API
  error bodies conventionally carry `{ error: { code, message } }`, but the
  SDK's `ErrorData` type is generic and 3.8.0 does not document it. The regex
  bounds what can leak to a short lower-snake identifier; the message is never
  read. If the execution session finds the SDK never populates `json` on
  create failures, keep the field (it is then always `null`) and say so.

### A.2 Receipt contract — `scripts/vercel/rebuild-scanner-cadence.js`

No code change is expected beyond what `projectBuildFailure` returns; verify
`:330` passes it through unchanged. Schema stays `schema_version: 1`: the
fields are additive, exist only inside `build_failure`, and only failed
receipts carry `build_failure`. Confirm `validateReceipt` in
`prepare-scanner-handoff.js` still rejects every failed receipt (the existing
assertion at spec `:1472-1474`), and that success/skip/simulation receipts
still have no `build_failure` (spec `:1490`).

### A.3 OIDC lifetime floor for the live producer

`OIDC_MIN_REMAINING_MS` (30 min) is less than the cadence watchdog (1800 s)
plus control calls, so a token can expire mid-run after `builder-create`.
Make the floor a parameter of the token check: keep 30 min for probes, and
require **75 min** for `rebuild-scanner-cadence.js` live mode and the
standalone builder (watchdog 30 min + snapshot/smoke/inspection margin; a
judgement). Dry-run/simulation is unaffected. The error text stays the
existing fixed "expires too soon; pull a fresh one with vercel env pull."

### A.4 Tests

In `build-scanner-snapshot.spec.js` and `rebuild-scanner-cadence.spec.js`:

1. Extend the scenario table's `deepEqual` to the seven-key `build_failure`.
2. `builder-create` with a fake `APIError` (`response.status` 429,
   `json.error.code` `"rate_limited"`, message and `text` containing
   `credential-canary`) → `api_error` / `429` / `rate_limited`, and the canary
   appears nowhere in the receipt, stdout, stderr or `error.stack`.
3. Same with status 402 + code `"payment_required"`, 401 + no json, 503 +
   code `"Bad Code!"` (→ `provider_code: null`), status `"429"` string
   (→ `provider_status: null`).
4. A `StreamError` with code `sandbox_stopped` → `stream_error` / `null` /
   `sandbox_stopped`.
5. `TypeError("fetch failed")` → `transport`; an error named `TimeoutError` →
   `timeout`; a plain object thrown → `other`.
6. An error whose `response` getter throws → `api_error` with status `null`,
   no crash, receipt still written.
7. A `command_failed`/`validation_failed` step → all three fields `null`.
8. Token check: 70 min remaining passes a probe but is refused by cadence
   live mode; 80 min passes both; dry-run with 70 min still simulates.

### A.5 Docs for stage A

- `infra/vercel/runbooks/managed-operations.md` §5: document the three new
  fields, their allowed values, and that they never certify cause, success or
  cleanup; note the 75-min live floor.
- `docs/vercel-deployment.md`: a "Scanner create diagnostics — Prompt 389"
  section; update the Resume-here scanner bullet's next gate.
- `docs/operations.md`: Prompt 389 record with the real check output.

### A.6 Checks, review, commit

Use the Node 24.21.0 launcher from "Resume here" (`node --version` inside
`npm run` must print `v24.21.0`). Run and quote:

```bash
node --test scripts/vercel/build-scanner-snapshot.spec.js \
  scripts/vercel/rebuild-scanner-cadence.spec.js \
  scripts/vercel/prepare-scanner-handoff.spec.js \
  scripts/vercel/probe-platform.spec.js
npm run lint
npm run typecheck
node scripts/vercel/rebuild-scanner-cadence.js --help
node scripts/vercel/rebuild-scanner-cadence.js --dry-run   # simulation, no build_failure
```

`npm run build` is not required (no workspace source changes); state that it
was skipped and why. Then `requesting-code-review` (BASE `4551988`, HEAD the
stage A commit candidate) with this prompt's §A as the requirement, evaluate
with `receiving-code-review`, fix, re-run the checks, and commit with
`caveman-commit` (e.g. `feat(ops): classify scanner provider failures`).
Stage A is complete and committed before stage B is asked.

## B. Owner allowance report (user, read-only)

1. Re-read the [Sandbox pricing](https://vercel.com/docs/sandbox/pricing)
   and Sandbox limits pages live (WebFetch) and record today's Hobby figures
   and the page dates; if they differ from the recorded ones, the live page
   wins and `docs/vercel-deployment.md` is corrected.
2. Ask the user, in one message, to open the Vercel dashboard for team
   `dgsloxx417's projects` → Usage (current Hobby period), and report for
   Sandbox: **Active CPU used / included**, **Sandbox creations used /
   included**, **Snapshot Storage used / 15 GB**, any **paused / limit
   reached** banner, the **period reset date**, and optionally the Sandbox
   tab's entry for the `2026-10-17T22:04Z` create attempt if one is shown.
   Snapshot Storage matters specifically: the baseline and the Prompt 386
   candidate are both retained, and creation pauses at quota.
3. Record exactly what the user reports as owner-reported (not measured).
4. **Stop conditions:** any Sandbox quota at or above its limit, a paused
   banner, or the user unable to see the figures → record, commit the
   record, and stop. Do not delete snapshots to free storage (retirement is
   out of scope and dependency-aware); name it as the next decision instead.

## C. At most one live rebuild

Only when B shows headroom on every figure, ask exactly:

`Sandbox usage shows headroom. Run the single scanner candidate rebuild now?`

On yes, follow `prompts/388-bounded-scanner-candidate-rebuild.md` §§1–4b
verbatim, with these differences:

- re-pull `preview.env` once and verify locally that the OIDC `exp` leaves
  ≥ 75 min (print only the `exp` timestamp and claim match booleans);
- custody directory `~/.config/acres/vercel-preview/prompt389-<UTC stamp>/`
  (0700, files 0600); never touch `prompt386-*` or `prompt388-*`;
- run the cadence producer from the stage A commit, so a failure carries the
  new `provider_error` / `provider_status` / `provider_code`;
- on **success**: offline handoff bundle only (388 §4a); no adoption;
- on **failure**: record the seven-key `build_failure` and its plain
  reading (e.g. `api_error`/429 = rate limited; 402 = plan/quota;
  401/403 = authorization; 5xx = provider; `transport` = client network),
  stating it as a reading of the classification, not a certified cause; post-
  run read-only inspection; stop. No retry.

Record stage C in `docs/operations.md` and `docs/vercel-deployment.md`,
update the memory file's scanner status line, review the record diff
(`requesting-code-review` / `receiving-code-review`), and commit with
`caveman-commit` (e.g. `docs(ops): record scanner rebuild 389`).

## Impact, non-goals and remaining gates

- Routes: none. No application, client, server or `vercel.json` change.
  Only `scripts/vercel/*` (builder, cadence token floor, specs) and docs.
- Non-goals: adoption into project env vars, deployment, application
  upload → scan proof, snapshot retirement or storage cleanup, cadence
  workflow dispatch, production/Cron, plan upgrade, Resend.
- Still open after this prompt even on success: preview adoption and deployed
  application proof (a later prompt), dependency-aware retirement/resource
  budget, hosted cadence, the production plan decision and all eleven launch
  sign-offs.
- Rollback: stage A is one revertable commit; the fields are additive and
  only on failed receipts. Stage C creates at most one retained snapshot,
  which expires on its own after 8 days.
