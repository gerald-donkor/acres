# 266 — harden and test restore drill

## Scope and why this is next

Parent phase: Phase 12K, within `docs/build-plan.md` §13/§22. Planning baseline:
`9ea3ff7` (`fix(ops): harden and test postgres restore`), clean worktree on
2026-10-04 before this prompt was written.

Following Prompt 257 (hardening and testing `launch-readiness.sh`), Prompts 258–259
(modularizing and hardening `check-production-templates.js`), Prompt 260
(hardening and testing `check-production-templates.sh`), Prompt 261
(hardening and testing `check-docker-runtime.sh`), Prompt 262
(hardening and testing `scan-secrets.sh`), Prompt 263
(hardening and testing `audit-dependencies.sh`), Prompt 264
(hardening and testing `backup-postgres.sh`), and Prompt 265
(hardening and testing `restore-postgres.sh`), `scripts/ops/run-restore-drill.sh`
is the core operational disaster recovery restore drill runner. It creates an
isolated target drill database, takes a fresh source dump via `pg_dump`, validates
archive structure via `pg_restore --list`, invokes `restore-postgres.sh`, verifies
table/migration/PostGIS/foreign-key/record parity, measures local RTO against
`RTO_TARGET_SECONDS`, cleans up owned resources (or retains them on request), and
publishes Category 6 disaster recovery simulation evidence. It is registered in root
npm scripts (`ops:restore-drill`, `ops:restore-drill-test`), called in `npm run ops:check`,
and documented in `docs/operations.md`, `docs/launch-checklist.md`, and `docs/security.md`.

Currently, `scripts/ops/run-restore-drill.sh` exhibits concrete defects and gaps:

1. It does not parse standard POSIX attached option format: passing `--source-db=name`,
   `--drill-db=name`, `--backup-dir=dir`, `--evidence-file=file`, or `--rto-target-seconds=100`
   fails with `drill error: unknown option <arg>` (exit code 1) instead of parsing the value.
2. It hardcodes execution against the caller's working directory with no `--cwd <path>`
   or `--cwd=<path>` option for cross-directory or repository root targeting.
3. It hardcodes relative execution of `scripts/ops/restore-postgres.sh` (line 195:
   `PGDATABASE="$DRILL_DB" scripts/ops/restore-postgres.sh "$CREATED_BACKUP"`). If the script
   is executed with a different working directory or caller path, `restore-postgres.sh`
   fails to resolve unless anchored to the script directory (`SCRIPT_DIR`).
4. It lacks CLI options to configure `--host <host>` / `--host=<host>`, `--port <port>` /
   `--port=<port>`, `--user <user>` / `--user=<user>`, forcing callers to rely exclusively
   on environment variables.
5. It does not validate port numbers: non-numeric, zero, negative, out-of-range ports
   (>65535), or multi-digit integer overflows are passed unchecked.
6. It does not verify that required tools (`pg_dump`, `pg_restore`, `psql`, `pg_isready`,
   `node`, `date`, `mktemp`) exist in `$PATH` before execution, causing unhandled shell
   command-not-found failures if utilities are absent.
7. It does not validate option arguments strictly: repeated options are silently accepted
   or overwritten, and empty or whitespace-only values are not consistently rejected upfront.
8. It does not reject unexpected positional arguments cleanly (e.g. `bash run-restore-drill.sh extra`).
9. `scripts/ops/run-restore-drill.sh` is missing from `scripts/ops/check-production-templates.sh`
   (line 126 requires `scripts/ops/run-restore-drill.spec.js`, but omits the shell runner itself)
   and from `scripts/ops/check-production-templates-shell.spec.js`.
10. `scripts/ops/run-restore-drill.spec.js` currently contains 28 tests, leaving attached option
    parsing, `--cwd` targeting, `--host`/`--port`/`--user` options, port bounds validation,
    missing prerequisite tool checks, repeated option rejection, and whitespace handling untested.

