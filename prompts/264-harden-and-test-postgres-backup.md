# 264 — harden and test postgres backup

## Scope and why this is next

Parent phase: Phase 12K, within `docs/build-plan.md` §13/§22. Planning baseline:
`4e49c44` (`fix(ops): harden and test audit dependencies`), clean worktree on
2026-10-04 before this prompt was written.

Following Prompt 257 (hardening and testing `launch-readiness.sh`), Prompts 258–259
(modularizing and hardening `check-production-templates.js`), Prompt 260
(hardening and testing `check-production-templates.sh`), Prompt 261
(hardening and testing `check-docker-runtime.sh`), Prompt 262
(hardening and testing `scan-secrets.sh`), and Prompt 263
(hardening and testing `audit-dependencies.sh`), `scripts/ops/backup-postgres.sh`
is the core operational PostgreSQL backup script executing `pg_dump` with
structured parameters, custom archive format (`--format=custom`), permission
hardening (`chmod 700` on archive directory, `chmod 600` on archive file), and
credential fallbacks (`PGPASSWORD`, `POSTGRES_PASSWORD`, `POSTGRES_SUPERUSER_PASSWORD`,
`ACRES_MIGRATOR_PASSWORD`). It is registered in root npm scripts (`ops:backup`) and
documented in `docs/operations.md`, `docs/launch-checklist.md`, and `docs/security.md`.

Currently, `scripts/ops/backup-postgres.sh` exhibits concrete defects:
1. It silently ignores all command-line arguments: passing `--help`, `-h`,
   `--invalid-flag`, or positional arguments attempts to invoke `pg_dump` and
   fails on missing `PGPASSWORD` rather than displaying usage or failing closed on
   invalid options.
2. It hardcodes execution against the caller's working directory (`$PWD`) with no
   `--cwd` option for cross-directory or repository root targeting.
3. It provides no `--dry-run` flag to validate parameters, credentials, directory
   permissions, and `pg_dump` availability without running a database dump.
4. It lacks CLI options to configure `--backup-dir`, `--host`, `--port`, `--user`,
   `--dbname`, or a custom `--output-file`.
5. It does not verify that `pg_dump` is installed and available in `$PATH` before
   attempting execution, causing raw shell command-not-found failures if PostgreSQL
   client utilities are missing.
6. It does not validate port numbers: non-numeric, negative, zero, or out-of-range
   ports are passed unchecked to `pg_dump`.
7. It has no dedicated test specification (`backup-postgres.spec.js` does not exist),
   leaving argument parsing, directory targeting, port validation, credential
   fallbacks, tool checks, dry-run mode, permissions, and error handling untested.
8. There is no npm test script (`ops:backup-test`) and it is not wired into
   `ops:check`.
9. Neither `scripts/ops/backup-postgres.sh` nor `scripts/ops/backup-postgres.spec.js`
   is asserted in `scripts/ops/check-production-templates.sh` or
   `check-production-templates-shell.spec.js`.

Harden `scripts/ops/backup-postgres.sh` to enforce strict POSIX argument validation,
portable directory targeting via `--cwd`, customizable `--backup-dir`, `--host`,
`--port`, `--user`, `--dbname`, `--output-file`, and `--dry-run`, fail-closed
prerequisite verification (`pg_dump` in PATH, valid port 1..65535, required credentials),
establish a comprehensive test suite in `scripts/ops/backup-postgres.spec.js`, wire the
test into `package.json`, require both files in `check-production-templates.sh`, and
update documentation in `docs/operations.md` and `docs/build-plan.md`.

This is a dependency-safe operational hardening and contract testing step within
Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning reproduction against the committed script, without changing code:

```text
bash scripts/ops/backup-postgres.sh --help -> fails on missing PGPASSWORD (ignores --help)
bash scripts/ops/backup-postgres.sh --invalid -> fails on missing PGPASSWORD (ignores flag)
```

## References read and execution prerequisites

Planning read:
- `AGENTS.md`: workflow, phase commands, prompt contract, product, verification,
  standing review, and local commit requirements.
- `docs/build-plan.md`: ordered phases, Phase 12 outcome/exit gate, Phase 12K
  evidence qualifications, and prompts 257–263 implemented records.
