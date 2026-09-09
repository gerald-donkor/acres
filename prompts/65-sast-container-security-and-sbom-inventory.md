# 65 - static application security testing, container security hardening, and sbom inventory

## Scope, and why it is next

The committed repository is on `main` at `7810ca4` (`feat(ops): add volume encryption and secret drill`).
Phases 1 through 10 are functionally complete, Phase 11A (Gemini free-tier draft preview)
is implemented as a disabled-by-default preview strictly excluded from production launch,
and Phase 12 operational foundations (12A templates/preflights, 12B telemetry/retention,
12C E2E journeys, 12D launch readiness decision record, 12E browser verification remediation,
12F disaster recovery restore drill and object reconciliation, 12G Caddy same-origin ingress
and deployment drill, and 12H volume encryption key separation and secret rotation drill) are committed.

However, critical supply-chain security, static code analysis, and container build hardening
requirements remain open across the build records and threat model:

1. **Supply-Chain Security & Software Bill of Materials (SBOM) Inventory (TM-18)**:
   In `docs/build-plan.md` Lines 562–563 and 578–579:
   > "- **Outcome/behavior:** ... secret rotation, dependency/SAST/container scanning...
   > - **Tests:** scanners with triage policy; runtime security headers/TLS; non-root images/SBOM or equivalent inventory..."
   And in `docs/security.md` (TM-18 dependency/action/container supply-chain compromise, Lines 159 & 242):
   > "Pin/review actions/images, dependency/container/SAST beyond local deterministic scans,
   > provenance, protected promotion, rotated deploy credentials...
   > dependency/container/SAST/secret scans, artifact provenance and controlled promotion"
   And in `infra/launch/readiness.example.json` Category 10 (`deployment_and_rollback`):
   > Requires explicit `image_provenance_policy` and container inventory.
   While `scripts/ops/audit-dependencies.sh` verifies zero critical vulnerabilities in production
   dependencies, the repository lacks a deterministic Software Bill of Materials (SBOM) generator
   documenting component names, resolved versions, package URLs (purl), integrity checksums,
   license expressions, and license compliance rules (flagging copyleft viral licenses such as
   AGPL/GPL while verifying permissive licenses).

2. **Static Application Security Testing (SAST) with Actionable Triage Policy (TM-15, TM-18)**:
   In `docs/build-plan.md` Line 594:
   > Explicitly specifies `sast-configuration` as a required skill for Phase 12.
   And in `docs/build-plan.md` Line 578:
   > "scanners with triage policy"
   Currently, there is no automated static security analysis engine scanning the TypeScript/JavaScript
   codebase across client, server, and shared workspaces for high-risk patterns:
   - SQL injection / raw query string interpolation (`$queryRawUnsafe`);
   - Command injection via `child_process` methods;
   - Path traversal and unvalidated file access;
   - Hardcoded API keys, JWT secrets, and database passwords;
   - Regular expressions vulnerable to exponential backtracking (ReDoS);
   - Multi-tenant query isolation bypasses;
   - Dangerous DOM/HTML manipulation (`dangerouslySetInnerHTML`);
   - Deprecated/insecure cryptography algorithms.
   Furthermore, an actionable triage policy registry (`infra/security/sast-triage.json`) is required
   to track approved suppressions, severity ratings, business justifications, and expiration dates,
   failing closed on unreviewed blockers.

3. **Container Image Security & Multi-Stage Build Hardening (TM-18)**:
   In `docs/build-plan.md` Line 578:
   > "non-root images/SBOM or equivalent inventory"
   And in `scripts/ops/check-docker-runtime.sh`:
   > Currently only performs a superficial 4-pattern grep against `server/Dockerfile`.
   A comprehensive container security validator is required to statically evaluate all Dockerfiles
   (`server/Dockerfile`, `infra/docker/client.Dockerfile.example`) and Compose templates:
   - Verifying `USER node` non-root runtime enforcement across all images;
   - Verifying multi-stage build separation ensuring compilers, devDependencies, and build secrets
     do not leak into final runtime layers;
   - Verifying healthcheck configurations with bounded intervals and timeouts;
   - Verifying direct process invocation (`CMD ["node", ...]`) ensuring direct POSIX signal delivery;
   - Verifying zero copying of `.env` files or secret variables into images.

