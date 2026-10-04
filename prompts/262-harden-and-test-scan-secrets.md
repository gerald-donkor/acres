# 262 — harden and test scan secrets

## Scope and why this is next

Parent phase: Phase 12K, within `docs/build-plan.md` §13/§22. Planning baseline:
`bf25413` (`fix(ops): harden and test docker runtime check`), clean worktree on
2026-10-04 before this prompt was written.

Following Prompt 257 (hardening and testing `launch-readiness.sh`), Prompts 258–259
(modularizing and hardening `check-production-templates.js`), Prompt 260
(hardening and testing `check-production-templates.sh`), and Prompt 261
(hardening and testing `check-docker-runtime.sh`), `scripts/ops/scan-secrets.sh`
is the third and final core script invoked in Stage 1 static integrity checks
(`run-static-integrity-checks.js`), and is invoked in `launch-readiness.sh`,
`run-deployment-drill.sh`, `run-secret-rotation-drill.sh`, and root npm scripts
(`ops:scan-secrets`, `ops:check`).

Currently, `scripts/ops/scan-secrets.sh` exhibits concrete defects:
1. It silently ignores all command-line arguments: passing `--help`, `-h`,
   `--unknown-flag`, or arbitrary positional arguments executes the scan and
   exits 0 instead of displaying usage or failing closed.
2. It hardcodes relative paths against the caller's working directory
   (`git grep ... -- .`): invoking the script from a subdirectory
   (e.g. `(cd server && ../scripts/ops/scan-secrets.sh)`) only searches that
   subdirectory, silently skipping `infra/`, `client/`, and root files. It lacks
   `--cwd` targeting support.
3. If executed against a directory that is not a git repository (or if a non-git
   directory is passed via `--cwd`), it fails with uncontrolled raw git errors
   (`fatal: not a git repository`) rather than a structured fail-closed error.
4. It has no dedicated test specification (`scan-secrets.spec.js` does not exist),
   leaving its argument parsing, directory targeting, allowed path exceptions,
   secret pattern matching, exclusions, and end-to-end execution untested against
   behavioral regressions.
5. There is no npm test script (`ops:scan-secrets-test`) and it is not wired into
   `ops:check`.
6. Neither `scripts/ops/scan-secrets.sh` nor `scripts/ops/scan-secrets.spec.js` is
   tracked in `scripts/ops/check-production-templates.sh` or
   `check-production-templates-shell.spec.js`.

Harden `scripts/ops/scan-secrets.sh` to enforce strict POSIX argument validation,
portable directory targeting via `--cwd`, fail-closed git repository verification,
establish a comprehensive test suite in `scripts/ops/scan-secrets.spec.js`, wire
the test into `package.json`, require both files in `check-production-templates.sh`,
and update documentation in `docs/operations.md` and `docs/build-plan.md`.

This is a dependency-safe operational hardening and contract testing step within
Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning reproduction against the committed script, without changing code:

```text
bash scripts/ops/scan-secrets.sh --help -> exit 0, outputs "secret/default scan passed" (ignores --help)
bash scripts/ops/scan-secrets.sh --invalid -> exit 0, outputs "secret/default scan passed" (ignores flag)
(cd server && ../scripts/ops/scan-secrets.sh) -> scans only server/, missing repo-wide infra/ and client/
```

## References read and execution prerequisites

Planning read:
- `AGENTS.md`: workflow, phase commands, prompt contract, product, verification,
  standing review, and local commit requirements.
- `docs/build-plan.md`: ordered phases, Phase 12 outcome/exit gate, Phase 12K
  evidence qualifications, and prompts 257–261 implemented records.
- `docs/operations.md`: production runbooks, Phase 12K, and prompts 257–261
  shell orchestrator and template check contracts.
- `docs/launch-checklist.md`: launch prerequisites, category map, and §6A operator
  gap register.
- `docs/system-architecture.md` §§11–12: production topology, secret reference posture,
  and deployment security.
- `docs/security.md`: assets, trust boundaries, and credentials scanning.
- `docs/skills.md`: locked skills and trigger manifest.
- `prompts/261-harden-and-test-docker-runtime-check.md`.

