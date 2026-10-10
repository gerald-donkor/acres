# Phase 12K — Harden Garage metrics template validation

## Scope and why this is next

Continue the unfinished Phase 12 launch gate in `docs/build-plan.md` §§13–14 from
clean `main` at `6b68311` (`fix(ops): reject ambiguous proxy placeholders`).
Following the successful completion of the dependency security audit series
(Prompts 281–299) and the template validator hardening across SMTP credentials
(Prompt 280, `21f412d`), application environment keys (Prompt 300, `99a35c3`), and
proxy environment / Caddyfile placeholders (Prompt 301, `6b68311`), continue the
Stage 1 template-preflight and verifier hardening series.

The pure helper `scripts/ops/check-garage-metrics.js` (`checkGarageMetrics`) is
invoked during Stage 1 template preflight by `scripts/ops/check-production-templates.js`
(lines 1313–1322) to enforce the single file-backed Garage metrics token invariant,
the non-exposure of metrics endpoints, and the strict isolation of the private
Prometheus scrape configuration. It exhibits the exact same structural validation
vulnerabilities and evasion blind spots addressed in Prompts 280, 300, and 301:

1. **Vulnerability to unhandled runtime TypeErrors on invalid inputs:**
   Calling `checkGarageMetrics` directly with non-string text inputs (`productionEnv`,
   `garageEnv`, `garageToml`, or `caddyText`) immediately throws an unhandled
   `TypeError: text.split is not a function` or `TypeError: caddyText.includes is not a function`.
   Similarly, passing non-object or array arguments for `compose` or `prom` produces
   fragile optional-chaining evaluations or unexpected behavior rather than
   deterministic, fail-closed input validation diagnostics.
2. **BOM vulnerability:**
   A UTF-8 Byte Order Mark (`\uFEFF`) at the beginning of any text input
   (`productionEnv`, `garageEnv`, `garageToml`, `caddyText`) causes line matching
   or section header matching on the first line to fail silently.
3. **Evasion of duplicate and forbidden key detection via ambiguous assignment syntax:**
   The current helper parses environment assignments using:
   `text.split(/\r?\n/).filter((line) => line.startsWith(`${key}=`))`
   - **Whitespace and `export` blind spots:**
     An operator or deployment script introducing leading whitespace (`  KEY=val`),
     an `export` prefix (`export KEY=val`), or whitespace around the delimiter
     (`KEY = val` or `KEY= val`) completely bypasses `startsWith(`${key}=`)`.
   - **Silent evasion of forbidden/legacy token keys:**
     The check rejects legacy tokens (`GARAGE_METRICS_TOKEN`) and duplicate file
     declarations (`GARAGE_METRICS_TOKEN_FILE`, `ACRES_GARAGE_METRICS_TOKEN_FILE` in
     `garageEnv`). If any of these forbidden keys are written with leading whitespace,
     `export`, or delimiter spacing, `assignments(...)` returns 0 matches, silently
     permitting the forbidden declaration.
   - **Silent evasion of duplicate `ACRES_GARAGE_METRICS_TOKEN_FILE` declarations:**
     If `ACRES_GARAGE_METRICS_TOKEN_FILE` is declared once canonically and once
     ambiguously (e.g. `export ACRES_GARAGE_METRICS_TOKEN_FILE=/path`), `assignments(...)`
     counts only 1 match, allowing an operator to define competing conflicting
     values.
   - **Ambiguous declarations reported improperly:**
     If `ACRES_GARAGE_METRICS_TOKEN_FILE` in `production.env.example` has leading
     whitespace or an `export` prefix, the helper reports that the file must assign
     the key once to an unresolved absolute path, rather than identifying that an
     ambiguous assignment was present.
4. **Defensive TOML and Compose service typing:**
   - In `garage.toml`, ensure extraction of the `[admin]` section safely tolerates
     whitespace inside section headers (e.g. `[ admin ]`) and guards against
     multiple duplicate `[admin]` sections.
   - In Compose services and environments, guard defensively against array-typed
     or malformed service mappings so iteration does not throw or misbehave.
5. **Zero secret leakage:**
   All diagnostic strings must remain strictly value-free and never reflect
   arbitrary secret strings, token values, or private path snippets.
6. **Preserved public contract and backwards compatibility:**
   The production references (`infra/compose/docker-compose.production.example.yml`,
   `infra/env/production.env.example`, `infra/env/garage.production.env.example`,
   `infra/garage/garage.toml`, `infra/prometheus/prometheus.yml`, and
   `infra/caddy/Caddyfile.example`) must continue to pass cleanly with zero errors.
   The single public export `checkGarageMetrics(compose, productionEnv, garageEnv, garageToml, prom, caddyText = '')`
   must be preserved, returning a deduplicated array of string diagnostics.

Re-establish current state from Git and code upon execution; written prompts do
not prove implementation.

## References read and execution prerequisites

- `AGENTS.md` §§2–7, 8.2, 10: phase controls, prompt file rules, checks, review,
  and local commit.
- `docs/build-plan.md` §§13–14 and Phase 12K records through Prompt 301:
  launch dependencies, verification history, and remaining operator gates.
