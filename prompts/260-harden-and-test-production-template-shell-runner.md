# 260 — harden and test production template shell runner

## Scope and why this is next

Parent phase: Phase 12K, within `docs/build-plan.md` §13/§22. Planning baseline:
`207c590` (`fix(ops): reject malformed template inputs`), clean worktree on
2026-10-03 before this prompt was written.

Following Prompt 257 (hardening and testing `launch-readiness.sh`), Prompt 258
(modularizing the inline Node.js verification script into
`check-production-templates.js`), and Prompt 259 (hardening input and document
shape validation in `check-production-templates.js`), the shell runner
`scripts/ops/check-production-templates.sh` remains the sole operational runner
in `scripts/ops/` lacking CLI argument parsing, directory targeting, and dedicated
unit/contract test coverage.

Currently, `scripts/ops/check-production-templates.sh` exhibits concrete defects:
1. It silently ignores all command-line arguments: passing `--help`, `-h`,
   `--unknown-flag`, or arbitrary positional arguments executes the full suite
   and prints success rather than showing usage or failing closed.
2. It hardcodes relative paths against the caller's working directory: invoking
   the script from a subdirectory or passing `--cwd` fails immediately on
   missing file assertions (`infra/caddy/Caddyfile.example`), and it does not
   support or forward `--cwd` to `check-production-templates.js`.
3. It has no dedicated test specification (`check-production-templates.spec.js`
   tests only the Node.js module), leaving its file requirements, sentinel greps,
   and downstream verifier integrations untested against behavioral regressions.

Harden `scripts/ops/check-production-templates.sh` to enforce strict argument
validation and portable directory targeting, establish comprehensive unit and
contract tests in `scripts/ops/check-production-templates-shell.spec.js`, wire the
suite into `package.json`, and update the template check requirements and documentation.

This is a dependency-safe operational hardening and contract testing step within
Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning reproduction against the committed script, without changing code:

```text
bash scripts/ops/check-production-templates.sh --help -> exit 0, outputs "ops template check passed" (ignores --help)
bash scripts/ops/check-production-templates.sh --invalid -> exit 0, outputs "ops template check passed" (ignores flag)
(cd server && ../scripts/ops/check-production-templates.sh) -> exit 1, "missing required file: infra/caddy/Caddyfile.example"
```

## References read and execution prerequisites

Planning read:
- `AGENTS.md`: workflow, phase commands, prompt contract, product, verification,
  standing review, and local commit requirements.
- `docs/build-plan.md`: ordered phases, Phase 12 outcome/exit gate, Phase 12K
  evidence qualifications, and prompts 254–259 implemented records.
- `docs/operations.md`: production runbooks, Phase 12K, and prompts 257–259
  shell orchestrator and template check contracts.
- `docs/launch-checklist.md`: launch prerequisites, category map, and §6A operator
  gap register.
- `docs/system-architecture.md` §§11–12: production topology, secret handling,
  health/supervision, telemetry, and deferred decisions.
- `docs/security.md`: assets, trust boundaries, and current Phase 12 evidence
  qualifications; no new runtime boundary is proposed.
- `docs/skills.md`: locked skills and trigger manifest.
- `prompts/257-harden-and-test-launch-readiness-shell-orchestrator.md`,
  `prompts/258-modularize-and-test-production-template-checks.md`, and
  `prompts/259-harden-production-template-input-validation.md`.

Code inspected:
- `scripts/ops/check-production-templates.sh`.
- `scripts/ops/check-production-templates.js` and `.spec.js`.
- `scripts/ops/launch-readiness.sh` and `launch-readiness.spec.js`.
- `scripts/ops/verify-caddy-routing.js`, `verify-volume-encryption.js`,
  `verify-alert-rules.js`, and `verify-capacity-load.js`.
- Root `package.json`: existing `ops:templates`, `ops:templates-test`,
  `ops:launch-readiness-test`, and `ops:check` scripts.

At execution, re-read those files, the approved prompt, and every skill below.
Verify all shell commands against POSIX `/bin/sh` syntax (compatible with Alpine
Linux containers). Inspect `scripts/ops/launch-readiness.spec.js` for established
test runner patterns with isolated temp directories and executable stubs. No
Next.js, React, shadcn, Tailwind, browser or visual work is planned; static comps,
crops, CSS measurements, and breakpoint requirements do not apply.

## Expected impact and non-goals

