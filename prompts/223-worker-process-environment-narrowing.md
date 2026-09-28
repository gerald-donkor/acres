# 223 — worker process environment narrowing

## Scope and why this is next

Phase 12K is the earliest unfinished build phase. Prompts 219 and 220 scoped production Caddy, Next, API, and worker Compose environments, Prompt 221 separated the CSRF signing secret, and Prompt 222 bound Garage metrics to an authenticated scrape. However, a repository-verifiable least-privilege coupling remained: the worker process still required and received `SESSION_SECRET` and `CLIENT_ORIGIN` at boot because the shared `validateEnv` enforced them indiscriminately, even though the worker module graph has zero session, cookie, auth, CORS, or browser-origin consumers. Decouple `SESSION_SECRET` and `CLIENT_ORIGIN` from worker boot validation, remove both inputs from the production worker Compose service, update the independent `check-application-environment` validator to classify both as API-only and reject them if injected into the worker, and verify with focused unit and negative regression tests. This eliminates unnecessary secret and origin exposure from the background worker.

## Sources and baseline to inspect on approval

- Re-read `AGENTS.md` §§2–7 and 10; `docs/build-plan.md` §§13–14 and 22; `docs/launch-checklist.md` §6A Category 4; `docs/operations.md` Phase 12K; `docs/security.md` production topology and secret boundaries; `docs/backend.md` §6 environment table; `docs/skills.md`.
- Inspect `server/src/config/env.validation.ts`, `server/src/config/env.validation.spec.ts`, `server/src/config/config.module.ts`, `server/src/config/acres-config.service.ts`, `server/src/worker.ts`, `server/src/worker/worker.module.ts`, `infra/compose/docker-compose.production.example.yml`, `scripts/ops/check-application-environment.js`, and `scripts/ops/check-application-environment.spec.js`. Check `git status --short --branch`, the base SHA, and worktree diff; preserve unrelated changes.
- Verify that `WorkerModule` and its transitively imported modules (`IngestionModule`, `MetricsModule`, `OutboxModule`, `PrismaModule`, `QueueModule`, `ScannerModule`, `StorageModule`, `ReportsModule`) do not consume `AcresConfigService.sessionSecret` or `AcresConfigService.clientOrigin`.
- No visual surface is involved. The static design references, comp measurements, and breakpoint contract do not apply. The measurable contract is the exact set of environment key names required by API and worker, and the fail-closed rejection of browser/session secrets injected into the worker. Never log real or rendered secret values.

## Implementation contract

1. In `server/src/config/env.validation.ts`, update `validateEnv(raw: Record<string, unknown>, worker = false)`:
   - For the API (`!worker`), require `DATABASE_URL`, `CLIENT_ORIGIN`, `SESSION_SECRET`, and `CSRF_SECRET` in `missing`.
   - For the worker (`worker === true`), require only `DATABASE_URL` from the base required set. Do not require `CLIENT_ORIGIN`, `SESSION_SECRET`, or `CSRF_SECRET`. Default `clientOrigin`, `sessionSecret`, and `csrfSecret` to `''` when not provided.
   - Guard production `SESSION_SECRET` placeholder and minimum length checks with `if (!worker)`, so worker startup does not fail when `SESSION_SECRET` is absent.
   - Keep existing database, queue, storage, scanner, parser, and metrics validation intact for both processes.
2. In `server/src/config/env.validation.spec.ts`:
   - Add unit tests proving `validateEnv(workerEnv, true)` succeeds without `SESSION_SECRET`, `CLIENT_ORIGIN`, or `CSRF_SECRET` in both development and production.
   - Verify that `validateEnv(apiEnv, false)` still strictly requires `SESSION_SECRET`, `CLIENT_ORIGIN`, and `CSRF_SECRET`, rejecting missing or placeholder values in production.
3. In `infra/compose/docker-compose.production.example.yml`:
   - Remove `CLIENT_ORIGIN: ${CLIENT_ORIGIN:?inject CLIENT_ORIGIN}` and `SESSION_SECRET: ${SESSION_SECRET:?inject SESSION_SECRET}` from `services.worker.environment`.
   - Keep `services.api.environment` unchanged with its required `CLIENT_ORIGIN`, `SESSION_SECRET`, and `CSRF_SECRET` inputs.
4. In `scripts/ops/check-application-environment.js`:
   - Move `CLIENT_ORIGIN` and `SESSION_SECRET` from `SHARED` to `API_ONLY`.
   - Ensure the checker enforces that `api` requires both keys and `worker` rejects both keys as unexpected environment keys.
5. In `scripts/ops/check-application-environment.spec.js`:
   - Update tests to assert that `compose().services.api.environment` has `SESSION_SECRET` and `CLIENT_ORIGIN`, while `compose().services.worker.environment` does NOT have either key.
   - Add test cases verifying that `worker` rejects `SESSION_SECRET` and `CLIENT_ORIGIN` if injected.
6. In `docs/operations.md`, `docs/launch-checklist.md`, `docs/backend.md`, and `docs/security.md`:
   - Reconcile Category 4 and Phase 12K records: remove the stale note that worker requires `SESSION_SECRET` and `CLIENT_ORIGIN` due to common validator coupling.
   - Document that worker boot validation and Compose configuration now completely exclude `SESSION_SECRET`, `CLIENT_ORIGIN`, and `CSRF_SECRET`.
   - Note that existing production operators updating to this version can safely remove `CLIENT_ORIGIN` and `SESSION_SECRET` from their worker container definitions.

## Expected impact, limits, and rollback

- Background worker startup no longer depends on web/session credentials or origin configuration. The API runtime environment is unaffected.
- No database migrations, schemas, GraphQL schemas, REST routes, client UI, or queue job semantics are modified.
- Rollback restores the worker's Compose environment entries and validation checks. If rolled back, the worker would once again require session and origin configuration.

## Verification, review, and commit on approval

1. Run and quote actual outputs for:
   - `npm run ops:templates-test`
   - `npm run ops:templates`
   - `npm run ops:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `git diff --check`
   - Focused server tests: `npm run test --workspace=@acres/server -- src/config/env.validation.spec.ts`
2. Inspect the complete diff for unintended modifications or exposed values. Dispatch an independent reviewer subagent under `requesting-code-review` with requirements, `BASE_SHA`/`HEAD_SHA`, changed paths, and real check outputs.
3. Evaluate feedback under `receiving-code-review`, fix valid findings, rerun affected checks, and request follow-up review for material changes.
4. Update the owning documentation (`docs/launch-checklist.md`, `docs/operations.md`, `docs/backend.md`, `docs/security.md`).
5. Stage only scoped files, inspect the staged diff, and commit locally to `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `nestjs-best-practices` — preserve typed Nest configuration and process-specific validation boundaries.
- `secrets-management` — enforce least-privilege runtime injection by removing unneeded secrets from worker.
- `security-best-practices` — verify safe environment parsing and error reporting without value exposure.
- `security-threat-model` — reconcile the narrowed worker process attack surface.
- `deployment-pipeline-design` — ensure Compose templates and template verifiers stay in sync.
- `javascript-testing-patterns` — write comprehensive unit and negative regression tests.
- `requesting-code-review` — dispatch the required independent implementation review.
- `receiving-code-review` — verify and resolve review findings.
- `caveman-commit` — write the required local commit message after execution.