This prompt implements **Phase 12I**:
1. **Deterministic Software Bill of Materials (SBOM) Generator & License Validator (`scripts/ops/generate-sbom.js` & `.spec.js`)**:
   - Produces a CycloneDX v1.5 JSON SBOM covering production dependencies across root, server, client, and shared workspaces.
   - Computes package URLs, version strings, SHA-512 integrity hashes, and license expressions.
   - Enforces license compliance: asserts all production packages comply with approved permissive licenses (`MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `CC0-1.0`), rejecting unapproved copyleft or commercial licenses (`AGPL-3.0`, `GPL-3.0`, `SSPL`).
   - Validates exclusion of build/dev dependencies (`@types/*`, `typescript`, `playwright`, `vitest`).
   - Unit test suite (`scripts/ops/generate-sbom.spec.js`) asserting valid JSON schema, dependency tree traversal, license compliance, and devDependency exclusion.

2. **Deterministic SAST Scanner & Triage Policy Engine (`scripts/ops/run-sast-scan.js` & `.spec.js`)**:
   - Pure Node.js security analysis engine scanning source trees (`client/`, `server/`, `packages/shared/`, `scripts/`).
   - Implements 8 core security rules:
     - `SAST-01`: SQL Injection ($queryRawUnsafe, string concatenation in SQL);
     - `SAST-02`: Command Injection (child_process.exec/spawn with shell: true without validation);
     - `SAST-03`: Path Traversal (unvalidated ../ in fs operations);
     - `SAST-04`: Hardcoded Secrets (private keys, tokens, hardcoded passwords);
     - `SAST-05`: ReDoS (vulnerable regex patterns with nested quantifiers);
     - `SAST-06`: Tenant Isolation Bypass (Prisma tenant models queried without organization scope);
     - `SAST-07`: Stored XSS / Dangerous HTML (dangerouslySetInnerHTML, innerHTML);
     - `SAST-08`: Insecure Cryptography (MD5, SHA1 for security-sensitive hashing).
   - Triage Policy Registry (`infra/security/sast-triage.json`):
     - Maps findings by rule, path, line, severity (`BLOCKER`, `HIGH`, `MEDIUM`, `LOW`), justification, approved owner, and expiration date.
     - Fail-closed evaluation: fails with exit code 1 on any untriaged blocker or expired suppression.
   - Unit test suite (`scripts/ops/run-sast-scan.spec.js`) asserting rule detection, triage suppression matching, expiration enforcement, and clean codebase scan.

3. **Container Security & Multi-Stage Build Hardening Validator (`scripts/ops/verify-container-security.js` & `.spec.js`)**:
   - Inspects `server/Dockerfile`, `infra/docker/client.Dockerfile.example`, and `infra/compose/docker-compose.production.example.yml`.
   - Validates non-root user (`USER node`), multi-stage isolation, healthchecks, signal propagation, and absence of secrets.
   - Unit test suite (`scripts/ops/verify-container-security.spec.js`) asserting valid configurations and catching insecure regressions.

4. **Operations & CI Integration**:
   - Package scripts: `ops:sbom`, `ops:sbom-test`, `ops:sast`, `ops:sast-test`, `ops:container-test`, `ops:container-security`.
   - Integrated into `npm run ops:check` and CI pipeline.
   - Documentation updates in `docs/operations.md`, `docs/security.md`, and `docs/build-plan.md`.

## Reference material

- `docs/build-plan.md`: Lines 562–563, 578–579, 594 (Phase 12 SAST, SBOM, container security, `sast-configuration` skill).
- `docs/security.md`: Lines 159, 242 (TM-18 supply-chain compromise, dependency/container/SAST scans, artifact provenance).
- `docs/operations.md`: Lines 85–88 (operational preflights, dependency audits, Docker runtime checks).
- `infra/launch/readiness.example.json`: Category 10 (`deployment_and_rollback`, `image_provenance_policy`).
- `server/Dockerfile`: Server multi-stage build reference.
- `infra/docker/client.Dockerfile.example`: Next.js client multi-stage build reference.
- `.agents/skills/sast-configuration/SKILL.md`: SAST rule configuration, triage policy, and security gate standards.
- `.agents/skills/security-threat-model/SKILL.md`: TM-18 supply chain threat modeling.
- `.agents/skills/security-best-practices/SKILL.md`: Node.js and TypeScript secure coding standards.

## Measurements and procedure

1. **SBOM Generation & License Standards**:
   - Schema: CycloneDX v1.5 specification format (`bomFormat: "CycloneDX"`, `specVersion: "1.5"`).
   - Component scope: all production runtime dependencies in `@acres/server`, `@acres/client`, and `@acres/shared`.
   - Banned license classes: `AGPL-1.0`, `AGPL-3.0`, `GPL-1.0`, `GPL-2.0`, `GPL-3.0`, `SSPL`, `CommonsClause`.
   - Allowed license classes: `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `0BSD`, `CC0-1.0`, `Unlicense`.
   - Performance: generation and validation completes in < 500ms without network access.

2. **SAST Scan & Triage Policy**:
   - Engine: pure Node.js AST/regex static analysis across all workspace source files (`.ts`, `.tsx`, `.js`, `.mjs`).
   - Exclusions: `node_modules/`, `dist/`, `.next/`, `coverage/`, test files (`*.spec.ts`, `*.e2e-spec.ts`, `*.test.ts`), and example templates (`*.example.*`).
   - Triage format: `infra/security/sast-triage.json` adhering to structured JSON schema:
     ```json
     {
       "$schema": "./sast-triage.schema.json",
       "version": "1.0.0",
       "suppressions": [
         {
           "id": "SUP-001",
           "rule_id": "SAST-04",
           "path": "path/to/file.ts",
           "severity": "LOW",
           "rationale": "Justification for suppression",
           "approved_by": "security-owner",
           "approved_date": "2026-09-09",
           "expires_at": "2027-09-09"
         }
       ]
     }
     ```
   - Performance: scans entire repository in < 1500ms.

3. **Container Security Standards**:
   - Server Dockerfile: `server/Dockerfile` verified for Node 24 Alpine, `USER node`, multi-stage `deps`/`build`/`prod-deps`/`runtime`, `HEALTHCHECK`, and `CMD ["node", "server/dist/main.js"]`.
   - Client Dockerfile: `infra/docker/client.Dockerfile.example` verified for Node 24 Alpine, `USER node`, multi-stage isolation, and `EXPOSE 3000`.
   - Image layer hygiene: verifies zero inclusion of `.env`, `*.pem`, `*.key`, or root credentials.

## Implementation details

1. **Implement SBOM Generator & License Validator (`scripts/ops/generate-sbom.js`)**:
   - Parse `package-lock.json` and resolve workspace dependency graph.
   - Separate runtime `dependencies` from `devDependencies`.
   - Extract package metadata: name, version, description, licenses, purl (`pkg:npm/<name>@<version>`), and integrity checksum.
   - Validate licenses against approved permissive whitelist.
   - CLI flags: `--output <path>` (writes CycloneDX JSON), `--verify-licenses` (enforces license compliance), `--json` (prints JSON to stdout).

2. **Implement SBOM Unit Tests (`scripts/ops/generate-sbom.spec.js`)**:
   - Test CycloneDX JSON format compliance.
   - Test workspace dependency resolution.
   - Test devDependency omission.
   - Test license compliance verification and rejection of forbidden copyleft licenses.
   - Test integrity hash extraction.

3. **Implement SAST Scanner & Triage Engine (`scripts/ops/run-sast-scan.js`)**:
   - Define rule registry with 8 core security rules (`SAST-01` through `SAST-08`).
   - Implement source file scanner with path filtering and line-by-line / multi-line evaluation.
   - Load and evaluate `infra/security/sast-triage.json`.
   - Check suppression expiration dates against current time: flag expired suppressions as active blockers.
   - Output structured terminal report with file paths, line numbers, snippets, severity, and rule documentation.
   - CLI flags: `--format [text|json]`, `--triage <path>`, `--fail-on [BLOCKER|HIGH|MEDIUM|LOW]`.

4. **Implement Triage Policy Registry (`infra/security/sast-triage.json`)**:
   - Structured registry with schema validation.
   - Document approved safe patterns (e.g. mock tokens in test fixtures or development seed hashes).

5. **Implement SAST Scanner Unit Tests (`scripts/ops/run-sast-scan.spec.js`)**:
   - Test detection of SQL injection vulnerabilities.
   - Test detection of command injection vulnerabilities.
   - Test detection of path traversal.
   - Test detection of hardcoded secrets.
   - Test ReDoS pattern detection.
   - Test triage suppression matching and expiration failure.
   - Test clean repository scan (asserts zero unreviewed blockers in production code).

6. **Implement Container Security Validator (`scripts/ops/verify-container-security.js` & `.spec.js`)**:
   - Parse Dockerfiles and evaluate AST/instruction sequence.
   - Verify non-root user, multi-stage structure, healthcheck, and direct node command.
   - Test suite asserting clean passes and failing on simulated root users or missing healthchecks.

7. **Update Root `package.json`**:
   - Add `"ops:sbom": "node scripts/ops/generate-sbom.js --verify-licenses"`.
   - Add `"ops:sbom-test": "node --test scripts/ops/generate-sbom.spec.js"`.
   - Add `"ops:sast": "node scripts/ops/run-sast-scan.js"`.
   - Add `"ops:sast-test": "node --test scripts/ops/run-sast-scan.spec.js"`.
   - Add `"ops:container-test": "node --test scripts/ops/verify-container-security.spec.js"`.
   - Add `"ops:container-security": "node scripts/ops/verify-container-security.js"`.
   - Update `"ops:check"` to include `npm run ops:sbom-test && npm run ops:sast-test && npm run ops:container-test && npm run ops:sast && npm run ops:container-security`.

8. **Update Documentation**:
   - `docs/operations.md`:
     - Add "Supply-Chain Security, SAST & Container Hardening Runbook";
     - Document Phase 12I artifacts and verification results.
   - `docs/security.md`:
     - Update TM-18 (supply-chain compromise) with Phase 12I evidence;
     - Update TM-15 (code secrets) with SAST secret scanning evidence.
   - `docs/build-plan.md`:
     - Add Phase 12I verification record documenting SBOM generation, SAST scan results, and container hardening.

## Expected impact

- Files created:
  - `scripts/ops/generate-sbom.js`
  - `scripts/ops/generate-sbom.spec.js`
  - `scripts/ops/run-sast-scan.js`
  - `scripts/ops/run-sast-scan.spec.js`
  - `infra/security/sast-triage.json`
  - `scripts/ops/verify-container-security.js`
  - `scripts/ops/verify-container-security.spec.js`
- Files modified:
  - `package.json`
  - `docs/operations.md`
  - `docs/security.md`
  - `docs/build-plan.md`

## Non-goals

- No third-party proprietary SAST SaaS integrations (Snyk, Veracode, Checkmarx); all analysis runs via pure Node.js and deterministic rules.
- No live Docker daemon requirement during static CI checks (evaluation is deterministic and static).
- No changes to database schema or existing application business logic.
- No modifying established build outputs or runtime performance.

## Verification and documentation plan

1. Execute unit test suites:
   - `npm run ops:sbom-test` (must pass 100% of tests);
   - `npm run ops:sast-test` (must pass 100% of tests);
   - `npm run ops:container-test` (must pass 100% of tests);
   - `npm run ops:sbom` (must exit 0 with valid CycloneDX output and approved licenses);
   - `npm run ops:sast` (must exit 0 with 0 unreviewed blockers);
   - `npm run ops:container-security` (must exit 0 on all production Dockerfiles);
   - `npm run ops:check` (must pass all template, secret, runtime, dependency, readiness, storage reconciliation, Caddy, volume encryption, SBOM, SAST, and container checks).
2. Repository verification checks:
   - `git diff --check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
3. Dispatch reviewer subagent via `requesting-code-review` and evaluate feedback via `receiving-code-review`.
4. Commit locally to `main` using `caveman-commit`.

## SKILLS USED

- `sast-configuration`: core skill guiding rule design, false positive management, triage policy structure, and security quality gates.
- `security-threat-model`: TM-18 supply-chain security and TM-15 code-level secret scanning.
- `security-best-practices`: secure coding standards for JavaScript/TypeScript, SQL injection prevention, and cryptographic safety.
- `architecture-patterns`: modular separation between scanner engine, triage registry, SBOM generator, and test runners.
- `deployment-pipeline-design`: security gate definitions, triage policies, and build verification thresholds.
- `github-actions-templates`: coordinating CI checks and runner security constraints.
- `secrets-management`: secret pattern detection and credential leak prevention in source code and container layers.
- `javascript-testing-patterns`: Node.js test runner unit test design for SAST and SBOM verification.
- `requesting-code-review`: preparing structured review context for code review subagent.
- `receiving-code-review`: evaluating reviewer feedback with technical rigor.
- `caveman-commit`: composing standard conventional commit message.
