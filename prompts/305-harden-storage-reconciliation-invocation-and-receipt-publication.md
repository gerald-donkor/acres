# Phase 12K — Harden storage reconciliation invocation and receipt publication

## Scope and why this is next

Continue the unfinished Phase 12 launch hardening gate in `docs/build-plan.md` §§13–14
from clean `main` at `1da417e` (`fix(ops): harden release images template validation`).
Following the successful completion of the dependency security audit series (Prompts 281–299)
and the template validator hardening across SMTP credentials (Prompt 280, `21f412d`),
application environment keys (Prompt 300, `99a35c3`), proxy environment / Caddyfile
placeholders (Prompt 301, `6b68311`), Garage metrics template validation (Prompt 302, `5044623`),
PostgreSQL diagnostics template validation (Prompt 303, `1a17ec4`), and release images
template validation (Prompt 304, `1da417e`), continue the operational drill receipt
producers.

In Stage 7 of the unified launch drill orchestrator (`scripts/ops/run-launch-drills.sh`,
line 380), `scripts/ops/reconcile-storage-objects.js` is invoked:
```bash
node "$OPS"/reconcile-storage-objects.js --dry-run --output "${STAGE_DIR}/reconcile-report-receipt.json"
```
The resulting artifact `reconcile-report-receipt.json` is ingested by
`scripts/ops/assemble-launch-dossier.js` (lines 37, 741, 758–767) as the Stage 7
disaster recovery storage reconciliation child receipt, establishing the
`storageReconciliation` baseline and `reconcileCompliance` status.

While the pure reconciliation comparison function (`reconcileObjects`) is thoroughly
tested in `scripts/ops/reconcile-storage-objects.spec.js` (10 unit tests), the script's
CLI invocation, execution lifecycle, error reporting, and receipt publication remain
unhardened and lack the standard controls established across Prompts 272–279:

1. **Ad-hoc and unvalidated CLI argument parsing:**
   - `reconcile-storage-objects.js` uses loose `args.indexOf(flag)` lookups without
     validating the presence of unknown options, duplicate flags, or unexpected positional
     arguments. Running `node scripts/ops/reconcile-storage-objects.js --bogus-arg` silently
     ignores the argument.
   - It only supports space-separated syntax (`--output file`, `--bucket name`), completely
     rejecting standard attached form syntax (`--output=file`, `--bucket=name`, `-o=file`, etc.).
   - Repeated options (e.g. `--output file1 --output file2`) are not detected or rejected.
   - If a flag is given without a value (e.g. trailing `--output`), `getArg` returns `null`
     and the script silently falls back to `'reconciliation-report.json'` instead of
     failing fast with a usage error.
   - Unlike sibling tools (`generate-sbom.js`, `run-sast-scan.js`, `verify-container-security.js`,
     `verify-volume-encryption.js`, `verify-caddy-routing.js`), it lacks an exported
     `parseCliArguments(argv, cwd)` helper and standard `ReconcileUsageError`.
   - It lacks `--cwd <path>` / `--cwd=<path>` resolution for relative file paths.
2. **Insecure, direct receipt overwrite semantics:**
   - When `--output` is specified, `reconcile-storage-objects.js` executes:
     `fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf8')`.
   - It performs direct non-exclusive writes without verifying whether the target file
     already exists, silently overwriting pre-existing retained audit evidence.
   - It does not use atomic sibling tempfile writing with exclusive linking/renaming
     (`O_CREAT | O_EXCL`), risking corrupted or truncated receipts if the process is terminated mid-write.
   - It follows symbolic links instead of rejecting them or verifying real file targets.
3. **Abrupt process termination and stream truncation:**
   - The CLI runner terminates by calling `process.exit(code)` directly, cutting off
     asynchronous stdio buffer flushes. Standard operations runners set `process.exitCode = code`
     and return normally to allow stdout/stderr streams to drain cleanly.
4. **Unsanitized exception reflection:**
   - In the catch block of `main()`, caught errors are logged directly to stderr:
     `console.error(`Reconciliation error: ${err.message}`)`.
   - Database connection failures or S3 client errors can reflect internal network
     topologies, credentials, or private filesystem paths into console logs.
5. **Missing programmatic runner interface:**
   - `main()` does not accept custom arguments, IO sinks, or options (`main(argv, io, options)`),
     preventing clean in-process unit testing without spawning child processes for every case.
6. **Zero CLI and publication test coverage:**
   - `scripts/ops/reconcile-storage-objects.spec.js` contains 10 pure reconciliation tests,
     but 0 tests for CLI argument parsing, 0 tests for invalid flags, 0 tests for `--help`/`-h`,
     0 tests for `--output` handling, 0 tests for overwrite prevention, and 0 tests for error sanitization.