- `scripts/ops/check-production-templates.sh` supports `--help` / `-h` (exits 0 with usage)
  and `--cwd <path>` / `--cwd=<path>` (targets explicit repository directory).
- Invalid options, missing option values, repeated `--cwd`, non-directory `--cwd` targets,
  and unexpected positional arguments reject with exit code 1 and descriptive usage output.
- Invocations with `--cwd` correctly validate required files, execute
  `node scripts/ops/check-production-templates.js --cwd <dir>`, evaluate env and Caddyfile
  security greps relative to that directory, and run downstream verifiers in that context.
- Dedicated unit and contract test suite `scripts/ops/check-production-templates-shell.spec.js`
  verifies CLI argument parsing, directory resolution, fail-closed ordering, and end-to-end
  repository checks.
- Valid repository templates continue passing cleanly.
- No client/server code, database migrations, production template values, SLO thresholds,
  or operator sign-off requirements change.
- No live drills, infrastructure provisioning, production mutations, or external push.

## Measurable requirements and implementation plan

### 1. Harden `scripts/ops/check-production-templates.sh`

Refactor the shell script while preserving POSIX `/bin/sh` compatibility:
1. Argument parsing loop:
   - Accept `--help` and `-h`: print usage to stdout and exit 0:
     `Usage: scripts/ops/check-production-templates.sh [--cwd <path> | --cwd=<path>]`
   - Accept `--cwd <path>` and `--cwd=<path>`:
     - Reject repeated `--cwd` with exit code 1 and error:
       `Error: Repeated --cwd option; expected single directory path`
     - Reject missing value for `--cwd` with exit code 1 and error:
       `Error: --cwd requires a non-empty directory path`
     - Reject empty or whitespace-only value with exit code 1 and error:
       `Error: --cwd path cannot be empty`
     - Reject next option passed as value (e.g. `--cwd --help`) with exit code 1.
   - Reject unknown options (starting with `-`):
     `Error: Unknown option "<opt>"`
     followed by usage to stderr and exit code 1.
   - Reject unexpected positional arguments:
     `Error: Unexpected argument "<arg>"`
     followed by usage to stderr and exit code 1.
2. Directory resolution and validation:
   - Default `TARGET_CWD="."`.
   - When specified, verify `[ -d "$TARGET_CWD" ]`; if missing, fail closed:
     `ops template check failed: target directory does not exist: <path>` and exit code 1.
   - Portably resolve script directory:
     `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"`
   - Portably resolve canonical target directory:
     `RESOLVED_CWD="$(cd "$TARGET_CWD" && pwd)"`
3. Prerequisite file checks:
   - Update `require_file` to test `[ -f "$RESOLVED_CWD/$1" ] || fail "missing required file: $1"`.
   - Add `require_file scripts/ops/check-production-templates-shell.spec.js`.
4. Execution sequence:
   - Invoke Node template validator:
     `node "$SCRIPT_DIR/check-production-templates.js" --cwd "$RESOLVED_CWD" || fail 'production template validation failed'`
   - Security greps:
     - Check `"$RESOLVED_CWD/infra/env/production.env.example"` for secret-looking `NEXT_PUBLIC_` variables.
     - Check `"$RESOLVED_CWD/infra/env/production.env.example"` for `__REQUIRED_` placeholder sentinels.
     - Check `"$RESOLVED_CWD/infra/caddy/Caddyfile.example"` for `Strict-Transport-Security`.
   - Downstream verifier execution in target context:
     - `node "$SCRIPT_DIR/verify-caddy-routing.js" "$RESOLVED_CWD/infra/caddy/Caddyfile.example" >/dev/null || fail 'Caddy routing verification failed'`
     - `node "$SCRIPT_DIR/verify-volume-encryption.js" --compose "$RESOLVED_CWD/infra/compose/docker-compose.production.example.yml" --env "$RESOLVED_CWD/infra/env/production.env.example" --readiness "$RESOLVED_CWD/infra/launch/readiness.example.json" >/dev/null || fail 'Volume encryption verification failed'`
     - `(cd "$RESOLVED_CWD" && node "$SCRIPT_DIR/verify-alert-rules.js" >/dev/null) || fail 'Alert rules verification failed'`
     - `(cd "$RESOLVED_CWD" && node "$SCRIPT_DIR/verify-capacity-load.js" --no-save >/dev/null) || fail 'Capacity load verification failed'`
   - Emit success:
     `printf 'ops template check passed\n'`

### 2. Create `scripts/ops/check-production-templates-shell.spec.js`

