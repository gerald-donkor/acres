# Phase 12K — Patch hono security release

## Scope and why this is next

Continue Phase 12K's committed dependency hardening series from clean main at
`fee5919`. In the recorded production dependency inventory, transitive
`hono@4.13.3` remains affected by two known advisories:

1. [GHSA-5629-43c9-83vf](https://github.com/honojs/hono/security/advisories/GHSA-5629-43c9-83vf) / CVE-2026-93981:
   Cross-Site Scripting (XSS) in `hono/jsx` renderer when plain strings are unescaped
   in specific positions such as `Suspense`, `ErrorBoundary`, `Context.Provider`, or
   root `renderToString` / `renderToReadableStream`. Fixed in 4.13.7+.
2. [GHSA-p297-f5wh-h97w](https://github.com/honojs/hono/security/advisories/GHSA-p297-f5wh-h97w) / CVE-2026-84365:
   Path Traversal in `toSSG()`. Fixed in 4.13.5+.

Select verified stable **4.13.13**, satisfying both `@modelcontextprotocol/sdk@1.32.1`'s
declared `hono: ^4.11.4` and `@hono/node-server@2.1.1`'s peer `hono: ^4` without
requiring overrides or workspace manifest changes.

This is inventory remediation. Acres application source does not directly import
`hono`, `hono/jsx`, or `toSSG`. Hono is an upstream transitive dependency of
`@modelcontextprotocol/sdk` (imported in `@acres/client` by `shadcn` for MCP
server/stdio and optionally `@google/genai`). No reachable application exploit
exists in Acres. Do not claim a reachable vulnerability.

Braces remains at latest 3.0.3 with no published patched release; do not invent or
suppress that status. GraphQL's cross-major repairs (`@apollo/server`, `@nestjs/apollo`,
`@nestjs/graphql`, `uuid`) remain a separate task.

## References read and verified

- `AGENTS.md`: prompt numbering, immediate-execution exception, checks, review, and commit rules.
- `docs/build-plan.md`: Phase 12K scope and committed hardening records through Prompt 296.
- `docs/operations.md`: historical inventory, prompt 296 results, and online audit restriction.
- `docs/skills.md`: scoped skill selection; no dedicated package updater skill exists.
- `docs/backend.md`, `docs/system-architecture.md`, `docs/security.md`,
  `docs/launch-checklist.md`, `docs/ai.md`: current runtimes, boundaries,
  no-AI operation, and limits on launch evidence.
- `package.json`, `package-lock.json`, `client/package.json`, `server/package.json`.
- Installed `node_modules/hono`, `@modelcontextprotocol/sdk`, `@hono/node-server`.
- https://github.com/honojs/hono/security/advisories/GHSA-5629-43c9-83vf
- https://github.com/honojs/hono/security/advisories/GHSA-p297-f5wh-h97w
- Public npm metadata for `hono@4.13.13`: MIT, Node >=16.9.0, zero runtime dependencies,
  tarball `https://registry.npmjs.org/hono/-/hono-4.13.13.tgz`, integrity
  `sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==`.

No visual, route, component, style, motion, Next API, or schema change is planned;
visual comps, frontend, and framework implementation skills do not apply.

## Files, behavior and non-goals

- Add this prompt: `prompts/297-patch-hono-security-release.md`.
- `package-lock.json`: update single node `node_modules/hono` from 4.13.3 to 4.13.13
  via targeted npm lock generation. Preserve all other lock nodes, workspace manifests,
  overrides, and package script approvals.
- `docs/operations.md`: record Prompt 297 provenance, exact one-node lock closure,
  checks, compatibility fixtures, limits, and rollback.
- `docs/build-plan.md`: append concise verified Prompt 297 Phase 12K record.

Non-goals:

- No workspace manifest changes or new overrides.
- No cross-major upgrades (GraphQL, Apollo, UUID).
- No invention of unreleased patches for `braces`.
- No application source code or API route modifications.
- No live production drills, deployments, or git pushes.
- Temporary logs and disposable test fixtures live under `/tmp/acres-297` and are not future prerequisites.

## Implementation procedure

1. Re-read this prompt and loaded skills before writing code. Save baseline lock
   and toolchain context in disposable `/tmp/acres-297`.
2. Generate the targeted lock update using:
   `npm update hono --workspace=@acres/client --package-lock-only --ignore-scripts --no-audit --no-fund`.
   Reject any unrelated lock churn; assert only `node_modules/hono` changes.
3. Compare the complete lockfile against baseline. Verify version 4.13.13, resolved
   tarball URL, and SHA-512 integrity:
   `sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==`.
4. Run `npm ci --no-audit --no-fund`, preserving existing third-party install-script
   approvals. Verify lock hash is unchanged (`package-lock.json: OK`).
   `npm ls hono --all` must show clean, valid 4.13.13 resolution under both parents.
5. Build bounded, disposable offline semantic fixtures:
   - Basic Hono app routing, status, JSON response, query/param handling;
   - HTML escaping in `hono/html`;
   - JSX rendering in `hono/jsx` with Suspense, ErrorBoundary, Context.Provider,
     verifying plain strings are properly HTML-escaped (CVE-2026-93981 regression check);
   - MCP SDK integration compatibility (in-memory client/server handshake and tool execution);
   - CJS and ESM export validation.
6. Run selected Prettier, root `npm run lint`, `npm run typecheck`, `npm run build`,
   and `git diff --check`. Run all 32 independent offline operations stages derived from
   `ops:check`, omitting only online `ops:audit` under the existing metadata-disclosure restriction.
   Record outputs and any sandbox failures/permitted reruns honestly. No fresh audit-count
   reduction or full `ops:check` pass may be claimed.
7. Self-review the entire diff, then dispatch an independent read-only reviewer
   subagent using `requesting-code-review` with base HEAD `fee5919`, actual unstaged
   diff, this brief, and logs. Evaluate findings using `receiving-code-review`, fix verified
   defects, and recheck.
8. Record results in owning docs (`docs/operations.md` and `docs/build-plan.md`), format
   and inspect final staged diff, and commit only approved files locally on `main` using
   `caveman-commit`. Do not push.

## Acceptance, inspection and rollback

Require one-node lock scope, verified registry integrity, reproducible install,
valid caller resolutions, bounded real-library semantic fixtures, repository and
offline operations checks, independent review, and clean local commit.

Inspect from repository root:

```bash
npm ls hono --all
```

Host checks do not establish Node 24, Docker, database E2E, browser, or production
acceptance. Prompt 201, other advisories, operator sign-offs, and Phase 12 exit
remain open. Rollback is a reviewed normal revert of the lock repair, restoring
affected inventory; reassess exposure before deployment.

## SKILLS USED

- `security-best-practices`: scoped dependency remediation and vulnerability analysis.
- `javascript-testing-patterns`: real-library semantic, JSX escaping, and compatibility fixtures.
- `deployment-pipeline-design`: preserve release gates and rollback semantics.
- `sast-configuration`: keep scanner policy and distinguish offline operations checks from unperformed online audit.
- `requesting-code-review`: independent read-only implementation review after self-verification.
- `receiving-code-review`: verify reviewer claims against actual codebase and scope.
- `caveman-commit`: concise conventional commit with security rationale.
