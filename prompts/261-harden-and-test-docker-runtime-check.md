# 261 — harden and test docker runtime check

## Scope and why this is next

Parent phase: Phase 12K, within `docs/build-plan.md` §13/§22. Planning baseline:
`fab13f6` (`fix(ops): harden template shell runner`), clean worktree on
2026-10-04 before this prompt was written.

Following Prompt 257 (hardening and testing `launch-readiness.sh`), Prompts 258–259
(modularizing and hardening `check-production-templates.js`), and Prompt 260
(hardening and testing `check-production-templates.sh`), `scripts/ops/check-docker-runtime.sh`
is an essential sequential preflight script invoked in Stage 1 static integrity checks
(`run-static-integrity-checks.js`), `launch-readiness.sh`, `run-deployment-drill.sh`,
and root npm scripts (`ops:docker-runtime`, `ops:check`).

Currently, `scripts/ops/check-docker-runtime.sh` exhibits concrete defects:
1. It silently ignores all command-line arguments: passing `--help`, `-h`,
   `--unknown-flag`, or arbitrary positional arguments executes the check and
   exits 0 instead of displaying usage or failing closed.
2. It hardcodes relative paths against the caller's working directory
   (`dockerfile=server/Dockerfile`): invoking the script from a subdirectory
   (e.g. `(cd server && ../scripts/ops/check-docker-runtime.sh)`) fails immediately
   with `docker runtime check failed: missing server/Dockerfile`. It lacks `--cwd`
   and `--dockerfile` targeting support.
3. It has no dedicated test specification (`check-docker-runtime.spec.js` does not exist),
   leaving its argument parsing, directory targeting, failure modes (missing Dockerfile,
   non-Node 24 base image, missing non-root USER node, missing HEALTHCHECK, non-direct CMD),
   and end-to-end execution untested against behavioral regressions.
4. There is no npm test script (`ops:docker-runtime-test`) and it is not wired into `ops:check`.

Harden `scripts/ops/check-docker-runtime.sh` to enforce strict POSIX argument validation,
portable directory and Dockerfile targeting, establish a comprehensive test suite in
`scripts/ops/check-docker-runtime.spec.js`, wire the test into `package.json`, require
both files in `check-production-templates.sh`, and update documentation in
`docs/operations.md` and `docs/build-plan.md`.

This is a dependency-safe operational hardening and contract testing step within
Phase 12K. Prompt 201 still governs real production evidence collection and sign-off.

Planning reproduction against the committed script, without changing code:

```text
bash scripts/ops/check-docker-runtime.sh --help -> exit 0, outputs "docker runtime check passed" (ignores --help)
bash scripts/ops/check-docker-runtime.sh --invalid -> exit 0, outputs "docker runtime check passed" (ignores flag)
(cd server && ../scripts/ops/check-docker-runtime.sh) -> exit 1, "docker runtime check failed: missing server/Dockerfile"
```

## References read and execution prerequisites

Planning read:
- `AGENTS.md`: workflow, phase commands, prompt contract, product, verification,
  standing review, and local commit requirements.
- `docs/build-plan.md`: ordered phases, Phase 12 outcome/exit gate, Phase 12K
  evidence qualifications, and prompts 257–260 implemented records.
- `docs/operations.md`: production runbooks, Phase 12K, and prompts 257–260
  shell orchestrator and template check contracts.
- `docs/launch-checklist.md`: launch prerequisites, category map, and §6A operator
  gap register.
- `docs/system-architecture.md` §§11–12: production topology, server image specifications,
  health/supervision, and runtime container isolation.
- `docs/security.md`: assets, trust boundaries, and non-root container execution.
- `docs/skills.md`: locked skills and trigger manifest.
- `prompts/260-harden-and-test-production-template-shell-runner.md`.