Implement comprehensive unit and contract tests using Node.js test runner (`node:test`,
`node:assert/strict`, `node:child_process.spawnSync`):
1. CLI argument parsing tests:
   - `--help` and `-h` print usage to stdout and exit 0.
   - Unknown options (e.g. `--invalid`, `-x`, `--unknown`) exit 1 with error and usage to stderr.
   - Unexpected positional arguments (e.g. `extra-arg`, `file.json`) exit 1 with error and usage to stderr.
   - Missing `--cwd` value (at end of argv or before another option) exits 1 with descriptive error to stderr.
   - Repeated `--cwd` option exits 1 with descriptive error to stderr.
   - Empty or whitespace `--cwd` value exits 1 with descriptive error to stderr.
   - Non-existent `--cwd` directory exits 1 with descriptive error to stderr.
   - Both `--cwd <path>` and `--cwd=<path>` are accepted and resolve target directory.
2. Isolated fixture and fail-closed step ordering tests:
   - Missing required template file fails closed with exit 1 and identifies the missing file.
   - `check-production-templates.js` failure aborts execution immediately with exit 1.
   - Leaked secret in `production.env.example` aborts execution with exit 1 and secret warning.
   - Missing `__REQUIRED_` sentinels aborts execution with exit 1.
   - Missing `Strict-Transport-Security` in `Caddyfile.example` aborts execution with exit 1.
   - Downstream verifier failures (`verify-caddy-routing.js`, `verify-volume-encryption.js`,
     `verify-alert-rules.js`, `verify-capacity-load.js`) abort execution with exit 1.
3. End-to-end integration tests:
   - Direct execution without arguments against the repository passes with exit code 0.
   - Direct execution with explicit `--cwd .` or absolute repository path passes with exit code 0.
   - Execution from another directory (e.g. `process.cwd()` set to a temp folder, passing `--cwd <repo>`)
     passes with exit code 0.

### 3. Update `package.json`

- Add script:
  `"ops:templates-shell-test": "node --test scripts/ops/check-production-templates-shell.spec.js"`
- Update `"ops:templates-test"`:
  Include `scripts/ops/check-production-templates-shell.spec.js`.
- Update `"ops:check"`:
  Include `npm run ops:templates-shell-test`.

### 4. Update documentation

- Update `docs/operations.md` recording the hardened shell runner CLI options, fail-closed
  guarantees, directory targeting behavior, and test coverage.
- Update `docs/build-plan.md` recording Prompt 260's contracts, verification outputs, and
  limitations.

## SKILLS USED

- `javascript-testing-patterns`: design and implement robust Node.js test runner specifications in `scripts/ops/check-production-templates-shell.spec.js` using isolated fixtures, stubs, and subprocess execution.
- `error-handling-patterns`: enforce fail-fast validation, precise usage error messages, and controlled exit codes for invalid CLI arguments and failed preflight steps.
- `security-best-practices`: preserve strict credential leakage prevention, sentinel preservation, and HSTS verification across custom working directories.
- `deployment-pipeline-design`: ensure operational preflight tooling behaves predictably across varied CI and working directory contexts.
- `requesting-code-review`: dispatch reviewer subagent with structured context, requirements, and test evidence.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor and verify codebase reality before committing.
- `caveman-commit`: author terse Conventional Commit message upon completion.

## Verification plan and commands

1. Syntax and static checks:
   - Shell syntax verification: `sh -n scripts/ops/check-production-templates.sh`.
   - Node syntax verification: `node -c scripts/ops/check-production-templates-shell.spec.js`.
   - Code formatting: `npx prettier --check scripts/ops/check-production-templates.sh scripts/ops/check-production-templates-shell.spec.js package.json`.
2. Focused test execution:
   - `node --test scripts/ops/check-production-templates-shell.spec.js`.
   - `npm run ops:templates-test`.
   - `npm run ops:templates`.
   - Test directory targeting: `(cd server && ../scripts/ops/check-production-templates.sh --cwd ..)`.
   - Test CLI help: `scripts/ops/check-production-templates.sh --help`.
   - Test CLI invalid option: `scripts/ops/check-production-templates.sh --invalid` (expect exit 1).
3. Full regression suites:
   - `npm run ops:launch-readiness-test`.
   - `npm run ops:readiness-test`.
   - `npm run ops:launch-drill-test`.
   - `npm run lint`.
   - `npm run typecheck`.
   - `npm run build`.
   - `git diff --check`.
