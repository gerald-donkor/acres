# Prompt 385 — scanner runtime configuration handoff

## Scope and why this is next

Parent: Phase 12 managed-target operations, continuing approved Prompt 370.
Inspected baseline: `2faafcb74c5e5fe821b33eb62fc03f559888e818` on `main`.
The worktree was clean before preparing this prompt. Git history and code prove
Prompt 384 is implemented; its prompt alone is not completion evidence.

The next dependency-safe portion of the scanner lifecycle is a durable,
target-bound configuration handoff. Preparation already preserves candidates,
but its receipt omits target identity and the runbook's manual mapping names two
variables the server does not consume. Correct that concrete defect and produce
a restricted local bundle that an operator can retain and use for the later
preview activation. This step prepares configuration; it does not activate it.

Repository evidence:

- `scripts/vercel/rebuild-scanner-cadence.js` emits candidate ID, two hashes,
  execution mode and clean/EICAR/cleanup results, but no team/project/region.
- Its exported env uses `ACRES_SCANNER_SNAPSHOT_ID`,
  `ACRES_SCANNER_MAIN_SHA256` and `ACRES_SCANNER_DAILY_SHA256`: probe/builder names.
- `server/src/config/env.validation.ts` requires runtime names
  `SCANNER_SANDBOX_SNAPSHOT_ID`, **`SCANNER_MAIN_SHA256`** and
  **`SCANNER_DAILY_SHA256`**. The latter two are not prefixed `SCANNER_SANDBOX_`.
- `infra/vercel/runbooks/managed-operations.md` §5.4 currently gives the wrong
  runtime hash names. Manual transcription can therefore produce invalid boot
  configuration even when the candidate itself passed smoke checks.
- The workflow preserves allowlisted summary fields and deletes local files.
  It does not persist runtime configuration or perform deployment adoption.

The chosen implementation is an offline receipt-to-bundle CLI plus an additive
target/version field in new preparation receipts. Do not introduce a deployment
controller or a second scanner builder. No provider API or hosted account access
is needed to complete this unit.

## Reference material read

- `AGENTS.md`, including phase control, prompt contract and §§6–10.
- `docs/build-plan.md`: Phase 12, managed amendment and Prompts 378–384.
- `docs/project-status.md`, `docs/skills.md`.
- `docs/vercel-deployment.md`: resume checklist, preview proof and remaining
  scanner lifecycle gates.
- `docs/system-architecture.md`: managed amendment and provider boundaries.
- `docs/security.md`: scope, operator/CI boundary and configuration assets.
- `docs/adr/0001-vercel-managed-production.md`.
- `docs/operations.md`: operations contract and Prompt 384 verification record.
- `docs/launch-checklist.md`: selected managed profile and Prompt 384 record.
- `infra/vercel/README.md`, `infra/vercel/runbooks/managed-operations.md` §5.
- `scripts/vercel/rebuild-scanner-cadence.js` and
  `scripts/vercel/probe-platform.js`: receipt, validation, target and export code.
- `.github/workflows/scanner-snapshot-rebuild.yml`, `package.json`,
  `.node-version`, and `server/src/config/env.validation.ts` scanner branch.

No visual surface changes or measurements are in scope. No comp, screenshot,
token or breakpoint change is needed. No Next/React API will be written.
Read relevant installed framework documentation first if a proposed change
would unexpectedly reach application code, and keep that expansion outside
this prompt. Reading server validation does not authorize changing it.

## SKILLS USED

- `architecture-patterns` — retain builder/probe/operator boundaries and keep this CLI out of application boot.
- `deployment-pipeline-design` — define the handoff before activation, application verification and retirement.
- `secrets-management` — restricted local output, allowlisted configuration and no credential propagation.
- `security-best-practices` — strict untrusted JSON/file input and safe filesystem output. No installed reference specifically covers this standalone Node CLI; verify Node APIs in installed source or local executable experiments rather than inventing provider behavior.
- `security-threat-model` — apply existing operator/configuration integrity boundaries; no new provider boundary or separate threat-model report is requested.
- `error-handling-patterns` — fixed error codes, partial-output handling and accurate completion semantics.
- `javascript-testing-patterns` — native Node behavioral regression tests with isolated files and SDK doubles.
- `requesting-code-review` — independent read-only reviewer after self-verification.
- `receiving-code-review` — verify feedback against actual code before fixes.
- `caveman-commit` — required local commit to main after approved execution.

The first seven skills were loaded during preparation. Load every listed skill
again during execution as AGENTS.md requires. No GitHub Actions, Nest, SQL,
browser or observability implementation is planned; their skills become required
only if separately approved scope reaches those surfaces.

## Implementation sequence

### 1. Bind newly prepared receipts to their actual target

Extend `scripts/vercel/rebuild-scanner-cadence.js` and its existing spec:

1. Add `schema_version: 1` and a `target` object containing `environment`,
   `team_id`, `project_id`, and `region` to preparation receipts. Live values
   must come from the already validated execution configuration, with
   `environment: "preview"`. Never copy credentials, arbitrary environment
   variables or decoded OIDC payloads into the receipt.
2. Simulation must use `target: null`. Do not label simulation as a verified
   Acres target. Skipped and failed live receipts can retain actual target
   identity, but cannot become eligible handoffs.
3. Keep existing receipt fields and meanings. Do not alter snapshot-age policy,
   output exclusivity, existing probe env exports or candidate retention.
4. Treat this as an additive producer contract; document that legacy receipts
   lacking target/version cannot be consumed by the new handoff tool. Do not
   supply a `--trust-legacy` or user-asserted target override.

### 2. Add an offline runtime handoff CLI

Create `scripts/vercel/prepare-scanner-handoff.js` with exported testable helpers
and a guarded main entrypoint. Proposed interface, to be implemented here:

```text
node scripts/vercel/prepare-scanner-handoff.js --help
node scripts/vercel/prepare-scanner-handoff.js --receipt <file> --output-dir <new directory outside repo>
```

Reject unknown flags, repeated flags, missing/empty values and extra positional
arguments with fixed diagnostics. Help works without input files, credentials
or SDK loading. No `--activate`, `--delete`, remote destination or override flag.

Input acceptance must require:

- A bounded regular JSON file (choose 64 KiB as a defensive engineering limit,
  not a measured provider limit). Reject symlinks and non-regular files before
  reading; ensure the opened descriptor still represents the checked file.
- An object, `schema_version: 1`, exact producer tool identity,
  `execution_mode: "live"`, `status: "success"`, `rebuild_needed: true`,
  `activation_status: "not_performed"`, no failure marker, and a parseable
  non-future timestamp. Tests inject a clock. This timestamp is preparation
  metadata, not CVD freshness or a safe activation deadline.
- All three smoke statuses (`clean_sample`, `eicar_sample`, `cleanup`) equal
  `"passed"`. Check the existing receipt structure before implementing.
- A candidate snapshot ID matching the existing `SNAPSHOT_ID` contract and two
  lowercase 64-character SHA-256 hashes. Previous ID is null or a valid distinct
  snapshot ID. Existing output/export flags do not prove activation.
- Exact target: `preview`, team `team_zE3mp7nrEZ6a7cxRavwUMYC4`, project
  `prj_q9ApajZWDgdYZetnm5s5oakEjrUD`, region `iad1`. Reject absent, partial,
  production, unknown or mismatched targets. Do not infer them from cwd linking
  or current environment variables.

Validate only the defined producer contract and explicitly reject contradictory
failure/activation fields. Unknown input content must never be echoed, spread
into output objects or executed. A structurally valid receipt is operator input,
not authenticated provider attestation: document that limitation plainly.

### 3. Produce a durable restricted bundle

The output directory must be new, outside the repository after canonical parent
resolution, with an existing writable parent. Reject existing directories/files,
symlinks (including dangling ones), repository aliases and input/output path
overlap. Acquire ownership with exclusive directory creation, mode 0700.
Create files exclusively with mode 0600; never overwrite an active env file.
Verify filesystem APIs locally before relying on their race semantics.

Write exactly:

1. `runtime.env` — three deterministic newline-terminated assignments:

   ```text
   SCANNER_SANDBOX_SNAPSHOT_ID=<validated new_snapshot_id>
   SCANNER_MAIN_SHA256=<validated main_sha256>
   SCANNER_DAILY_SHA256=<validated daily_sha256>
   ```

   These values have strict ID/hex grammars, so no shell escaping or execution
   is necessary. Do not source input files, run a shell or parse arbitrary env.
   Do not add credentials, `SCANNER_PROVIDER`, freshness policy or other runtime
   defaults. Preserve operator ownership of those separate settings.

2. `handoff.json` — versioned allowlisted manifest with tool identity, target,
   preparation timestamp, previous/candidate snapshot IDs and hashes, SHA-256
   of the original receipt bytes, SHA-256 of generated `runtime.env` bytes,
   and explicit `activation_status: "not_performed"`,
   `deployment_verification: "not_performed"`, `retirement_status: "not_performed"`.
   Write this last, only after env write/close succeeds. No manifest can claim
   handoff success after an output failure. Hashes establish byte consistency,
   not authenticity, signing or a deployed scanner identity.

On failure, preserve all pre-existing data and all cloud resources. Clean up
only outputs this invocation demonstrably owns, or retain a clearly incomplete
directory without a successful manifest and return nonzero; document one
consistent policy. Never recursively delete an untrusted caller path.

Stdout/stderr use a small allowlist of status/ID/hash fields and fixed codes.
Do not print input bodies, filesystem paths, environment values, exception text,
stack traces or embedded secret canaries. Success means local bundle prepared
only. No SDK import, network request, GitHub variable update, Vercel env mutation,
deployment creation or snapshot deletion is permitted in any code path.