Harden `scripts/ops/run-restore-drill.sh` to enforce strict POSIX argument validation,
portable directory targeting via `--cwd`, customizable `--host`, `--port`, `--user`, attached
and separate options, fail-closed prerequisite verification, robust cleanup trap management,
expand test coverage in `scripts/ops/run-restore-drill.spec.js`, require `run-restore-drill.sh`
in `check-production-templates.sh` and `check-production-templates-shell.spec.js`, and update
documentation in `docs/operations.md` and `docs/build-plan.md`.

This is a dependency-safe operational hardening and contract testing step within
Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning reproduction against the committed script, without changing code:

```text
bash scripts/ops/run-restore-drill.sh --source-db=acres -> fails with "drill error: unknown option --source-db=acres"
bash scripts/ops/run-restore-drill.sh --cwd /tmp -> fails with "drill error: unknown option --cwd"
```

## References read and execution prerequisites

Planning read:

- `AGENTS.md`: workflow, phase commands, prompt contract, product, verification,
  standing review, and local commit requirements.
- `docs/build-plan.md`: ordered phases, Phase 12 outcome/exit gate, Phase 12K
  evidence qualifications, and prompts 257–265 implemented records.
- `docs/operations.md`: production runbooks, Phase 12K, and prompts 257–265
  shell orchestrator, operational check, backup, and restore contracts.
- `docs/launch-checklist.md`: launch prerequisites, category map, and §6A operator
  gap register.
- `docs/system-architecture.md` §§11–12: production topology, secret reference posture,
  and deployment security.
- `docs/security.md`: assets, trust boundaries, and disaster recovery restore integrity.
- `docs/skills.md`: locked skills and trigger manifest.
- `prompts/265-harden-and-test-postgres-restore.md`.

Code inspected:

- `scripts/ops/run-restore-drill.sh`.
- `scripts/ops/run-restore-drill.spec.js`.
- `scripts/ops/restore-postgres.sh` and `restore-postgres.spec.js`.
- `scripts/ops/backup-postgres.sh` and `backup-postgres.spec.js`.
- `scripts/ops/check-production-templates.sh` and `check-production-templates-shell.spec.js`.
- `package.json`.

## Non-goals

- Executing a live production database restore or modifying production data.
- Modifying PostgreSQL database schema, migrations, or role permissions.
- Operator sign-off or production evidence collection under prompt 201.
- Pushing to remote repositories.

## Implementation details

### 1. Harden `scripts/ops/run-restore-drill.sh`

- Use strict `bash` syntax (`set -euo pipefail`).
- Resolve script directory: `SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`.
- Add helper functions:
  - `usage()`: print command syntax, options, and descriptions to stdout.
    `Usage: scripts/ops/run-restore-drill.sh [options]`
  - `fail()`: print formatted error `drill error: <msg>` to stderr and exit 1.
- CLI argument parsing:
  - Support `--help` and `-h` (print usage to stdout and exit 0).
  - Support `--cwd <path>` and `--cwd=<path>` (optional target directory, defaults to `.`).
  - Support `--host <host>` and `--host=<host>` (optional database host, defaults to `$PGHOST` or `localhost`).
  - Support `--port <port>` and `--port=<port>` (optional database port, defaults to `$PGPORT` or `5432`). Validate positive integer 1..65535.
  - Support `--user <user>` and `--user=<user>` (optional database user, defaults to `$PGUSER` or `$POSTGRES_USER` or `postgres`).
  - Support `--source-db <name>` and `--source-db=<name>` (source database name, defaults to `$SOURCE_DB` or `$PGDATABASE` or `acres`).
  - Support `--drill-db <name>` and `--drill-db=<name>` (target drill database name, defaults to `$DRILL_DB` or `acres_restore_drill`).
  - Support `--backup-dir <dir>` and `--backup-dir=<dir>` (archive directory, defaults to `$BACKUP_DIR` or `backups`).
  - Support `--evidence-file <file>` and `--evidence-file=<file>` (success evidence JSON destination).
  - Support `--rto-target-seconds <sec>` and `--rto-target-seconds=<sec>` (positive integer target <= 2147483, defaults to 300).
  - Support `--keep-drill-db` (flag to retain drill database on exit).
  - Support `--keep-backup` (flag to retain archive on exit).
  - Support `--dry-run` (flag to validate inputs, tools, credentials, source and absent target without executing dump/restore).
  - Reject unknown options with `drill error: unknown option "<opt>"` and exit 1.
  - Reject unexpected arguments with `drill error: unexpected argument "<arg>"` and exit 1.
  - Reject repeated options with `drill error: repeated <opt> option; expected single value` and exit 1.
  - Reject missing, empty, or whitespace-only option values with `drill error: <opt> requires a non-empty value` and exit 1.