- `docs/operations.md`: production runbooks, Phase 12K, and prompts 257–263
  shell orchestrator and operational check contracts.
- `docs/launch-checklist.md`: launch prerequisites, category map, and §6A operator
  gap register.
- `docs/system-architecture.md` §§11–12: production topology, secret reference posture,
  and deployment security.
- `docs/security.md`: assets, trust boundaries, and backup integrity.
- `docs/skills.md`: locked skills and trigger manifest.
- `prompts/263-harden-and-test-audit-dependencies.md`.

Code inspected:
- `scripts/ops/backup-postgres.sh`.
- `scripts/ops/restore-postgres.sh`.
- `scripts/ops/run-restore-drill.sh`.
- `scripts/ops/audit-dependencies.sh` and `audit-dependencies.spec.js`.
- `scripts/ops/scan-secrets.sh` and `scan-secrets.spec.js`.
- `scripts/ops/check-docker-runtime.sh` and `check-docker-runtime.spec.js`.
- `scripts/ops/check-production-templates.sh` and `check-production-templates-shell.spec.js`.
- `package.json`.

## Non-goals

- Modifying `scripts/ops/restore-postgres.sh` or `scripts/ops/run-restore-drill.sh`
  (reserved for subsequent dependency-safe steps).
- Executing a live production database backup or establishing off-host scheduling
  under this prompt.
- Modifying PostgreSQL database schema, migrations, or role permissions.
- Operator sign-off or production evidence collection under prompt 201.
- Pushing to remote repositories.

## Implementation details

### 1. Harden `scripts/ops/backup-postgres.sh`

- Use strict `/bin/sh` syntax (`set -eu`).
- Add helper functions:
  * `usage()`: print command syntax, options, and descriptions to stdout or stderr.
    `Usage: scripts/ops/backup-postgres.sh [--cwd <path> | --cwd=<path>] [--backup-dir <dir> | --backup-dir=<dir>] [--host <host> | --host=<host>] [--port <port> | --port=<port>] [--user <user> | --user=<user>] [--dbname <db> | --dbname=<db>] [--output-file <file> | --output-file=<file>] [--dry-run]`
  * `fail()`: print formatted error `backup error: <msg>` to stderr and exit 1.
- CLI argument parsing:
  * Support `--help` and `-h` (print usage to stdout and exit 0).
  * Support `--cwd <path>` and `--cwd=<path>` (optional working directory, defaults to `.`).
  * Support `--backup-dir <dir>` and `--backup-dir=<dir>` (optional archive directory, defaults to `$BACKUP_DIR` or `backups`).
  * Support `--host <host>` and `--host=<host>` (optional database host, defaults to `$PGHOST` or `localhost`).
  * Support `--port <port>` and `--port=<port>` (optional database port, defaults to `$PGPORT` or `5432`). Validate positive integer between 1 and 65535.
  * Support `--user <user>` and `--user=<user>` (optional database user, defaults to `$PGUSER` or `$POSTGRES_USER` or `postgres`).
  * Support `--dbname <db>` and `--dbname=<db>` (optional database name, defaults to `$PGDATABASE` or `$POSTGRES_DB` or `acres`).
  * Support `--output-file <file>` and `--output-file=<file>` (optional exact destination file).
  * Support `--dry-run` (validate inputs, tools, directory permissions, and credential presence without executing `pg_dump`).
  * Reject unknown options with `Error: Unknown option "<opt>"` and usage to stderr, exit 1.
  * Reject unexpected positional arguments with `Error: Unexpected argument "<arg>"` and usage to stderr, exit 1.
  * Reject missing/empty/whitespace/repeated options with descriptive errors and usage to stderr, exit 1.
- Target directory and file path resolution:
  * Validate that the resolved target directory exists (`if [ ! -d "$TARGET_CWD" ]; then fail "target directory does not exist: $TARGET_CWD"; fi`).
  * Resolve canonical absolute path: `RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"`.
  * If `--backup-dir` is relative, resolve it relative to `$RESOLVED_CWD`.
  * If `--output-file` is relative, resolve it relative to `$RESOLVED_CWD`.
  * Default `--output-file` to `${RESOLVED_BACKUP_DIR}/acres-db-${TIMESTAMP}.dump`.
