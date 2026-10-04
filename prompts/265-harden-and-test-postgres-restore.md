# 265 — harden and test postgres restore

## Scope and why this is next

Parent phase: Phase 12K, within `docs/build-plan.md` §13/§22. Planning baseline:
`831d7ff` (`fix(ops): harden and test postgres backup`), clean worktree on
2026-10-04 before this prompt was written.

Following Prompt 257 (hardening and testing `launch-readiness.sh`), Prompts 258–259
(modularizing and hardening `check-production-templates.js`), Prompt 260
(hardening and testing `check-production-templates.sh`), Prompt 261
(hardening and testing `check-docker-runtime.sh`), Prompt 262
(hardening and testing `scan-secrets.sh`), Prompt 263
(hardening and testing `audit-dependencies.sh`), and Prompt 264
(hardening and testing `backup-postgres.sh`), `scripts/ops/restore-postgres.sh`
is the core operational PostgreSQL restore script executing `pg_restore` with
custom archive options, database connectivity checks via `pg_isready`, post-restore
table verification via `psql`, and credential resolution across fallback
environment variables (`PGPASSWORD`, `POSTGRES_PASSWORD`, `POSTGRES_SUPERUSER_PASSWORD`,
`ACRES_MIGRATOR_PASSWORD`). It is registered in root npm scripts (`ops:restore`),
invoked by `scripts/ops/run-restore-drill.sh` (line 195:
`PGDATABASE="$DRILL_DB" scripts/ops/restore-postgres.sh "$CREATED_BACKUP"`), and
documented in `docs/operations.md`, `docs/launch-checklist.md`, and `docs/security.md`.

Currently, `scripts/ops/restore-postgres.sh` exhibits concrete defects:
1. It does not parse standard POSIX CLI options: passing `--help` or `-h` treats
   the flag as a backup file path and fails with `restore error: backup file does not exist: --help`
   (exit code 1) instead of displaying clean usage and exiting 0.
2. Passing unknown options (e.g. `--invalid`) treats the flag as a backup file name
   rather than failing fast on unrecognized CLI arguments.
3. It hardcodes execution against the caller's working directory (`$PWD`) with no
   `--cwd` option for cross-directory or repository root targeting.
4. It only accepts a single positional argument for the backup file, lacking named
   flags (`--file <file>`, `--file=<file>`, `--input-file <file>`, `--input-file=<file>`),
   while failing to reject unexpected trailing arguments when multiple positional
   arguments are passed.
5. It lacks CLI options to configure `--host`, `--port`, `--user`, or `--dbname`,
   forcing callers to rely exclusively on environment variables.
6. It hardcodes `--clean --if-exists` in `pg_restore` with no option to toggle or
   explicitly specify clean mode (`--clean` vs `--no-clean`).
7. It provides no `--dry-run` flag to validate parameters, credentials, backup file
   existence/readability/non-emptiness, target connectivity, and tool availability
   without performing destructive database restoration statements.
8. It does not verify that required PostgreSQL client tools (`pg_restore`, `psql`,
   `pg_isready`) exist in `$PATH` before execution, causing unhandled shell
   command-not-found failures if utilities are absent.
9. It does not validate port numbers: non-numeric, zero, negative, or out-of-range
   ports (>65535) are passed unchecked.
10. Credential propagation defect: when `PGPASSWORD` is not set in the parent
    environment but resolved from `POSTGRES_PASSWORD` or other fallbacks, it is
    stored in a local shell variable without being exported or explicitly passed to
    the subshell invocations of `pg_restore` and `psql`, causing authentication
    failures.
11. Table verification weakness: the restored table count from `psql` is not validated
    to be a valid integer, allowing malformed or empty output to be reported as success.
12. It has no dedicated test specification (`restore-postgres.spec.js` does not exist),
    leaving argument parsing, directory targeting, port validation, credential
    fallbacks, tool checks, dry-run mode, backup file validation, clean mode, mock
    restore execution, and error handling untested.
13. There is no npm test script (`ops:restore-test`) and it is not wired into `ops:check`.
14. Neither `scripts/ops/restore-postgres.sh` nor `scripts/ops/restore-postgres.spec.js`
    is asserted in `scripts/ops/check-production-templates.sh` or
    `check-production-templates-shell.spec.js`.

