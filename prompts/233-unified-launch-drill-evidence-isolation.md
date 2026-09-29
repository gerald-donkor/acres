# Phase 12K follow-up — isolate unified launch drill evidence

## Scope and why this is next

Harden `scripts/ops/run-launch-drills.sh` so each invocation consumes only its own child receipts, validates them before reporting stage success, and publishes a complete dossier atomically. Replace the launch runner's infrastructure-dependent process tests with isolated fixtures that exercise the real runner without network, databases, storage, dependency audits, or tracked-file mutation.

This is a dependency-safe unit within Phase 12 (`docs/build-plan.md` §13), not a new phase or production launch approval. The clean planning baseline is `d8bca12` on `main`: commits `cf0b906`, `515b16a`, `c111c85`, and `d8bca12` implement the deployment, rotation, restore, and DoS child hardening. Their code and git history prove the dependencies; prompt filenames do not. Re-establish status and baseline SHA at execution.

Observed gaps in the current runner:

- `run_stage` discovers artifacts by comparing directory listings before and after each stage. Other concurrent writers can supply those files; repeated runs overwrite fixed `launch-drill-stage-<id>.log` names.
- Default dossier and several child names have only second-resolution stamps. Aggregation selects several receipts with the first substring match rather than an invocation-owned exact path.
- Inline aggregation uses unbounded `fs.readFileSync` and silently catches parsing errors. Some invalid baselines set compliance failure without changing their stage status, allowing a contradictory overall success.
- The final dossier is written directly to its public destination, and an old custom output may remain readable if a subsequent run terminates before publication.
- `run-launch-drills.spec.js` runs real children and cleans repository `backups/` files by time/directory difference. Its behavior depends on infrastructure and can delete another run's outputs. Do not retain that cleanup approach.

## References read and required execution inspection

Planning read: `AGENTS.md` (especially §§2, 5–10), `docs/build-plan.md` §13 and sequence gates, `docs/skills.md`, the unified-launch and prompt-232 sections of `docs/operations.md`, the checklist's preflight, dossier contract, and operator gates in `docs/launch-checklist.md`, and the boundary/principle sections of `docs/security.md` and `docs/system-architecture.md`.

Code inspected: root `package.json`; `scripts/ops/run-launch-drills.sh`; `scripts/ops/run-launch-drills.spec.js`; `scripts/ops/launch-target-evidence.js`; the dossier assertions in `scripts/ops/check-production-templates.sh`; the output/CLI paths of `run-capacity-alerting-drill.sh`, `run-restore-drill.sh`, `run-secret-rotation-drill.sh`, `run-static-integrity-checks.js`, `generate-sbom.js`, `verify-volume-encryption.js`, and `reconcile-storage-objects.js` under `scripts/ops/`.

Before editing, re-read those surfaces and inspect the remaining child output contracts and the dossier consumer in `scripts/ops/check-launch-readiness.js` with its spec. Verify CLI flags from actual child source, not assumptions. Verify Node filesystem/process interfaces from installed documentation/types or local executable probes, and Bash/mktemp interfaces locally. No skill provides Bash-specific CLI hardening guidance; the process tests are required evidence for it.

This task changes no visual surface, component, route, or Next API. Design comps, pixel measurement, browser automation, and Next/Tailwind/shadcn API changes are not applicable. There are no comp deltas or breakpoint changes. Numeric filesystem bounds below are engineering choices, not measured production limits.

## Implementation plan

### 1. Validate input and allocate an invocation-owned artifact tree

Preserve existing public flags and the seven ordered stage IDs. Reject missing, empty, flag-like values (including single-dash forms), control characters, unknown options, and existing live/dry conflicts before launching any child. Help must remain side-effect-free. Keep errors generic where the argument could contain target credentials or sensitive content. Preserve URL normalization and target hashing conventions: the aggregate API hash uses normalized URL `href`, whereas the DoS child uses `origin`.