- Prerequisite validation:
  * Verify `pg_dump` exists:
    `command -v pg_dump >/dev/null 2>&1 || fail "pg_dump utility not found in PATH"`
  * Validate password fallback chain:
    Check `PGPASSWORD`, then `POSTGRES_PASSWORD`, then `POSTGRES_SUPERUSER_PASSWORD`, then `ACRES_MIGRATOR_PASSWORD`.
    If empty, fail closed with `fail "PGPASSWORD environment variable is required"`. Never log passwords.
- Directory and permissions setup:
  * Ensure the destination directory exists and set permissions to 0700:
    `mkdir -p "$OUTPUT_DIR"`
    `chmod 700 "$OUTPUT_DIR"`
- Dry-run handling:
  * If `--dry-run` is active:
    Print planned parameters:
    ```text
    [dry-run] PostgreSQL backup plan:
    [dry-run]   Host: <host>
    [dry-run]   Port: <port>
    [dry-run]   User: <user>
    [dry-run]   Database: <db>
    [dry-run]   Output file: <file>
    [dry-run] Dry run completed successfully.
    ```
    Exit 0 without invoking `pg_dump`.
- Backup execution:
  * Print startup message:
    `printf 'Starting PostgreSQL backup for database "%s" on %s:%s...\n' "$PGDATABASE" "$PGHOST" "$PGPORT"`
  * Run `pg_dump` with structured parameters:
    ```sh
    PGHOST="$PGHOST" PGPORT="$PGPORT" PGUSER="$PGUSER" PGDATABASE="$PGDATABASE" PGPASSWORD="$PGPASSWORD" \
      pg_dump --format=custom --no-owner --no-privileges --file="$RESOLVED_OUTPUT_FILE"
    ```
  * Verify output file exists and is non-empty:
    `if [ ! -s "$RESOLVED_OUTPUT_FILE" ]; then rm -f "$RESOLVED_OUTPUT_FILE"; fail "generated backup file is empty or missing: $RESOLVED_OUTPUT_FILE"; fi`
  * Harden file permissions to 0600:
    `chmod 600 "$RESOLVED_OUTPUT_FILE"`
  * Compute file size and print success message:
    `FILE_BYTES="$(wc -c < "$RESOLVED_OUTPUT_FILE" | tr -d ' ')"`
    `printf 'PostgreSQL backup completed successfully: %s (%s bytes)\n' "$RESOLVED_OUTPUT_FILE" "$FILE_BYTES"`

### 2. Create `scripts/ops/backup-postgres.spec.js`

Write comprehensive unit and contract tests using Node.js built-in test runner (`node:test` and `node:assert/strict`):
1. CLI argument validation tests:
   - `--help` and `-h` print usage to stdout and exit 0.
   - Unknown options (e.g. `--invalid-flag`, `-x`) exit 1 with error and usage to stderr.
   - Unexpected positional arguments (e.g. `unexpected-arg`) exit 1 with error and usage to stderr.
   - Missing `--cwd` value exits 1 with descriptive error to stderr.
   - Repeated `--cwd` option exits 1 with descriptive error to stderr.
   - Empty or whitespace `--cwd` value exits 1 with descriptive error to stderr.
   - Non-existent `--cwd` directory exits 1 with descriptive error to stderr.
   - Missing `--backup-dir`, `--host`, `--port`, `--user`, `--dbname`, `--output-file` values exit 1.
   - Repeated `--backup-dir`, `--host`, `--port`, `--user`, `--dbname`, `--output-file` options exit 1.
   - Empty or whitespace `--backup-dir`, `--host`, `--port`, `--user`, `--dbname`, `--output-file` exit 1.
   - Invalid port values (negative, non-numeric, 0, >65535) exit 1 with descriptive error.
   - Both `--option <val>` and `--option=<val>` syntax are supported across all options.