Harden `scripts/ops/reconcile-storage-objects.js` and its spec following the proven
producer hardening pattern from Prompts 272–279 and 300–304.

Re-establish current state from Git and code upon execution; written prompts do
not prove implementation.

## References read and execution prerequisites

- `AGENTS.md` §§2–7, 8.2, 10: phase controls, prompt file rules, checks, review,
  and local commit.
- `docs/build-plan.md` §§13–14 and Phase 12K records: launch dependencies,
  verification history, and remaining operator gates.
- `docs/operations.md` Phase 12K, Prompts 210, 238, 272–279:
  disaster recovery verification, atomic publication, and receipt protection.
- `docs/launch-checklist.md` Category 6 (`backup_and_disaster_recovery`) and §4:
  `reconcile-report-receipt.json` schema, simulation baseline, and operator checklist.
- `docs/system-architecture.md` §11: storage, Garage, and PostgreSQL architecture.
- `docs/security.md` Tooling, evidence integrity, and diagnostic minimization:
  immutable receipt retention, zero secret/credential reflection, and safe error boundaries.
- `docs/skills.md`: locked skill triggers and exact local skill paths.
- `scripts/ops/reconcile-storage-objects.js`: storage reconciliation comparison,
  CLI arguments, DB/S3 clients, and current publication logic.
- `scripts/ops/reconcile-storage-objects.spec.js`: existing 10 test cases.
- `scripts/ops/assemble-launch-dossier.js`: lines 37, 343, 379–394, 741, 758–797,
  verifying receipt consumption and summary field expectations.
- `scripts/ops/check-launch-readiness.js`: lines 1819–1850, validating reconciliation report fields.
- `scripts/ops/run-launch-drills.sh`: line 380, Stage 7 invocation.
- `scripts/ops/verify-caddy-routing.js` and `verify-volume-encryption.js`: reference
  implementations for `parseCliArguments`, `publishReceipt`, usage errors, and CLI runners.
- `package.json`: `ops:reconcile-test`, `ops:reconcile-storage`, `ops:check`, lint,
  typecheck, and build scripts.

## Expected impact and non-goals

- `scripts/ops/reconcile-storage-objects.js` provides strict CLI argument parsing,
  rejecting unknown options, positional arguments, duplicate flags, and malformed options.
- Supports `--help`, `-h`, `--cwd <path>`, `--cwd=<path>`, `--output <file>`, `-o <file>`,
  `--output=<file>`, `-o=<file>`, `--bucket <name>`, `--bucket=<name>`, `--endpoint <url>`,
  `--endpoint=<url>`, `--region <name>`, `--region=<name>`, `--access-key <key>`,
  `--access-key=<key>`, `--secret-key <key>`, `--secret-key=<key>`, `--prefix <prefix>`,
  `--prefix=<prefix>`, `--organization-id <id>`, `--organization-id=<id>`,
  `--fail-on-orphans`, `--exclude-quarantined`, `--no-force-path-style`, and `--dry-run`.
- Atomic exclusive publication: writes to an absent destination via an isolated sibling
  temporary file, enforcing that pre-existing files are never overwritten and symlinks are rejected.
- Natural stream draining via `process.exitCode` without abrupt `process.exit()`.
- Safe error diagnostics that never reflect database passwords, access keys, or sensitive connection parameters.
- Preserves all 5 existing public exports (`reconcileObjects`, `formatReconciliationSummary`,
  `listBucketObjects`, `queryDatabaseStoredObjects`, `DEFAULT_IGNORE_PATTERNS`).
- Preserves 100% backward compatibility for existing callers: `run-launch-drills.sh`,
  `assemble-launch-dossier.js`, and `check-launch-readiness.js`.
- Expanded test coverage in `scripts/ops/reconcile-storage-objects.spec.js` covering argument parsing,
  usage errors, help, atomic publication, overwrite refusal, and error sanitization.
- Non-goals: live PostgreSQL/Garage infrastructure provisioning, live production disaster recovery
  execution, changes to database schema or product routes, or pushing commits.

## Implementation details

### 1. Custom usage error class and exported argument parser

Define and export `ReconcileUsageError` extending `Error`.

