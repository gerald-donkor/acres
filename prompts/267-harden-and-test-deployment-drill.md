# 267 — harden and test deployment drill

## Scope and why this is next

Parent phase: Phase 12K within `docs/build-plan.md` §§13 and 22. Planning
baseline: `8985e2bd724b0b953c455fac47b9ace91a39781b` on `main`, clean worktree
before this prompt was written, 2026-10-06. The committed restore-drill work
completes the preceding repository hardening unit. Phase 12 remains open;
prompt 201 owns the separate production-evidence and operator-sign-off work.

The next dependency-safe unit is the deployment configuration rehearsal runner,
`scripts/ops/run-deployment-drill.sh`. Inspection of the actual runner and its
tests establishes these gaps:

1. Value options accept only separate arguments; duplicates silently overwrite
   earlier values and whitespace-only arguments survive parsing.
2. The runner always changes to its installation repository root, with no
   explicit target-directory option.
3. Selected Compose input is validated late, after children, optional probes,
   and evidence-directory creation. API URL safety is checked only while
   writing the final receipt, after logging and probing that URL.
4. Optional PostgreSQL queries use `psql ... || echo "0"`, so authentication or
   SQL failures can produce a printed live-verification success. The
   `POSTGRES_PASSWORD` fallback is tested for presence but is not exported as
   `PGPASSWORD` to the query commands.
5. Evidence uses a second-resolution default name and unconditional
   `fs.writeFileSync`, allowing retained evidence to be overwritten and readers
   to observe an incomplete JSON write.

Planning reproduction, with no child execution or evidence writes:

```text
bash scripts/ops/run-deployment-drill.sh --compose-file=infra/compose/docker-compose.production.example.yml
Error: Unknown option "--compose-file=infra/compose/docker-compose.production.example.yml"
exit 1
```

Fix argument and target validation, optional database observation integrity,
and evidence publication; expand isolated contract coverage. Preserve the
runner's simulation classification and its existing static policy checks.
This prompt authorizes repository implementation and mocked verification only.

## References read

- `AGENTS.md`: phase control, prompt contract, product/standing rules, checks,
  independent review and local commit workflow.
- `docs/build-plan.md`: Phase 12 requirements, Phase 12K evidence qualification,
  and committed hardening records through prompt 266.
- `docs/operations.md`: topology and telemetry; Phase 12G; prompt 236 deployment
  receipt separation; prompt 266 runner conventions and verification limits.
- `docs/launch-checklist.md`: Category 10, shared stage prerequisites, operator
  gap register and production authorization boundary.
- `docs/system-architecture.md` §§11–12: configuration, secrets, health/drain,
  recovery, observability and deferred production choices.
- `docs/security.md` §18: deployment preflight qualification and TM-18/TM-19.
- `docs/skills.md`: skill storage convention and applicable triggers.
- `prompts/266-harden-and-test-restore-drill.md`: adjacent implementation and
  formatter/check lessons; not used as proof that work executed.

Code inspected:

- `scripts/ops/run-deployment-drill.sh` and
  `scripts/ops/run-deployment-drill.spec.js`.
- `scripts/ops/launch-target-evidence.js`: existing URL and probe validation.
- `scripts/ops/check-launch-readiness.js`: `validateDeploymentDrillReport`.
- `scripts/ops/run-launch-drills.sh`: Stage 3 argument forwarding.
- `scripts/ops/assemble-launch-dossier.js`: fixed Stage 3 receipt name and
  `api_target_id` comparison using URL `href`.
- `scripts/ops/run-restore-drill.sh`: adjacent argument/credential conventions.
- `scripts/ops/check-production-templates.sh` and
  `scripts/ops/check-production-templates-shell.spec.js`: deployment runner and
  spec already required; do not add duplicate inventory entries.
- `package.json`: existing operational and root verification scripts.

No UI or styling changes, static reference measurements, screenshots, Next API
changes, or component work are required. The four visual references do not
specify this operational interface. No specialized Bash skill is available;
verify Bash/Node behavior against existing implementations, installed tools and
isolated tests instead of inventing shell or library APIs.