2. Tool prerequisite and environment tests:
   - Missing `pg_dump` from `PATH` exits 1 with `backup error: pg_dump utility not found in PATH`.
   - Missing all password environment variables exits 1 with `backup error: PGPASSWORD environment variable is required`.
   - Credential fallback: succeeds with `PGPASSWORD`.
   - Credential fallback: succeeds with `POSTGRES_PASSWORD`.
   - Credential fallback: succeeds with `POSTGRES_SUPERUSER_PASSWORD`.
   - Credential fallback: succeeds with `ACRES_MIGRATOR_PASSWORD`.
3. Dry-run mode tests:
   - `--dry-run` with valid credentials prints plan and exits 0 without invoking `pg_dump`.
   - `--dry-run` still checks for missing credentials and fails closed.
   - `--dry-run` still checks for missing `pg_dump` and fails closed.
   - `--dry-run` creates the backup directory with 0700 permissions.
4. Mock execution and failure handling (using isolated temporary PATH mock `pg_dump` binary):
   - Successful backup creates file with 0600 permissions, directory with 0700 permissions, and outputs file size.
   - Validates that `pg_dump` received correct flags (`--format=custom`, `--no-owner`, `--no-privileges`, `--file=...`) and environment.
   - Empty dump output from `pg_dump` removes the empty file, exits 1, and reports `generated backup file is empty or missing`.
   - Non-zero exit code from `pg_dump` causes script to exit non-zero.
5. Directory targeting and custom output:
   - Explicit `--output-file` writes dump to specified path and creates parent directory if needed.
   - Explicit `--backup-dir` places timestamped dump inside custom directory.
   - Explicit `--cwd` properly anchors relative backup and output paths.

### 3. Update `package.json`

- Add script:
  `"ops:backup-test": "node --test scripts/ops/backup-postgres.spec.js"`
- Update `"ops:check"`:
  Include `npm run ops:backup-test`.

### 4. Update `scripts/ops/check-production-templates.sh` and tests

- In `scripts/ops/check-production-templates.sh`:
  * Add `require_file scripts/ops/backup-postgres.sh`.
  * Add `require_file scripts/ops/backup-postgres.spec.js`.
- In `scripts/ops/check-production-templates-shell.spec.js`:
  * Add `scripts/ops/backup-postgres.sh` and `scripts/ops/backup-postgres.spec.js` to `REQUIRED_FILES`.

### 5. Update documentation

- Update `docs/operations.md` recording the hardened `backup-postgres.sh` CLI options, fail-closed assertions, and test coverage.
- Update `docs/build-plan.md` recording Prompt 264's contracts, verification outputs, and limitations.

## SKILLS USED

- `postgres-best-practices`: verify PostgreSQL dump flags, custom archive format, owner and privilege stripping for portability, and bypass-RLS role handling.
- `security-best-practices`: enforce permission hardening (0700 directory, 0600 dump file), secure credential resolution without logging secrets, and fail-closed validation.
- `secrets-management`: guarantee database passwords are resolved cleanly from environment variables without exposure.
- `javascript-testing-patterns`: design and implement robust Node.js test runner specifications in `scripts/ops/backup-postgres.spec.js` using isolated temporary fixtures, mock binaries, and subprocess execution.
- `error-handling-patterns`: enforce fail-fast validation, precise usage error messages, cleanup of empty/corrupt dumps, and controlled exit codes.
- `requesting-code-review`: dispatch reviewer subagent with structured context, requirements, and test evidence.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor and verify codebase reality before committing.
- `caveman-commit`: author terse Conventional Commit message upon completion.

## Verification plan and commands

1. Syntax and static checks:
   - Shell syntax verification: `sh -n scripts/ops/backup-postgres.sh`.
   - Node syntax verification: `node -c scripts/ops/backup-postgres.spec.js`.
   - Code formatting: `npx prettier --check scripts/ops/backup-postgres.spec.js scripts/ops/check-production-templates-shell.spec.js package.json`.
2. Focused test execution:
   - `node --test scripts/ops/backup-postgres.spec.js`.
   - `npm run ops:backup-test`.
   - CLI help: `scripts/ops/backup-postgres.sh --help`.
   - CLI invalid option: `scripts/ops/backup-postgres.sh --invalid` (expect exit 1).
   - CLI dry-run: `PGPASSWORD=dummy scripts/ops/backup-postgres.sh --dry-run`.
3. Downstream and integration suites:
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