- Target directory and path resolution:
  - Validate that the resolved target directory exists (`if [[ ! -d "$TARGET_CWD" ]]; then fail "target directory does not exist: $TARGET_CWD"; fi`).
  - Resolve canonical absolute path: `RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"`.
  - If `--backup-dir` is relative, resolve it relative to `$RESOLVED_CWD`.
  - If `--evidence-file` is relative, resolve it relative to `$RESOLVED_CWD`.
- Database identifier validation:
  - Validate both `SOURCE_DB` and `DRILL_DB` match `^[A-Za-z_][A-Za-z_0-9]{0,62}$`.
  - Reject identical `SOURCE_DB` and `DRILL_DB` (`source and drill databases must differ`).
  - Reject protected database names for `DRILL_DB`: `postgres|template0|template1|acres`.
- Port validation:
  - Ensure port is numeric, positive integer, between 1 and 65535 (with overflow protection).
- RTO target validation:
  - Ensure `RTO_TARGET_SECONDS` is positive integer <= 2147483.
- Prerequisite validation:
  - Verify `pg_dump` exists: `command -v pg_dump >/dev/null 2>&1 || fail "pg_dump utility not found in PATH"`.
  - Verify `pg_restore` exists: `command -v pg_restore >/dev/null 2>&1 || fail "pg_restore utility not found in PATH"`.
  - Verify `psql` exists: `command -v psql >/dev/null 2>&1 || fail "psql utility not found in PATH"`.
  - Verify `pg_isready` exists: `command -v pg_isready >/dev/null 2>&1 || fail "pg_isready utility not found in PATH"`.
  - Verify `node` exists: `command -v node >/dev/null 2>&1 || fail "node utility not found in PATH"`.
- Credential resolution:
  - Resolve `PGPASSWORD` across `PGPASSWORD`, `POSTGRES_PASSWORD`, `POSTGRES_SUPERUSER_PASSWORD`, `ACRES_MIGRATOR_PASSWORD`.
  - Reject missing or whitespace-only password with `fail "PGPASSWORD is required"`. Never log passwords.
  - Export `PGHOST PGPORT PGUSER PGPASSWORD`.
- Evidence destination check:
  - If `EVIDENCE_FILE` already exists or is a symlink, fail fast with `fail "evidence destination already exists: $EVIDENCE_FILE"`.
- Pre-execution connectivity and absence checks:
  - Run `pg_isready -h "$PGHOST" -p "$PGPORT"`.
  - Run `sql postgres 'SELECT 1;'` to check maintenance db authentication.
  - Run `sql "$SOURCE_DB" 'SELECT 1;'` to check source db authentication.
  - Run `count postgres "SELECT count(*) FROM pg_database WHERE datname = '$DRILL_DB';"` to verify drill database does NOT already exist.
- Dry-run handling:
  - If `--dry-run` is active, print `[DRY RUN] Validated credentials, source and absent target.` and exit 0.
- Execution and cleanup trap:
  - Execute `restore-postgres.sh` via anchored path:
    `"$SCRIPT_DIR/restore-postgres.sh" --cwd "$RESOLVED_CWD" --host "$PGHOST" --port "$PGPORT" --user "$PGUSER" --dbname "$DRILL_DB" "$CREATED_BACKUP" || fail 'restore failed'`
  - Ensure cleanup trap handles database dropping, archive deletion (or retention if `--keep-backup` / `--keep-drill-db`), and atomic evidence publication via temp file and `ln`.

### 2. Expand `scripts/ops/run-restore-drill.spec.js`

Add tests to cover new functionality while preserving all 28 existing tests:

- `--help` and `-h` usage output.
- Unknown option rejection.
- Unexpected argument rejection.
- Repeated option rejection across all supported options (`--source-db`, `--drill-db`, `--backup-dir`, `--evidence-file`, `--rto-target-seconds`, `--host`, `--port`, `--user`, `--cwd`).
- Missing, empty, and whitespace-only option arguments.
- Attached option syntax support (`--source-db=...`, `--drill-db=...`, `--backup-dir=...`, `--evidence-file=...`, `--rto-target-seconds=...`, `--host=...`, `--port=...`, `--user=...`, `--cwd=...`).
- `--cwd` directory targeting: non-existent directory rejection, relative directory resolution, execution from subdirectories.
- Port validation: non-numeric, 0, negative, >65535, integer overflow.
- Tool prerequisite checks in `$PATH`: fail closed when `pg_dump`, `pg_restore`, `psql`, `pg_isready`, or `node` is missing.
- Credential fallbacks across `PGPASSWORD`, `POSTGRES_PASSWORD`, `POSTGRES_SUPERUSER_PASSWORD`, and `ACRES_MIGRATOR_PASSWORD`.
- Rejection of whitespace-only password.
- Verification that `--host`, `--port`, `--user`, and `--cwd` are propagated cleanly to `restore-postgres.sh`.

### 3. Update `scripts/ops/check-production-templates.sh` and `check-production-templates-shell.spec.js`

- Add `require_file scripts/ops/run-restore-drill.sh` to `scripts/ops/check-production-templates.sh`.
- Add `"scripts/ops/run-restore-drill.sh"` to `REQUIRED_FILES` in `scripts/ops/check-production-templates-shell.spec.js`.

### 4. Update documentation

- Update `docs/operations.md` with prompt 266 restore drill hardening record and updated CLI usage.
- Update `docs/build-plan.md` with prompt 266 summary and actual test verification counts.

## SKILLS USED

- `postgres-best-practices`: Database connectivity, transaction, and restore verification patterns.
- `secrets-management`: Environment variable credential handling without stdout/stderr leaking.
- `javascript-testing-patterns`: Isolated CLI fixtures, assertions, and failure/credential propagation coverage.
- `requesting-code-review`: Two-stage code review workflow dispatching reviewer subagent.
- `receiving-code-review`: Two-stage code review feedback evaluation with technical rigor.
- `caveman-commit`: Conventional commit message formulation and commit execution.

## Verification plan

Run the following checks and verify 0 exit codes:

- Shell syntax check: `bash -n scripts/ops/run-restore-drill.sh`
- Template shell check: `sh -n scripts/ops/check-production-templates.sh`
- Node syntax checks: `node -c scripts/ops/run-restore-drill.spec.js` and `node -c scripts/ops/check-production-templates-shell.spec.js`
- Test suites:
  - `npm run ops:restore-drill-test`
  - `npm run ops:restore-test`
  - `npm run ops:backup-test`
  - `npm run ops:templates-shell-test`
  - `npm run ops:templates-test`
  - `npm run ops:templates`
  - `npm run ops:scan-secrets-test`
  - `npm run ops:docker-runtime-test`
  - `npm run ops:audit-test`
  - `npm run ops:readiness-test`
  - `npm run ops:launch-drill-test`
  - `npm run ops:check`
- Root linters and builds:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
- Style and diff checks:
  - `npx prettier --check scripts/ops/run-restore-drill.sh scripts/ops/run-restore-drill.spec.js scripts/ops/check-production-templates.sh scripts/ops/check-production-templates-shell.spec.js docs/operations.md docs/build-plan.md`
  - `git diff --check`

## Execution notes

- Preserve the runner's established `nonempty value` diagnostic spelling and
  unquoted unknown/positional argument diagnostics; duplicate errors for cwd,
  host, port, and user name their expected value type. Validation behavior and
  exit status follow the plan.
- Validate leading-zero ports explicitly as decimal integers. Check `date` and
  `mktemp` prerequisites as well as PostgreSQL clients and Node.
- Forward helper options in attached form to preserve accepted option-like
  values. Tests compare expected credentials inside stubs without recording
  passwords, and exercise a full restore from another working directory.
- Prettier has no installed shell parser. Run shell syntax checks separately;
  format the changed JavaScript and new Markdown sections. Existing whole-file
  Markdown formatting warnings are baseline issues, verified against HEAD.
