# Phase 12K — Harden release images template validation

## Scope and why this is next

Continue the unfinished Phase 12 launch gate in `docs/build-plan.md` §§13–14 from
clean `main` at `1a17ec4` (`fix(ops): harden postgres diagnostics validation`).
Following the successful completion of the dependency security audit series
(Prompts 281–299) and the template validator hardening across SMTP credentials
(Prompt 280, `21f412d`), application environment keys (Prompt 300, `99a35c3`),
proxy environment / Caddyfile placeholders (Prompt 301, `6b68311`), Garage
metrics template validation (Prompt 302, `5044623`), and PostgreSQL diagnostics
template validation (Prompt 303, `1a17ec4`), complete the Stage 1 template-preflight
and verifier hardening series.

The release images verifier in `scripts/ops/check-release-images.js` is invoked
during Stage 1 template preflight by `scripts/ops/check-production-templates.js`
(lines 9, 1240–1246) via `validateComposeImages(compose)` to ensure that the
production Compose template (`infra/compose/docker-compose.production.example.yml`)
binds the application services (`next`, `api`, `worker`) strictly to release image
variables without `build` definitions, and pins `postgres-exporter` to its exact
attested immutable digest (`ghcr.io/prometheus-community/postgres-exporter@sha256:...`).
Furthermore, `check-launch-readiness.js` imports `validateImageReference` from
`check-release-images.js` (lines 15, 916, 2612, 3253) to enforce immutable Docker
distribution grammar across operator release declarations.

`check-release-images.js` is the final Stage 1 template validator requiring
hardening against unexpected input types, missing CLI features, and test suite integration:

1. **Vulnerability to unhandled runtime TypeErrors on invalid inputs:**
   - Calling `checkReleaseImages(compose, env)` with a non-object `env` (such as `null`,
     `undefined`, a string, number, or array) throws an unhandled `TypeError: Cannot read properties of null/undefined (reading 'ACRES_CLIENT_IMAGE')`.
   - Calling `validateComposeImages(compose)` with primitive or non-mapping inputs
     (such as `null`, `undefined`, `"invalid"`, `123`, or `[]`) currently evaluates
     `compose?.services?.[serviceName]` as undefined and throws the misleading error
     `${serviceName} must use its required release image input without a build`, rather
     than failing fast with a clean shape diagnostic (`compose must be an object`).
   - If `compose.services` is missing or not a plain mapping (such as `{ services: null }`
     or `{ services: "invalid" }`), it should fail with `compose services must be an object`.
   - If an individual service mapping is not an object or contains a `build` property
     (regardless of value), it must be deterministically rejected without crashing.
2. **Missing pure error collection helpers:**
   - Existing functions (`validateComposeImages`, `checkReleaseImages`, `validateImageReference`)
     throw `Error` directly on failure. While existing callers in `check-production-templates.js`
     and `check-launch-readiness.js` catch these errors, companion verifiers in `scripts/ops/`
     export pure functions returning arrays of string errors (`validateComposeImagesErrors`,
     `checkReleaseImagesErrors`). Adding these pure helpers while preserving backward-compatible
     throwing behavior provides deterministic, value-free error collections for callers and tests.
3. **Absence of standard CLI argument parser and runner interface:**
   - `check-release-images.js` currently hardcodes `COMPOSE_PATH = 'infra/compose/docker-compose.production.example.yml'`
     relative to process working directory, with no support for `--help`, `-h`, `--cwd <path>`,
     or `--cwd=<path>`.
   - Running `node scripts/ops/check-release-images.js --help` currently throws an error
     attempting to check images rather than printing usage and exiting 0.
   - It requires a standard `parseCliArguments(argv, cwd)` and `main(argv, io, options)`
     runner consistent with `verify-postgres-diagnostics.js`, `check-application-environment.js`,
     and `check-garage-metrics.js`.
