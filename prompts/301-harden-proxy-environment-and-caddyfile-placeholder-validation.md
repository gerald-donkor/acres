# Phase 12K — Harden proxy environment and Caddyfile placeholder validation

## Scope and why this is next

Continue the unfinished Phase 12 launch gate in `docs/build-plan.md` §§13–14 from
clean `main` at `99a35c3` (`fix(ops): reject ambiguous application env keys`).
Following the successful completion of the dependency security audit series
(Prompts 281–299) and the hardening of the SMTP template key check in Prompt 280
(`21f412d`) and the application environment template validator in Prompt 300
(`99a35c3`), continue the Stage 1 template-preflight and verifier hardening series.

The proxy environment and Caddyfile template verifier in
`scripts/ops/check-proxy-environment.js` (`checkProxyEnvironment`) is the sibling
helper invoked during Stage 1 template preflight by `scripts/ops/check-production-templates.js`.
It exhibits the exact same structural validation vulnerabilities and blind spots
addressed in Prompts 280 and 300:

1. **Vulnerability to unhandled runtime TypeErrors on invalid inputs:**
   Calling `checkProxyEnvironment` directly with non-string `caddyfile` input
   (e.g. `null`, `undefined`, numeric or object values) immediately throws an
   unhandled `TypeError: caddyfile.matchAll is not a function`. Similarly, passing
   a non-object or array `compose` argument evaluates fragilely via optional
   chaining and produces misleading service errors rather than deterministic,
   fail-closed input validation diagnostics.
2. **BOM vulnerability:**
   A UTF-8 Byte Order Mark (`\uFEFF`) at the beginning of `caddyfile` must be
   safely stripped before parsing.
3. **Evasion of duplicate and malformed placeholder detection:**
   Caddy environment variable substitution syntax requires `{$VAR_NAME}` (dollar
   sign strictly inside braces, immediately preceding the uppercase identifier).
   The current implementation scans placeholders using:
   `new Set([...caddyfile.matchAll(/\{\$([A-Z][A-Z0-9_]*)\}/g)].map((match) => match[1]))`
   - **Silent duplicate suppression:** The `Set` deduplication silently ignores
     multiple duplicate occurrences of the same placeholder (e.g. if an operator
     duplicates an ingress block or route directive containing `{$ACRES_PRODUCTION_DOMAIN}`).
     Every required placeholder in `CADDY_KEYS` must appear exactly once in the
     template.
   - **Missed ambiguous/malformed placeholders:** Operators accustomed to
     Bash, Docker Compose, or Nginx syntax frequently introduce malformed syntax
     such as `${VAR_NAME}` (dollar outside braces), `{$ VAR_NAME}` / `{$VAR_NAME }`
     (whitespace inside braces), or shell-style defaults `{$VAR_NAME:default}` /
     `{$VAR_NAME=default}`. In Caddy, these forms fail to expand environment
     variables at runtime. Currently, the regex skips these forms entirely. If a
     required key has only an ambiguous declaration, the validator reports
     `Caddyfile missing ${key} placeholder` rather than identifying that an
     ambiguous declaration was present; and if a key has both a canonical and an
     ambiguous declaration, the ambiguous declaration evades duplicate detection.
4. **Defensive Compose service environment typing:**
   In Compose service environment checks for `caddy` and `next`, non-string values
   (e.g. `null`, numbers, or nested objects) should be guarded defensively so
   regex checks on `caddy` environment values do not rely on implicit coercion.
5. **Zero secret leakage:**
   All diagnostic strings must remain strictly value-free and never reflect
   arbitrary secret strings, unexpected values, or sensitive configuration
   snippets.
6. **Preserved public contract and backwards compatibility:**
   The production references (`infra/caddy/Caddyfile.example` and
   `infra/compose/docker-compose.production.example.yml`) must continue to pass
   cleanly with zero errors. The single public export `checkProxyEnvironment(compose, caddyfile)`
   must be preserved, returning an array of string diagnostics.

Re-establish current state from Git and code upon execution; written prompts do
not prove implementation.

## References read and execution prerequisites

- `AGENTS.md` §§2–7, 8.2, 10: phase controls, prompt file rules, checks, review,
  and local commit.
- `docs/build-plan.md` §§13–14 and Phase 12K records through Prompt 300:
  launch dependencies, verification history, and remaining operator gates.
