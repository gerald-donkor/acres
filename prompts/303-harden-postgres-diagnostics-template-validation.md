# Phase 12K — Harden PostgreSQL diagnostics template validation

## Scope and why this is next

Continue the unfinished Phase 12 launch gate in `docs/build-plan.md` §§13–14 from
clean `main` at `5044623` (`fix(ops): harden garage metrics template validation`).
Following the successful completion of the dependency security audit series
(Prompts 281–299) and the template validator hardening across SMTP credentials
(Prompt 280, `21f412d`), application environment keys (Prompt 300, `99a35c3`),
proxy environment / Caddyfile placeholders (Prompt 301, `6b68311`), and Garage
metrics template validation (Prompt 302, `5044623`), continue the Stage 1
template-preflight and verifier hardening series.

The PostgreSQL exporter and dashboard diagnostics verifier in
`scripts/ops/verify-postgres-diagnostics.js` (`verifyPostgresDiagnostics`) is
invoked during Stage 1 template preflight by `scripts/ops/check-production-templates.js`
(lines 1357–1367) to enforce the six approved Prometheus metrics retained by
`postgres-exporter` and verify that the operational Grafana dashboard maintains
exact query expressions, units, layout coordinates, and absent-data states for
the PostgreSQL transaction age and lock wait diagnostic panels (Panels 21 and 22).

`verify-postgres-diagnostics.js` is the only remaining template verifier imported
by `check-production-templates.js` that lacks input shape validation, CLI runner
support, and CI integration:

1. **Vulnerability to unhandled runtime TypeErrors on invalid inputs:**
   Calling `verifyPostgresDiagnostics` directly with non-object inputs (e.g. `null`,
   `undefined`, strings, numbers, or arrays) or with malformed properties (e.g.
   `dashboard = { panels: "invalid" }` or `{ panels: null }`) immediately throws
   an unhandled `TypeError: panels.map is not a function`. Similarly, if
   `scrape.metric_relabel_configs` is null or not an array, or if `panel.targets`
   is not an array, property access produces unexpected exceptions rather than
   deterministic, fail-closed input validation diagnostics.
2. **Missing required panel discrimination:**
   If a required diagnostic panel (id 21 or 22) is completely missing from
   `dashboard.panels`, the current implementation evaluates `panel` as `undefined`
   and cascades three vague drift errors (`panel ${id} query or scope drifted`,
   `panel ${id} unit or absent-data state drifted`, `panel ${id} layout or type drifted`)
   rather than reporting clearly that the required panel is missing:
   `dashboard missing panel ${id}`.
3. **Absence of standalone CLI execution runner:**
   Unlike sibling operations scripts in `scripts/ops/`, `verify-postgres-diagnostics.js`
   has no `if (require.main === module)` execution block or CLI argument parser.
   Running `node scripts/ops/verify-postgres-diagnostics.js` executes silently and
   does nothing. It requires a standard CLI interface supporting `--help`, `-h`,
   `--cwd <path>`, and `--cwd=<path>`, reading `infra/prometheus/prometheus.yml`
   and `infra/grafana/dashboards/acres-operations.json`, and exiting 0 or 1 with
   clean console logging.
4. **Missing repository wiring in `package.json` and `ops:check`:**
   Neither `verify-postgres-diagnostics.js` nor its existing test file
   `verify-postgres-diagnostics.spec.js` is wired into `package.json` scripts.
   `ops:postgres-diagnostics-test` does not exist, `verify-postgres-diagnostics.spec.js`
   is omitted from `ops:templates-test`, and `scripts/ops/check-production-templates.sh`
   omits `require_file scripts/ops/verify-postgres-diagnostics.spec.js` (line 139
   requires only the implementation file).
5. **Zero secret reflection and diagnostic deduplication:**
   All diagnostic strings must remain strictly value-free and never reflect
   arbitrary untrusted strings or query fragments. Errors must be deduplicated
   (`[...new Set(errors)]`).
6. **Preserved public contract and backwards compatibility:**
   The production references (`infra/prometheus/prometheus.yml` and
   `infra/grafana/dashboards/acres-operations.json`) must continue to pass
   cleanly with zero errors. The existing export
   `verifyPostgresDiagnostics(scrape, dashboard)` must be preserved.