4. **Error sanitization and zero secret / value reflection:**
   - Error messages in `validateImageReference`, `validateComposeImages`, and `checkReleaseImages`
     must remain strictly value-free and never reflect untrusted input strings or file contents.
   - The CLI error handler must sanitize thrown errors to avoid reflecting untrusted parser outputs.
5. **Repository wiring and test unification:**
   - Wire `scripts/ops/check-release-images.spec.js` into `package.json`'s `ops:templates-test`
     script alongside the other template validators, ensuring the comprehensive template test
     run includes release image verification.
   - Add `"ops:release-images": "node scripts/ops/check-release-images.js"` in `package.json`
     to provide a standard npm command for operators in the release shell as specified in `docs/operations.md`.
   - Retain `"ops:release-images-test"` in `package.json` and ensure `ops:check` passes completely.
6. **Preserved public contract and backwards compatibility:**
   - Preserve existing named exports (`validateImageReference`, `validateComposeImages`, `checkReleaseImages`).
   - All existing tests in `check-release-images.spec.js`, `check-production-templates.spec.js`,
     and `check-launch-readiness.spec.js` must continue to pass unchanged.

Re-establish current state from Git and code upon execution; written prompts do
not prove implementation.

## References read and execution prerequisites

- `AGENTS.md` §§2–7, 8.2, 10: phase controls, prompt file rules, checks, review,
  and local commit.
- `docs/build-plan.md` §§13–14 and Phase 12K records through Prompt 303:
  launch dependencies, verification history, and remaining operator gates.
- `docs/operations.md` Phase 12K, Prompts 163, 164, 165, 214, 258, 280, 300, 301, 302, 303:
  immutable production image references, template checking, and release shell validation.
- `docs/launch-checklist.md` Category 3 (`deployment_and_rollback`) and §2:
  release image digest binding, production Compose verification, and operator checklists.
- `docs/security.md` Supply chain and deployment boundaries:
  immutable digest pinning, absence of build directives in production Compose, value non-reflection.
- `docs/skills.md`: locked skill triggers and exact local skill paths.
- `scripts/ops/check-release-images.js` and `.spec.js`: release image verification logic,
  `validateImageReference`, `validateComposeImages`, and existing 22 test cases.
- `scripts/ops/verify-postgres-diagnostics.js` and `.spec.js`: Prompt 303 reference
  for `isMapping`, `parseCliArguments`, `main` runner, and usage error patterns.
- `scripts/ops/check-garage-metrics.js` and `.spec.js`: Prompt 302 reference
  for pure error returning, input validation, and deduplication.
- `scripts/ops/check-production-templates.js` and `.spec.js`: caller integration
  and template preflight assertions.
- `scripts/ops/check-launch-readiness.js`: caller of `validateImageReference`.
- `infra/compose/docker-compose.production.example.yml`: authoritative production Compose template.
- `package.json`: `ops:templates-test`, `ops:release-images-test`, `ops:check`, lint,
  typecheck, and build scripts.

No visual comp, UI component, route, or database schema change is involved.
The measurable contract is:
- Clean validation of checked-in `infra/compose/docker-compose.production.example.yml` with valid env returning 0 errors;
- Deterministic error returns (`['compose must be an object']`, `['env must be an object']`, `['compose services must be an object']`) on invalid inputs;
- Standalone CLI runner with `--help` (exit 0), `--cwd <path>`, and fail-closed error handling (exit 1);
- Complete backward compatibility with `check-production-templates.js` and `check-launch-readiness.js`;
- All tests in `ops:templates-test`, `ops:release-images-test`, and `ops:check` passing.

## Implementation details

### 1. `scripts/ops/check-release-images.js`

1. **Input shape and mapping validator:**
   - Define `isMapping(value)`:
     ```js
     function isMapping(value) {
       return (
         value !== null &&
         typeof value === 'object' &&
         !Array.isArray(value) &&
         [Object.prototype, null].includes(Object.getPrototypeOf(value))
       );
     }
     ```