## Expected impact and non-goals

No application route, tenant behavior, schema, release record, readiness
category schema or public API changes. Existing separate-form Stage 3
invocations remain supported. Newly malformed, ambiguous or unsafe runner
inputs fail before execution. Existing explicit receipt destinations must be
absent; callers receive a failure instead of overwriting evidence.

Do not deploy, promote, drain, roll back, rotate credentials, inspect a private
production record, run a live database query/health probe, enable HSTS on a
live target, or approve launch. Do not upgrade dependencies, alter the lockfile,
weaken audit checks, change migration compatibility policy, or introduce a
provider, service, queue, CI workflow, shell framework, or general runner
abstraction. The DDL check remains a heuristic; configured drain periods
remain configuration evidence. Any real exercise needs separately scoped
operator authorization. No push is authorized.

## Implementation plan

### 1. Validate the complete invocation before side effects

Keep Bash with `set -euo pipefail`. Add small local usage/error/validation
helpers as useful; preserve existing actionable policy diagnostics where safe.

- Preserve `--help`/`-h`, `--dry-run`, `--allow-hsts`, `--caddyfile`,
  `--compose-file`, `--evidence-dir`, `--evidence-file`, and `--api-url`.
- Add `--cwd <path>` and `--cwd=<path>`. Its default is the installation
  repository root, preserving today's default from any caller directory.
  An explicitly supplied relative cwd resolves against the invocation cwd.
- Support attached and separate forms for every value option. Reject missing,
  empty, whitespace-only and duplicate values, including mixed-form duplicates.
  Separate option-looking arguments are missing values; attached path values
  can contain spaces or begin with a dash and must remain single arguments.
- Reject unknown options and positional arguments. Repeated boolean flags may
  remain idempotent; document this deliberately. `--help` alone must not require
  operational prerequisites or create directories.
- Validate/canonicalize the target directory before changing into it. Resolve
  relative config/evidence paths against that target. Absolute paths stay
  absolute. Run children and static reads against that same repository target;
  forward its cwd to the three existing shell checkers where appropriate.
- Verify required Node/shell utilities and local child inputs before directory
  creation, children or probes. Require selected Caddy/Compose regular readable
  files, migration directory, health controller, Caddy verifier/spec, URL
  helper and the three shell checkers. Avoid adding an unrelated inventory of
  repository files.
- Validate API URL using the existing `safeUrl` helper before printing it or
  passing it to curl. Accept only an HTTP(S) origin: root pathname, no userinfo,
  query, fragment or control characters. Reject path-prefixed URLs because the
  runner appends root health routes. Use the canonical origin for probes and
  `safeUrl`'s canonical `href` for the existing receipt hash; do not change the
  assembler's `href` identity contract.
- Diagnostics for rejected URLs/arguments must name the failing option/category
  without reflecting supplied values, parser stacks or embedded credential
  canaries. Report configured paths only after validation.
- Check explicit evidence destinations before execution: reject existing files,
  directories and symlinks, including dangling links. Do not delete, truncate,
  follow or replace them. Validate output-parent failures with controlled
  diagnostics. Perform this check even when the subsequent rehearsal fails.

### 2. Make optional PostgreSQL observations truthful

Retain offline operation when neither supported password variable is supplied.
Preserve the existing `PGHOST`, `PGPORT`, `PGUSER`/`POSTGRES_USER`, and
`PGDATABASE` defaults. Do not add unused database CLI options or broader
credential fallback classes.

- If `PGPASSWORD` or `POSTGRES_PASSWORD` is supplied, choose the first nonempty
  supported value, reject whitespace-only credentials, and export it as
  `PGPASSWORD`. Do not put it in process arguments, logs, errors or receipts.
- Validate nonempty connection fields and decimal port 1–65535 before probes;
  prevent Bash octal interpretation and integer overflow. Missing PostgreSQL
  client tools must produce a controlled failure when this branch is selected.