Harden `scripts/ops/restore-postgres.sh` to enforce strict POSIX argument validation,
portable directory targeting via `--cwd`, customizable `--host`, `--port`, `--user`,
`--dbname`, `--file` / `--input-file` (with 100% backward-compatible positional argument
support for `run-restore-drill.sh`), `--clean` / `--no-clean` toggle, and `--dry-run`,
fail-closed prerequisite verification (`pg_restore`, `psql`, `pg_isready` in PATH, valid
port 1..65535, non-empty readable file, required credentials passed securely), establish
a comprehensive test suite in `scripts/ops/restore-postgres.spec.js`, wire the test into
`package.json`, require both files in `check-production-templates.sh`, and update
documentation in `docs/operations.md` and `docs/build-plan.md`.

This is a dependency-safe operational hardening and contract testing step within
Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning reproduction against the committed script, without changing code:

```text
bash scripts/ops/restore-postgres.sh --help -> fails with "restore error: backup file does not exist: --help"
bash scripts/ops/restore-postgres.sh --invalid -> fails with "restore error: backup file does not exist: --invalid"
```

## References read and execution prerequisites

Planning read:
- `AGENTS.md`: workflow, phase commands, prompt contract, product, verification,
  standing review, and local commit requirements.
- `docs/build-plan.md`: ordered phases, Phase 12 outcome/exit gate, Phase 12K
  evidence qualifications, and prompts 257–264 implemented records.
- `docs/operations.md`: production runbooks, Phase 12K, and prompts 257–264
  shell orchestrator, operational check, and backup contracts.
- `docs/launch-checklist.md`: launch prerequisites, category map, and §6A operator
  gap register.
- `docs/system-architecture.md` §§11–12: production topology, secret reference posture,
  and deployment security.
- `docs/security.md`: assets, trust boundaries, and restore integrity.
- `docs/skills.md`: locked skills and trigger manifest.
- `prompts/264-harden-and-test-postgres-backup.md`.

Code inspected:
- `scripts/ops/restore-postgres.sh`.
- `scripts/ops/backup-postgres.sh` and `backup-postgres.spec.js`.
- `scripts/ops/run-restore-drill.sh` and `run-restore-drill.spec.js`.
- `scripts/ops/check-production-templates.sh` and `check-production-templates-shell.spec.js`.
- `package.json`.

## Non-goals

- Modifying `scripts/ops/run-restore-drill.sh` (already tested and working; compatibility
  with its positional argument invocation pattern must be preserved).
- Executing a live production database restore or modifying production data.
- Modifying PostgreSQL database schema, migrations, or role permissions.
- Operator sign-off or production evidence collection under prompt 201.
- Pushing to remote repositories.

## Implementation details

### 1. Harden `scripts/ops/restore-postgres.sh`

- Use strict `/bin/sh` syntax (`set -eu`).
- Add helper functions:
  * `usage()`: print command syntax, options, and descriptions to stdout or stderr.
    `Usage: scripts/ops/restore-postgres.sh [<backup-file>] [--file <file> | --file=<file>] [--input-file <file> | --input-file=<file>] [--cwd <path> | --cwd=<path>] [--host <host> | --host=<host>] [--port <port> | --port=<port>] [--user <user> | --user=<user>] [--dbname <db> | --dbname=<db>] [--clean | --no-clean] [--dry-run]`
  * `fail()`: print formatted error `restore error: <msg>` to stderr and exit 1.
- CLI argument parsing:
  * Support `--help` and `-h` (print usage to stdout and exit 0).
  * Support `--cwd <path>` and `--cwd=<path>` (optional working directory, defaults to `.`).
  * Support `--host <host>` and `--host=<host>` (optional database host, defaults to `$PGHOST` or `localhost`).
  * Support `--port <port>` and `--port=<port>` (optional database port, defaults to `$PGPORT` or `5432`). Validate positive integer between 1 and 65535.
  * Support `--user <user>` and `--user=<user>` (optional database user, defaults to `$PGUSER` or `$POSTGRES_USER` or `postgres`).
  * Support `--dbname <db>` and `--dbname=<db>` (optional database name, defaults to `$PGDATABASE` or `$POSTGRES_DB` or `acres`).
  * Support `--file <file>`, `--file=<file>`, `--input-file <file>`, and `--input-file=<file>` (explicit backup file option).
  * Support positional `<backup-file>` argument (for full backwards compatibility with `run-restore-drill.sh`). Reject multiple positional arguments or clashing `--file` with positional argument.
  * Support `--clean` (explicitly enable clean mode, default: enabled) and `--no-clean` (disable clean mode in `pg_restore`). Reject conflicting `--clean` and `--no-clean` options.
  * Support `--dry-run` (validate inputs, tools, file presence/readability/non-emptiness, target connectivity, and credentials without executing `pg_restore` or DDL).
  * Reject unknown options with `Error: Unknown option "<opt>"` and usage to stderr, exit 1.
  * Reject unexpected arguments with `Error: Unexpected argument "<arg>"` and usage to stderr, exit 1.
  * Reject missing/empty/whitespace/repeated options with descriptive errors and usage to stderr, exit 1.