2. **Pure error collectors:**
   - `validateComposeImagesErrors(compose)`:
     - Return `['compose must be an object']` if `!isMapping(compose)`.
     - Return `['compose services must be an object']` if `!isMapping(compose.services)`.
     - Check each service in `APP_IMAGES`:
       - If `!isMapping(service)`: error `${serviceName} must use its required release image input without a build`.
       - If `Object.hasOwn(service, 'build')`: error `${serviceName} must use its required release image input without a build`.
       - If `service.image !== expectedImage`: error `${serviceName} must use its required release image input without a build`.
     - Check `postgres-exporter`:
       - If `!isMapping(exporter)`: error `postgres-exporter must use its required pinned image input without a build`.
       - If `Object.hasOwn(exporter, 'build')`: error `postgres-exporter must use its required pinned image input without a build`.
       - If `exporter.image !== EXPORTER_IMAGE`: error `postgres-exporter must use its required pinned image input without a build`.
     - Return `[...new Set(errors)]`.
   - `validateComposeImages(compose)`:
     - Call `validateComposeImagesErrors(compose)`.
     - If errors exist, throw `new Error(errors[0])` to maintain exact backward compatibility.
   - `checkReleaseImagesErrors(compose, env)`:
     - Collect errors from `validateComposeImagesErrors(compose)`.
     - If `!isMapping(env)`: errors.push('env must be an object'); return errors.
     - For `ACRES_CLIENT_IMAGE` and `ACRES_SERVER_IMAGE`:
       - Run `validateImageReference(env[key], key)` inside a try/catch, pushing `err.message` on failure.
     - Return `[...new Set(errors)]`.
   - `checkReleaseImages(compose, env)`:
     - Call `validateComposeImages(compose)`.
     - If `!isMapping(env)`: throw `new Error('env must be an object')`.
     - Call `validateImageReference(env.ACRES_CLIENT_IMAGE, 'ACRES_CLIENT_IMAGE')`.
     - Call `validateImageReference(env.ACRES_SERVER_IMAGE, 'ACRES_SERVER_IMAGE')`.
3. **`validateImageReference(value, name)` defensive hardening:**
   - Default `name = typeof name === 'string' && name.trim() ? name.trim() : 'image'`.
   - If `typeof value !== 'string' || !IMAGE_REFERENCE.test(value)`:
     throw `new Error(`${name} must be a registry/path@sha256 reference with 64 lowercase hex digits and no tag`)`.
   - Validate hostname length (<= 253) and label lengths (<= 63); throw `${name} has an invalid registry hostname`.
   - Validate port number (<= 65535); throw `${name} has an invalid registry port`.
   - Zero reflection: untrusted `value` is never included in the thrown error message.
4. **CLI argument parsing and runner:**
   - Define `class ReleaseImagesUsageError extends Error {}`.
   - `parseCliArguments(argv = process.argv.slice(2), cwd = process.cwd())`:
     - Validate `cwd` is non-empty string.
     - Validate `argv` is array of strings.
     - Support `--help`, `-h` -> `{ showHelp: true, cwd: resolvedPath }`.
     - Support `--cwd <path>` and `--cwd=<path>` -> `{ showHelp: false, cwd: resolvedPath }`.
     - Reject unknown options, unexpected positional arguments, empty or repeated `--cwd`.
   - `main(argv = process.argv, io = { log: console.log, error: console.error }, options = {})`:
     - Parse CLI arguments, catching `ReleaseImagesUsageError` to print usage error and return 1.
     - If `showHelp`, print usage line and return 0.
     - Resolve `COMPOSE_PATH` against parsed `cwd`.
     - Safely read and parse YAML file; catch errors and log:
       `release image check failed: unable to read or parse infra/compose/docker-compose.production.example.yml` (return 1).
     - Run `checkReleaseImages(compose, options.env || process.env)`.
     - Catch errors: sanitize error message ensuring no arbitrary untrusted text is reflected; log:
       `release image check failed: ${sanitizedMessage}` (return 1).
     - On success: log `release image check passed` (return 0).
