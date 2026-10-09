# Phase 12K — Patch the undici security release

## Scope and why this is next

Continue Phase 12 launch hardening and dependency hygiene after committed
brace-expansion repair `e100dad` on clean `main`. Planning found highest existing
prompt 289. The next dependency-safe unit is **undici 7.29.0 → 7.29.1**,
preserving existing parent ranges:

- `client/node_modules/shadcn@4.18.0` declares `"undici": "^7.27.2"`
- `client/node_modules/shadcn/node_modules/@dotenvx/dotenvx@1.75.1` declares `"undici": "^7.11.0"`

Both parents admit `7.29.1` directly under their semver ranges. This is a bounded
same-major patch unit within Phase 12K operations and launch hardening before
larger parent migrations; it is not a comparative exploitability ranking.

Historical production audit records undici in the residual high inventory.
Public maintainer security releases and GitHub Advisory Database document
ten advisories resolved by `7.29.1`:

- GHSA-pmjh-fq2x-6v4x (CVE-2026-18149): DoS via orphaned RetryHandler response body (`>= 7.11.0, < 7.29.1`)
- GHSA-r53p-7pc4-xj5r: downstream response splitting via retry interceptor (`>= 7.0.0, < 7.29.1`)
- GHSA-rfgv-xxqx-mfg5: DoS via unrequested WebSocket subprotocol (`>= 7.0.0, < 7.29.1`)
- GHSA-3xpg-4rpp-hhhm: DoS via unbounded decompression of compressed responses (`>= 7.15.0, < 7.29.1`)
- GHSA-2jfj-6hjv-fm6j: cross-user cookie disclosure via Set-Cookie caching in shared caches (`>= 7.0.0, < 7.29.1`)
- GHSA-2gqq-gqf2-x968: response truncation via oversized chunked responses in dump interceptor (`>= 7.1.0, < 7.29.1`)
- GHSA-w293-vg96-wgc3: TLS certificate validation bypass via dropped connect options in BalancedPool (`>= 7.24.1, < 7.29.1`)
- GHSA-8436-99hf-9mmv: caching and replay of unsafe HTTP method responses (`>= 7.0.0, < 7.29.1`)
- GHSA-rx4f-c7p8-82vq: DoS via WebSocketStream unclean close (`>= 7.0.0, < 7.29.1`)
- GHSA-3wwx-pv8p-q78v: DoS via unhandled error in WebSocket permessage-deflate decompression (`>= 7.28.0, < 7.29.1`)

Parent presence alone does not establish customer exploitability on Acres routes.
Online npm audit disclosure status must be handled per user authorization rules;
do not claim an offline audit is a fresh registry audit or bypass restrictions.

## References read and verified

- `AGENTS.md`: workflow, phase-control protocol, prompt contract, verification and local commit.
- `docs/build-plan.md` Phase 12 and Prompt 281–289 records: ongoing Phase 12K dependency hardening.
- `docs/operations.md`: topology, audit policy, Prompt 289 record and residual advisory inventory.
- `docs/security.md`: scope, dependency boundary, threat register and supply-chain controls.
- `docs/system-architecture.md`: modular monolith principles and dependency contracts.
- `docs/backend.md`: runtime contracts, workspace separation and resolved package notes.
- `docs/launch-checklist.md`: preflight prerequisites: local checks are not production launch approval.
- `docs/skills.md`: locked project skills, tooling inventory and execution conventions.
- Root and workspace manifests (`package.json`, `client/package.json`, `server/package.json`, `packages/shared/package.json`).
- Root `package-lock.json` single `node_modules/undici` node (7.29.0).
- Installed parent definitions:
  - `node_modules/shadcn/package.json`: `"undici": "^7.27.2"`
  - `node_modules/@dotenvx/dotenvx/package.json`: `"undici": "^7.11.0"`
- Public npm `undici@7.29.1` registry metadata: MIT, Node `>=20.18.1`, zero runtime dependencies (`dependencies: {}`), tarball URL `https://registry.npmjs.org/undici/-/undici-7.29.1.tgz`, published SHA-512 integrity `sha512-RYONW2MeafgYlkVOKYKkA/Ag7BmXqgIWCa8t1m0JcxrQg9pI9lEqRhAOruOBCbAohOa/gkCF+iPi9hrgvTzu6Q==`.
- Upstream release and advisory references:
  - https://github.com/nodejs/undici/releases/tag/v7.29.1
  - https://github.com/advisories/GHSA-pmjh-fq2x-6v4x
  - https://github.com/advisories/GHSA-r53p-7pc4-xj5r
  - https://github.com/advisories/GHSA-rfgv-xxqx-mfg5
  - https://github.com/advisories/GHSA-3xpg-4rpp-hhhm
  - https://github.com/advisories/GHSA-2jfj-6hjv-fm6j
  - https://github.com/advisories/GHSA-2gqq-gqf2-x968
  - https://github.com/advisories/GHSA-w293-vg96-wgc3
  - https://github.com/advisories/GHSA-8436-99hf-9mmv
  - https://github.com/advisories/GHSA-rx4f-c7p8-82vq
  - https://github.com/advisories/GHSA-3wwx-pv8p-q78v

