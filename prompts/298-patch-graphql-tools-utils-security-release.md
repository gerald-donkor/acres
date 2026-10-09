# Phase 12K — Patch graphql-tools/utils security release

## Scope and why this is next

Continue Phase 12K's committed dependency hardening series from clean main at
`2d86bb0`. In the recorded production dependency inventory, transitive
`@graphql-tools/utils` versions `<=12.0.0` (previously resolved at `9.2.1` under
`@apollo/server@4.13.0` and pinned at `12.0.0` under `@nestjs/graphql@13.4.5`) are
affected by a known high-severity advisory:

- [GHSA-7mx3-vvmw-hjmv](https://github.com/advisories/GHSA-7mx3-vvmw-hjmv) / CVE-2026-104852:
  Prototype pollution in `mergeDeep` utility function where sensitive object keys
  such as `__proto__`, `constructor`, and `prototype` were not excluded during
  recursive property merging. Unauthenticated clients can trigger prototype
  pollution or denial-of-service crashes (`TypeError: Cannot assign to read only
property 'prototype' of function 'Object'`). Fixed in 12.0.1+ / stable **12.0.3**.

Upstream `@nestjs/graphql@13.4.5` explicitly pins `"@graphql-tools/utils": "12.0.0"`,
and `@apollo/server@4.13.0`'s transitive `@graphql-tools/schema@9.0.19` declares
`"^9.2.1"`. Following the established pattern from Prompts 283 (multer), 285
(js-yaml), 291 (mysql2), and 295 (deepmerge-ts), add a root override in root
`package.json`:

```json
"@graphql-tools/utils": "12.0.3"
```

This updates `node_modules/@graphql-tools/utils` to 12.0.3, removes the nested
pinned `node_modules/@nestjs/graphql/node_modules/@graphql-tools/utils`, deduplicates
both parent callers to the single patched 12.0.3 release, and updates internal
helper `@whatwg-node/promise-helpers` to 2.0.0.

This is inventory remediation. Acres application source does not directly import
`@graphql-tools/utils` or call `mergeDeep`. It is used transitively by NestJS
GraphQL schema synthesis and Apollo Server schema composition. No reachable
application exploit is established in Acres. Do not claim a reachable vulnerability.

`braces` remains at latest 3.0.3 with no published patched release; do not invent or
suppress that status. Full cross-major upgrades (`@apollo/server` v5, `@nestjs/graphql`
v14, `uuid` v11) remain a separate task.

## References read and verified

- `AGENTS.md`: prompt numbering, immediate-execution exception, checks, review, and commit rules.
- `docs/build-plan.md`: Phase 12K scope and committed hardening records through Prompt 297.
- `docs/operations.md`: historical inventory, prompt 297 results, and online audit restriction.
- `docs/skills.md`: scoped skill selection; no dedicated package updater skill exists.
- `docs/backend.md`, `docs/system-architecture.md`, `docs/security.md`,
  `docs/launch-checklist.md`, `docs/ai.md`: current runtimes, boundaries,
  no-AI operation, and limits on launch evidence.
- `package.json`, `package-lock.json`, `server/package.json`.
- Installed `node_modules/@graphql-tools/utils` and `node_modules/@nestjs/graphql`.
- https://github.com/advisories/GHSA-7mx3-vvmw-hjmv
- Public npm metadata for `@graphql-tools/utils@12.0.3`: MIT, Node >=16.0.0,
  tarball `https://registry.npmjs.org/@graphql-tools/utils/-/utils-12.0.3.tgz`, integrity
  `sha512-M+04bHvI1SKoug7W2EkwfKjig2mdtgIIlFY8p2jLHmxPNVs5bC/3R+58JrD+7ZXWgPILWTwuqJ9AqTjPlahroA==`.

No visual, route, component, style, motion, Next API, or database schema change is planned;
visual comps, frontend, and framework UI implementation skills do not apply.

## Files, behavior and non-goals

- Add this prompt: `prompts/298-patch-graphql-tools-utils-security-release.md`.
- `package.json`: add `"@graphql-tools/utils": "12.0.3"` to `overrides`.
- `package-lock.json`: update `node_modules/@graphql-tools/utils` to 12.0.3,
  remove nested `@nestjs/graphql/node_modules/@graphql-tools/utils`, and update
  `@whatwg-node/promise-helpers` to 2.0.0 via targeted npm update. Preserve all
  other lock nodes, workspace manifests, and package script approvals.
- `docs/operations.md`: record Prompt 298 provenance, exact lock closure,
  checks, compatibility fixtures, limits, and rollback.
- `docs/build-plan.md`: append concise verified Prompt 298 Phase 12K record.

Non-goals:

- No cross-major upgrades (Apollo Server 5, NestJS GraphQL 14, uuid 11).
- No invention of unreleased patches for `braces`.
- No application source code or API route modifications.
- No live production drills, deployments, or git pushes.
- Temporary logs and disposable test fixtures live under `/tmp/acres-298` and are not future prerequisites.

## Implementation procedure

1. Re-read this prompt and loaded skills before writing code. Save baseline lock
   and toolchain context in disposable `/tmp/acres-298`.
2. Add `"@graphql-tools/utils": "12.0.3"` to `overrides` in root `package.json`.
3. Generate the targeted lock update using:
   `npm update @graphql-tools/utils --package-lock-only --ignore-scripts --no-audit --no-fund`.
   Assert only `@graphql-tools/utils` and its internal helper change in `package-lock.json`.
4. Verify registry metadata and SHA-512 integrity:
   `sha512-M+04bHvI1SKoug7W2EkwfKjig2mdtgIIlFY8p2jLHmxPNVs5bC/3R+58JrD+7ZXWgPILWTwuqJ9AqTjPlahroA==`.
5. Run `npm ci --no-audit --no-fund`, preserving existing install-script approvals.
   Verify lock hash is unchanged (`package-lock.json: OK`).
   `npm ls @graphql-tools/utils --all` must show clean, valid 12.0.3 resolution deduplicated under all callers.
6. Build bounded, disposable offline semantic fixtures:
   - `mergeDeep` prototype pollution rejection with `__proto__` and `constructor.prototype`
     payloads, verifying clean execution without crash or pollution (CVE-2026-104852 check);
   - Basic object/array deep merging and override behavior;
   - ApolloServer schema generation and query execution with 12.0.3;
   - Contract verification via `npm run contracts:check`;
   - CJS and ESM export validation.
7. Run selected Prettier, root `npm run lint`, `npm run typecheck`, `npm run build`,
   and `git diff --check`. Run all 32 independent offline operations stages derived from
   `ops:check`, omitting only online `ops:audit` under the existing metadata-disclosure restriction.
   Record outputs honestly. No fresh audit-count reduction or full `ops:check` pass may be claimed.
8. Self-review the entire diff, then dispatch an independent read-only reviewer
   subagent using `requesting-code-review` with base HEAD `2d86bb0`, actual unstaged
   diff, this brief, and logs. Evaluate findings using `receiving-code-review`, fix verified
   defects, and recheck.
9. Record results in owning docs (`docs/operations.md` and `docs/build-plan.md`), format
   and inspect final staged diff, and commit only approved files locally on `main` using
   `caveman-commit`. Do not push.

## Loaded skills and alignment

- `security-best-practices`: Prototype pollution mitigation and dependency inventory governance.
- `nestjs-best-practices`: NestJS GraphQL and Apollo Server dependency compatibility.
- `deployment-pipeline-design`: Preserve existing audit/launch gates and rollback.
- `javascript-testing-patterns`: Bounded real-library and caller compatibility fixtures.
- `requesting-code-review`: Dispatch independent reviewer after self-verification.
- `receiving-code-review`: Verify review feedback with technical rigor before implementing.
- `caveman-commit`: Required Conventional Commit for the local implementation.

## Verification and rollback

Execute:

```bash
npm run contracts:check
npm run lint
npm run typecheck
npm run build
npm run ops:check (offline stages)
git diff --check
```

Rollback is a reviewed normal revert restoring root `package.json` overrides and
`package-lock.json`. Phase 12, prompt 201, residual findings (`braces`, `uuid`, `@apollo/server`),
and operator sign-offs remain open.