### 4. Wire checks and correct the runbook

Add `scripts/vercel/prepare-scanner-handoff.spec.js` to the existing
`vercel:probe-test` command in `package.json`; no dependency installation or
new test framework. A dedicated npm command is unnecessary: use the documented
Node interface above.

Update:

- `infra/vercel/runbooks/managed-operations.md` §5: fix runtime hash names;
  show candidate preparation followed by offline handoff into a fresh,
  operator-selected durable restricted directory outside the repo. Temporary
  `/tmp` output is an inspection fixture, not durable operator storage.
  Require preserving the previous runtime configuration separately for rollback.
- `infra/vercel/README.md`: explain the probe/runtime naming distinction and
  the new CLI, including legacy-receipt rejection and manifest limitations.
- `docs/vercel-deployment.md`, `docs/operations.md`, `docs/build-plan.md`:
  record only this implemented local gate and actual checks after execution.
  Durable local output is not a Vercel environment change or hosted adoption.
- `docs/launch-checklist.md`: a short cross-reference to the handoff procedure;
  retain all open scanner/launch gates without category approval.

Do not change historical verification output or erase Prompt 384's limits.
Do not edit the workflow: its simulation/live authorization, credentials,
summary and cleanup behavior remain intact. The future CI persistence and
activation path must use an explicitly selected restricted destination and
separate target authorization; this unit does not choose a new remote store.

### 5. Behavioral acceptance

Use native Node tests with isolated temporary directories and clock injection.
At minimum prove:

- A genuine new-format cadence receipt from the existing SDK doubles flows
  through the CLI and produces exactly the correct runtime names/bytes, file
  permissions, target and digest-bound manifest. Exercise the subprocess CLI,
  not only helpers or a manually invented success fixture.
- Legacy, simulation, skipped, failed, incomplete smoke/cleanup, missing target,
  different target/production, malformed IDs/hashes, equal old/new ID, invalid
  or future timestamp, non-object/oversized/malformed JSON and contradictory
  status fields all fail before output directory creation.
- No export is required from cadence to make an otherwise valid live receipt
  usable: the bundle derives only validated receipt values, not env contents.
- Existing output directories, files, parent/repo aliases, symlinks and late
  creation races preserve sentinel data. Partial write/close failure cannot
  leave a successful manifest or return success. Exercise mode checks on disk.
- Hostile input strings containing command substitution, newlines, traversal,
  credentials and error canaries never execute or appear in diagnostics/output.
- Help and all CLI paths work with provider/network calls prohibited. No
  snapshot build/deletion, remote mutation or activation happens in handoff.
- Existing cadence retention/simulation and executable workflow tests still
  pass with additive receipt fields; existing `ACRES_SCANNER_*` exports retain
  their exact contract.

## Verification and completion

Use Node 24.21.0 from `.node-version`; record the real executable/version.
Run build and typecheck sequentially to avoid the documented `.next/types` race.

```bash
node --test scripts/vercel/prepare-scanner-handoff.spec.js
node --test scripts/vercel/rebuild-scanner-cadence.spec.js
node scripts/vercel/prepare-scanner-handoff.js --help
npm run vercel:probe-test
npm run ops:check
npm run lint
npm run build
npm run typecheck
npm run ops:scan-secrets
git diff --check
```

Use the installed formatter for changed JS/spec/JSON and check the prompt/doc
diff. There is no root format script; do not claim one exists. Quote actual
output and exits, distinguish local tests from hosted proof, and disclose any
audit/network failure that prevents later aggregate stages. No live rebuild,
deployment, real credentials or hosted mutation is required or authorized here.

After self-verification, use `requesting-code-review` to dispatch an independent
read-only reviewer with the baseline SHA, current HEAD/uncommitted diff,
requirements and actual results. Evaluate findings with `receiving-code-review`,
fix valid issues and rerun affected checks; re-review significant changes.
Record outcomes in owning docs. Stage only this approved scope and commit to
`main` with `caveman-commit`; do not push. Give help and local fixture inspection
steps, explicitly excluding any simulated receipt from activation eligibility.

## Impact, non-goals and rollback

No customer route, database, server implementation, provider adapter, workflow
permission or visual surface changes. New receipts gain target/version fields;
existing producer env names remain compatible. The new consumer deliberately
rejects unbound legacy receipts rather than making an unverifiable assertion.

No production promotion, preview deployment/configuration mutation, snapshot
retirement, scheduled live automation, resource-budget approval, signature SLA,
new evidence/signing service, eleven-category sign-off or completion percentage
change. Hosted application verification and old-deployment/in-flight/rollback
dependencies remain open. Do not present this bundle as their closure.

Rollback is a local commit revert; operator-created bundles remain outside git
and require deliberate operator disposition. No hosted state needs reversal.
Do not restore the incorrect hash-variable instructions during a rollback.
