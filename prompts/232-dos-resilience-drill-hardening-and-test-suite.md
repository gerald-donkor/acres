# 232 — DoS resilience drill hardening and automated test suite

## Scope and why this is next

Phase 12K remains open at committed `c111c85db53e0aaa40a44ab9f8d7581a5d6dbd85` on `main`. The worktree was clean at planning intake. Deployment, rotation, and restore drill hardening are committed; operator-owned production evidence and eleven-category sign-off remain outstanding. The next dependency-safe repository step is the Stage 6 DoS child runner and its immediate capacity-alerting consumer. Harden these tools and test them without live traffic; do not approve launch.

Observed in `scripts/ops/run-dos-resilience-drill.sh`: `--dry-run` still invokes curl against `/health`; an unreachable live target silently falls back to static success; zero HTTP 429 responses only print a warning; login requests lack the globally required CSRF cookie/header; burst and post-burst requests have no timeout; malformed option values are consumed without validation. The report lacks a target identity and response counts. Its parent currently accepts `dosData.status === "success"` without checking mode, target, failures, or layer results. These are code findings, not claims about production behavior.

## Authorities and references

- `AGENTS.md` §§2–7 and 8–10, including phase control and mandatory independent review and local commit.
- `docs/build-plan.md` Phase 12 and §22; `docs/operations.md` Phase 12J/12K and prompts 194/202; `docs/launch-checklist.md` Category 5, targeted drill procedure, and operator authorization boundary.
- `docs/security.md` operational boundary and TM-04/TM-05/TM-20; `docs/system-architecture.md` binding principles and operations boundary; `docs/backend.md` auth/CSRF and response envelope contract; `docs/skills.md` skill selection contract.
- `scripts/ops/run-dos-resilience-drill.sh`, `scripts/ops/run-capacity-alerting-drill.sh`, `scripts/ops/run-launch-drills.sh`, `scripts/ops/run-launch-drills.spec.js`, `scripts/ops/launch-target-evidence.js`, `scripts/ops/check-launch-readiness.js`, `scripts/ops/check-production-templates.sh`, `scripts/ops/run-deployment-drill.spec.js`, and root `package.json`.
- Verified server source: `server/src/app.setup.ts`, `server/src/auth/auth.controller.ts`, `server/src/security/csrf.service.ts`, and `server/src/security/rate-limit.guard.ts`. Re-read the exception filter, CSRF service, DTO, and health controller at execution before implementing response checks.
- No visual surface changes; design comps and geometry measurements do not apply. The existing burst is 15 sequential requests; retain that bounded count. The current static limits are repository assertions, not live measurements. Verify current source before printing any limit. Choose curl connect timeout 2 seconds and total request timeout 5 seconds as operational judgments, not measured production values; document them. Do not increase burst size or retry indefinitely to obtain a passing result.

## Implementation plan

### 1. Validate CLI inputs before side effects

In `scripts/ops/run-dos-resilience-drill.sh`, preserve help and the existing option names. Reject missing, empty, or flag-like values for `--evidence-dir`, `--evidence-file`, and `--api-url` with option-specific errors; reject unknown flags. Validate `API_URL` from either CLI or environment with the existing `safeUrl` helper and require an HTTP(S) origin with pathname `/`, no credentials, query, fragment, or control characters. Normalize the origin once so a trailing slash does not produce double slashes. Reject rather than echo unsafe input, and do not leak private origins in evidence or diagnostic output. Use argument vectors and quoting; no eval, shell-built commands, or credential interpolation into JavaScript source.

`--help` must require neither network access nor output directories. `--dry-run` must perform zero curl/network requests, including health checks. Retain the current local default origin for compatibility, but document that an invocation without `--dry-run` is a live exercise. Implementation approval does not authorize an unstubbed live exercise.

### 2. Separate static checks from observed live results

Retain the existing five repository checks and make missing files/patterns fail explicitly. Do not turn a static pattern check into a claim that live Caddy, GraphQL, ClamAV, or constant-time behavior was measured. Remove unconditional success messages about unchecked files. Keep report layer names used by existing consumers.

Dry-run evidence uses `mode: "simulated"`, null target identity, and a skipped live burst (`burstTestMode: "skipped"`, `passed: null`, all observed counters zero). Its overall status can be success when all static checks pass, but output must call this an offline repository check and state live rate limiting was not exercised. A non-dry invocation uses `mode: "live"`; it must never fall back to simulated success.

### 3. Exercise the existing authentication contract

Use a unique private temporary directory with restrictive permissions for response bodies and the cookie jar; clean it on normal exit, error, and catchable signals. Never persist or log CSRF tokens, cookies, raw response bodies, or session values in evidence. Do not consume a real user account or operator session. Retain the current synthetic invalid login identity/password and never attempt registration.

