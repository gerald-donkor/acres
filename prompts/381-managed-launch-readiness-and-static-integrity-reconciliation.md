# Prompt 381 — Managed launch readiness and static integrity reconciliation

## Scope and why this is next

Planning baseline: `83f841c` on `main`, 2026-10-16; working tree clean before
this prompt. Parent: Phase 12 managed-target amendment, approved Prompt 370,
ordered step 5 and step 7 ("Managed operations and launch evidence").

Prompts 370–380 implemented and verified all runtime, storage, scanning, outbox,
throttling, preview deployment, managed readiness schema, validator, operator handoff
templates, and branched launch drill orchestration:
- Private Blob browser upload adapter and presigned protocol (Prompt 371)
- Sandbox scanner container evaluation and snapshot verification (Prompts 372–373)
- Invocation-safe transactional outbox (Prompt 374)
- Queue-retention job reconciliation (Prompt 375)
- Protected managed outbox dispatch runner, after-commit kicks, and Cron function entrypoint (Prompt 376)
- Shared managed API throttling and sweep cleanup via PostgreSQL (Prompt 377)
- Services routing and first preview deployment on Vercel (`dpl_Hr9VwjL5jrA5vmsZfx7Qvi2R966b`) with all five hosted gates A–E passing (Prompt 378)
- Managed storage reconciliation (`reconcile-storage-objects.js --provider vercel-blob`), readiness schema discrimination (`infra/launch/readiness.schema.json`), fail-closed managed template (`infra/launch/readiness.vercel.example.json`), launch readiness validator (`scripts/ops/check-launch-readiness.js`), and managed operations runbook (Prompt 379)
- Managed operator handoff package template (`infra/launch/operator-handoff.vercel.example.md`), branched launch drill runner (`run-launch-drills.sh --target-architecture vercel-managed-production`), and dossier assembler support (`assemble-launch-dossier.js`) (Prompt 380)

With the drill runner and validator supporting `vercel-managed-production`, three
critical operational preflight and launch readiness gaps remain:

1. **Top-Level Launch Readiness Shell Orchestrator (`scripts/ops/launch-readiness.sh`)**:
   `scripts/ops/launch-readiness.sh` is the canonical top-level entrypoint invoked by operators
   and npm script `npm run ops:launch-readiness`. It currently:
   - Only supports `single-host-compose-caddy` without an explicit `--target-architecture` option.
   - Unconditionally runs `check-production-templates.sh` and `check-docker-runtime.sh` (which fails if Docker daemon is not running).
   - Fails to forward `--target-architecture` to `run-launch-drills.sh` when `--with-drills` is set.
   - Expects positional `[readiness.json]` defaulting to `infra/launch/readiness.example.json`.
   Reconcile `launch-readiness.sh` to accept `--target-architecture <arch>` (or `--target-arch <arch>`),
   `--record <path>`, and auto-detect target architecture from the provided readiness record.
   In `vercel-managed-production` mode, execute `scripts/vercel/check-vercel-config.js` and `scripts/ops/scan-secrets.sh`,
   safely omit `check-docker-runtime.sh` and `check-production-templates.sh`, forward `--target-architecture`
   to `run-launch-drills.sh`, and invoke `check-launch-readiness.js` with the managed record.

2. **Static Integrity Verification Reconciled for Managed Target (`scripts/ops/run-static-integrity-checks.js`)**:
   Stage 1 (`static_templates`) in `run-launch-drills.sh` invokes `run-static-integrity-checks.js`.
   Currently, `run-static-integrity-checks.js` has hardcoded checks:
   `CHECKS = [ 'production_templates', 'docker_runtime', 'secret_defaults' ]`.
   On a host without a Docker daemon or when running against the managed target, this fails Stage 1.
   Reconcile `run-static-integrity-checks.js` to accept `--target-architecture <arch>` (defaulting to
   `single-host-compose-caddy`):
   - For `vercel-managed-production`: execute `vercel_config` (`node scripts/vercel/check-vercel-config.js`)
     and `secret_defaults` (`scripts/ops/scan-secrets.sh`). Omit `production_templates` and `docker_runtime`.
   - Update `validateStaticEvidence` in `run-static-integrity-checks.js` and `assemble-launch-dossier.js`
     to validate receipts according to `target_architecture`.
   - Update `run-launch-drills.sh` Stage 1 to pass `--target-architecture "$TARGET_ARCHITECTURE"`
     to `run-static-integrity-checks.js`.