- `docs/operations.md` Phase 12K, Prompts 218, 220, 223, 224, 240, 258, 279, 280, 299, 300:
  environment contract, Caddy ingress, template checking, and limits.
- `docs/launch-checklist.md` Category 1 (`tls_and_ingress_configuration`),
  Category 4 (`secret_references_encryption`), and §4:
  strict single-placeholder integrity, fail-closed template verification, and
  operator sign-off boundaries.
- `docs/security.md` Ingress, proxy, and environment boundaries: minimization,
  placeholder retention, and zero secret reflection.
- `docs/skills.md`: locked skill triggers and exact local skill paths.
- `scripts/ops/check-proxy-environment.js` and `.spec.js`: pure function
  `checkProxyEnvironment(compose, caddyfile)` and existing 10 unit tests.
- `scripts/ops/check-application-environment.js` and `.spec.js`: Prompt 300
  reference implementation for ambiguous scanning, duplicate tracking, and input validation.
- `scripts/ops/check-smtp-template-keys.js` and `.spec.js`: Prompt 280 reference
  for BOM stripping and ambiguous line scanning.
- `scripts/ops/check-production-templates.js` and `.spec.js`: caller integration
  and template preflight assertions.
- `infra/caddy/Caddyfile.example`: authoritative Caddyfile reference manifest with
  13 canonical environment placeholders.
- `infra/compose/docker-compose.production.example.yml`: authoritative Compose
  production reference manifest declaring `caddy` and `next` services.
- `package.json`: `ops:templates-test`, `ops:templates`, `ops:check`, lint,
  typecheck, and build scripts.

No visual comp, UI component, route, or database schema change is involved.
The measurable contract is:
- Clean validation of current `infra/caddy/Caddyfile.example` and Compose reference;
- Strict detection and rejection of ambiguous placeholders (`${KEY}`, `{$ KEY}`, `{$KEY }`, `{$KEY:...}`, `{$KEY=...}`);
- Deterministic duplicate detection for all `CADDY_KEYS` placeholders;
- Graceful error return (`['Caddyfile must be text']` or `['compose must be an object']`) for non-text/invalid inputs;
- Zero reflection of secret or unrecognized values in error messages.

## Files, behavior and non-goals

### Files to change

1. `scripts/ops/check-proxy-environment.js`:
   - Validate `caddyfile`: return `['Caddyfile must be text']` when `typeof caddyfile !== 'string'`.
   - Validate `compose`: return `['compose must be an object']` when `compose` is null, undefined, not of type `'object'`, or an `Array`.
   - Strip leading UTF-8 BOM (`caddyfile.replace(/^\uFEFF/, '')`).
   - Placeholder scanning and validation:
     - Define canonical placeholder matching for Caddy syntax: `\{\$([A-Z][A-Z0-9_]*)\}`.
     - Detect candidate/ambiguous placeholders:
       - Match any token referencing an uppercase identifier resembling an environment variable inside braces:
         e.g. `\$(?:\{|\{?\$)\s*([A-Z][A-Z0-9_]*)[^}]*\}` or `\{\$?\s*([A-Z][A-Z0-9_]*)\s*[:=]?[^}]*\}`.
       - If a candidate matches a watched key from `CADDY_KEYS` but is not strictly formatted as canonical `{$KEY}`, flag it as ambiguous.
     - Track both canonical counts and total occurrences across all syntax variants for each key.
     - If a required key has total occurrences === 0: report `Caddyfile missing ${key} placeholder` (preserving exact existing error identity).
     - If a required key has canonical count > 1 or total occurrences > 1: report `Caddyfile must define ${key} placeholder exactly once`.
     - If any watched key is detected with ambiguous syntax: report `Caddyfile has an ambiguous ${key} placeholder`.
     - For any canonical placeholder `{$KEY}` where `KEY` is not in `CADDY_KEYS`: report `Caddyfile has unexpected ${key} placeholder`.
   - Compose service validation:
     - For `service` in `['caddy', 'next']`:
       - Validate service object: if `!service || typeof service !== 'object' || Array.isArray(service)`, report `compose missing ${name} service`.
       - Check `Object.hasOwn(service, 'env_file')`: report `${name} must not declare env_file`.
       - Check `Object.hasOwn(service, 'extends')`: report `${name} must not extend another service`.
       - Validate `service.environment`: if `!environment || typeof environment !== 'object' || Array.isArray(environment)`, report `${name} must declare an environment map`.
       - Unexpected environment keys: for `key` in `Object.keys(environment)`, if not in `expected`, report `${name} has unexpected environment key ${key}`.
       - Missing environment keys: for `key` in `expected`, if `!Object.hasOwn(environment, key)`, report `${name} missing environment key ${key}`.
       - Caddy environment wiring: for `name === 'caddy'`, if `typeof environment[key] !== 'string'` or does not match `^\$\{[A-Z0-9_]+:\?[^}]+\}$`, report `${name} must require ${key} from the matching Compose input`.
       - Next environment constants: for `name === 'next'`, enforce `environment.NODE_ENV === 'production'` and `environment.ACRES_API_ORIGIN === 'http://api:3001'`.
   - Return deduplicated errors: `[...new Set(errors)]`.