- Use bounded connection behavior, disable interactive password prompts and
  user psql startup files, and fail SQL errors explicitly. Verify flags against
  installed client help/manpages before writing them.
- Distinguish an unavailable server from a successful observation: an
  unsuccessful `pg_isready` may retain today's optional offline fallback, but
  print that the live check was unavailable, never that it was verified.
- Once readiness succeeds, authentication/SQL errors or malformed counts must
  fail the runner. Remove `|| echo "0"`. Require one nonnegative safe integer
  per count result, accepting ordinary surrounding psql whitespace; reject
  empty, negative, fractional, multiline or overflow values.
- A successful count observation reports the observed counts; it does not
  claim migration parity, foreign-key validity, backward compatibility or
  production verification solely from a numeric result. Do not introduce new
  policy thresholds in this patch.
- Preserve optional health-probe fallback and existing payload validation.
  Successful health or database probes never change `execution_mode`.

### 3. Publish evidence without overwriting retained receipts

- Keep the receipt fields and `execution_mode: "simulation"` for both success
  and the existing destructive-DDL failure receipt, with or without
  `--dry-run`. Early invalid-input/child failures must not publish success.
- Preserve explicit Stage 3 `deployment-drill-evidence-receipt.json` paths.
  Use a collision-resistant default filename retaining the
  `deployment-drill-evidence-` prefix, timestamp and `.json` suffix.
- Create evidence directories privately and set generated receipt permissions
  to 0600 without changing existing directory permissions unexpectedly.
- Build the full JSON in a uniquely owned temporary file in the destination
  directory. Atomically publish with exclusive/no-replace semantics (follow the
  adjacent runner's temp-file plus exclusive-link pattern or verified Node
  equivalent). A race inserting the destination must fail and preserve it.
- Cleanup on normal exit, error and interruption removes only this run's
  temporary resource. Never remove a prior destination or unrelated temp file.
  Publication failures return nonzero with a controlled error; no partial
  final JSON is left behind.
- Preserve the existing Compose policy assertions and heuristic migration
  behavior. If restructuring inline Node validation is needed, catch expected
  read/YAML/shape errors rather than leaking stack traces; do not redesign the
  Compose validator or expand its security policy incidentally.

### 4. Expand the existing isolated runner contract tests

Modify `scripts/ops/run-deployment-drill.spec.js`; keep `node:test` and actual
runner execution. Retain the intent of existing policy and classification
cases, adapting early-failure diagnostics and fixture files as needed.

Use disposable repositories, explicit allowlisted environments and stubbed
curl/PostgreSQL/preflight children. No test inherits real credentials or
contacts a real service. Track child calls without storing password values;
compare fixture passwords inside stubs only. Test:

- Help aliases; attached/separate parsing; all value-option duplicate forms;
  missing/empty/whitespace/option-looking values; positional and unknown input.
- Default installation-root behavior from another caller directory; explicit
  absolute/relative cwd; invalid cwd; paths with spaces and attached dash-leading
  paths; exact child cwd and argument forwarding.
- Invalid config files, prerequisites, origins and output destinations failing
  before child calls/probes/output-directory creation. URL cases include
  credentials, query, fragment, controls, non-HTTP schemes and nonroot paths;
  canary values must be absent from stdout/stderr and receipts.
- No-password offline branch; both supported credential sources; whitespace
  rejection; missing clients; port bounds and leading-zero decimal handling;
  unavailable-server fallback; first/second query failures; invalid count
  outputs; credential propagation; truthful valid-count reporting.
- Probe failure/malformed payload versus successful bounded probes; canonical
  target hash compatibility with the assembler.
- Prior receipt/file/directory/symlink preservation, including dangling links;
  concurrent destination insertion; distinct default receipt names; private
  file mode; write/publication failure and interruption cleanup. Use bounded
  deterministic coordination, not timing-only sleeps for race assertions.
