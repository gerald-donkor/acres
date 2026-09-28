# 225 — authenticate the production Valkey healthcheck

## Scope and why this is next

Phase 12K is the earliest unfinished phase. At `935848e07eef178a5629d24af2262e2f4359b043` on `main`, the production Compose template scopes every service environment explicitly, but the `valkey` service has a broken readiness dependency: its command receives `${VALKEY_PASSWORD:?inject Valkey password}` as an argument, while its healthcheck executes `valkey-cli -a "$${VALKEY_PASSWORD}" ping | grep PONG` inside the container without a `VALKEY_PASSWORD` environment entry. Compose interpolation of the server command does not create a container environment variable. Once Valkey requires authentication, the probe cannot authenticate; `api` and `worker` both wait for `valkey: service_healthy`.

Fix this one deployment-template defect before attempting prompt 201's operator launch evidence and sign-off. This is a dependency-safe Phase 12K remediation, not evidence that any production Valkey instance is running or healthy. The checked-in launch readiness example remains unresolved.

## Authorities and verified references

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13–14 and 22, `docs/operations.md` Phase 12I/12K and production template notes, `docs/launch-checklist.md` §§2, 3 Category 4, and 6A, `docs/security.md` production container and secret boundaries, and `docs/skills.md`.
- Inspect `infra/compose/docker-compose.production.example.yml` (Valkey command, healthcheck, `api`/`worker` dependencies), `infra/env/production.env.example` (`VALKEY_PASSWORD` and `VALKEY_URL` placeholders), `scripts/ops/verify-container-security.js` and `.spec.js`, `scripts/ops/check-production-templates.sh`, and `package.json` operations scripts before editing.
- No static visual reference, crop, pixel measurement, breakpoint behavior, UI route, or design token applies. The executable contract is: one mandatory injected Valkey password; the same value available to the Valkey server and its in-container authenticated probe; an exact `PONG` success; a failing probe on bad/missing authentication; and no new exposure to other services or public ports.
- Verify Compose interpolation and escaping with the installed Docker Compose CLI rather than relying on remembered syntax. Its locally observed version during prompt preparation was `5.5.1`; recheck at execution. The current YAML uses `$${VALKEY_PASSWORD}` to defer expansion to the probe shell.

## Implementation plan

1. In `infra/compose/docker-compose.production.example.yml`, add an explicit `valkey.environment.VALKEY_PASSWORD: ${VALKEY_PASSWORD:?inject Valkey password}`. Keep `--requirepass` mapped to that same mandatory interpolation. Keep the secret scoped to the Valkey service and the existing API/worker `VALKEY_URL` connection values; do not introduce an `env_file` or `NEXT_PUBLIC_` value. Preserve private networking, encrypted mount and dependency wiring.
2. Keep the probe's escaped shell variable so Docker Compose does not substitute it on the host. Make the success check exact (`PONG` as a whole line) and ensure a missing or wrong password produces a nonzero healthcheck status. Do not print the password in test output, documentation, logs, or a generated artifact. Do not put the interpolated plaintext password directly in the healthcheck command, where it would become part of the Compose service definition.
3. Extend the existing parsed-Compose validation in `scripts/ops/verify-container-security.js` with a named Valkey authentication-healthcheck check. Require a mandatory injected `VALKEY_PASSWORD` in the Valkey environment, require the server command to use the same placeholder, require the healthcheck to read the in-container variable and assert `PONG`, and reject any unbound or mismatched variant. Keep validation narrow to the production Valkey service; do not redesign generic Compose secret handling.
4. Add focused mutation tests in `scripts/ops/verify-container-security.spec.js` using the existing `validateComposeConfig`/fixture style. Cover the valid production template and at least these regressions: remove `valkey.environment.VALKEY_PASSWORD`, change the healthcheck to an unbound variable, and point the server command at a different password source. Assert the named check fails with actionable diagnostics. Do not add tests that merely mirror implementation details if the existing validator already proves the behavior.
5. Update `docs/operations.md` with the precise template fix, verification performed, and the remaining live-runtime uncertainty. Update `docs/launch-checklist.md` Category 4 or §6A only if its operator instructions need the explicit Valkey probe requirement; do not rewrite the eleven-category matrix or change any readiness status. Update `docs/security.md` only if its current secret-boundary description needs correction.

## Verification and acceptance

1. Run `docker compose version`; render the production Compose template with a **synthetic** `VALKEY_PASSWORD` and all other required placeholders through the existing example env file. Inspect only the Valkey environment **key names**, command/healthcheck structure, and escaped variable binding. Suppress or redact rendered secret values; never paste full `docker compose config` output into the review or docs. Confirm the healthcheck still contains the container-shell variable while the service environment contains the injected password.
2. Run `npm run ops:container-test`, `npm run ops:container-security`, `npm run ops:templates`, `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`. Quote the real output and resolve actual failures. `npm run ops:check` includes the container test and security validator; the focused run helps isolate this regression.
3. If a local Docker daemon and the pinned Valkey image are available without changing a production target, run a disposable synthetic-password Valkey probe to show `healthy` with the correct password and nonzero status with a wrong password. If unavailable, report the runtime check as unverified and retain the static/rendered checks; never claim production runtime evidence from a local container.
4. Run the checked-in launch readiness validator only to confirm the example still fails closed. Do not edit `infra/launch/readiness.example.json`, approve Category 4, or count this probe as a live secret rotation or launch sign-off.
5. Inspect the full diff and secret scan. Request independent review using `requesting-code-review` with base/head SHAs, requirements, changed files and exact check output. Evaluate findings through `receiving-code-review`, fix verified defects, rerun affected checks, and request follow-up review if the fix changes service behavior or the validator contract materially. Stage only scoped files, inspect the staged diff, and commit locally on `main` using `caveman-commit`. Do not push.

## Expected impact, limits and rollback

- Expected behavior: a production Valkey container receives its mandatory password as an explicit environment entry, so its own authenticated healthcheck can become healthy and unblock the API and worker after the server is ready. This adds an environment representation of a secret already present in Valkey's command argument. Operator review should confirm their runtime secret-injection and container-inspection permissions are consistent with that existing exposure.
- No database schema, API, client route, worker logic, Valkey password value, rotation cadence, production deployment, or launch decision changes here. No real credential is needed for repository verification.
- A negative authenticated probe or an unavailable Docker daemon remains a reported limit, not a success. Rollback is a scoped revert of this template/validator/docs commit; that restores the previous readiness failure, so deployment operators must retain the fixed version before relying on `service_healthy`.

## SKILLS USED

- `deployment-pipeline-design` — specify the service health gate and its effect on API/worker startup.
- `secrets-management` — keep the injected Valkey credential scoped and absent from artifacts and logs.
- `javascript-testing-patterns` — create meaningful parsed-Compose regression cases in the Node test suite.
- `requesting-code-review` — dispatch an independent review of the implementation and evidence.
- `receiving-code-review` — verify review findings against the Compose contract before applying fixes.
- `caveman-commit` — write the required concise local commit message after review.
