# 263 — harden and test audit dependencies

## Scope and why this is next

Parent phase: Phase 12K, within `docs/build-plan.md` §13/§22. Planning baseline:
`1ef4e96` (`fix(ops): harden and test scan secrets`), clean worktree on
2026-10-04 before this prompt was written.

Following Prompt 257 (hardening and testing `launch-readiness.sh`), Prompts 258–259
(modularizing and hardening `check-production-templates.js`), Prompt 260
(hardening and testing `check-production-templates.sh`), Prompt 261
(hardening and testing `check-docker-runtime.sh`), and Prompt 262
(hardening and testing `scan-secrets.sh`), `scripts/ops/audit-dependencies.sh` is
the dedicated operational script enforcing zero critical security vulnerabilities
in production dependencies via `npm audit --omit=dev --audit-level=critical`.
It is registered in root npm scripts (`ops:audit`, `ops:check`) and documented in
`docs/operations.md` and `docs/security.md`.

Currently, `scripts/ops/audit-dependencies.sh` exhibits concrete defects:
1. It silently ignores all command-line arguments: passing `--help`, `-h`,
   `--unknown-flag`, or arbitrary positional arguments launches `npm audit` and
   exits without displaying usage or failing closed on invalid options.
2. It hardcodes execution against the caller's working directory (`$PWD`):
   invoking the script from a workspace subdirectory
   (e.g. `(cd server && ../scripts/ops/audit-dependencies.sh)`) only audits that
   workspace, silently bypassing `client/` and repository-level production
   vulnerabilities (returning exit code 0 when `client/` has critical CVEs).
   It lacks `--cwd` targeting support.
3. If executed against a directory that does not exist or lacks `package.json`
   or `package-lock.json`, it relies on raw npm error output rather than
   structured fail-closed validation.
4. It hardcodes `--omit=dev` and `--audit-level=critical` with no CLI flags to
   inspect or test different audit levels (such as `high` or `moderate`) or omit
   types.
5. It has no dedicated test specification (`audit-dependencies.spec.js` does not exist),
   leaving argument parsing, directory targeting, audit level validation,
   pass/fail handling, and regression behavior untested.
6. There is no npm test script (`ops:audit-test`) and it is not wired into
   `ops:check`.
7. Neither `scripts/ops/audit-dependencies.sh` nor
   `scripts/ops/audit-dependencies.spec.js` is tracked in
   `scripts/ops/check-production-templates.sh` or
   `check-production-templates-shell.spec.js`.

Harden `scripts/ops/audit-dependencies.sh` to enforce strict POSIX argument validation,
portable directory targeting via `--cwd`, configurable `--audit-level` and `--omit`,
fail-closed prerequisite verification, establish a comprehensive test suite in
`scripts/ops/audit-dependencies.spec.js`, wire the test into `package.json`,
require both files in `check-production-templates.sh`, and update documentation in
`docs/operations.md` and `docs/build-plan.md`.

This is a dependency-safe operational hardening and contract testing step within
Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning reproduction against the committed script, without changing code:

```text
bash scripts/ops/audit-dependencies.sh --help -> runs npm audit, fails on Next.js advisory (ignores --help)
bash scripts/ops/audit-dependencies.sh --invalid -> runs npm audit (ignores flag)
(cd server && ../scripts/ops/audit-dependencies.sh) -> exits 0 (only audits server/, misses client/ critical CVE)
```

## References read and execution prerequisites

Planning read:
- `AGENTS.md`: workflow, phase commands, prompt contract, product, verification,
  standing review, and local commit requirements.
- `docs/build-plan.md`: ordered phases, Phase 12 outcome/exit gate, Phase 12K
  evidence qualifications, and prompts 257–262 implemented records.
- `docs/operations.md`: production runbooks, Phase 12K, and prompts 257–262
  shell orchestrator and template check contracts.
- `docs/launch-checklist.md`: launch prerequisites, category map, and §6A operator
  gap register.
- `docs/system-architecture.md` §§11–12: production topology, secret reference posture,
  and deployment security.
- `docs/security.md`: assets, trust boundaries, and dependency vulnerability auditing.
- `docs/skills.md`: locked skills and trigger manifest.
- `prompts/262-harden-and-test-scan-secrets.md`.