2. `scripts/ops/check-proxy-environment.spec.js`:
   - Expand test coverage:
     - Non-string `caddyfile` returns `['Caddyfile must be text']`.
     - Null / primitive / array `compose` returns `['compose must be an object']`.
     - Leading UTF-8 BOM in `caddyfile` is cleanly handled without spurious errors.
     - Ambiguous placeholders (Bash-style `${KEY}`, leading whitespace `{$ KEY}`, trailing whitespace `{$KEY }`, default fallback `{$KEY:val}`) produce `Caddyfile has an ambiguous ${key} placeholder`.
     - Duplicate placeholder definitions produce `Caddyfile must define ${key} placeholder exactly once`.
     - Non-string environment values in `caddy` service environment (e.g. `null`, numbers) produce `${name} must require ${key} from the matching Compose input` without unhandled exceptions.
     - Array-typed service definitions (e.g. `services.caddy = []`) report `compose missing caddy service`.
     - Non-reflection of sensitive values: confirm that values assigned in unexpected keys, ambiguous placeholders, or invalid assignments are never echoed in error diagnostics.

3. `docs/operations.md`:
   - Record Prompt 301 implementation details, contract invariants, actual check outputs, and rollback procedure under Phase 12K.

4. `docs/build-plan.md`:
   - Append concise Prompt 301 verification record under Phase 12K.

### Non-goals

- No changes to `infra/caddy/Caddyfile.example` (it must pass unchanged).
- No changes to `infra/compose/docker-compose.production.example.yml` (it must pass unchanged).
- No changes to NestJS server runtime, client application, or database schemas.
- No live network requests, Caddy execution, or Docker commands.
- No git pushes.
- No changes to unrelated validators (`check-application-environment.js`, `check-smtp-template-keys.js`, etc.).

## Implementation procedure

1. Re-read this prompt and loaded skills before writing code.
2. Inspect `scripts/ops/check-proxy-environment.js` and `scripts/ops/check-proxy-environment.spec.js`.
3. Implement type validation, BOM stripping, candidate placeholder scanning, ambiguous placeholder detection, duplicate tracking, and Compose typing in `scripts/ops/check-proxy-environment.js`.
4. Update `scripts/ops/check-proxy-environment.spec.js` with comprehensive positive and negative test cases.
5. Run focused checks:
   - `node --check scripts/ops/check-proxy-environment.js`
   - `node --check scripts/ops/check-proxy-environment.spec.js`
   - `node --test scripts/ops/check-proxy-environment.spec.js`
   - `npm run ops:templates-test`
   - `npm run ops:templates`
   - `npm run ops:check`
6. Run global verification:
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
   - `git diff --check`
7. Dispatch code reviewer subagent via `requesting-code-review`.
8. Evaluate feedback with `receiving-code-review`, making any necessary technical corrections.
9. Document changes in `docs/operations.md` and `docs/build-plan.md`.
10. Commit changes locally using `caveman-commit`.

## SKILLS USED

- `security-best-practices`: Secure-by-default input validation, defensive placeholder parsing, and secret non-reflection.
- `javascript-testing-patterns`: Node.js test runner unit and integration tests for template validators.
- `requesting-code-review`: Mandatory independent code review request dispatch.
- `receiving-code-review`: Technical verification and evaluation of reviewer feedback.
- `caveman-commit`: Conventional Commits local commit message generation.

## Verification, review, documentation and completion

Record BASE_SHA, branch, and worktree state. Run and quote actual outputs and exit codes from:

```bash
node --check scripts/ops/check-proxy-environment.js
node --check scripts/ops/check-proxy-environment.spec.js
node --test scripts/ops/check-proxy-environment.spec.js
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