Before the burst, require a bounded, successful `/health` probe with the actual Acres API envelope. Fetch `GET /api/v1/auth/csrf` with the same curl cookie jar that subsequent POSTs use. Require HTTP 200, `ok: true`, a nonempty `data.csrfToken`, and `data.headerName === "x-csrf-token"`; refuse malformed or contradictory receipts. Send the token header and paired cookie with the existing invalid login payload. Follow the server contract rather than bypassing CSRF. Do not follow redirects or disable TLS verification. Disable ambient curl config if supported by the verified local curl interface so it cannot add redirects, credentials, or unexpected targets. Keep ephemeral token-bearing request configuration private.

Every curl invocation must have explicit connection and overall time bounds. A transport error, timeout, HTTP 000, malformed status, redirect, HTTP 2xx login, unexpected 403/404/5xx, or invalid envelope fails the run. Expected invalid-login responses must match the actual server error code (verify from source); HTTP 400 is not automatically evidence of a correct auth attempt. Require at least one HTTP 429 with the Acres `RATE_LIMITED` error envelope, rather than counting an arbitrary upstream 429 page. Record only bounded counters and codes; stop immediately on unexpected responses instead of continuing a harmful or misdirected exercise. Finish with a bounded successful Acres `/health` probe; failure means failed resilience evidence.

Preserve the fixed maximum of 15 sequential POSTs. Do not adaptively increase traffic when thresholds differ. If that bound produces no validated 429, exit nonzero and describe the bounded observation without claiming the limiter is universally broken. This drill tests the login throttle and health probe only; it does not prove all five live protection layers or sustained DoS capacity.

### 4. Publish truthful, atomic evidence

Preserve existing `timestamp`, `durationMs`, `status`, `mode`, `layers`, and `failures` fields. Add `drill_type: "dos_resilience_drill"` and `apiTargetId`, computed using `targetId(normalizedOrigin)` in live mode and null in offline mode. Preserve `layer6_rate_limiter_burst.burstTestMode` and add `attemptedRequests`, `throttledRequests`, `authRejectedRequests`, `unexpectedResponses`, `transportFailures`, `preHealthPassed`, `csrfHandshakePassed`, and `postHealthPassed`. All counters must be nonnegative safe integers, never exceed 15, and reflect requests actually attempted. Successful live runs require positive attempts and throttled count, expected response totals equal attempted requests, zero unexpected/transport failures, and all three probe/handshake booleans true. Failed runs cannot claim a passing burst.

Write valid JSON through Node serialization and atomic publication in the destination directory. Ensure default evidence names cannot collide during same-second concurrent runs while preserving the discoverable `dos-resilience-evidence-` prefix. Fail nonzero on write failure. An interrupted or unsuccessful run must not leave a partial or stale success artifact that its caller accepts. Custom paths containing spaces and quotes must work. Use generic safe failure labels rather than response content or secret-bearing exception text.

### 5. Validate the child at the immediate consumer

In `scripts/ops/run-capacity-alerting-drill.sh`, allocate a unique owned temporary child evidence path and clean it on all exits. Keep the fixed API target and dry-run arguments forwarded as an argument vector. Bound child JSON reads using the existing helper. Add a narrow reusable validator in `scripts/ops/launch-target-evidence.js` (and tests in its existing `launch-target-evidence.spec.js` if present; otherwise create that spec explicitly).

Validate report type, successful status, empty failures, all five static layer results, counters, duration, a real UTC timestamp within this invocation, and the mode-specific burst contract above. In live mode require the expected hashed API origin and actual live passing burst. In dry mode require simulated/skipped mode and no observed network counts. Missing, malformed, oversized, failed, stale, contradictory, or mismatched evidence must set `summary.dosResilience: "failed"`, append a safe failure reason, and fail the parent even if the child exited zero. A nonzero child exit must remain failure even if it wrote a valid-looking success file. Update parent success output to distinguish static checks from the bounded live throttle observation.

Preserve the aggregate evidence shape consumed by `run-launch-drills.sh` and Category 5. Do not loosen database telemetry, capacity, or alert gates to make tests pass. This prompt fixes the producer and its immediate consumer; a broader readiness schema redesign is out of scope. Independent operator inspection and approval remain mandatory.

### 6. Add isolated process tests and wire the gate

Create `scripts/ops/run-dos-resilience-drill.spec.js` using Node `node:test` and `assert`, with a private temporary PATH containing a curl stub. Run the real Bash script. Record curl argument vectors without printing tokens and emulate cookie receipt, status/body responses, transport failures, and timeouts. The stub must never delegate to real curl. Use an isolated repository fixture for missing/pattern-failing static files rather than mutating tracked source. No test may contact the real local or production API.