Re-establish current state from Git and code upon execution; written prompts do
not prove implementation.

## References read and execution prerequisites

- `AGENTS.md` §§2–7, 8.2, 10: phase controls, prompt file rules, checks, review,
  and local commit.
- `docs/build-plan.md` §§13–14 and Phase 12K records through Prompt 302:
  launch dependencies, verification history, and remaining operator gates.
- `docs/operations.md` Phase 12K, Prompts 171, 172, 173, 218, 220, 223, 224, 258, 280, 300, 301, 302:
  PostgreSQL diagnostics, dashboard panels, template checking, and limits.
- `docs/launch-checklist.md` Category 5 (`telemetry_and_alerting`) and §4:
  PostgreSQL telemetry integrity, operational dashboard panel verification, and
  fail-closed preflight gates.
- `docs/security.md` Telemetry and operational boundaries:
  safe metric filtering, exclusion of query text / PII, and value non-reflection.
- `docs/skills.md`: locked skill triggers and exact local skill paths.
- `scripts/ops/verify-postgres-diagnostics.js` and `.spec.js`: pure function
  `verifyPostgresDiagnostics(scrape, dashboard)` and existing 6 unit tests.
- `scripts/ops/check-garage-metrics.js` and `.spec.js`: Prompt 302 reference
  for input validation, defensive collection inspection, and deduplication.
- `scripts/ops/check-production-templates.js` and `.spec.js`: caller integration
  and template preflight assertions.
- `scripts/ops/check-production-templates.sh`: shell preflight script.
- `infra/prometheus/prometheus.yml`: authoritative Prometheus scrape configuration
  declaring `acres-postgres` scrape job with exact metric relabel configs.
- `infra/grafana/dashboards/acres-operations.json`: authoritative Grafana
  operations dashboard defining Panels 21 and 22.
- `package.json`: `ops:templates-test`, `ops:templates`, `ops:check`, lint,
  typecheck, and build scripts.

No visual comp, UI component, route, or database schema change is involved.
The measurable contract is:
- Clean validation of checked-in `infra/prometheus/prometheus.yml` and `infra/grafana/dashboards/acres-operations.json` with 0 diagnostics;
- Deterministic error returns (`['scrape must be an object']`, `['dashboard must be an object']`, etc.) on invalid or primitive inputs;
- Explicit error reporting (`dashboard missing panel ${id}`) when required Panels 21 or 22 are missing;
- Complete CLI runner with `--help`, `-h`, and `--cwd` options;
- Wiring of `ops:postgres-diagnostics-test` into `package.json`, `ops:templates-test`, and `ops:check`;
- Addition of `require_file scripts/ops/verify-postgres-diagnostics.spec.js` in `scripts/ops/check-production-templates.sh`;
- 100% value-free diagnostic strings with zero secret or query snippet reflection.

## Expected files and impact

- `scripts/ops/verify-postgres-diagnostics.js`: harden `verifyPostgresDiagnostics`
  with input type checks, defensive collection/panel validation, explicit missing
  panel reporting, deduplicated errors, and standalone CLI `main` runner.
- `scripts/ops/verify-postgres-diagnostics.spec.js`: preserve all 6 existing tests,
  expand with comprehensive tests for invalid argument types, missing panels,
  malformed targets, CLI arguments, and error formatting.
- `scripts/ops/check-production-templates.sh`: add
  `require_file scripts/ops/verify-postgres-diagnostics.spec.js`.
- `package.json`: add `"ops:postgres-diagnostics-test"` and `"ops:postgres-diagnostics"`,
  and wire the spec into `"ops:templates-test"` and `"ops:check"`.
- `docs/operations.md`: record Prompt 303 implementation details, verification
  commands, check outputs, and rollback guidance.
- `docs/build-plan.md`: record Prompt 303 verification summary at the end of the
  build plan.

### Non-goals

- No changes to `infra/prometheus/prometheus.yml` (must pass unchanged).
- No changes to `infra/grafana/dashboards/acres-operations.json` (must pass unchanged).
- No changes to other dashboard panels (Panels 1–20, 23–28).
- No changes to NestJS server runtime, client application, or database schemas.
- No live network requests, Prometheus queries, or Docker commands.
- No git pushes.