- Target directory and backup file path resolution:
  * Validate that the resolved target directory exists (`if [ ! -d "$TARGET_CWD" ]; then fail "target directory does not exist: $TARGET_CWD"; fi`).
  * Resolve canonical absolute path: `RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"`.
  * Ensure a backup file was provided (either positional or via `--file` / `--input-file`). If missing, fail with `fail "backup file path is required"`.
  * If the backup file path is relative, resolve it relative to `$RESOLVED_CWD`.
  * Validate that the backup file exists: `if [ ! -e "$RESOLVED_BACKUP_FILE" ]; then fail "backup file does not exist: $RESOLVED_BACKUP_FILE"; fi`.
  * Validate that the backup file is a regular file: `if [ ! -f "$RESOLVED_BACKUP_FILE" ]; then fail "backup target is not a regular file: $RESOLVED_BACKUP_FILE"; fi`.
  * Validate that the backup file is readable: `if [ ! -r "$RESOLVED_BACKUP_FILE" ]; then fail "backup file is not readable: $RESOLVED_BACKUP_FILE"; fi`.
  * Validate that the backup file is non-empty: `if [ ! -s "$RESOLVED_BACKUP_FILE" ]; then fail "backup file is empty: $RESOLVED_BACKUP_FILE"; fi`.
- Prerequisite validation:
  * Verify `pg_restore` exists: `command -v pg_restore >/dev/null 2>&1 || fail "pg_restore utility not found in PATH"`.
  * Verify `psql` exists: `command -v psql >/dev/null 2>&1 || fail "psql utility not found in PATH"`.
  * Verify `pg_isready` exists: `command -v pg_isready >/dev/null 2>&1 || fail "pg_isready utility not found in PATH"`.
  * Validate password fallback chain:
    Check `PGPASSWORD`, then `POSTGRES_PASSWORD`, then `POSTGRES_SUPERUSER_PASSWORD`, then `ACRES_MIGRATOR_PASSWORD`.
    If empty, fail closed with `fail "PGPASSWORD environment variable is required"`. Never log passwords.
  * Validate port number: ensure integer 1..65535.
- Dry-run handling:
  * If `--dry-run` is active:
    Print planned parameters:
    ```text
    [dry-run] PostgreSQL restore plan:
    [dry-run]   Host: <host>
    [dry-run]   Port: <port>
    [dry-run]   User: <user>
    [dry-run]   Database: <dbname>
    [dry-run]   Backup file: <file> (<bytes> bytes)
    [dry-run]   Clean mode: <enabled/disabled>
    [dry-run] Dry run completed successfully.
    ```
    Exit 0 without modifying the database.
- Database connectivity check:
  * Print connection check notice:
    `printf 'Checking target PostgreSQL connection on %s:%s...\n' "$RESOLVED_PGHOST" "$RESOLVED_PGPORT"`
  * Run `pg_isready`:
    `PGHOST="$RESOLVED_PGHOST" PGPORT="$RESOLVED_PGPORT" PGUSER="$RESOLVED_PGUSER" PGPASSWORD="$RESOLVED_PGPASSWORD" pg_isready -h "$RESOLVED_PGHOST" -p "$RESOLVED_PGPORT" >/dev/null 2>&1 || fail "PostgreSQL is not ready on $RESOLVED_PGHOST:$RESOLVED_PGPORT"`
