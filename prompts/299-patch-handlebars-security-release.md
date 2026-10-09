# Phase 12K — Patch handlebars security release

## Scope and why this is next

Continue Phase 12K's committed dependency hardening series from clean main at
`65d34b9`. In the recorded dependency inventory, transitive `handlebars` versions
`<=4.7.9` (resolved at `4.7.9` under `ts-jest@29.4.12` in `@acres/server`) are
affected by two critical-severity advisories and one moderate advisory:

- [GHSA-8r5x-fm3f-whwj](https://github.com/advisories/GHSA-8r5x-fm3f-whwj) / CVE-2026-33937 bypass:
  JavaScript Injection via AST Type Confusion in compile. Unauthenticated or untrusted
  template compilation can exploit type confusion during AST traversal to execute arbitrary
  JavaScript. Severity: **Critical** (CVSS 9.8). Fixed in **4.7.10**.
- [GHSA-p8wg-vrv2-v86f](https://github.com/advisories/GHSA-p8wg-vrv2-v86f):
  JavaScript Injection via Own Property Check Bypass. Flawed prototype/own-property
  guards in template compilation permit property lookup bypass leading to remote code execution.
  Severity: **Critical**. Fixed in **4.7.10**.
- [GHSA-xw65-4hp5-5hc7](https://github.com/advisories/GHSA-xw65-4hp5-5hc7):
  JavaScript Injection via Unsafe Inline Embedding of Precompiled Templates.
  Severity: **Moderate** (CVSS 4.7). Fixed in **4.7.10**.

This is the only remaining Critical-severity vulnerability identified in the repository's
dependency audit inventory.

Upstream `ts-jest@29.4.12` declares `"handlebars": "^4.7.9"`, which admits patch release
`4.7.10`. Following the established pattern from Prompts 283 (multer), 285 (js-yaml),
291 (mysql2), 295 (deepmerge-ts), and 298 (graphql-tools/utils), add a root override in
root `package.json`:

```json
"handlebars": "4.7.10"
```

This updates `node_modules/handlebars` to 4.7.10 under `ts-jest@29.4.12`, satisfying its declared
range, patching all three advisories, and eliminating all remaining critical audit findings.

This is inventory remediation. Acres application runtime source does not directly import
`handlebars` or compile untrusted templates. It is used transitively by `ts-jest` for
TypeScript test preprocessing and template transforms. No reachable production exploit is
established in Acres. Do not claim a reachable production vulnerability.

`braces` remains at latest 3.0.3 with no published patched release; do not invent or
suppress that status. Cross-major upgrades (`@apollo/server` v5, `@nestjs/graphql` v14,
`uuid` v11) remain separate tasks.

## References read and verified

- `AGENTS.md`: prompt numbering, immediate-execution exception, checks, review, and commit rules.
- `docs/build-plan.md`: Phase 12K scope and committed hardening records through Prompt 298.
- `docs/operations.md`: historical inventory, prompt 298 results, and offline operations stages.
- `docs/skills.md`: scoped skill selection; no dedicated package updater skill exists.
- `docs/backend.md`, `docs/system-architecture.md`, `docs/security.md`,
  `docs/launch-checklist.md`, `docs/ai.md`: current runtimes, boundaries,
  no-AI operation, and limits on launch evidence.
- `package.json`, `package-lock.json`, `server/package.json`.
- Installed `node_modules/handlebars` and `node_modules/ts-jest`.
- https://github.com/advisories/GHSA-8r5x-fm3f-whwj
- https://github.com/advisories/GHSA-p8wg-vrv2-v86f
- https://github.com/advisories/GHSA-xw65-4hp5-5hc7
- Public npm metadata for `handlebars@4.7.10`: MIT, Node >=0.4.7,
  tarball `https://registry.npmjs.org/handlebars/-/handlebars-4.7.10.tgz`, integrity
  `sha512-P5VJMVM7qgBn6vjXMw8WG9uVI+ncf2pi72j4de4yz5ZULLj2RGqLYaKOYGsgyrViQ0tePOVlN1tDCCXXtFqXKg==`.

No visual, route, component, style, motion, Next API, or database schema change is planned;
visual comps, frontend, and framework UI implementation skills do not apply.

## Files, behavior and non-goals

- Add this prompt: `prompts/299-patch-handlebars-security-release.md`.
- `package.json`: add `"handlebars": "4.7.10"` to `overrides`.
- `package-lock.json`: update `node_modules/handlebars` to 4.7.10 via targeted npm update.
  Preserve all other lock nodes, workspace manifests, and package script approvals.
- `docs/operations.md`: record Prompt 299 provenance, exact lock closure,
  checks, compatibility fixtures, limits, and rollback.
- `docs/build-plan.md`: append concise verified Prompt 299 Phase 12K record.

Non-goals:

- No cross-major upgrades (Apollo Server 5, NestJS GraphQL 14, uuid 11).
- No invention of unreleased patches for `braces`.
- No application source code or API route modifications.
- No live production drills, deployments, or git pushes.
- Temporary logs and disposable test fixtures live under `/tmp/acres-299` and are not future prerequisites.

## Implementation procedure

1. Re-read this prompt and loaded skills before writing code. Save baseline lock
   and toolchain context in disposable `/tmp/acres-299`.
2. Add `"handlebars": "4.7.10"` to `overrides` in root `package.json`.
3. Generate the targeted lock update using:
   `npm update handlebars --package-lock-only --ignore-scripts --no-audit --no-fund`.
   Assert only `node_modules/handlebars` (and any required internal helper) changes in `package-lock.json`.
4. Verify registry metadata and SHA-512 integrity:
   `sha512-P5VJMVM7qgBn6vjXMw8WG9uVI+ncf2pi72j4de4yz5ZULLj2RGqLYaKOYGsgyrViQ0tePOVlN1tDCCXXtFqXKg==`.
5. Run `npm ci --no-audit --no-fund`, preserving existing install-script approvals.
   Verify lock hash is unchanged (`package-lock.json: OK`).
   `npm ls handlebars --all` must show clean, valid 4.7.10 resolution under `ts-jest`.
6. Build bounded, disposable offline semantic fixtures:
   - Basic template compilation, variable interpolation, custom helpers, and partials;
   - AST type confusion rejection with nested and synthetic payloads (CVE-2026-33937 bypass check / GHSA-8r5x-fm3f-whwj);
   - Prototype and own-property guard verification (GHSA-p8wg-vrv2-v86f check);
   - `ts-jest` compilation and unit test execution;
   - CJS and CLI invocation.
7. Run selected Prettier, root `npm run lint`, `npm run typecheck`, `npm run build`,
   and `git diff --check`. Run all 32 independent offline operations stages derived from
   `ops:check`, omitting only online `ops:audit` under the existing metadata-disclosure restriction.
   Record outputs honestly. No fresh audit-count reduction or full `ops:check` pass may be claimed.
8. Self-review the entire diff, then dispatch an independent read-only reviewer
   subagent using `requesting-code-review` with base HEAD `65d34b9`, actual unstaged
   diff, this brief, and logs. Evaluate findings using `receiving-code-review`, fix verified
   defects, and recheck.
9. Record results in owning docs (`docs/operations.md` and `docs/build-plan.md`), format
   and inspect final staged diff, and commit only approved files locally on `main` using
   `caveman-commit`. Do not push.

## SKILLS USED

- `security-best-practices`: Template injection mitigation and dependency inventory governance.
- `javascript-testing-patterns`: Bounded real-library and caller compatibility fixtures.
- `deployment-pipeline-design`: Preserve existing audit/launch gates and rollback.
- `requesting-code-review`: Dispatch independent reviewer after self-verification.
- `receiving-code-review`: Verify review feedback with technical rigor before implementing.
- `caveman-commit`: Required Conventional Commit for the local implementation.

## Verification and rollback

Execute:

```bash
npm run lint
npm run typecheck
npm run build
npm run ops:check (offline stages)
git diff --check
```

Rollback is a reviewed normal revert restoring root `package.json` overrides and
`package-lock.json`. Phase 12, prompt 201, residual findings (`braces`, `uuid`, `@apollo/server`),
and operator sign-offs remain open.