Implement and export `parseCliArguments(argv, cwd = process.cwd())`:
- Validate that `argv` is an array of strings.
- Validate that `cwd` is a non-empty string.
- Support both space-separated and attached syntax:
  - `--output <file>`, `-o <file>`, `--output=<file>`, `-o=<file>`
  - `--cwd <path>`, `--cwd=<path>`
  - `--bucket <name>`, `--bucket=<name>`
  - `--endpoint <url>`, `--endpoint=<url>`
  - `--region <name>`, `--region=<name>`
  - `--access-key <key>`, `--access-key=<key>`
  - `--secret-key <key>`, `--secret-key=<key>`
  - `--prefix <prefix>`, `--prefix=<prefix>`
  - `--organization-id <id>`, `--organization-id=<id>`
  - `--fail-on-orphans`
  - `--exclude-quarantined`
  - `--no-force-path-style`
  - `--dry-run`
  - `--help`, `-h`
- Set `showHelp: true` when `--help` or `-h` is encountered.
- Enforce that singleton options (`--output`, `--cwd`, `--bucket`, `--endpoint`, `--region`,
  `--access-key`, `--secret-key`, `--prefix`, `--organization-id`) may be specified at most once.
- Reject empty, whitespace-only, or dash-prefixed values for value options.
- Reject unknown options and positional arguments with descriptive, value-free error messages.
- Resolve relative `--output` paths against `parsed.cwd`.

### 2. Atomic, exclusive receipt publication

Implement and export `publishReceipt(outputFile, report)`:
- Resolve destination path cleanly.
- Verify that the target file does not already exist; if it exists (or is a symlink), fail
  with `'output file already exists'` without modifying or overwriting it.
- Verify that the parent directory exists and is a directory.
- Write report JSON to a unique temporary sibling file in the same directory
  (e.g. `${outputFile}.tmp.${randomUUID()}`).
- Atomically link or rename the temporary file to the final destination using exclusive semantics
  (`fs.linkSync` or atomic rename where link is unsupported).
- Clean up any temporary files on error.

### 3. Programmatic CLI runner with sanitized diagnostics

Implement and export `main(argv = process.argv, io = { log: console.log, error: console.error }, options = {})`:
- Parse CLI arguments via `parseCliArguments`.
- On `showHelp: true`, print standard usage text to `io.log` and return 0.
- Catch `ReconcileUsageError`, log `reconciliation usage error: ${error.message}`, print usage,
  and return 1 (exiting with code 1 if `options.exitOnError !== false`).
- Sanitize database and S3 connection errors: map internal connection failures, credential
  errors, and filesystem errors to fixed safe diagnostics (e.g. `'PostgreSQL connection failed'`,
  `'PostgreSQL password is required'`, `'Object storage connection failed'`) without
  reflecting connection URIs, passwords, or access keys.
- Write evidence exclusively when output path is specified.
- Set `process.exitCode = exitCode` instead of calling `process.exit(exitCode)` to allow
  stdio streams to flush naturally.
- In `if (require.main === module)`: invoke `main()`.

### 4. Comprehensive test suite expansion

In `scripts/ops/reconcile-storage-objects.spec.js`:
- Retain all 10 existing pure calculation and formatting tests.
- Add test suites for `parseCliArguments`:
  - Valid space-separated and attached options.
  - `--help` and `-h` returning `showHelp: true`.
  - Rejection of unknown options and positional arguments.
  - Rejection of missing values and dash-prefixed values.
  - Rejection of repeated options.
  - `--cwd` resolution.
- Add test suites for `publishReceipt`:
  - Successful atomic write to absent destination.
  - Rejection of pre-existing destination file.
  - Rejection of non-existent parent directory.
  - Tempfile cleanup on write failure.
- Add test suites for `main()` runner:
  - `--help` output and zero exit code.
  - Usage error output and non-zero exit code.
  - Sanitized error messages on missing credentials.
  - Clean execution with mock DB and S3 clients.

## Verification plan

Run the checks and verify output:
1. `npm run ops:reconcile-test` — all unit tests pass (10 existing + new CLI/publication tests).
2. `npm run ops:check` — all 34 independent operations stages pass.
3. `npm run lint` — ESLint across all workspaces passes.
4. `npm run typecheck` — TypeScript checks across all workspaces pass.
5. `npm run build` — Shared, client, and server production builds pass.
6. `git diff --check` — verify no trailing whitespace or unresolved conflict markers.

## SKILLS USED

- `architecture-patterns`: modular operations tool and CLI boundary preservation.
- `deployment-pipeline-design`: disaster recovery rehearsal and drill orchestration integration.
- `secrets-management`: credential and key protection, zero secret reflection.
- `security-best-practices`: input validation, defensive parsing, and secure file publication.
- `security-threat-model`: receipt tamper-resistance and audit log immutability.
- `javascript-testing-patterns`: Node.js test runner unit and integration suites.
- `requesting-code-review`: two-stage code review dispatcher (§2, §2.1).
- `receiving-code-review`: review evaluation and technical verification (§2, §2.1).
- `caveman-commit`: conventional commit authoring (§3, §7).