- Destructive DDL still exits nonzero and emits a failed simulation receipt;
  all passing receipts satisfy `validateDeploymentDrillReport`, and
  `requireLive: true` rejects them with either dry-run flag state.
- Existing restart/drain/dependency/signal/network assertions still fail closed.

Update `scripts/ops/run-launch-drills.spec.js` or
`scripts/ops/assemble-launch-dossier.spec.js` only if an additional focused
Stage 3 compatibility assertion is necessary; retain separate-form forwarding
and existing identity expectations. No new npm script is needed: existing
`ops:deployment-test` and `ops:check` already include this runner suite.

### 5. Record, review and commit

Update `docs/operations.md` with the CLI/defaults, observation-failure contract,
receipt-publication behavior, actual commands/results and limitations. Append
the prompt 267 implemented record in `docs/build-plan.md` only after execution.
Update `docs/launch-checklist.md` Category 10 usage if needed to describe the
absent-output requirement; never mark a category approved.

Self-review all changed files before dispatching an independent reviewer with
the approved prompt, baseline/current SHAs, full uncommitted diff, constraints
and actual check output. Apply `receiving-code-review`: verify claims against
code, fix valid findings, and re-review significant interaction/data-flow
changes. Record verified work, stage only this prompt's files, inspect the
staged diff, then commit locally to `main` with `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design`: Configuration rehearsal, optional readiness
  observations and preservation of operator promotion/rollback gates.
- `error-handling-patterns`: Early validation, truthful query failures and
  cleanup/publication error handling.
- `secrets-management`: Password fallback propagation and diagnostic privacy.
- `postgres-best-practices`: Read-only database observation integrity and client
  invocation verification; no schema or query optimization changes.
- `javascript-testing-patterns`: Isolated actual-runner contracts and failure
  injection using the repository's existing Node test runner.
- `requesting-code-review`: Independent implementation/diff review after checks.
- `receiving-code-review`: Verify feedback, fix valid defects and re-review.
- `caveman-commit`: Required local commit message, without a push.

These are the skills for this bounded Phase 12K unit. The full parent-phase
manifest applies when those broader surfaces are actually touched; this unit
does not change Nest modules, CI workflows, monitoring, threat-model boundaries,
browser journeys or accessibility.

## Verification and acceptance

Run, capture exit status and quote actual concise output:

```bash
bash -n scripts/ops/run-deployment-drill.sh
node --check scripts/ops/run-deployment-drill.spec.js
npm run ops:deployment-test
npm run ops:caddy-test
npm run ops:templates
npm run ops:templates-test
npm run ops:readiness-test
npm run ops:launch-readiness-test
npm run ops:launch-drill-test
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Run root typecheck and build sequentially because both consume generated Next
types. Run syntax checks for any additional changed scripts. Use the installed
Prettier executable on changed JavaScript and this prompt; format new owning-doc
sections. No shell parser is installed per the preceding verified record:
use shell syntax checks, and do not claim shell formatter success. Baseline
whole-document formatting issues must be distinguished from changed content.

The preceding committed operations record reports `ops:check` stopped at a
critical dependency audit. Re-run it and report its actual result; do not
assume the advisory state or claim later aggregate stages ran after a failure.
Run the listed affected local suites independently if an aggregate external
gate blocks. No dependency repair, registry retry or production action is
part of this prompt.

Acceptance: invalid invocations have no rehearsal side effects; SQL failures
cannot masquerade as successful observations; retained evidence is preserved;
published receipts are complete, private, simulation-only and consumer-compatible;
affected tests and root checks pass, with any external blockers explicitly
recorded; independent review is resolved; the approved work is committed locally.
Phase 12 and prompt 201 remain open until authentic live evidence, dependency
security gates and required operator approvals are satisfied.

Safe inspection after execution: `npm run ops:deployment-test` and
`bash scripts/ops/run-deployment-drill.sh --help`. The runner's `--dry-run`
metadata flag does not disable every optional probe; do not run a default or
targeted rehearsal against real services to demonstrate this repository patch.
