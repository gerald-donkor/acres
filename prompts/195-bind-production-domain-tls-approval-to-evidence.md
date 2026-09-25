# 195 — bind production domain and TLS approval to evidence

## Scope and why this is next

The committed baseline is `ef49779` on `main`, with a clean worktree at planning time. Phase 12's launch gate remains open pending operator evidence and approval. Prompts 188–190 hardened Category 6 (`backup_and_disaster_recovery`) by validating backup cadence against RPO and binding launch approval to concrete restore and reconciliation child reports. Prompt 191 hardened Category 8 (`volume_encryption`) by binding launch approval to concrete volume encryption child reports. Prompt 192 hardened Category 3 (`secrets_management`) by binding launch approval to concrete secret rotation child reports and enforcing the 90-day cadence ceiling. Prompt 193 hardened Category 10 (`deployment_and_rollback`) by binding launch approval to concrete deployment drill child reports. Prompt 194 hardened Category 5 (`slo_and_alerting`) by binding launch approval to concrete capacity alerting child reports.

The next dependency-safe launch readiness gap is Category 1 (`production_domain_tls`). `docs/launch-checklist.md` §3.1 requires:
- Drill/verify: `node scripts/ops/verify-caddy-routing.js`, `scripts/ops/check-production-templates.sh`
- Evidence: Caddyfile HSTS approval, DNS A/AAAA record printout
- Accept: real (non-localhost) domain, valid TLS contact email, `hsts_approved: true`

Currently, `scripts/ops/check-launch-readiness.js` permits narrative-only evidence for Category 1 without referencing any verified Caddy routing child report, and its syntax checks are loose:
1. `domain` check only verifies `!domain.includes('localhost') && !domain.includes('127.0.0.1')`, allowing IP addresses, URLs with protocols (`https://...`), ports, paths, or malformed strings.
2. `tls_contact_email` only checks `.includes('@')`, allowing malformed email addresses or placeholder fragments.
3. `custom_certificates` is not validated as a boolean.
4. `scripts/ops/verify-caddy-routing.js` prints output to the console but lacks `--output <file>` and `--json` support, unlike `verify-volume-encryption.js`, `run-sast-scan.js`, and `generate-sbom.js`. Consequently, Stage 3 of `run-launch-drills.sh` runs `verify-caddy-routing.js` but does not capture structured child evidence.

Bind Category 1 launch approval to:
1. Valid production FQDN hostname syntax (rejecting localhost, IP addresses, protocols, ports, and paths).
2. Valid TLS contact email address syntax (rejecting placeholders and malformed emails).
3. Explicit `hsts_approved: true` confirmation and boolean `custom_certificates`.
4. A concrete, successful Caddy routing and TLS child report emitted by `scripts/ops/verify-caddy-routing.js` (`caddy-routing-evidence-<timestamp>.json`), referenced in `evidence`.
5. Update `verify-caddy-routing.js` with `--output, -o <file>` and `--json` flags.
6. Update `scripts/ops/run-launch-drills.sh` Stage 3 to emit `caddy-routing-evidence-${TIMESTAMP}.json`.
7. Harden `checkEvidenceFile` and `validateReadiness` in `check-launch-readiness.js` to validate Caddy routing child reports (status, timestamp, security headers, S3 SigV4 Host header preservation, API proxy headers, tested route counts, and all routes passed).

## References and verified baseline

- Re-read `AGENTS.md` §§2–7 and 10, `docs/build-plan.md` §§13, 21, 22, `docs/launch-checklist.md` Category 1 (§3.1) and §4, `docs/security.md` TM-01, TM-05, TM-18, and `docs/skills.md` before execution.
- Inspect `scripts/ops/verify-caddy-routing.js` and `scripts/ops/verify-caddy-routing.spec.js`; `scripts/ops/check-launch-readiness.js` and `scripts/ops/check-launch-readiness.spec.js`; `scripts/ops/run-launch-drills.sh` Stage 3; `infra/launch/readiness.example.json`; `scripts/ops/check-production-templates.sh`; and `infra/caddy/Caddyfile.example`.
- Producer `verify-caddy-routing.js` output structure when `--output` is provided:
  - `drill_type`: `'caddy_routing_and_tls_verification'`
  - `timestamp`: ISO UTC timestamp string (`new Date().toISOString()`)
  - `status`: `'success'` | `'failed'` (`'success'` required)
  - `valid`: boolean (`true` required)
  - `targetPath`: string path to target Caddyfile
  - `domain`: string domain from site block
  - `hstsApproved`: boolean
  - `securityHeadersVerified`: boolean (`true` required)
  - `s3SigV4HostPreserved`: boolean (`true` required)
  - `proxyHeadersVerified`: boolean (`true` required)
  - `routesEvaluated`: integer `>= 12`
  - `routesPassed`: integer equal to `routesEvaluated`
  - `evaluatedRoutes`: array of at least 12 evaluated route objects, each with `passed === true`
  - `errors`: array (`errors.length === 0` required)
  - `warnings`: array of strings