Code inspected:
- `scripts/ops/audit-dependencies.sh`.
- `scripts/ops/scan-secrets.sh` and `scan-secrets.spec.js`.
- `scripts/ops/check-docker-runtime.sh` and `check-docker-runtime.spec.js`.
- `scripts/ops/check-production-templates.sh` and `check-production-templates-shell.spec.js`.
- `package.json`.

## Non-goals

- Resolving or suppressing upstream dependency advisories (e.g. Next 16.3.4
  `GHSA-vcvr-r3jv-pc5j`): prompt 201 and Phase 12K records govern upstream
  dependency upgrade posture; default audit level remains `critical`.
- Weakening production dependency audit enforcement: default `--audit-level=critical`
  and `--omit=dev` remain the default behavior.
- Modifying other drill runners (`backup-postgres.sh`, `restore-postgres.sh`):
  reserved for subsequent dependency-safe steps.
- Operator sign-off or production evidence collection under prompt 201.
- Pushing to remote repositories.

## Implementation details

### 1. Harden `scripts/ops/audit-dependencies.sh`

- Use strict `/bin/sh` syntax (`set -eu`).
- Add helper functions:
  * `usage()`: print command syntax, options, and descriptions to stdout or stderr.
    `Usage: scripts/ops/audit-dependencies.sh [--cwd <path> | --cwd=<path>] [--audit-level <level> | --audit-level=<level>] [--omit <type> | --omit=<type>]`
  * `fail()`: print formatted error `audit error: <msg>` to stderr and exit 1.
- CLI argument parsing:
  * Support `--help` and `-h` (print usage to stdout and exit 0).
  * Support `--cwd <path>` and `--cwd=<path>` (optional working directory, defaults to `.`).
  * Support `--audit-level <level>` and `--audit-level=<level>` (optional audit level, defaults to `critical`).
    Valid levels: `info`, `low`, `moderate`, `high`, `critical`. Reject invalid levels with
    `Error: Invalid --audit-level "<level>" (allowed: info, low, moderate, high, critical)`.
  * Support `--omit <type>` and `--omit=<type>` (optional omit type, defaults to `dev`).
  * Reject unknown options with `Error: Unknown option "<opt>"` and usage to stderr, exit 1.
  * Reject unexpected positional arguments with `Error: Unexpected argument "<arg>"` and usage to stderr, exit 1.
  * Reject missing/empty/whitespace/repeated `--cwd`, `--audit-level`, and `--omit` options
    with descriptive errors and usage to stderr, exit 1.
  * Validate that the resolved target directory exists (`if [ ! -d "$TARGET_CWD" ]; then fail "target directory does not exist: $TARGET_CWD"; fi`).
  * Resolve canonical absolute path: `RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"`.
  * Validate that target directory contains `package.json`:
    `if [ ! -f "$RESOLVED_CWD/package.json" ]; then fail "target directory does not contain package.json: $TARGET_CWD"; fi`.
  * Validate that target directory contains `package-lock.json`:
    `if [ ! -f "$RESOLVED_CWD/package-lock.json" ]; then fail "target directory does not contain package-lock.json: $TARGET_CWD"; fi`.
- Audit execution:
  * Print startup message:
    `printf 'Running production dependency security audit (level: %s, omit: %s)...\n' "$AUDIT_LEVEL" "$OMIT"`
  * Execute `npm audit` inside `$RESOLVED_CWD`:
    ```sh
    if ! (cd "$RESOLVED_CWD" && npm audit --omit="$OMIT" --audit-level="$AUDIT_LEVEL"); then
      fail "$AUDIT_LEVEL vulnerabilities detected in production dependencies"
    fi
    ```
  * Print success message on exit 0:
    `printf 'Production dependency security audit passed (0 %s vulnerabilities)\n' "$AUDIT_LEVEL"`

### 2. Create `scripts/ops/audit-dependencies.spec.js`

