# Prompt 384 — scanner candidate lifecycle safety

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Baseline inspected: `2d5e449352d3cc610c0a3b497542f10d0ad4d821` on `main`,
with a clean worktree before preparing this prompt. Prompt 383's implementation
is committed. This prompt fixes concrete safety gaps in that implementation;
it does not repeat its build or establish production launch approval.

Prepare scanner candidates safely while preserving every previously configured
snapshot. A successful candidate build is not deployment activation. Make dry
runs incapable of replacing real scanner configuration, constrain unattended
workflow behavior, and correct the premature operational-completion claims.
These prerequisites precede any future automated deployment switch or snapshot
retirement. The production plan decision and eleven launch sign-offs remain open.

### Repository evidence

- `scripts/vercel/rebuild-scanner-cadence.js` calls `replaceSnapshot()` after
  optional `writeScannerEnv()`, even though it performs no deployment switch.
  It also prunes when no env output was requested.
- Its dry-run branch calls `writeScannerEnv()` with a simulated snapshot ID and
  fabricated digests. An existing outside-repository scanner.env can be replaced.
- `evaluateCadence()` uses snapshot creation/expiry metadata, not CVD build
  dates. Its `signatures_fresh` reason overstates what was inspected.
- `.github/workflows/scanner-snapshot-rebuild.yml` runs live each day, exports
  configuration into a temporary directory, then deletes that directory. It
  neither updates runtime configuration nor deploys, and does not update the
  configured snapshot ID for the next workflow run.
- `infra/vercel/README.md` already warns that deleting a snapshot still named by
  a deployment causes `scanner_unavailable`; it prescribes building without
  `--replace`, switching/redeploying, and only then retiring the old snapshot.
- `infra/vercel/runbooks/managed-operations.md` §5.4 separately describes manual
  activation, contradicting §5.1's zero-downtime rotation claim.

## Reference material read

- `AGENTS.md`, especially §§2, 5–10 and phase-control commands.
- `docs/build-plan.md`: Phase 12, managed-target amendment, Prompts 378–383.
- `docs/project-status.md` and `docs/skills.md`.
- `docs/vercel-deployment.md`: resume checklist, hosted preview record, Prompt 383.
- `docs/system-architecture.md`: managed amendment and provider boundaries.
- `docs/security.md`: scope, supply-chain and operator boundaries.
- `docs/operations.md`: operational inventory and Prompt 383 record.
- `docs/launch-checklist.md`: managed profile, scanner claim and launch gates.
- `docs/adr/0001-vercel-managed-production.md`.
- `infra/vercel/README.md` and `infra/vercel/runbooks/managed-operations.md` §5.
- `scripts/vercel/rebuild-scanner-cadence.js` and its test specification.
- `scripts/vercel/build-scanner-snapshot.js`: builder lifecycle, replacement and
  filesystem helpers; `scripts/vercel/probe-platform.js`: target/auth checks.
- `.github/workflows/scanner-snapshot-rebuild.yml`,
  `scripts/vercel/check-vercel-config.spec.js`, `package.json`, `.node-version`.

No visual surface changes: no comp measurement, screenshot, new token or
breakpoint behavior is required. No Next/React API changes are planned. If scope
unexpectedly requires application code, stop expanding this task and identify
the prerequisite documentation/skill reads first.

## SKILLS USED

- `architecture-patterns` — retain the existing builder/probe boundaries; avoid a second deployment controller.
- `deployment-pipeline-design` — distinguish candidate preparation, activation, verification and retirement.
- `github-actions-templates` — gate scheduled/manual behavior with minimal permissions and pinned actions.
- `secrets-management` — restricted configuration outputs and no credentials in receipts, logs or summaries.
- `security-best-practices` — protect filesystem outputs and sanitize error sinks. No skill reference specifically covers this Node CLI; verify Node APIs from installed documentation/source or local executable behavior.
- `security-threat-model` — use the existing operator/CI availability boundary and documented abuse/failure paths; no new trust boundary or separate threat-model report is in scope.
- `error-handling-patterns` — preserve primary failure and report cleanup/export failures accurately.
- `javascript-testing-patterns` — meaningful native Node regression and workflow contract tests.
- `requesting-code-review` — dispatch independent reviewer after self-verification.
- `receiving-code-review` — verify feedback against implementation and requirements before fixes.
- `caveman-commit` — required local conventional commit to main after execution.

Re-read the prompt, owning records and these skills on approval before code.
Phase 12 observability/browser/Nest skills are unnecessary for this bounded CLI
and workflow fix; load them only if an approved scope change reaches those areas.

## Implementation sequence

### 1. Remove retirement authority from candidate preparation

Modify `scripts/vercel/rebuild-scanner-cadence.js`:

1. Remove the `replaceSnapshot` import and all snapshot deletion/replacement
   branches from this orchestrator. Retain builder/probe sandbox cleanup with
   `deleteOrphanSnapshots: false`. Never delete a current or candidate snapshot.