## Implementation contract

1. In `scripts/ops/verify-caddy-routing.js`:
   - Support CLI arguments:
     - `targetPath` (optional positional argument or default `infra/caddy/Caddyfile.example`)
     - `--output, -o <file>`: path to write structured JSON report
     - `--json`: output JSON report to stdout and exit
     - `--help, -h`: display usage instructions
   - Build payload with `drill_type: 'caddy_routing_and_tls_verification'`, `timestamp`, `status`, `valid`, `targetPath`, `domain`, `hstsApproved`, `securityHeadersVerified`, `s3SigV4HostPreserved`, `proxyHeadersVerified`, `routesEvaluated`, `routesPassed`, `evaluatedRoutes`, `errors`, and `warnings`.
   - When `--output` is provided, create parent directory recursively and write formatted JSON.
   - When `--json` is provided, print JSON to stdout and exit with code 0 on success, 1 on errors.
   - Preserve existing human-readable output when neither `--json` is specified nor running in quiet mode.
2. In `scripts/ops/run-launch-drills.sh`:
   - In Stage 3 (`ingress_deployment`), pass `--output "${EVIDENCE_DIR}/caddy-routing-evidence-${TIMESTAMP}.json"` to `verify-caddy-routing.js`.
   - Stage 3 will now emit both `caddy-routing-evidence-*.json` and `deployment-drill-evidence-*.json`.
3. In `scripts/ops/check-launch-readiness.js`:
   - Add `isCaddyRoutingCandidate({ file, parsed } = {})` helper recognizing Caddy routing child evidence by filename (`caddy-routing-evidence-` or `caddy-routing`) or structural markers (`parsed.drill_type === 'caddy_routing_and_tls_verification'` or `typeof parsed.securityHeadersVerified === 'boolean' && typeof parsed.s3SigV4HostPreserved === 'boolean' && Array.isArray(parsed.evaluatedRoutes)`). Reject non-objects, arrays, null, or unified dossiers.
   - Add `validateCaddyRoutingReport(report, now)` helper:
     - Require a plain object (not null, not array).
     - Require `report.timestamp` to be a valid UTC timestamp that parses to a finite timestamp not in the future relative to `now`.
     - Require `report.status === 'success'`.
     - Require `report.valid === true`.
     - Require `report.hstsApproved === true` for an approved production Caddyfile; add an explicit CLI `--allow-hsts` option to verify operator-approved active HSTS with a concrete positive `max-age`.
     - Require `Array.isArray(report.errors) && report.errors.length === 0`.
     - Require `report.securityHeadersVerified === true`.
     - Require `report.s3SigV4HostPreserved === true`.
     - Require `report.proxyHeadersVerified === true`.
     - Require integer `report.routesEvaluated >= 12`.
     - Require integer `report.routesPassed === report.routesEvaluated`.
     - Require `Array.isArray(report.evaluatedRoutes)` where every item has `passed === true`.
   - In `checkEvidenceFile`:
     - Add checks for `caddy-routing-evidence-` child reports:
       - Check `status !== 'success'` -> addBlocker
       - Check `valid === false` -> addBlocker
       - Check `errors.length > 0` -> addBlocker
       - Check `securityHeadersVerified === false` -> addBlocker
       - Check `s3SigV4HostPreserved === false` -> addBlocker
       - Check `proxyHeadersVerified === false` -> addBlocker
       - Check `routesEvaluated < 12` -> addBlocker
       - Check `routesPassed !== routesEvaluated` -> addBlocker
       - Check any failed route in `evaluatedRoutes` -> addBlocker
   - In `validateReadiness`:
     - Accumulate parsed evidence files from `sections.production_domain_tls` into a `caddyEvidence` array:
       `if (sectionName === 'production_domain_tls') caddyEvidence.push(...parsedFiles);`
     - In Category 3.1 (`production_domain_tls`):
       - Validate `domain`:
         - Require non-empty string.
         - Reject `localhost`, `127.0.0.1`, and IPv4/IPv6 addresses.
         - Reject protocol prefix (e.g. `https://` or `http://`).
         - Reject ports, paths, query strings, and fragments.
         - Enforce valid FQDN hostname syntax (at least two labels separated by dots, valid alphanumeric/hyphen labels, valid TLD).
       - Validate `tls_contact_email`:
         - Require non-empty string.
         - Reject placeholders (`__REQUIRED_`).
         - Enforce standard email syntax (`local@domain.tld`).
       - Validate `hsts_approved === true`.
       - Validate `typeof domainSec.custom_certificates === 'boolean'`.
       - Filter `caddyEvidence` with `isCaddyRoutingCandidate`.
       - If no candidate report exists, add blocker:
         `'A successful Caddy routing and TLS verification child JSON report is required'`
     - Validate all candidate reports with `validateCaddyRoutingReport(parsed, now, domain)`. If any candidate report fails or is malformed, add blocker:
         `'A referenced Caddy routing report is invalid or failed'`
     - Ensure that every candidate in evidence is validated: a failed or malformed report blocks approval even beside a valid one or inside a wildcard match.
     - Bind every candidate report to the approved domain and reject the placeholder `Caddyfile.example` as approval evidence.
     - Export `isCaddyRoutingCandidate` and `validateCaddyRoutingReport` in `module.exports`.