- `docs/operations.md` Phase 12K, Prompts 218, 220, 223, 224, 240, 258, 279, 280, 299, 300, 301:
  environment contract, Garage metrics isolation, template checking, and limits.
- `docs/launch-checklist.md` Category 1 (`tls_and_ingress_configuration`),
  Category 4 (`secret_references_encryption`), Category 5 (`telemetry_and_alerting`), and §4:
  strict single-source token file integrity, private network isolation, fail-closed
  template verification, and operator sign-off boundaries.
- `docs/security.md` Ingress, proxy, object storage, and metrics boundaries:
  token file minimization, forbidden inline secrets, and zero secret reflection.
- `docs/skills.md`: locked skill triggers and exact local skill paths.
- `scripts/ops/check-garage-metrics.js` and `.spec.js`: pure function
  `checkGarageMetrics(compose, productionEnv, garageEnv, garageToml, prom, caddyText = '')`
  and existing 30 unit tests.
- `scripts/ops/check-proxy-environment.js` and `.spec.js`: Prompt 301 reference
  implementation for input typing, BOM stripping, and duplicate tracking.
- `scripts/ops/check-application-environment.js` and `.spec.js`: Prompt 300
  reference implementation for watched-key scanning, ambiguous line tracking,
  and Compose service inspection.
- `scripts/ops/check-smtp-template-keys.js` and `.spec.js`: Prompt 280 reference
  for BOM stripping and ambiguous line scanning.
- `scripts/ops/check-production-templates.js` and `.spec.js`: caller integration
  and template preflight assertions.
- `infra/garage/garage.toml`: authoritative Garage configuration reference declaring
  `[admin]` listening on private port 3903 with `metrics_require_token = true`.
- `infra/env/production.env.example`: authoritative production environment reference
  declaring `ACRES_GARAGE_METRICS_TOKEN_FILE=/__REQUIRED_OPERATOR_GARAGE_METRICS_TOKEN_FILE__`.
- `infra/env/garage.production.env.example`: authoritative Garage-specific environment
  reference declaring `GARAGE_RPC_SECRET` and `GARAGE_ADMIN_TOKEN`.
- `infra/compose/docker-compose.production.example.yml`: authoritative Compose
  production reference manifest declaring `garage`, `prometheus`, `api`, `worker`,
  `caddy`, and `grafana` services.
- `infra/prometheus/prometheus.yml`: authoritative Prometheus scrape configuration
  declaring private `acres-garage` scrape with Bearer `credentials_file`.
- `infra/caddy/Caddyfile.example`: authoritative Caddyfile reference manifest.
- `package.json`: `ops:templates-test`, `ops:templates`, `ops:check`, lint,
  typecheck, and build scripts.

No visual comp, UI component, route, or database schema change is involved.
The measurable contract is:
- Clean validation of current production references with 0 diagnostics;
- Rejection of invalid argument types with fixed deterministic error messages;
- Robust acceptance of leading UTF-8 BOM across all text inputs;
- Strict detection and rejection of ambiguous assignment syntax (` KEY=val`, `export KEY=val`, `KEY = val`, `KEY= val`) for watched keys;
- Deterministic duplicate rejection for `ACRES_GARAGE_METRICS_TOKEN_FILE` across any mix of canonical and ambiguous lines;
- Deterministic rejection of forbidden/legacy keys (`GARAGE_METRICS_TOKEN`, `GARAGE_METRICS_TOKEN_FILE`, `ACRES_GARAGE_METRICS_TOKEN_FILE` in `garageEnv`) across any mix of canonical and ambiguous lines;
- Robust `garage.toml` `[admin]` section parsing guarding against section duplication;
- Defensive handling of malformed Compose services, environments, volumes, and Prometheus configurations;
- 100% value-free diagnostic strings with zero secret or path reflection.

## Expected files and impact

- `scripts/ops/check-garage-metrics.js`: harden `checkGarageMetrics` with input
  type checks, BOM stripping, regex-based watched-key assignment scanning,
  ambiguous declaration detection, duplicate tracking, defensive Compose/TOML
  traversal, and deduplicated diagnostic output.
- `scripts/ops/check-garage-metrics.spec.js`: preserve all 30 existing test cases,
  add comprehensive tests covering invalid argument types, UTF-8 BOM tolerance,
  ambiguous assignments across `productionEnv` and `garageEnv`, mixed canonical/ambiguous
  duplicates, malformed TOML structures, array Compose services, and value non-reflection.
- `docs/operations.md`: record Prompt 302 implementation details, verification
  commands, check outputs, and rollback guidance.
- `docs/build-plan.md`: record Prompt 302 verification summary at the end of the
  build plan.

### Non-goals

- No changes to `infra/garage/garage.toml` (it must pass unchanged).
- No changes to `infra/env/production.env.example` or `garage.production.env.example` (must pass unchanged).
- No changes to `infra/compose/docker-compose.production.example.yml` or `infra/prometheus/prometheus.yml` (must pass unchanged).
- No changes to NestJS server runtime, client application, or database schemas.
- No live network requests, Garage execution, or Docker commands.
- No git pushes.
- No changes to unrelated validators (`check-application-environment.js`, `check-proxy-environment.js`, etc.).