No visual surface, comp geometry, Next API route or Nest server source changes
are involved. No dedicated dependency-update skill is available; primary package
sources, testing and security skills cover this bounded lock repair.

## Files, resulting behavior and non-goals

1. `package-lock.json`: targeted npm-generated update of `node_modules/undici`
   version (7.29.0 → 7.29.1), tarball URL, and integrity only. Preserve all
   manifests, parents, overrides and other package nodes. Reject incidental lock churn.
2. `docs/operations.md`: append Prompt 290 record with exact provenance, compatibility,
   audit comparison, actual check outputs, review, residual work and rollback.
3. `docs/build-plan.md`: append concise Phase 12K implemented evidence.
4. This prompt: committed with the executed work.

Routes, UI, DTOs and data schemas retain their contracts. No new dependency,
override, suppression, audit policy, CI, provider or deployment change. Package
presence does not prove an exposed customer request path. Do not claim launch,
real database/browser acceptance or Node 24 validation from local Node 26 checks.

## Detailed execution

1. **Environment and baseline capture**:
   - Re-read this prompt and named skills before mutation.
   - Record base SHA, branch `main`, toolchain (Node v26.11.0, npm 11.20.0),
     manifests and baseline lock state in disposable `/tmp/acres-290`.
   - Preserve clean worktree state.
2. **Metadata and advisory verification**:
   - Verify public npm metadata, release notes and advisory ranges for `undici@7.29.1`.
   - Confirm selected version clears all ten listed advisory ranges.
   - Verify parent ranges in `shadcn` and `@dotenvx/dotenvx` admit `7.29.1` without
     overrides or manifest edits.
3. **Audit baseline and permissions posture**:
   - If online npm audit disclosure is explicitly authorized, fetch a fresh
     production audit baseline (`npm audit --omit=dev --json`).
   - If online audit disclosure remains pending or restricted, perform independent
     offline checks, retain the unchanged baseline lock for later comparison, and
     do not bypass restrictions or misrepresent offline checks.
4. **Targeted lockfile update**:
   - Run `npm update undici --package-lock-only --ignore-scripts --no-audit --no-fund`.
   - Inspect `git diff package-lock.json` to confirm only the `node_modules/undici`
     node was updated.
   - Never hand-invent registry integrity or run `npm audit fix --force`.
5. **Clean installation and lock stability**:
   - Run `npm ci --no-audit --no-fund`.
   - Verify reproducible lock hash (`git diff package-lock.json` clean).
   - Verify caller-relative resolution on both parent branches via `npm ls undici --all`.
   - Confirm published SHA-512 integrity matches npm registry metadata.
6. **Bounded offline semantic compatibility fixtures**:
   - Construct disposable offline semantic fixtures in `/tmp/acres-290` using actual
     installed library APIs without live network calls:
     - Caller-relative `createRequire` resolution from `shadcn` and `@dotenvx/dotenvx`;
     - `Client`, `Pool`, `Agent`, `Dispatcher` instantiation and option validation;
     - `RetryHandler` instantiation, default retry counters and error handling;
     - Header parsing, content-type normalization, and response body stream handling;
     - CommonJS and ESM entrypoint loading;
     - Bounded synthetic tests for error handling and decompression guards in
       subprocesses with timeouts.
7. **Repository checks and test suites**:
   - Run `npm run ops:audit-test` (audit script wrapper test suite).
   - Run independent offline operations stages or full `ops:check` (reporting actual
     run modes honestly).
   - Run `npm run lint` across all workspaces.
   - Run `npm run typecheck` sequentially.
   - Run `npm run build` sequentially (shared, client, server).
   - Run selected Prettier formatting on prompt, lockfile and new doc sections.
   - Run `git diff --check`.
8. **Independent code review loop**:
   - Dispatch mandatory independent read-only reviewer subagent (`requesting-code-review`)
     with structured context: base/head commits, prompt, exact lock diff, registry
     integrity, fixture logs and audit comparison.
   - Reviewer must not mutate checkout or dispatch further agents.
   - Evaluate findings using `receiving-code-review`. Verify claims against codebase
     reality before implementing fixes.
   - Re-run affected checks and request follow-up review for significant changes.
9. **Documentation and local commit**:
   - Record results in `docs/operations.md` and `docs/build-plan.md`.
   - Inspect final git diff and staged changes.
   - Commit locally to `main` using `caveman-commit`. No push.

## Verification commands and checks

```bash
npm ls undici --all
npm explain undici
npm run ops:audit-test
npm run lint
npm run typecheck
npm run build
git diff --check
```

## SKILLS USED

- `security-best-practices`: Dependency hygiene, advisory boundary analysis and evidence-based risk claims.
- `sast-configuration`: Preserve scanner policy and distinguish scan evidence from vulnerability remediation.
- `deployment-pipeline-design`: Preserve release gates, fail-closed policy and reviewed rollback.
- `javascript-testing-patterns`: Real-library offline semantic fixtures and parent caller compatibility.
- `requesting-code-review`: Dispatch independent read-only review subagent with structured context.
- `receiving-code-review`: Evaluate reviewer feedback with technical rigor before any code changes.
- `caveman-commit`: Ultra-compressed conventional commit message for the local commit.