- Restore execution:
  * Print startup message:
    `printf 'Restoring %s into database "%s" on %s:%s...\n' "$RESOLVED_BACKUP_FILE" "$RESOLVED_PGDATABASE" "$RESOLVED_PGHOST" "$RESOLVED_PGPORT"`
  * Run `pg_restore`:
    If clean mode is enabled:
    ```sh
    PGHOST="$RESOLVED_PGHOST" PGPORT="$RESOLVED_PGPORT" PGUSER="$RESOLVED_PGUSER" PGDATABASE="$RESOLVED_PGDATABASE" PGPASSWORD="$RESOLVED_PGPASSWORD" \
      pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$RESOLVED_PGDATABASE" "$RESOLVED_BACKUP_FILE"
    ```
    If clean mode is disabled:
    ```sh
    PGHOST="$RESOLVED_PGHOST" PGPORT="$RESOLVED_PGPORT" PGUSER="$RESOLVED_PGUSER" PGDATABASE="$RESOLVED_PGDATABASE" PGPASSWORD="$RESOLVED_PGPASSWORD" \
      pg_restore --no-owner --no-privileges --dbname="$RESOLVED_PGDATABASE" "$RESOLVED_BACKUP_FILE"
    ```
- Post-restore verification:
  * Query public schema table count using `psql`:
    ```sh
    TABLE_COUNT="$(
      PGHOST="$RESOLVED_PGHOST" PGPORT="$RESOLVED_PGPORT" PGUSER="$RESOLVED_PGUSER" PGDATABASE="$RESOLVED_PGDATABASE" PGPASSWORD="$RESOLVED_PGPASSWORD" \
        psql -t -A -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
    )"
    ```
  * Verify `TABLE_COUNT` is a non-empty numeric value:
    `case "$TABLE_COUNT" in ''|*[!0-9]*) fail "failed to verify public schema table count after restore" ;; esac`
  * Print completion notice:
    `printf 'PostgreSQL restore completed successfully. Verified %s tables in public schema.\n' "$TABLE_COUNT"`

### 2. Create `scripts/ops/restore-postgres.spec.js`

Write comprehensive unit and contract tests using Node.js built-in test runner (`node:test` and `node:assert/strict`):
1. CLI argument validation tests:
   - `--help` and `-h` print usage to stdout and exit 0.
   - Unknown options (e.g. `--invalid-flag`, `-x`) exit 1 with error and usage to stderr.
   - Multiple unexpected positional arguments exit 1 with error and usage to stderr.
   - Missing `--cwd` value exits 1 with descriptive error to stderr.
   - Repeated `--cwd` option exits 1 with descriptive error to stderr.
   - Empty or whitespace `--cwd` value exits 1 with descriptive error to stderr.
   - Non-existent `--cwd` directory exits 1 with descriptive error to stderr.
   - Missing `--host`, `--port`, `--user`, `--dbname`, `--file`, `--input-file` values exit 1.
   - Repeated `--host`, `--port`, `--user`, `--dbname`, `--file`, `--input-file` options exit 1.
   - Empty or whitespace `--host`, `--port`, `--user`, `--dbname`, `--file`, `--input-file` exit 1.
   - Invalid port values (negative, non-numeric, 0, >65535) exit 1 with descriptive error.
   - Conflicting `--clean` and `--no-clean` flags exit 1 with descriptive error.
   - Clashing `--file` with positional argument exits 1 with descriptive error.
   - Both `--option <val>` and `--option=<val>` syntax are supported across all options.
2. Backup file validation tests:
   - Missing backup file argument entirely exits 1 with `restore error: backup file path is required`.
   - Non-existent backup file exits 1 with `restore error: backup file does not exist`.
   - Directory specified as backup file exits 1 with `restore error: backup target is not a regular file`.
   - Empty backup file (0 bytes) exits 1 with `restore error: backup file is empty`.
3. Tool prerequisite and environment tests:
   - Missing `pg_restore` from `PATH` exits 1 with `restore error: pg_restore utility not found in PATH`.
   - Missing `psql` from `PATH` exits 1 with `restore error: psql utility not found in PATH`.
   - Missing `pg_isready` from `PATH` exits 1 with `restore error: pg_isready utility not found in PATH`.
   - Missing all password environment variables exits 1 with `restore error: PGPASSWORD environment variable is required`.
   - Credential fallback: succeeds with `PGPASSWORD`.
   - Credential fallback: succeeds with `POSTGRES_PASSWORD`.
   - Credential fallback: succeeds with `POSTGRES_SUPERUSER_PASSWORD`.
   - Credential fallback: succeeds with `ACRES_MIGRATOR_PASSWORD`.
   - Password is never printed to stdout or stderr.
4. Dry-run mode tests:
   - `--dry-run` prints execution plan (host, port, user, database, file size, clean mode) and exits 0 without invoking `pg_isready`, `pg_restore`, or `psql`.
   - `--dry-run` still checks for missing credentials and fails closed.
   - `--dry-run` still checks for missing tools and fails closed.
   - `--dry-run` still checks for missing or empty backup files and fails closed.