Create a unique private run directory under `--evidence-dir` using exclusive directory creation, with private per-stage subdirectories. A suitable layout is `<evidence-dir>/launch-drill-run-<unique-id>/<stage-id>/`; choose names with a UUID or equivalent collision-resistant primitive verified locally. Set restrictive permissions on newly created directories/logs/evidence without chmodding an existing operator-owned parent. Validate symlink/non-directory destinations and fail clearly rather than redirecting evidence unexpectedly.

Keep the default final dossier directly under the selected evidence directory with prefix `launch-evidence-dossier-`, adding the unique invocation suffix to its existing timestamp. Preserve `--output` as the exact requested dossier destination. Logs may keep their established basename inside the unique stage directory. Store resolved paths in artifacts so they remain inspectable after the command exits. Normal stage failures retain private logs and evidence for diagnosis; remove only owned temporary files on exit/interruption. Do not recursively delete retained evidence or sweep the shared directory.

Remove before/after `ls`/`comm` discovery. Explicitly allocate and pass each expected receipt path through the child's verified `--output`, `--evidence-file`, or equivalent flag. Known receipts: static integrity; SBOM, SAST, container security; Caddy and deployment; volume encryption; secret rotation; capacity-alerting aggregate; restore and reconciliation. Child intermediate outputs may remain in their private stage directory but must not become selected receipts through directory discovery. Never add unexpected files to the dossier simply because their names match a prefix.

Use argument arrays and keep stage functions sequential. Preserve all child mode/target forwarding. Secret rotation remains `--dry-run` in every parent mode; reconciliation remains read-only. Do not introduce production credential mutation, deployment commands, target traffic, or a new bypass flag. Do not alter restore database naming/ownership behavior incidentally.

### 2. Bound receipt loading and make validation failures stage failures

Extract the inline dossier assembly into a new focused CommonJS module `scripts/ops/assemble-launch-dossier.js` if that makes the contracts directly testable; create `scripts/ops/assemble-launch-dossier.spec.js` alongside it. Keep Bash as the public runner. Do not duplicate receipt interpretation between the module and shell. The module may accept a small private manifest with exact receipt paths, child/stage exits and start/end timestamps, and selected targets. It must not execute children or discover artifacts.

Read only the exact registered receipts inside their owned stage directory. Reject symlinks, paths escaping that directory, directories, FIFOs, missing files, malformed JSON, and oversized or changing files without blocking indefinitely. Bound actual bytes read, not only a pre-read stat. Reuse existing helpers where their limits and semantics fit; do not increase the established 64 KiB telemetry/DoS limits. For larger dossier children choose and document explicit limits: an initial 16 MiB SBOM ceiling and 1 MiB ceiling for other child reports are design choices. Check representative serialized outputs/fixtures and adjust only with recorded size evidence if those choices are insufficient. Avoid a shared-helper change that silently broadens another consumer's limit.

Use receipt timestamps to reject evidence outside this invocation. Record parent start/end in milliseconds. Accept the real producers' verified timestamp forms (ISO UTC with/without milliseconds and basic UTC where already used), require a real calendar date and canonical round trip, and account only for their documented one-second precision. SBOM time is `metadata.timestamp`; other timestamps must come from each actual contract. Require the correct report discriminator where the producer defines one. Freshness and private paths support attribution, not cryptographic provenance or proof of production scope.

Preserve every existing baseline, summary field, threshold, target/config binding, Caddy/HSTS production-candidate rule, database telemetry gate, restore invariant, and seven-step rotation requirement. Tighten consistency instead of weakening it: a nonzero child exit always fails its stage even beside successful JSON, and zero exit with missing, failed, contradictory, or invalid receipts also fails. Require every mandatory receipt in a multi-child stage. Do not make license compliance optional when the SBOM child was invoked with `--verify-licenses`.