Code inspected:
- `scripts/ops/scan-secrets.sh`.
- `scripts/ops/run-static-integrity-checks.js` and `run-static-integrity-checks.spec.js`.
- `scripts/ops/launch-readiness.sh` and `launch-readiness.spec.js`.
- `scripts/ops/run-deployment-drill.sh` and `run-deployment-drill.spec.js`.
- `scripts/ops/run-secret-rotation-drill.sh` and `run-secret-rotation-drill.spec.js`.
- `scripts/ops/check-docker-runtime.sh` and `check-docker-runtime.spec.js`.
- `scripts/ops/check-production-templates.sh` and `check-production-templates-shell.spec.js`.

## Non-goals

- Modifying secret detection patterns or weakening regexes: the existing 4 patterns
  (`acres_(superuser|migrator|app|test|valkey)_dev_password`, `change-me(-|_|[A-Za-z0-9])`,
  `__REQUIRED_[A-Z0-9_]+__`, `NEXT_PUBLIC_[A-Z0-9_]*(SECRET|PASSWORD|TOKEN|KEY)`) remain exact.
- Weakening allowed path rules: existing allowed path patterns are preserved.
- Modifying `scripts/ops/audit-dependencies.sh`: reserved for subsequent
  dependency-safe hardening steps.
- Operator sign-off or production evidence collection under prompt 201.
- Pushing to remote repositories.

## Implementation details

### 1. Harden `scripts/ops/scan-secrets.sh`

- Use strict `/bin/sh` syntax (`set -eu`).
- Add helper functions:
  * `usage()`: print command syntax, options, and descriptions to stdout or stderr.
    `Usage: scripts/ops/scan-secrets.sh [--cwd <path> | --cwd=<path>]`
  * `fail()`: print formatted error `secret scan failed: <msg>` to stderr and exit 1.
- CLI argument parsing:
  * Support `--help` and `-h` (print usage to stdout and exit 0).
  * Support `--cwd <path>` and `--cwd=<path>` (optional working directory, defaults to `.`).
  * Reject unknown options with `Error: Unknown option "<opt>"` and usage to stderr, exit 1.
  * Reject unexpected positional arguments with `Error: Unexpected argument "<arg>"` and usage to stderr, exit 1.
  * Reject missing/empty/whitespace/repeated `--cwd` options with descriptive errors and usage to stderr, exit 1.
  * Validate that the resolved target directory exists (`if [ ! -d "$TARGET_CWD" ]; then fail "target directory does not exist: $TARGET_CWD"; fi`).
  * Resolve canonical absolute path: `RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"`.
  * Validate that the resolved target directory is a git repository:
    `if ! (cd "$RESOLVED_CWD" && git rev-parse --is-inside-work-tree >/dev/null 2>&1); then fail "target directory is not a git repository: $TARGET_CWD"; fi`.
- Safe temporary tracking file:
  * Create temporary file using `mktemp` with fallback:
    `tmp="$(mktemp "${TMPDIR:-/tmp}/acres-secret-scan.XXXXXX" 2>/dev/null || printf '%s/acres-secret-scan.%s' "${TMPDIR:-/tmp}" "$$")"`
  * Register trap: `trap 'rm -f "$tmp"' EXIT INT TERM HUP`.
  * Initialize `: > "$tmp"`.
- Pattern scanning execution:
  * Run git grep in a subshell inside `$RESOLVED_CWD`:
    ```sh
    scan_pattern() {
      pattern="$1"
      label="$2"
      (
        cd "$RESOLVED_CWD"
        { git grep -n -I -E "$pattern" -- . \
          ':(exclude)package-lock.json' \
          ':(exclude).agents' \
          ':(exclude)node_modules' \
          ':(exclude).next' \
          ':(exclude)server/src/generated' 2>/dev/null || true; }
      ) | while IFS= read -r match; do
        [ -n "$match" ] || continue
        path="${match%%:*}"
        path="${path#./}"
        if ! is_allowed_path "$path"; then
          printf 'secret scan failed: %s in %s\n' "$label" "$match" >&2
          printf '1\n' >> "$tmp"
        fi
      done
    }
    ```
- Result check:
  * If `[ -s "$tmp" ]`, exit 1.
  * Print `secret/default scan passed\n` on success, exit 0.

### 2. Create `scripts/ops/scan-secrets.spec.js`

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
2. Non-git directory validation:
   - Running against a temporary directory without a git repository exits 1 and emits `target directory is not a git repository`.