3. **Secret Scan Allowlist for Managed Secret Rotation Verifier (`scripts/ops/scan-secrets.sh`)**:
   Prompt 380 introduced `scripts/ops/verify-managed-secret-rotation.js` which verifies against
   development passwords, but `scripts/ops/scan-secrets.sh` currently fails because
   `verify-managed-secret-rotation.js` was not included in `is_allowed_path()`.
   Add `scripts/ops/verify-managed-secret-rotation.js` to `is_allowed_path()` in `scripts/ops/scan-secrets.sh`,
   and update `scripts/ops/scan-secrets.spec.js` to ensure `npm run ops:scan-secrets` and
   `npm run ops:scan-secrets-test` pass cleanly.

4. **Package Manifest and Documentation Updates**:
   - Add `"ops:launch-readiness:managed": "scripts/ops/launch-readiness.sh --target-architecture vercel-managed-production infra/launch/readiness.vercel.example.json"` to `package.json`.
   - Update `docs/launch-checklist.md`, `docs/operations.md`, `docs/vercel-deployment.md`, and `docs/build-plan.md`.

This prompt completes launch readiness preflight and static integrity tool reconciliation
for the Vercel-managed target. It authorizes no production deployment or launch sign-off.
Stop for phase-control approval before execution.

## References and verified interfaces

Read at execution:

- `AGENTS.md`, especially §§2, 2.1, 3, 5–10 and phase-control commands.
- `docs/build-plan.md` managed-target amendment, Prompt 370 §5, and Prompt 380 exit.
- `docs/vercel-deployment.md` "Target and gates", "Resume here", and Prompt 380 record.
- `docs/launch-checklist.md` "Selected managed profile — Prompt 370", 11 launch categories, and pre-flight prerequisites.
- `docs/operations.md` root scripts and launch-readiness contracts.
- `docs/operator-handoff.md` and `infra/launch/operator-handoff.vercel.example.md`.
- `infra/launch/readiness.schema.json` and `infra/launch/readiness.vercel.example.json`.
- `scripts/ops/launch-readiness.sh` and `scripts/ops/launch-readiness.spec.js`.
- `scripts/ops/run-static-integrity-checks.js` and `scripts/ops/run-static-integrity-checks.spec.js`.
- `scripts/ops/scan-secrets.sh` and `scripts/ops/scan-secrets.spec.js`.
- `scripts/ops/run-launch-drills.sh` and `scripts/ops/run-launch-drills.spec.js`.
- `scripts/ops/assemble-launch-dossier.js` and `scripts/ops/assemble-launch-dossier.spec.js`.
- `scripts/ops/check-launch-readiness.js` and `scripts/vercel/check-vercel-config.js`.

## SKILLS USED

- `architecture-patterns` — clean architectural discrimination between `single-host-compose-caddy` and `vercel-managed-production` in launch readiness preflights and static checks.
- `deployment-pipeline-design` — release gating, launch readiness verification, rollback preflight, and preflight orchestration.
- `secrets-management` — secret scanning rules, zero-secret tolerance, development credential detection, and path allowlisting.
- `security-threat-model` — fail-closed preflights, evidence verification, and defense-in-depth launch checks.
- `security-best-practices` — constant-time secret evaluation, strict argument parsing, sanitizing paths and subprocess outputs.
- `javascript-testing-patterns` — Node test runner (`node:test`, `node:assert/strict`) for subprocess orchestrator unit and contract tests.
- `requesting-code-review` — stage 1 code review subagent dispatch.
- `receiving-code-review` — stage 2 technical review evaluation and verification.
- `caveman-commit` — conventional commit formatting without AI trailers.