Cover help, unknown flags, every malformed value form, invalid CLI/environment origins, normalization, zero curl calls in dry-run, correct skipped evidence, unreachable live API, wrong health envelope, failed/malformed CSRF receipt, cookie/token propagation, positive live throttle, zero 429, wrong 429 body, unexpected login success/403/5xx, transport failures, failed final probe, bounded count and timeout flags, output write failure, custom paths, cleanup, and no successful artifact on failures. Assert tokens/cookies/origin do not appear in logs or evidence.

Create `scripts/ops/run-capacity-alerting-drill.spec.js` for the child-consumer contract using an isolated fixture with stubbed children. Test valid offline and live child evidence, mismatch, skipped burst in a live run, failed child exit with success JSON, zero exit with failed JSON, missing/malformed/oversized/stale JSON, inconsistent counters, and concurrent temporary-file ownership. Stub capacity/alert outputs and fresh database telemetry where needed without representing them as production evidence. Validate both parent exit and `summary.dosResilience`/failure fields.

Add root `ops:dos-test` and `ops:capacity-alerting-test` scripts, and include both in `ops:check`. Include the helper spec in the appropriate existing helper test invocation, or add an explicit invocation to one of these scripts if no root helper script exists. Require new files in `check-production-templates.sh`. Do not install a test framework or introduce arbitrary test-only flags into production scripts.

## File scope, impact, and non-goals

Expected changes: the two Bash runners, `launch-target-evidence.js` and its focused spec, the two new runner specs, root `package.json`, `check-production-templates.sh`, `docs/operations.md`, and `docs/launch-checklist.md`. Update `docs/security.md` narrowly to record TM-04/TM-05/TM-20 evidence limitations if existing claims overstate this drill. Change launch runner tests only if the updated child contract requires fixture corrections; do not weaken assertions. Verify every optional existing path before editing it.

There are no HTTP route, UI, auth implementation, database, infrastructure topology, alert rule, or threshold changes. No production traffic, live bursts, deployment, secret changes, launch approval, or operator-record edits are authorized. Leave the unresolved readiness example unresolved. No new architecture decision or full threat-model report is required: this changes validation of an existing CLI evidence boundary. No skill specifically covers Bash CLI hardening; verify shell/curl interfaces locally and rely on executable process tests rather than guessed flags. The security skill supplies general guidance and supported JavaScript review, not a claim of Bash-specific coverage.

Rollback is a revert of this implementation commit. No durable API state is created by the drill; a later separately authorized live burst may affect the caller's throttle bucket and logs, which the operator must account for in the approved window.

## Verification and completion

1. Run Bash syntax checks for both changed runners and `check-production-templates.sh`; run the new `ops:dos-test` and `ops:capacity-alerting-test` plus focused helper tests. Quote actual output and counts.
2. Run `npm run ops:templates`, `npm run ops:capacity-test`, `npm run ops:alert-test`, `npm run ops:launch-drill-test`, and `npm run ops:check`. A dry capacity-alerting run may be executed only after proving its entire path is offline; place generated evidence in `/tmp`. Never execute an unstubbed non-dry drill during this task.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`. Format changed JS/Markdown consistently with the repository; inspect available formatting tooling before naming a formatter command. Inspect the full diff for scope and secrets. Report blocked checks and actual errors without treating them as passes.
4. Confirm the checked-in readiness example continues to fail closed. Do not classify that expected rejection as an implementation regression or fabricate a production pass.
5. Follow `AGENTS.md` §2.1: self-verify, dispatch an independent reviewer subagent with this prompt, base SHA, working-tree diff, scope and real outputs; load `receiving-code-review`, verify findings, fix valid issues, and re-review significant changes. Reviewer delegation is explicitly required at execution by the project workflow.
6. Record observed behavior and checks in the two owning operations docs, including the limits of static verification and operator-only live authorization. Commit all approved work and this prompt to local `main` with `caveman-commit`. Do not push. Provide exact safe inspection commands: the two new test scripts and the offline DoS invocation with an evidence path in `/tmp`.

## SKILLS USED

- `deployment-pipeline-design` — preserve fail-closed operational evidence gates and distinguish rehearsal from live verification.
- `error-handling-patterns` — make transport, process, validation, cleanup, and evidence-publication failures explicit.
- `javascript-testing-patterns` — design isolated Node process tests and evidence-contract cases.
- `auth-implementation-patterns` — honor the verified existing CSRF cookie/header handshake in the CLI client.
- `security-best-practices` — review supported JavaScript input/evidence handling and avoid credential leakage; no Bash-specific guidance is supplied.
- `security-threat-model` — ground the narrow evidence-boundary update and its limitations in the existing TM-04/TM-05/TM-20 model; no new full report.
- `requesting-code-review` — prepare and dispatch mandatory independent implementation review.
- `receiving-code-review` — verify feedback before applying fixes.
- `caveman-commit` — prepare the required local implementation commit message.