5. Mock execution and failure handling (using isolated temporary PATH mock binaries):
   - Successful restore executes `pg_isready`, `pg_restore`, and `psql` and outputs verified table count.
   - Validates that `pg_restore` received default flags (`--clean`, `--if-exists`, `--no-owner`, `--no-privileges`, `--dbname=...`) and environment.
   - Validates that `--no-clean` omits `--clean` and `--if-exists` from `pg_restore`.
   - Validates that `PGPASSWORD` is correctly passed in the execution environment to all tools.
   - `pg_isready` failure causes script to exit 1 with `PostgreSQL is not ready`.
   - Non-zero exit code from `pg_restore` causes script to exit non-zero.
   - `psql` non-numeric table count causes script to exit 1 with `failed to verify public schema table count after restore`.
6. Directory targeting and custom paths:
   - Positional argument resolves relative to current working directory or `--cwd`.
   - Explicit `--file` / `--input-file` resolves relative to current working directory or `--cwd`.
   - Absolute paths work regardless of `--cwd`.

### 3. Update `package.json`

- Add script:
  `"ops:restore-test": "node --test scripts/ops/restore-postgres.spec.js"`
- Update `"ops:check"`:
  Include `npm run ops:restore-test`.

### 4. Update `scripts/ops/check-production-templates.sh` and tests

- In `scripts/ops/check-production-templates.sh`:
  * Add `require_file scripts/ops/restore-postgres.sh`.
  * Add `require_file scripts/ops/restore-postgres.spec.js`.
- In `scripts/ops/check-production-templates-shell.spec.js`:
  * Add `scripts/ops/restore-postgres.sh` and `scripts/ops/restore-postgres.spec.js` to `REQUIRED_FILES`.

### 5. Update documentation

- Update `docs/operations.md` recording the hardened `restore-postgres.sh` CLI options, fail-closed assertions, and test coverage.
- Update `docs/build-plan.md` recording Prompt 265's contracts, verification outputs, and limitations.

## SKILLS USED

- `postgres-best-practices`: verify PostgreSQL restore flags, clean and if-exists options, privilege and owner handling, and public schema table verification.
- `security-best-practices`: secure credential resolution without logging secrets, credential propagation bug fix, and fail-closed validation.
- `secrets-management`: guarantee database passwords are resolved cleanly from environment variables without exposure.
- `javascript-testing-patterns`: design and implement robust Node.js test runner specifications in `scripts/ops/restore-postgres.spec.js` using isolated temporary fixtures, mock binaries, and subprocess execution.
- `error-handling-patterns`: enforce fail-fast validation, precise usage error messages, non-empty file checks, and controlled exit codes.
- `requesting-code-review`: dispatch reviewer subagent with structured context, requirements, and test evidence.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor and verify codebase reality before committing.
- `caveman-commit`: author terse Conventional Commit message upon completion.

## Verification plan and commands

1. Syntax and static checks:
   - Shell syntax verification: `sh -n scripts/ops/restore-postgres.sh`.
   - Node syntax verification: `node -c scripts/ops/restore-postgres.spec.js`.
   - Code formatting: `npx prettier --check scripts/ops/restore-postgres.spec.js scripts/ops/check-production-templates-shell.spec.js package.json`.
2. Focused test execution:
   - `node --test scripts/ops/restore-postgres.spec.js`.
   - `npm run ops:restore-test`.
   - CLI help: `scripts/ops/restore-postgres.sh --help`.
   - CLI invalid option: `scripts/ops/restore-postgres.sh --invalid` (expect exit 1).
   - CLI dry-run: `PGPASSWORD=dummy scripts/ops/restore-postgres.sh --dry-run <valid-file>`.
3. Downstream and integration suites:
   - `npm run ops:backup-test`.
   - `npm run ops:audit-test`.
   - `npm run ops:scan-secrets-test`.
   - `npm run ops:docker-runtime-test`.
   - `npm run ops:templates-test`.
   - `npm run ops:templates-shell-test`.
   - `npm run ops:templates`.
   - `npm run ops:launch-readiness-test`.
   - `npm run ops:readiness-test`.
   - `npm run ops:launch-drill-test`.
   - `npm run lint`.
   - `npm run typecheck`.
   - `npm run build`.
   - `git diff --check`.