## Implementation sequence

### 1. Fix secret scanner allowlist (`scripts/ops/scan-secrets.sh`)

1. In `scripts/ops/scan-secrets.sh`:
   - Update `is_allowed_path()` to allow `scripts/ops/verify-managed-secret-rotation.js` alongside
     `scripts/ops/run-secret-rotation-drill.sh` and `scripts/ops/verify-volume-encryption.js`.
2. In `scripts/ops/scan-secrets.spec.js`:
   - Update test expectations to verify `scripts/ops/verify-managed-secret-rotation.js` is an allowed path.
   - Verify `npm run ops:scan-secrets` and `npm run ops:scan-secrets-test` pass cleanly.

### 2. Reconcile static integrity checks (`scripts/ops/run-static-integrity-checks.js`)

1. Update `scripts/ops/run-static-integrity-checks.js`:
   - Add CLI option `--target-architecture <arch>` (or `--target-arch <arch>`), defaulting to `single-host-compose-caddy`.
   - Define check profiles:
     * `single-host-compose-caddy`:
       `production_templates` (`scripts/ops/check-production-templates.sh`),
       `docker_runtime` (`scripts/ops/check-docker-runtime.sh`),
       `secret_defaults` (`scripts/ops/scan-secrets.sh`).
     * `vercel-managed-production`:
       `vercel_config` (`node scripts/vercel/check-vercel-config.js`),
       `secret_defaults` (`scripts/ops/scan-secrets.sh`).
   - Emit `target_architecture` in the evidence receipt.
   - Update `validateStaticEvidence(evidence, targetArchitecture)` to validate the receipt against the expected profile checks.
2. Update `scripts/ops/run-launch-drills.sh`:
   - In `stage_static()`, pass `--target-architecture "$TARGET_ARCHITECTURE"` to `run-static-integrity-checks.js`.
3. Update `scripts/ops/assemble-launch-dossier.js`:
   - Pass `targetArchitecture` to `validateStaticEvidence` when evaluating `static_templates` stage.
4. Update `scripts/ops/run-static-integrity-checks.spec.js`:
   - Add unit tests verifying `--target-architecture vercel-managed-production` executes `vercel_config` and `secret_defaults` without running `docker_runtime`.
   - Verify `validateStaticEvidence` validates managed static evidence.
   - Assert `single-host-compose-caddy` test cases continue to pass 100%.

### 3. Reconcile launch readiness orchestrator (`scripts/ops/launch-readiness.sh`)

1. Add CLI options:
   - `--target-architecture <arch>` or `--target-arch <arch>` (accepting `single-host-compose-caddy` and `vercel-managed-production`).
   - `--record <path>` or positional `[readiness.json]`.
   - Reject duplicate options, blank values, unknown flags, and extra positional arguments fail-closed.
2. Architecture auto-detection:
   - If `--target-architecture` is not explicitly passed, inspect the target readiness JSON file (if it exists):
     read `target_architecture` field. If present and valid, use it; otherwise default to `single-host-compose-caddy`.
   - If no custom file is specified and no architecture is specified, default to `single-host-compose-caddy` with `infra/launch/readiness.example.json`.
3. Execution sequence:
   - In `single-host-compose-caddy` mode:
     * Run `scripts/ops/check-production-templates.sh`
     * Run `scripts/ops/scan-secrets.sh`
     * Run `scripts/ops/check-docker-runtime.sh`
     * Run `node --test scripts/ops/check-launch-readiness.spec.js`
     * If `--with-drills` is set: run `scripts/ops/run-launch-drills.sh --dry-run`
     * Run `node scripts/ops/check-launch-readiness.js "$READINESS_FILE"`
   - In `vercel-managed-production` mode:
     * Run `node scripts/vercel/check-vercel-config.js`
     * Run `scripts/ops/scan-secrets.sh`
     * Run `node --test scripts/ops/check-launch-readiness.spec.js`
     * If `--with-drills` is set: run `scripts/ops/run-launch-drills.sh --dry-run --target-architecture vercel-managed-production`
     * Run `node scripts/ops/check-launch-readiness.js --record "$READINESS_FILE"`