4. In `scripts/ops/verify-caddy-routing.spec.js`:
   - Add tests verifying `--output` writes valid JSON with all required fields.
   - Add tests verifying `--json` outputs valid JSON and exits with code 0.
   - Add tests verifying error handling when invalid options or nonexistent files are provided.
5. In `scripts/ops/check-launch-readiness.spec.js`:
   - Update approved readiness fixture to include a valid `caddy-routing-evidence-*.json` in `production_domain_tls.evidence`.
   - Add tests verifying Category 1 validation passes with valid Caddy routing evidence.
   - Add tests verifying Category 1 blocks approval when Caddy routing evidence is missing.
   - Add tests verifying Category 1 blocks approval when Caddy routing evidence reports failure, errors, failed routes, or missing security headers.
   - Add tests verifying Category 1 fails closed on invalid domain (IP address, protocol, port, path, malformed FQDN).
   - Add tests verifying Category 1 fails closed on invalid TLS contact email.
   - Add tests verifying Category 1 fails closed on non-boolean `custom_certificates`.
   - Add tests verifying wildcard Caddy routing evidence rejects a failed child alongside a valid child.
   - Add tests verifying helper functions handle edge cases and missing parameters safely.
6. Documentation:
   - Update `docs/launch-checklist.md` §3.1 with child report evidence requirements and fail-closed validator rules.
   - Update `docs/operations.md` and `docs/build-plan.md` with prompt 195 verification records.

## Impact, non-goals, and rollback

- Approved `production_domain_tls` records now require a concrete Caddy routing child report and valid domain, email, and certificate fields. The unresolved example remains blocked. No application routes, database schema, UI, or production Caddy template changes are planned.
- The verifier checks the Caddyfile structure and route simulation. It does not contact production DNS, issue a certificate, or prove a live TLS handshake; operators retain the DNS printout, HSTS approval, certificate recovery, and live TLS checks required by the checklist.
- Rollback: revert the readiness validator, Caddy verifier output and CLI, Stage 3 child artifact wiring, tests, and owning documentation in this prompt's commit.

## Verification and review

1. Run `node --test scripts/ops/check-launch-readiness.spec.js scripts/ops/verify-caddy-routing.spec.js scripts/ops/run-launch-drills.spec.js` and `npm run ops:templates`.
2. Run `npm run ops:check`; verify the checked-in `infra/launch/readiness.example.json` remains blocked with `node scripts/ops/check-launch-readiness.js infra/launch/readiness.example.json`.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`; inspect the complete prompt-scoped diff.
4. Dispatch reviewer subagent via `requesting-code-review` using base commit and worktree diff. Evaluate findings through `receiving-code-review`, fix verified issues, and re-run affected checks.
5. Record actual results in `docs/operations.md` and `docs/build-plan.md`, then commit the prompt-scoped files locally to `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `deployment-pipeline-design` — preserve the stage gate and operator approval boundary.
- `javascript-testing-patterns` — cover CLI output and fail-closed evidence validation.
- `requesting-code-review` — dispatch independent review after self-verification.
- `receiving-code-review` — evaluate findings against the implementation.
- `caveman-commit` — write the local commit message.