2. Keep `--current-snapshot-id` for age inspection only. Keep `--skip-prune` as
   a deprecated harmless compatibility option; explain that all runs now retain
   snapshots. Do not introduce `--prune`, an activation assertion flag, an
   unverified deployment receipt, or any bypass restoring deletion authority.
3. A completed live build means candidate prepared, clean/EICAR checks passed,
   and optional candidate configuration exported. It must explicitly report
   `activation_status: "not_performed"` and a retained/not-requested prune state,
   never `pruned`. Keep `status: "success"` only with this narrower meaning.
4. Preserve the prior snapshot on build, smoke, export, receipt and cleanup
   failures. Report the candidate ID when known so an operator can inspect it.
   Do not automatically delete ambiguous or failed candidates: account-bound
   retirement remains outside this task.
5. Do not change the standalone builder's existing `--replace` API. Its manual
   destructive behavior remains explicitly documented and is never used here.

### 2. Make simulation and configuration export safe

1. Dry runs must make no SDK calls and must never create, truncate or replace
   the `--write-env` destination. Permit explicit `--output` for a simulation
   receipt, clearly marked `execution_mode: "simulation"`; report configuration
   export as not performed. No simulated ID/digest may reach scanner.env.
2. Test both an existing configuration sentinel and a nonexistent destination.
   Preserve the existing file's bytes and permissions. Help must also remain
   usable without credentials and without provider calls.
3. For live configuration export, avoid truncating an existing active env file.
   Treat `--write-env` as a new candidate file: reject an existing destination
   (including symlinks) before creating cloud resources; use exclusive creation
   and mode 0600 at the final write to prevent a later overwrite race. A skipped
   build exports nothing. Validate all output paths before cloud work.
4. Keep env output outside the repository using the existing real-parent path
   rules. Do not broaden `writeScannerEnv()` globally just to change cadence
   behavior: add a small cadence-local exclusive writer if necessary.
5. Reject env/receipt path collisions, including normalized aliases and symlinks.
   Receipt writing must not follow a symlink or overwrite scanner configuration;
   preserve existing unrelated files. Use exclusive new receipt files with 0600
   permissions and a clear fixed error on collision. Use fresh per-run paths.
6. Do not propagate raw SDK/command exception text, `BuildError.detail`, secrets,
   absolute private paths or provider response bodies to console or receipts.
   Use bounded fixed error codes/messages; retain useful nonsecret stage status.
   Cover export and receipt failures as failures, not candidate activation.

### 3. Describe age evidence honestly

1. Keep existing 48-hour default and 168-hour CLI maximum as compatibility
   bounds. Do not change the application's actual signature policy.
2. Label the decision as snapshot age throughout help, receipts and docs.
   Replace the `signatures_fresh` reason with `snapshot_recent`; document the
   receipt compatibility change. Snapshot metadata cannot certify CVD freshness.
3. At the threshold, request rebuild (`age >= maxAgeHours`). Missing, invalid
   or future timestamps must not produce a recent/fresh verdict. Do not clamp
   a future creation timestamp to zero and silently trust it.
4. The builder retains its own CVD validation and smoke checks. This prompt
   does not implement live active-snapshot signature inspection or certify a
   hosted freshness SLA. Record that limitation explicitly.

### 4. Gate the workflow to candidate preparation

Modify `.github/workflows/scanner-snapshot-rebuild.yml`:

1. Keep the existing daily trigger for credential-free simulation/validation.
   Scheduled runs must not build cloud resources, delete snapshots, export real
   env configuration or receive cloud credentials.
2. Add a boolean manual `prepare_candidate` input, default false. Only an
   explicitly selected manual preparation runs live; `force` alone must not
   enable live execution. Live preparation remains preview-only.
3. Inject Vercel credentials only into the live step. Require explicit target
   and region configuration; bind the workflow to the documented Acres preview
   project/team and iad1, rejecting a mismatched identity before SDK work.
   Reuse existing probe opt-in/auth validation; no production environment.
4. Keep pinned checkout/setup actions, contents-read permission, Node 24 and
   concurrency protection. Use a unique runtime temporary directory with 0700
   permissions instead of the fixed `/tmp/acres-scanner-rebuild` directory.
5. Use only new candidate output paths. Summaries may expose only allowlisted
   receipt fields such as candidate ID, hashes, execution mode and stage result;
   never `cat` an arbitrary env file or raw failure payload into a summary.
6. Clearly identify candidate-only success and pending manual activation.
   Preserve the candidate ID and checksums in the sanitized run summary before
   cleaning local temporary files. A summary is operational handoff information,
   not a signed deployment or launch artifact. Do not add new actions/providers
   or remote artifact storage to this task.

### 5. Add behavioral regression coverage

Extend `scripts/vercel/rebuild-scanner-cadence.spec.js`, keeping it in the existing
`vercel:probe-test` script. Add focused tests which prove:

- No snapshot delete is called on default success, with/without env output,
  with a previous ID, with `--skip-prune`, or on every failure path.
- Candidate build and probe sandbox cleanup still execute with orphan snapshot
  deletion disabled; cleanup failure cannot silently certify success.
- Dry run/help use SDK doubles which throw on any call; dry run with existing
  and nonexistent env paths never changes the configuration. Simulation receipts
  cannot claim activation or pruning.
- Existing output files, symlinks, env/receipt aliases and invalid destinations
  fail before cloud work; a destination created between validation and export
  remains intact and the live run fails safely.
- Exports contain exactly the three existing ACRES scanner variables, valid
  builder ID/hashes, and mode 0600; receipt/config failures retain snapshots.
- Snapshot age just below, equal to and above threshold, missing/invalid/future
  metadata and force behavior have accurate reasons and do not claim signature
  freshness.
- Secret canaries in SDK exceptions and builder error details never appear in
  public stdout/stderr, receipts or workflow summaries.
- Workflow contract: schedule/default manual are simulation; only explicit
  manual preparation has credentials; force cannot select live mode; target
  mismatch fails early; temporary paths are per-run; no snapshot prune/deploy,
  production env update, GitHub variable update or credential-printing command.

Use the existing native Node test runner and SDK doubles. Verify any YAML parser
API from installed dependencies if used; do not install dependencies. Exercise
the workflow's mode-selection shell behavior locally with stub commands in
addition to static assertions, so tests verify the actual branch conditions.

### 6. Correct and record the operational contract

Update only the scanner-related records in:

- `docs/vercel-deployment.md`: correct the scanner checklist closure claim and
  record Prompt 384, candidate-only semantics and missing activation/retirement
  proof. Correct the stale opening claim that no Acres preview was deployed by
  referring to the existing Prompt 378 record; make no new hosted claim.
- `infra/vercel/runbooks/managed-operations.md` §5: document preparation,
  switching/redeploying and hosted verification as separate stages. Retain old
  snapshots through deployment rollback needs and possible queued invocations;
  no fixed safe retirement duration is established here. Use fresh candidate
  filenames. Do not present a synthetic probe as application acceptance.
- `infra/vercel/README.md`: describe the cadence tool's non-destructive role;
  preserve the standalone builder warning and verified command vocabulary.
- `docs/operations.md`, `docs/launch-checklist.md`, `docs/build-plan.md`: correct
  Prompt 383's zero-downtime/closed-blocker claims with an explicit superseding
  note and record this fix plus real verification output. Historical results
  stay attributed to their original runs.

State remaining work plainly: durable adoption of new ID/hash configuration,
verified application deployment using it, surviving old deployments/in-flight
jobs/rollback dependencies, bounded retirement and free-tier resource budget,
and hosted scheduled-execution evidence. These are not closed by local tests.
No percentage change, category approval or production promotion is authorized.

## Verification and completion

Use `.node-version` (24.21.0) and verify the active Node executable. All checks
are local/offline except the existing dependency-audit stage of `ops:check`;
report an audit/network failure accurately and do not claim the aggregate passed
when a stage prevented later checks. Do not run the live scanner rebuild.

```bash
node --test scripts/vercel/rebuild-scanner-cadence.spec.js
node scripts/vercel/rebuild-scanner-cadence.js --help
node scripts/vercel/rebuild-scanner-cadence.js --dry-run
npm run vercel:probe-test
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Check formatting with the repository's installed formatter if present; there
is no root format script in the inspected package.json. Do not invent one.
Inspect the entire diff for accidental application or generated-file changes.
Quote actual output/exit status and distinguish SDK doubles from hosted proof.

After self-verification dispatch a read-only independent reviewer with baseline
SHA, current HEAD plus uncommitted diff, requirements and test output using
`requesting-code-review`. Evaluate feedback with `receiving-code-review`, fix
valid findings and rerun affected checks; re-review significant changes. Record
final outcomes in the owning docs, stage only this approved scope and commit to
`main` using `caveman-commit`. Do not push. Give the user the help/dry-run commands
to inspect the result without cloud mutation.

## Impact, non-goals and rollback

No customer route, schema, provider adapter or visual layout changes. The cadence
CLI intentionally loses automatic pruning, dry-run env writes and overwrite
behavior; receipt age terminology changes. Existing `--skip-prune` callers remain
safe. Scheduled workflow runs no longer mutate cloud resources, and live manual
runs prepare retained candidates only.

No live account access, credential provisioning, deployment, production config
mutation, hosted scanner execution, paid usage, signing policy, launch sign-off
or automated activation/retirement controller. Those require their own concrete
target-bound proof and existing action boundaries.

Rollback is a local revert of this change, with no hosted state to undo. Warn
that reverting reintroduces premature snapshot deletion and dry-run configuration
overwrite; keep scheduled live execution disabled during rollback review.