Code inspected:
- `scripts/ops/check-docker-runtime.sh`.
- `server/Dockerfile`.
- `infra/docker/client.Dockerfile.example`.
- `scripts/ops/launch-readiness.sh` and `launch-readiness.spec.js`.
- `scripts/ops/run-deployment-drill.sh` and `run-deployment-drill.spec.js`.
- `scripts/ops/run-static-integrity-checks.js` and `run-static-integrity-checks.spec.js`.
- `scripts/ops/check-production-templates.sh` and `check-production-templates-shell.spec.js`.

## Non-goals

- Modifying `server/Dockerfile` or container runtime configuration: the existing Dockerfile
  already complies with all four directives.
- Modifying `infra/docker/client.Dockerfile.example`: that template is covered by
  `check-production-templates.js`.
- Modifying `scripts/ops/scan-secrets.sh` or `audit-dependencies.sh`: reserved for subsequent
  dependency-safe hardening steps.
- Operator sign-off or production evidence collection under prompt 201.
- Pushing to remote repositories.

## Implementation details

### 1. Harden `scripts/ops/check-docker-runtime.sh`

- Use strict `/bin/sh` syntax (`set -eu`).
- Add helper functions:
  * `usage()`: print command syntax, options, and descriptions to stdout or stderr.
  * `fail()`: print formatted error `docker runtime check failed: <msg>` to stderr and exit 1.
- CLI argument parsing:
  * Support `--help` and `-h` (print usage to stdout and exit 0).
  * Support `--cwd <path>` and `--cwd=<path>` (optional working directory, defaults to `.`).
  * Support `--dockerfile <path>` and `--dockerfile=<path>` (optional path to Dockerfile; if unset, resolves to `$TARGET_CWD/server/Dockerfile`).
  * Reject unknown options with `Error: Unknown option "<opt>"` and usage to stderr, exit 1.
  * Reject unexpected positional arguments with `Error: Unexpected argument "<arg>"` and usage to stderr, exit 1.
  * Reject missing/empty/whitespace/repeated `--cwd` and `--dockerfile` options with descriptive errors and usage to stderr, exit 1.
  * Validate that the resolved target directory exists.
  * Validate that the resolved Dockerfile exists (`[ -f "$dockerfile" ] || fail "missing $dockerfile"`).
- Static Dockerfile assertions:
  * Base image stage: `grep -Eq '^FROM node:24-alpine( AS |$)' "$dockerfile"` (fail: `server image must use Node 24 Alpine stages`).
  * Non-root user: `grep -Eq '^USER node$' "$dockerfile"` (fail: `runtime image must run as USER node`).
  * Healthcheck directive: `grep -Eq '^HEALTHCHECK ' "$dockerfile"` (fail: `server image must keep a HEALTHCHECK`).
  * Startup command: `grep -Fq 'CMD ["node", "server/dist/main.js"]' "$dockerfile"` (fail: `server image must start Node directly, not npm`).
- Output: print `docker runtime check passed\n` on success, exit 0.

### 2. Create `scripts/ops/check-docker-runtime.spec.js`

Write comprehensive unit and contract tests using Node.js built-in test runner (`node:test` and `node:assert/strict`):
1. CLI argument validation tests:
   - `--help` and `-h` print usage to stdout and exit 0.
   - Unknown options (e.g. `--invalid`, `-x`) exit 1 with error and usage to stderr.
   - Unexpected positional arguments (e.g. `foo`, `server/Dockerfile`) exit 1 with error and usage to stderr.
   - Missing `--cwd` value exits 1 with descriptive error to stderr.
   - Repeated `--cwd` option exits 1 with descriptive error to stderr.
   - Empty or whitespace `--cwd` value exits 1 with descriptive error to stderr.
   - Non-existent `--cwd` directory exits 1 with descriptive error to stderr.
   - Missing `--dockerfile` value exits 1 with descriptive error to stderr.
   - Repeated `--dockerfile` option exits 1 with descriptive error to stderr.
   - Empty or whitespace `--dockerfile` value exits 1 with descriptive error to stderr.
   - Non-existent `--dockerfile` exits 1 with descriptive error to stderr.
   - Both `--cwd <path>` / `--cwd=<path>` and `--dockerfile <path>` / `--dockerfile=<path>` are supported.
