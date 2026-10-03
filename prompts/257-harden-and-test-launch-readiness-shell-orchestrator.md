# Phase 12K follow-up — harden and test launch readiness shell orchestrator

## Scope and why this is next

Harden the command-line interface, argument validation, and execution orchestration of `scripts/ops/launch-readiness.sh`, establish dedicated unit and contract test coverage in `scripts/ops/launch-readiness.spec.js`, integrate template checks in `scripts/ops/check-production-templates.sh`, and wire the test into root `package.json` scripts:
1. Harden `scripts/ops/launch-readiness.sh`:
   - Enforce single positional argument validation: reject multiple positional arguments (e.g. `scripts/ops/launch-readiness.sh file1.json file2.json`) with exit code 1 and error message `Error: Too many arguments; expected single readiness JSON path` followed by usage instructions.
   - Retain robust `--with-drills` flag support and `--help` / `-h` handling.
   - Retain ordered fail-closed preflight checks (`check-production-templates.sh`, `scan-secrets.sh`, `check-docker-runtime.sh`, `node --test scripts/ops/check-launch-readiness.spec.js`).
   - Retain drill invocation (`run-launch-drills.sh --dry-run`) under `--with-drills`, failing closed if drills exit non-zero.
   - Execute `node scripts/ops/check-launch-readiness.js "$READINESS_FILE"` and propagate its exit code.
2. Create `scripts/ops/launch-readiness.spec.js`:
   - Implement comprehensive unit and contract tests using Node.js test runner (`node:test`, `node:assert/strict`, `node:child_process.spawnSync`).
   - Test CLI argument parsing:
     - `--help` and `-h` display usage and exit with code 0.
     - Unknown flags (e.g. `--invalid`, `--dry-run`) emit error to stderr and exit with code 1.
     - Multiple positional arguments emit error to stderr and exit with code 1.
     - Default readiness file resolution targets `infra/launch/readiness.example.json`.
     - Explicit custom readiness file path is forwarded to `check-launch-readiness.js`.
   - Test orchestration flow and fail-closed step ordering using isolated stub environments:
     - Failure in `check-production-templates.sh` aborts execution immediately with exit code > 0.
     - Failure in `scan-secrets.sh` aborts execution immediately with exit code > 0.
     - Failure in `check-docker-runtime.sh` aborts execution immediately with exit code > 0.
     - Failure in `check-launch-readiness.spec.js` aborts execution immediately with exit code > 0.
     - When `--with-drills` is specified, `run-launch-drills.sh --dry-run` is invoked; if it fails, the script emits the dossier hint to stderr and exits with code 1.
     - When `--with-drills` is omitted, `run-launch-drills.sh` is not invoked.
   - Test end-to-end execution against actual repository files:
     - Running without arguments on `infra/launch/readiness.example.json` passes preflight checks and fails closed with exit code 1 (70 unresolved blockers).
     - Running against a valid approved readiness fixture passes preflights and exits with code 0.
3. Update `scripts/ops/check-production-templates.sh`:
   - Add `require_file scripts/ops/check-launch-readiness.spec.js`.
   - Add `require_file scripts/ops/launch-readiness.spec.js`.
4. Update `package.json`:
   - Add script `"ops:launch-readiness-test": "node --test scripts/ops/launch-readiness.spec.js"`.
   - Integrate `npm run ops:launch-readiness-test` into `"ops:check"`.
5. Update `docs/operations.md` and `docs/build-plan.md` recording the hardened shell orchestrator contracts and verification results.

Following Prompts 254–256:
- All 11 checklist categories enforce discrete category section validators and syntax/format helpers.
- Document-level structure checks, placeholder scans, section structural verification, evidence collection/routing, and the CLI execution runner in `scripts/ops/check-launch-readiness.js` have been modularized, exported, and unit tested.
- `scripts/ops/launch-readiness.sh` is the remaining operational orchestrator that ties together template checks, secret scanning, docker runtime validation, test suite execution, optional drill execution, and readiness evaluation.
- All other drill shell scripts in `scripts/ops/` (`run-restore-drill.sh`, `run-deployment-drill.sh`, `run-secret-rotation-drill.sh`, `run-dos-resilience-drill.sh`, `run-capacity-alerting-drill.sh`, `run-launch-drills.sh`) have dedicated `.spec.js` test files. Establishing `scripts/ops/launch-readiness.spec.js` and hardening argument parsing completes 100% test specification coverage across all operational runners.

This is a repository-owned, dependency-safe hardening and testing step within Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning baseline: clean worktree at commit `3657e14` (`fix(ops): modularize readiness cli and runner`).

## References read and execution prerequisites

Planning read:
- `AGENTS.md` phase-control, workflow, prompt, product, and standing rules
- `docs/build-plan.md` Phase 12 and Phase 12K (prompts 246–256)
- `docs/skills.md`
- `docs/system-architecture.md` §11–12
- `docs/security.md` TM-01, TM-04, TM-05, TM-15, and Phase 12K evidence integrity
- `docs/operations.md` Phase 12K and prompts 246–256
- `docs/launch-checklist.md` Categories 1–11
- `prompts/201-production-launch-evidence-and-signoff.md`
- `prompts/256-modularize-and-test-readiness-cli-and-execution-runner.md`