Write comprehensive unit and contract tests using Node.js built-in test runner (`node:test` and `node:assert/strict`):
1. CLI argument validation tests:
   - `--help` and `-h` print usage to stdout and exit 0.
   - Unknown options (e.g. `--invalid-flag`, `-x`) exit 1 with error and usage to stderr.
   - Unexpected positional arguments (e.g. `unexpected-arg`) exit 1 with error and usage to stderr.
   - Missing `--cwd` value exits 1 with descriptive error to stderr.
   - Repeated `--cwd` option exits 1 with descriptive error to stderr.
   - Empty or whitespace `--cwd` value exits 1 with descriptive error to stderr.
   - Non-existent `--cwd` directory exits 1 with descriptive error to stderr.
   - Both `--cwd <path>` and `--cwd=<path>` syntax are supported.
   - Missing `--audit-level` value exits 1 with descriptive error to stderr.
   - Repeated `--audit-level` option exits 1 with descriptive error to stderr.
   - Invalid `--audit-level` value exits 1 with allowed levels listed.
   - Both `--audit-level <level>` and `--audit-level=<level>` syntax are supported.
   - Missing `--omit` value exits 1 with descriptive error to stderr.
   - Repeated `--omit` option exits 1 with descriptive error to stderr.
   - Both `--omit <type>` and `--omit=<type>` syntax are supported.
2. Prerequisite file validation:
   - Target directory without `package.json` exits 1 and emits `target directory does not contain package.json`.
   - Target directory without `package-lock.json` exits 1 and emits `target directory does not contain package-lock.json`.
3. Isolated fixture and execution tests:
   - Temporary fixture with clean `package.json` and `package-lock.json` (0 dependencies) exits 0 and prints passed message.
   - Execution with simulated `npm` failure (via PATH wrapper stub) exits 1 and emits formatted failure message.
   - Execution with custom `--audit-level` passes level through to audit command.
   - Execution with custom `--omit` passes omit argument through.
4. Directory targeting and integration tests:
   - Execution with explicit `--cwd .` runs against repository root.
   - Subdirectory invocation with `--cwd ..` correctly targets repository root.

### 3. Update `package.json`

- Add script:
  `"ops:audit-test": "node --test scripts/ops/audit-dependencies.spec.js"`
- Update `"ops:check"`:
  Include `npm run ops:audit-test` alongside `npm run ops:audit`.

### 4. Update `scripts/ops/check-production-templates.sh` and tests

- In `scripts/ops/check-production-templates.sh`:
  * Add `require_file scripts/ops/audit-dependencies.sh`.
  * Add `require_file scripts/ops/audit-dependencies.spec.js`.
- In `scripts/ops/check-production-templates-shell.spec.js`:
  * Add `scripts/ops/audit-dependencies.sh` and `scripts/ops/audit-dependencies.spec.js` to `REQUIRED_FILES`.

### 5. Update documentation

- Update `docs/operations.md` recording the hardened `audit-dependencies.sh` CLI options, fail-closed assertions, and test coverage.
- Update `docs/build-plan.md` recording Prompt 263's contracts, verification outputs, and limitations.

## SKILLS USED

- `javascript-testing-patterns`: design and implement robust Node.js test runner specifications in `scripts/ops/audit-dependencies.spec.js` using isolated fixtures and subprocess execution.
- `error-handling-patterns`: enforce fail-fast validation, precise usage error messages, and controlled exit codes for invalid CLI arguments and failed dependency audits.
- `security-best-practices`: preserve strict production dependency auditing, fail-closed prerequisite checks, and omit dev dependencies.
- `deployment-pipeline-design`: ensure operational preflight tooling behaves predictably across varied CI and working directory contexts.
- `requesting-code-review`: dispatch reviewer subagent with structured context, requirements, and test evidence.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor and verify codebase reality before committing.
- `caveman-commit`: author terse Conventional Commit message upon completion.

## Verification plan and commands

1. Syntax and static checks:
   - Shell syntax verification: `sh -n scripts/ops/audit-dependencies.sh`.
   - Node syntax verification: `node -c scripts/ops/audit-dependencies.spec.js`.
   - Code formatting: `npx prettier --check scripts/ops/audit-dependencies.spec.js scripts/ops/check-production-templates-shell.spec.js package.json`.
2. Focused test execution:
   - `node --test scripts/ops/audit-dependencies.spec.js`.
   - `npm run ops:audit-test`.
   - CLI help: `scripts/ops/audit-dependencies.sh --help`.
   - CLI invalid option: `scripts/ops/audit-dependencies.sh --invalid` (expect exit 1).
3. Downstream and integration suites:
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