## Implementation procedure

1. Re-read this prompt and loaded skills before writing code.
2. Inspect `scripts/ops/verify-postgres-diagnostics.js` and `scripts/ops/verify-postgres-diagnostics.spec.js`.
3. Implement input type validation in `scripts/ops/verify-postgres-diagnostics.js`:
   - Validate `scrape`: must be a non-null object and not an Array (`['scrape must be an object']`).
   - Validate `dashboard`: must be a non-null object and not an Array (`['dashboard must be an object']`).
   - Validate `scrape.metric_relabel_configs`: if present, must be an Array (`['metric_relabel_configs must be a list']`).
   - Validate `dashboard.panels`: if present, must be an Array (`['panels must be a list']`).
4. Implement defensive panel validation:
   - Check panel objects and ensure IDs are unique.
   - For expected Panels 21 and 22:
     - If panel is not found, report `dashboard missing panel ${id}`.
     - If panel targets is not an array, report `panel ${id} targets must be a list`.
     - Check targets length and query scope, unit and absent-data state, and layout/type.
5. Implement CLI execution runner:
   - Parse `--help`, `-h`, `--cwd <path>`, and `--cwd=<path>`.
   - Read `infra/prometheus/prometheus.yml` and `infra/grafana/dashboards/acres-operations.json` relative to resolved `cwd`.
   - Execute check, format output, and set exit code.
   - Guard entrypoint with `if (require.main === module) { main(); }`.
6. Update `scripts/ops/check-production-templates.sh`:
   - Add `require_file scripts/ops/verify-postgres-diagnostics.spec.js`.
7. Update `package.json`:
   - Add `"ops:postgres-diagnostics-test": "node --test scripts/ops/verify-postgres-diagnostics.spec.js"`.
   - Add `"ops:postgres-diagnostics": "node scripts/ops/verify-postgres-diagnostics.js"`.
   - Update `"ops:templates-test"` to include `scripts/ops/verify-postgres-diagnostics.spec.js`.
   - Update `"ops:check"` to include `npm run ops:postgres-diagnostics-test`.
8. Expand `scripts/ops/verify-postgres-diagnostics.spec.js`:
   - Add test coverage for invalid inputs, non-object scrape/dashboard, missing panels, malformed targets, and CLI runner.
9. Run focused checks:
   - `node --check scripts/ops/verify-postgres-diagnostics.js`
   - `node --check scripts/ops/verify-postgres-diagnostics.spec.js`
   - `node --test scripts/ops/verify-postgres-diagnostics.spec.js`
   - `npm run ops:postgres-diagnostics-test`
   - `npm run ops:templates-test`
   - `npm run ops:templates`
   - `npm run ops:check`
10. Run global verification:
    - `npm run lint`
    - `npm run typecheck`
    - `npm run build`
    - `git diff --check`
11. Dispatch code reviewer subagent via `requesting-code-review`.
12. Evaluate feedback with `receiving-code-review`, making any necessary technical corrections.
13. Document changes in `docs/operations.md` and `docs/build-plan.md`.
14. Commit changes locally using `caveman-commit`.

## SKILLS USED

- `security-best-practices`: Secure-by-default input validation, defensive parsing, and sensitive value non-reflection.
- `javascript-testing-patterns`: Node.js test runner unit and integration tests for template validators.
- `requesting-code-review`: Mandatory independent code review request dispatch.
- `receiving-code-review`: Technical verification and evaluation of reviewer feedback.
- `caveman-commit`: Conventional Commits local commit message generation.

## Verification, review, documentation and completion

Record BASE_SHA, branch, and worktree state. Run and quote actual outputs and exit codes from:

```bash
node --check scripts/ops/verify-postgres-diagnostics.js
node --check scripts/ops/verify-postgres-diagnostics.spec.js
node --test scripts/ops/verify-postgres-diagnostics.spec.js
npm run ops:postgres-diagnostics-test
npm run ops:templates-test
npm run ops:templates
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Format new documentation without reformatting existing history.
Inspect the complete diff before dispatching `requesting-code-review`.
Verify feedback using `receiving-code-review`, resolve valid findings, and update documentation.
Stage approved files only, inspect staged diff, and commit locally with `caveman-commit`.
Do not push.