3. Isolated fixture and pattern detection tests (using a temporary `git init` repository):
   - Clean fixture passes with exit 0 and prints `secret/default scan passed`.
   - Local development password (`acres_superuser_dev_password`, `acres_migrator_dev_password`, `acres_app_dev_password`, `acres_test_dev_password`, `acres_valkey_dev_password`) in an unallowed file fails with exit 1 and identifies match.
   - Change-me placeholder (`change-me-key`, `change-me_secret`, `change-me123`) in an unallowed file fails with exit 1 and identifies match.
   - Launch placeholder sentinel (`__REQUIRED_DATABASE_PASSWORD__`) in an unallowed file fails with exit 1 and identifies match.
   - Client-exposed secret (`NEXT_PUBLIC_APP_SECRET`, `NEXT_PUBLIC_AUTH_PASSWORD`, `NEXT_PUBLIC_API_TOKEN`, `NEXT_PUBLIC_MAP_KEY`) in an unallowed file fails with exit 1 and identifies match.
   - Allowed path exceptions: patterns in `.env.example`, `infra/env/production.env.example`, `infra/launch/readiness.example.json`, `docs/example.md`, `prompts/example.md`, `server/test/mock.ts`, `server/src/foo/bar.spec.ts`, `client/tests/e2e.ts`, `scripts/ops/custom.spec.js` do NOT fail.
   - Excluded directories (`node_modules/`, `.next/`, `package-lock.json`, `.agents/`, `server/src/generated/`) containing patterns do NOT cause failures.
4. Directory targeting and integration tests:
   - Direct execution without arguments against the repository passes with exit code 0 and prints `secret/default scan passed`.
   - Execution with explicit `--cwd .` passes with exit code 0.
   - Execution from another directory (e.g. `server/` with `--cwd ..`) passes with exit code 0.

### 3. Update `package.json`

- Add script:
  `"ops:scan-secrets-test": "node --test scripts/ops/scan-secrets.spec.js"`
- Update `"ops:check"`:
  Include `npm run ops:scan-secrets-test`.

### 4. Update `scripts/ops/check-production-templates.sh` and tests

- In `scripts/ops/check-production-templates.sh`:
  * Add `require_file scripts/ops/scan-secrets.sh`.
  * Add `require_file scripts/ops/scan-secrets.spec.js`.
- In `scripts/ops/check-production-templates-shell.spec.js`:
  * Add `scripts/ops/scan-secrets.sh` and `scripts/ops/scan-secrets.spec.js` to `REQUIRED_FILES`.

### 5. Update documentation

- Update `docs/operations.md` recording the hardened `scan-secrets.sh` CLI options, fail-closed assertions, and test coverage.
- Update `docs/build-plan.md` recording Prompt 262's contracts, verification outputs, and limitations.

## SKILLS USED

- `javascript-testing-patterns`: design and implement robust Node.js test runner specifications in `scripts/ops/scan-secrets.spec.js` using isolated git fixtures and subprocess execution.
- `error-handling-patterns`: enforce fail-fast validation, precise usage error messages, and controlled exit codes for invalid CLI arguments and failed secret scans.
- `security-best-practices`: preserve strict secret pattern scanning, default credentials rejection, and fail-closed secret exposure detection.
- `deployment-pipeline-design`: ensure operational preflight tooling behaves predictably across varied CI and working directory contexts.
- `requesting-code-review`: dispatch reviewer subagent with structured context, requirements, and test evidence.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor and verify codebase reality before committing.
- `caveman-commit`: author terse Conventional Commit message upon completion.

## Verification plan and commands

1. Syntax and static checks:
   - Shell syntax verification: `sh -n scripts/ops/scan-secrets.sh`.
   - Node syntax verification: `node -c scripts/ops/scan-secrets.spec.js`.
   - Code formatting: `npx prettier --check scripts/ops/scan-secrets.sh scripts/ops/scan-secrets.spec.js scripts/ops/check-production-templates.sh scripts/ops/check-production-templates-shell.spec.js package.json`.
2. Focused test execution:
   - `node --test scripts/ops/scan-secrets.spec.js`.
   - `npm run ops:scan-secrets-test`.
   - `npm run ops:scan-secrets`.
   - Subdirectory invocation: `(cd server && ../scripts/ops/scan-secrets.sh --cwd ..)`.
   - CLI help: `scripts/ops/scan-secrets.sh --help`.
   - CLI invalid option: `scripts/ops/scan-secrets.sh --invalid` (expect exit 1).
3. Downstream and integration suites:
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