5. **Exports:**
   - Export `{ validateImageReference, validateComposeImages, validateComposeImagesErrors, checkReleaseImages, checkReleaseImagesErrors, parseCliArguments, main, ReleaseImagesUsageError, APP_IMAGES, EXPORTER_IMAGE, COMPOSE_PATH }`.

### 2. `scripts/ops/check-release-images.spec.js`

1. Preserve all 22 existing test cases.
2. Add comprehensive test coverage:
   - Non-object / primitive inputs for `compose` (`null`, `undefined`, `"string"`, `123`, `[]`) throw / return `compose must be an object`.
   - Missing or non-object `compose.services` (`{ services: null }`, `{ services: "invalid" }`, `{ services: [] }`) throw / return `compose services must be an object`.
   - Service with explicit `build` property (`build: {}`, `build: null`, `build: false`) is rejected.
   - Missing required services (`next`, `api`, `worker`, `postgres-exporter`) are rejected.
   - `env` non-object / primitive inputs throw / return `env must be an object`.
   - `validateImageReference` handles non-string value, omitted name, and invalid port/hostname gracefully.
   - `validateComposeImagesErrors` and `checkReleaseImagesErrors` return string arrays of errors.
   - `parseCliArguments` handles `--help`, `-h`, `--cwd <path>`, `--cwd=<path>`, and rejects repeated or invalid options.
   - `main` handles help, missing compose file, missing env variables, and clean passing execution with mock `io`.

### 3. `package.json`

1. Add `"ops:release-images": "node scripts/ops/check-release-images.js"` in `scripts`.
2. Update `"ops:templates-test"` to include `scripts/ops/check-release-images.spec.js`:
   `"ops:templates-test": "node --test scripts/ops/check-smtp-template-keys.spec.js scripts/ops/check-proxy-environment.spec.js scripts/ops/check-application-environment.spec.js scripts/ops/check-garage-metrics.spec.js scripts/ops/verify-postgres-diagnostics.spec.js scripts/ops/check-release-images.spec.js scripts/ops/check-production-templates.spec.js scripts/ops/check-production-templates-shell.spec.js"`
3. Retain `"ops:release-images-test": "node --test scripts/ops/check-release-images.spec.js"`.

### 4. Verification and Documentation

1. Run and quote actual outputs of:
   - `npm run ops:release-images-test`
   - `npm run ops:templates-test`
   - `npm run ops:templates`
   - `npm run ops:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
2. Update `docs/operations.md` and `docs/build-plan.md` recording Prompt 304 hardening, actual test counts, and residual gates.
3. Complete two-stage code review loop (`requesting-code-review` / `receiving-code-review`).
4. Commit locally to `main` with `caveman-commit`.

## Non-goals

- No change to production image digests, registry paths, or Dockerfile templates.
- No change to runtime application code in `client/`, `server/`, or `packages/shared/`.
- No live network requests or external container registry queries.
- No push to remote or automated release execution; operator gates remain open.

## SKILLS USED

- `deployment-pipeline-design`: guides container image reference pinning, immutable digest grammar, and production release promotion gates.
- `security-best-practices`: ensures fail-closed input validation, prototype pollution defense, and zero reflection of untrusted inputs in diagnostics or error logs.
- `error-handling-patterns`: designs deterministic, typed error handling with safe CLI error formatting, usage errors, and pure error-returning alternatives alongside backward-compatible exception throwing.
- `javascript-testing-patterns`: guides unit test expansion for pure validation functions, input boundary cases, CLI argument parsing, and runner invocation under `node:test`.
- `requesting-code-review`: required by project workflow (§2, §2.1) to prepare structured context for dispatching reviewer subagent after implementation.
- `receiving-code-review`: required by project workflow (§2, §2.1) to evaluate reviewer feedback with technical rigor before making fixes or committing.
- `caveman-commit`: required by project workflow (§3, §7) to author the concise commit message upon execution.