When a required baseline/compliance validation fails, mark that stage `FAILED`, attach a bounded safe reason, and emit the existing breached baseline/failed compliance. Invalid raw receipt content must not be copied into the dossier. In particular, static, supply-chain, volume, rotation, capacity, recovery, and deployment validations all participate in stage verdicts. Recompute `overall_status`, passed/failed counts, and summary stage statuses after all validation. No dossier may state `PASSED` with a required breached baseline or failed compliance. Keep `environment: "drill"` and the existing no-AI posture. Synthetic/offline verification remains rehearsal; it cannot approve production.

This is validation of existing evidence contracts, not a redesign of the readiness schema or a requirement to make every child production-proven. The existing dry restore preflight produces no successful restore receipt; Stage 7 must continue to fail closed when the requisite recovery evidence is absent.

### 3. Publish dossiers atomically and protect custom destinations

Serialize through Node, write a uniquely owned private temporary file in the final destination directory, then rename only after complete assembly. Fail nonzero on serialization/write/rename errors, and clean the owned temporary file on all catchable exits. Record timing as finite nonnegative numbers. Preserve existing JSON version/top-level shape; additive invocation metadata is allowed only if the readiness consumer accepts it and tests prove compatibility.

For `--output`, prevent simultaneous writers from sharing the same destination through exclusive invocation ownership (for example a sidecar lock created exclusively). Reject an already-active writer; do not steal/remove its lock. Reject symlink/nonregular existing destinations. Once this invocation owns the destination and validation has succeeded, invalidate an existing regular receipt before children start so failure/interruption cannot leave an old success accepted as the new run. Release only this invocation's lock. A normal failed stage run should publish a complete `FAILED` dossier; an interrupted run must leave no stale/partial success at the selected output. Never follow symlinks or overwrite an unrelated destination without the explicit output selection.

`--json` must print the exact published dossier; preserve the current human summary convention around it. Report generic failure codes rather than raw exceptions or child bodies. Keep child output in private stage logs. State the distinction between completed drill stages and operator production sign-off in the success text.

### 4. Replace unsafe test execution with isolated process fixtures

Rework `scripts/ops/run-launch-drills.spec.js` to execute the real Bash runner in a disposable repository fixture. Copy the actual assembly/helper modules needed by the runner, and replace child entry points in that fixture with deterministic stubs. Stub every child that can audit packages, probe APIs, use Docker, connect to PostgreSQL/Garage, or scan external resources; never delegate such work to a real executable. Use the real Node runtime for assembly. Do not add production-only test switches or mutate tracked files. Tests must scrub inherited service credentials from the child environment and never use repository `backups/` for fixtures.

Cover help and malformed flags with zero child calls; preserved order and forwarding; default/custom destinations; spaces/quotes in paths; exact child receipt registration; valid offline rehearsal with missing recovery evidence failing closed; valid full fixture dossier; failed exit with successful JSON; zero exit with invalid JSON; missing, duplicate/unregistered, stale/future, oversized, symlink, FIFO, contradictory and wrong-target receipts; each baseline causing its own stage failure; `--json` equivalence; permissions; output write/rename failure; and catchable interruption cleanup.

Run two asynchronous invocations sharing one evidence parent and prove disjoint stage logs, receipt paths, default dossier paths, and no cross-consumption. Seed unrelated success receipts/logs before and during execution and assert they are neither accepted nor removed. Exercise two writers to one explicit output and assert exclusive ownership. Remove `cleanNestedResiduals`, timestamp sweeps, and all shared-directory deletion. Tests may clean only their own disposable root. Add pure assembly tests for stage/count/summary invariants if the extraction is used.

Keep existing `ops:launch-drill-test`, adding the new module spec to that invocation if created. No new test framework/package is needed. `ops:check` already invokes the script; preserve that integration. Update `check-production-templates.sh` to require new files and recognize the extracted baseline assembly without merely deleting its existing enforcement. Use behavioral tests for correctness; source string assertions are only existence/integration guards.