4. Update `scripts/ops/launch-readiness.spec.js`:
   - Unit tests covering CLI argument parsing (`--target-architecture`, `--target-arch`, `--record`, attached values).
   - Tests covering fail-closed preflight order for both architectures.
   - Tests covering drill execution with architecture flag forwarding.
   - Tests covering auto-detection of architecture from readiness record.
   - Preserving 100% of existing tests.

### 4. Package scripts and documentation updates

1. In `package.json`:
   - Add `"ops:launch-readiness:managed": "scripts/ops/launch-readiness.sh --target-architecture vercel-managed-production infra/launch/readiness.vercel.example.json"`.
2. Update `docs/launch-checklist.md`:
   - Document preflight commands for both `single-host-compose-caddy` and `vercel-managed-production`.
3. Update `docs/operations.md`, `docs/vercel-deployment.md`, and `docs/build-plan.md`.

### 5. Review, documentation, and local commit

1. Self-verify all changes, run `npm run ops:scan-secrets`, `npm run ops:scan-secrets-test`, `npm run ops:launch-readiness-test`, `npm run ops:launch-drill-test`, and `npm run ops:check`.
2. Dispatch independent read-only reviewer via `requesting-code-review` subagent.
3. Evaluate reviewer feedback with `receiving-code-review`.
4. Update `docs/vercel-deployment.md`, `docs/launch-checklist.md`, `docs/operations.md`, and `docs/build-plan.md`.
5. Commit locally to `main` using `caveman-commit`. Do not push.

## Acceptance criteria

- `scripts/ops/scan-secrets.sh` allowlists `scripts/ops/verify-managed-secret-rotation.js`, and `npm run ops:scan-secrets` and `npm run ops:scan-secrets-test` pass with 0 errors.
- `scripts/ops/run-static-integrity-checks.js` supports `--target-architecture vercel-managed-production`, running `vercel_config` and `secret_defaults` while omitting Docker runtime and Compose templates.
- `scripts/ops/launch-readiness.sh` accepts `--target-architecture` (and `--record`), executes managed preflights, forwards target architecture to unified drills, and passes the readiness record to the validator.
- `scripts/ops/launch-readiness.spec.js` and `scripts/ops/run-static-integrity-checks.spec.js` pass with 100% coverage across both topologies.
- `npm run ops:check` passes all checks in CI/preflight.
- Reference `single-host-compose-caddy` behavior remains 100% backward compatible.

## Verification

Execute with Node 24:

```bash
npm run ops:scan-secrets
npm run ops:scan-secrets-test
npm run ops:launch-readiness-test
npm run ops:launch-drill-test
node --test scripts/ops/run-static-integrity-checks.spec.js
bash scripts/ops/launch-readiness.sh --help
bash scripts/ops/launch-readiness.sh --target-architecture vercel-managed-production infra/launch/readiness.vercel.example.json
npm run ops:check
npm run lint
npm run typecheck
git diff --check
```

## Non-goals, impact and rollback

- Non-goals: No production promotion; no paid tier upgrades; no custom domain assignment; no mock passes; no alteration of existing Compose+Caddy tests or fixtures; no bypass of fail-closed launch readiness blockers.
- Impact: Reconciles the top-level launch readiness orchestrator (`launch-readiness.sh`), static integrity checker (`run-static-integrity-checks.js`), and secret scanner (`scan-secrets.sh`) to support both `single-host-compose-caddy` and `vercel-managed-production`.
- Rollback: Revert changes to `scripts/ops/` and `package.json`.

## Review and completion

Dispatch an independent reviewer subagent with baseline/HEAD identities, prompt, all changes, schema, and verification evidence. Evaluate feedback with technical rigor using `receiving-code-review`. Record results in `docs/vercel-deployment.md`, update `docs/build-plan.md`, and commit to `main` using `caveman-commit`.