## Implementation procedure

1. Re-read this prompt and loaded skills before writing code.
2. Inspect `scripts/ops/check-garage-metrics.js` and `scripts/ops/check-garage-metrics.spec.js`.
3. Implement input type validation:
   - Check `compose`: must be a non-null object and not an Array (`['compose must be an object']`).
   - Check `productionEnv`: must be a string (`['production.env.example must be text']`).
   - Check `garageEnv`: must be a string (`['garage.production.env.example must be text']`).
   - Check `garageToml`: must be a string (`['garage.toml must be text']`).
   - Check `prom`: must be a non-null object and not an Array (`['prometheus.yml must be an object']`).
   - Check `caddyText`: must be a string (`['Caddyfile must be text']`).
4. Implement UTF-8 BOM stripping across `productionEnv`, `garageEnv`, `garageToml`, and `caddyText`.
5. Implement watched-key scanning for environment files:
   - Define `WATCHED_KEY = /^(?:\s*export\s+)?\s*([A-Z][A-Z0-9_]*)(?=$|[^A-Za-z0-9_])/`.
   - Scan `productionEnv` for `ACRES_GARAGE_METRICS_TOKEN_FILE`, `GARAGE_METRICS_TOKEN`, `GARAGE_METRICS_TOKEN_FILE`.
   - Track canonical lines (`line.startsWith(`${key}=`) && !/^\s/.test(line[key.length + 1] || '')`) vs ambiguous lines.
   - Enforce: `ACRES_GARAGE_METRICS_TOKEN_FILE` must be defined exactly once canonically, and must match `/${tokenSentinel}`.
   - If ambiguous declarations of `ACRES_GARAGE_METRICS_TOKEN_FILE` exist, report: `production.env.example has an ambiguous ACRES_GARAGE_METRICS_TOKEN_FILE assignment`.
   - If total occurrences of `ACRES_GARAGE_METRICS_TOKEN_FILE` exceed 1, report duplicate error.
   - Scan `garageEnv` for `GARAGE_METRICS_TOKEN`, `GARAGE_METRICS_TOKEN_FILE`, `ACRES_GARAGE_METRICS_TOKEN_FILE`. If any match (canonical or ambiguous), report:
     `Garage metrics must have one file source; remove legacy GARAGE_METRICS_TOKEN and duplicate GARAGE_METRICS_TOKEN_FILE assignments`.
   - If `productionEnv` has any matches (canonical or ambiguous) for `GARAGE_METRICS_TOKEN` or `GARAGE_METRICS_TOKEN_FILE`, report:
     `Garage metrics must have one file source; remove legacy GARAGE_METRICS_TOKEN and duplicate GARAGE_METRICS_TOKEN_FILE assignments`.
6. Implement defensive TOML extraction and validation for `garage.toml`:
   - Check for multiple `[admin]` sections (reject duplicate sections).
   - Ensure `admin` section extraction handles optional whitespace in `\[\s*admin\s*\]`.
   - Enforce `metrics_require_token = true` and private port `3903`.
7. Implement defensive Compose and Prometheus traversal:
   - Defensively guard `services`, `service.volumes`, `service.environment`, and `prom.scrape_configs`.
8. Ensure all diagnostic messages are deduplicated (`[...new Set(errors)]`) and strictly value-free.
9. Update `scripts/ops/check-garage-metrics.spec.js` with comprehensive positive and negative test cases.
10. Run focused checks:
    - `node --check scripts/ops/check-garage-metrics.js`
    - `node --check scripts/ops/check-garage-metrics.spec.js`
    - `node --test scripts/ops/check-garage-metrics.spec.js`
    - `npm run ops:templates-test`
    - `npm run ops:templates`
    - `npm run ops:check`
11. Run global verification:
    - `npm run lint`
    - `npm run typecheck`
    - `npm run build`
    - `git diff --check`
12. Dispatch code reviewer subagent via `requesting-code-review`.
13. Evaluate feedback with `receiving-code-review`, making any necessary technical corrections.
14. Document changes in `docs/operations.md` and `docs/build-plan.md`.
15. Commit changes locally using `caveman-commit`.

## SKILLS USED

- `security-best-practices`: Secure-by-default input validation, defensive token/assignment parsing, and secret non-reflection.
- `javascript-testing-patterns`: Node.js test runner unit and integration tests for template validators.
- `requesting-code-review`: Mandatory independent code review request dispatch.
- `receiving-code-review`: Technical verification and evaluation of reviewer feedback.
- `caveman-commit`: Conventional Commits local commit message generation.

## Verification, review, documentation and completion

Record BASE_SHA, branch, and worktree state. Run and quote actual outputs and exit codes from:

```bash
node --check scripts/ops/check-garage-metrics.js
node --check scripts/ops/check-garage-metrics.spec.js
node --test scripts/ops/check-garage-metrics.spec.js
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