2. Isolated fixture and fail-closed tests:
   - Missing Dockerfile fails closed with exit 1 and identifies the missing file.
   - Missing Node 24 Alpine stage (e.g. Node 20, Ubuntu, Debian) aborts with exit 1 and descriptive error.
   - Missing `USER node` (runs as root or other user) aborts with exit 1 and descriptive error.
   - Missing `HEALTHCHECK` directive aborts with exit 1 and descriptive error.
   - Incorrect startup CMD (e.g. `CMD ["npm", "start"]`) aborts with exit 1 and descriptive error.
   - Valid isolated Dockerfile with all 4 directives passes with exit code 0.
3. Directory targeting and integration tests:
   - Direct execution without arguments against the repository passes with exit code 0 and prints `docker runtime check passed`.
   - Execution with explicit `--cwd .` or `--dockerfile server/Dockerfile` passes with exit code 0.
   - Execution from another directory (e.g. `server/` with `--cwd ..` or `--dockerfile ../server/Dockerfile`) passes with exit code 0.

### 3. Update `package.json`

- Add script:
  `"ops:docker-runtime-test": "node --test scripts/ops/check-docker-runtime.spec.js"`
- Update `"ops:check"`:
  Include `npm run ops:docker-runtime-test`.

### 4. Update `scripts/ops/check-production-templates.sh` and tests

- In `scripts/ops/check-production-templates.sh`:
  * Add `require_file scripts/ops/check-docker-runtime.sh`.
  * Add `require_file scripts/ops/check-docker-runtime.spec.js`.
- In `scripts/ops/check-production-templates-shell.spec.js`:
  * Add `scripts/ops/check-docker-runtime.sh` and `scripts/ops/check-docker-runtime.spec.js` to `REQUIRED_FILES`.

### 5. Update documentation

- Update `docs/operations.md` recording the hardened Docker runtime check CLI options, fail-closed assertions, and test coverage.
- Update `docs/build-plan.md` recording Prompt 261's contracts, verification outputs, and limitations.

## SKILLS USED

- `javascript-testing-patterns`: design and implement robust Node.js test runner specifications in `scripts/ops/check-docker-runtime.spec.js` using isolated fixtures, stubs, and subprocess execution.
- `error-handling-patterns`: enforce fail-fast validation, precise usage error messages, and controlled exit codes for invalid CLI arguments and failed runtime checks.
- `security-best-practices`: preserve strict non-root user execution, Node 24 alpine stage constraints, and direct Node execution to protect server runtime posture.
- `deployment-pipeline-design`: ensure operational preflight tooling behaves predictably across varied CI and working directory contexts.
- `requesting-code-review`: dispatch reviewer subagent with structured context, requirements, and test evidence.
- `receiving-code-review`: evaluate reviewer feedback with technical rigor and verify codebase reality before committing.
- `caveman-commit`: author terse Conventional Commit message upon completion.

## Verification plan and commands

1. Syntax and static checks:
   - Shell syntax verification: `sh -n scripts/ops/check-docker-runtime.sh`.
   - Node syntax verification: `node -c scripts/ops/check-docker-runtime.spec.js`.
   - Code formatting: `npx prettier --check scripts/ops/check-docker-runtime.sh scripts/ops/check-docker-runtime.spec.js scripts/ops/check-production-templates.sh scripts/ops/check-production-templates-shell.spec.js package.json`.
2. Focused test execution:
   - `node --test scripts/ops/check-docker-runtime.spec.js`.
   - `npm run ops:docker-runtime-test`.
   - `npm run ops:docker-runtime`.
   - Subdirectory invocation: `(cd server && ../scripts/ops/check-docker-runtime.sh --cwd ..)`.
   - Custom dockerfile targeting: `scripts/ops/check-docker-runtime.sh --dockerfile server/Dockerfile`.
   - CLI help: `scripts/ops/check-docker-runtime.sh --help`.
   - CLI invalid option: `scripts/ops/check-docker-runtime.sh --invalid` (expect exit 1).
3. Downstream and integration suites:
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