Code inspected:
- `scripts/ops/launch-readiness.sh`
- `scripts/ops/check-launch-readiness.js`
- `scripts/ops/check-launch-readiness.spec.js`
- `scripts/ops/check-production-templates.sh`
- `scripts/ops/run-launch-drills.sh`
- `scripts/ops/run-launch-drills.spec.js`
- `package.json`

## Non-goals

- Altering the exit codes or fail-closed behavior of `check-launch-readiness.js` or `infra/launch/readiness.example.json`.
- Modifying runtime server, client, or worker business logic.
- Altering production Docker or Caddy configurations.
- Fabricating production drill evidence or signing off on launch readiness without operator execution.

## Measurable requirements and implementation plan

### 1. Harden argument validation in `scripts/ops/launch-readiness.sh`

In `scripts/ops/launch-readiness.sh`:
- Initialize `CUSTOM_FILE_SPECIFIED=0`.
- In the argument parsing loop:
  ```sh
  while [ $# -gt 0 ]; do
    case "$1" in
      --with-drills)
        WITH_DRILLS=1
        shift
        ;;
      --help|-h)
        printf 'Usage: scripts/ops/launch-readiness.sh [--with-drills] [readiness.json]\n'
        exit 0
        ;;
      --*)
        printf 'Error: Unknown option "%s"\n' "$1" >&2
        printf 'Usage: scripts/ops/launch-readiness.sh [--with-drills] [readiness.json]\n' >&2
        exit 1
        ;;
      *)
        if [ "$CUSTOM_FILE_SPECIFIED" -eq 1 ]; then
          printf 'Error: Too many arguments; expected single readiness JSON path\n' >&2
          printf 'Usage: scripts/ops/launch-readiness.sh [--with-drills] [readiness.json]\n' >&2
          exit 1
        fi
        READINESS_FILE="$1"
        CUSTOM_FILE_SPECIFIED=1
        shift
        ;;
    esac
  done
  ```
- Ensure standard formatting, error reporting, and exit code 1 on usage violations.

### 2. Create `scripts/ops/launch-readiness.spec.js`

Using Node.js built-in test runner (`node:test`) and child process runner (`node:child_process.spawnSync`), test:
1. **CLI Usage & Flags**:
   - `--help` outputs usage string and exits with 0.
   - `-h` outputs usage string and exits with 0.
   - Unknown flag (e.g. `--invalid-flag`) outputs error and exits with 1.
   - Unknown option `--dry-run` outputs error and exits with 1.
   - Excessive positional arguments (`file1.json file2.json`) outputs `Too many arguments` error and exits with 1.
2. **Preflight Step Ordering & Fail-Closed Behavior**:
   - Use an isolated temporary directory with a mock `bin` directory prepended to `PATH` or wrapper stubs to verify that:
     - When `check-production-templates.sh` fails, `launch-readiness.sh` halts and returns non-zero without running `scan-secrets.sh` or subsequent steps.
     - When `scan-secrets.sh` fails, `launch-readiness.sh` halts and returns non-zero without running `check-docker-runtime.sh`.
     - When `check-docker-runtime.sh` fails, `launch-readiness.sh` halts and returns non-zero without running `check-launch-readiness.spec.js`.
     - When `check-launch-readiness.spec.js` fails, `launch-readiness.sh` halts and returns non-zero without running drills or readiness evaluation.
3. **Drill Flag (`--with-drills`) Execution**:
   - When `--with-drills` is specified, `scripts/ops/run-launch-drills.sh --dry-run` is executed.
   - If `run-launch-drills.sh --dry-run` fails, `launch-readiness.sh` exits with 1 and prints `launch-readiness: unified drills failed; see the dossier at backups/launch-evidence-dossier-*.json` to stderr.
   - When `--with-drills` is not specified, `run-launch-drills.sh` is not called.
4. **Target File Passing and Exit Code Propagation**:
   - Default target `infra/launch/readiness.example.json` is passed to `check-launch-readiness.js`.
   - Custom target path is correctly forwarded to `check-launch-readiness.js`.
   - Fail-closed exit code (1) from `check-launch-readiness.js` is preserved and returned.
   - Passing exit code (0) on an approved fixture is preserved and returned.

### 3. Update `scripts/ops/check-production-templates.sh`

Add:
- `require_file scripts/ops/check-launch-readiness.spec.js`
- `require_file scripts/ops/launch-readiness.spec.js`

### 4. Update `package.json`

Add:
- `"ops:launch-readiness-test": "node --test scripts/ops/launch-readiness.spec.js"`
Add `npm run ops:launch-readiness-test` into `"ops:check"` script chain.

### 5. Update Documentation

- `docs/operations.md`: record the `launch-readiness.sh` CLI contracts and test specifications.
- `docs/build-plan.md`: record Prompt 257 verification results, test counts, and exit state.

## Verification commands

```bash
npm run ops:launch-readiness-test
npm run ops:readiness-test
npm run ops:launch-drill-test
npm run ops:templates
npm run ops:templates-test
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```