## File scope, impact, exclusions, and rollback

Expected edits: the launch runner/spec, optional new assembly module/spec, root `package.json` if needed to include the new spec, production template checks, `docs/operations.md`, and `docs/launch-checklist.md`. Update `docs/security.md` only for a narrow correction of existing launch-evidence integrity claims. No new documentation index row is needed. Child runners are inspected but not redesigned; if an output flag cannot express an owned receipt, report that concrete incompatibility before expanding scope.

Routes, UI, schema, SQL, runtime topology, alert rules, secret rotation, CI workflow, SLOs and readiness approval records do not change. Production targets, live bursts, database restore operations, external package audits from tests, operator handoff facts, and launch sign-off are outside authorization. The selected Phase 12 skill subset covers this narrow CLI/JavaScript evidence boundary; Nest, browser, GitHub Actions, telemetry/dashboard, secret-provider, scanner-rule, and PostgreSQL implementation skills are not triggered because their implementations are unchanged. No new ADR or full threat-model report is required.

Rollback is a revert of this implementation commit; no persistent product state/migration changes. Document the new retained artifact layout and safe disposal by an operator. Reverting requires operators to retain previously produced child paths if referenced evidence is still in use.

## Verification and completion

1. Run Bash syntax checks on the changed shell files; run the hermetic `npm run ops:launch-drill-test` and focused assembly tests. Quote real output/counts. Verify zero external child calls, no repository backup residuals, and concurrent ownership invariants.
2. Run `npm run ops:templates`, `npm run ops:dos-test`, `npm run ops:capacity-alerting-test`, `npm run ops:restore-drill-test`, `npm run ops:deployment-test`, `npm run ops:rotation-test`, `npm run ops:readiness-test`, and `npm run ops:readiness-schema-test`. Inspect available formatting tooling, format changed files consistently, and quote the actual check result.
3. Run `npm run ops:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`. The aggregate operations gate includes a dependency audit that contacts npm; follow available permissions and report any blocked network check honestly. Do not claim a previously authorized audit proves the current result. Never run an unstubbed unified or live child drill as a shortcut during this task.
4. Verify the unresolved checked-in readiness example still rejects launch with its actual output. Do not fabricate operator values or turn expected rejection into a passing production claim. Readiness tests must also accept a structurally consistent fixture dossier where applicable.
5. Inspect the full diff and scope. Follow `AGENTS.md` §2.1: dispatch an independent read-only reviewer subagent after self-verification, supplying this prompt, base SHA, working-tree diff, changed paths and real check outputs. Evaluate feedback through `receiving-code-review`, fix verified findings, rerun affected checks, and request follow-up review for significant changes. This delegation is explicitly required at execution, not during prompt preparation.
6. Record actual output, file ownership, bounds, failure/cleanup behavior, retained paths, limitations, and operator-only production gates in the owning operations/checklist docs. Commit only approved work and this prompt locally to `main` using `caveman-commit`; do not push. Provide safe inspection commands (`npm run ops:launch-drill-test` and relevant focused tests). Do not describe the entire real unified `--dry-run` command as network-free: reconciliation still reads live services and the static scanner may audit dependencies.

## SKILLS USED

- `deployment-pipeline-design` — preserve staged operational evidence gates, child failures, and independent operator approval.
- `error-handling-patterns` — define validation, process, filesystem, atomic-publication and cleanup failures.
- `javascript-testing-patterns` — build isolated Node/Bash process fixtures and concurrent-run regressions.
- `security-best-practices` — review supported JavaScript evidence handling and secure defaults; no Bash/CLI-specific reference is available in this skill.
- `security-threat-model` — consult the existing operations/evidence boundary and record narrow integrity limitations; no new full threat-model report.
- `requesting-code-review` — dispatch the mandatory independent read-only implementation review.
- `receiving-code-review` — verify feedback against code/contracts before fixing it.
- `caveman-commit` — write the required local implementation commit message.
