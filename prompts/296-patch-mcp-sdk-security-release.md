# Phase 12K — Patch the MCP SDK security release

## Scope and why this is next

Continue Phase 12K's committed dependency repair series from clean main at
`e0fd081`. The shared transitive @modelcontextprotocol/sdk 1.30.0 is affected
by GHSA-6qxp-vccf-f47h / CVE-2026-104850. Select verified stable **1.32.1**,
within shadcn 4.18.0's ^1.26.0 and @google/genai 2.19.0's ^1.25.2 ranges.
The maintainer identifies 1.31.0 as the first fixed 1.x release. Registry
metadata confirms 1.32.1 retains MIT, Node >=18, dependencies, peers and exports.
Braces remains at latest 3.0.3 with no published patch; do not invent or suppress
that fix. GraphQL's cross-major repairs remain a separate task.

This is inventory remediation. The advisory concerns HTTP OAuth clients sending
credentials to a server-selected authorization server. Acres has no direct SDK
imports or MCP OAuth providers in application source; its Gemini adapter uses
models.generateContent. Shadcn imports MCP server/stdio APIs. Do not claim a
reachable application exploit. Upgrading alone does not protect credentials
persisted without issuer or bundled providers without expectedIssuer; record
these upstream caveats without introducing unused OAuth configuration.

## References read and verified

- AGENTS.md: prompt numbering, immediate execution exception, checks/review/commit.
- docs/build-plan.md: Phase 12 scope and implemented hardening records.
- docs/operations.md: historical inventory, prompt 295 and online audit restriction.
- docs/skills.md: scoped skill selection; no dedicated dependency updater exists.
- docs/backend.md, docs/system-architecture.md, docs/security.md,
  docs/launch-checklist.md and docs/ai.md: current runtimes, boundaries,
  no-AI operation and limits on launch evidence.
- package.json, package-lock.json, client/package.json, installed SDK,
  shadcn and @google/genai manifests; shadcn MCP imports; Gemini adapter source.
- https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6qxp-vccf-f47h
- Public npm metadata for SDK 1.31.0 and 1.32.1, fetched this session.
  The v1.32.1 GitHub release URL returned 404; registry metadata is version
  authority and installed source must establish actual patch behavior.

No visual, route, component, style, motion, Next API or schema change is planned;
visual comps, frontend and framework implementation skills do not apply.

## Files, behavior and non-goals

- Add this prompt.
- package-lock.json: update only node_modules/@modelcontextprotocol/sdk from
  1.30.0 to 1.32.1 using npm generation. Preserve other nodes and all manifests.
- docs/operations.md: provenance, exact closure, checks, compatibility and limits.
- docs/build-plan.md: concise verified prompt 296 record.

No manifest/override, parent major upgrade, application source, auth policy,
AI enablement, stored credential migration, scanner threshold, CI, schema,
production operation, audit upload, deployment or push changes. All routes retain
existing behavior. Temporary fixtures/logs live under /tmp/acres-296 and are
not future prerequisites.

## Implementation procedure

1. Re-read this file and named skills before code. The user's explicit instruction
   to implement after writing supplies approval. Save baseline lock and SDK auth
   source before installation; inspect credential/provider interfaces and patch.
2. Generate the targeted lock with `npm update @modelcontextprotocol/sdk
--package-lock-only --ignore-scripts --no-audit --no-fund`. Reject unrelated
   lock churn or a different target; do not hand-invent lock metadata.
3. Compare the complete lock JSON against baseline. Verify the one changed node
   against registry tarball/integrity, dependency/peer/engine/export metadata.
   Expected integrity:
   `sha512-2DdE+SJDtzLEEWzY1ZjY7Q+VcPhcV1KisD3zI4u0XZyktsjHum1mwbMI+JaulUBi2OZk+KJAi2uPXzxichPkdw==`.
4. Run `npm ci --no-audit --no-fund`, retaining third-party script policy, and
   verify lock hash is unchanged. `npm ls @modelcontextprotocol/sdk --all`
   must show valid deduplicated 1.32.1 beneath both unchanged parents.
5. Read installed auth implementation/types. Build bounded disposable real-SDK
   fixtures with fake public URLs, fake credentials and injected fetch only:
   verify matching issuer refresh succeeds, mismatched issuer credentials cannot
   reach another token endpoint, issued tokens preserve issuer, and pre-registered
   client information or configured providers enforce their documented issuer
   rules. Make no external OAuth requests or use real credentials. Test ordinary
   MCP client/server initialization, tools schema and in-memory transport if the
   installed API supports them; verify CJS/ESM surfaces and actual Google SDK
   construction/import without API calls. Do not assert safety for legacy
   issuer-less credentials; explicitly report the advisory's migration caveat.
6. Run selected Prettier, root lint, typecheck, build, git diff --check; run
   independent offline stages derived from current ops:check in their order,
   omitting only online ops:audit under the existing metadata disclosure
   restriction. Record outputs and any sandbox failures/permitted reruns honestly.
   No fresh audit-count reduction or full ops:check pass may be claimed.
7. Self-review the entire diff, then dispatch the mandatory independent read-only
   reviewer with base/current HEAD e0fd081, actual unstaged diff, this brief and
   logs. Evaluate findings using receiving-code-review, fix verified defects and
   recheck; seek follow-up review for significant changes.
8. Record results in owning docs, format and inspect final/staged diff; commit
   only task files locally on main using caveman-commit. Do not push.

## Acceptance, inspection and rollback

Require one-node lock scope, verified registry integrity, reproducible install,
valid callers, bounded OAuth issuer regression evidence, ordinary SDK caller
compatibility, repository/offline checks, independent review and local commit.

Inspect from repository root: `npm ls @modelcontextprotocol/sdk --all`.
Host checks do not establish Node 24, Docker, database E2E, browser or production
acceptance. Prompt 201, other advisories, operator sign-offs and Phase 12 exit
remain open. Rollback is a reviewed normal revert of the lock repair, restoring
affected inventory; reassess exposure before deployment.

## SKILLS USED

- `security-best-practices`: scoped dependency remediation and credential evidence.
- `javascript-testing-patterns`: real-library OAuth and compatibility fixtures.
- `deployment-pipeline-design`: preserve release gates and rollback semantics.
- `sast-configuration`: distinguish offline checks from unperformed online audit.
- `requesting-code-review`: independent read-only review after self-verification.
- `receiving-code-review`: verify feedback against installed behavior and scope.
- `caveman-commit`: concise conventional security commit with rationale.
