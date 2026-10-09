# Phase 12K — Patch the ip-address security release

## Scope and why this is next

Continue Phase 12 dependency hardening after committed fast-uri repair
`6511ba0`. Planning found clean `main` and highest existing prompt 287.
The next dependency-safe unit is **ip-address 10.5.0 → 10.7.3**, preserving
the existing `^10.2.0` express-rate-limit 8.6.2 and `^10.1.1` socks 2.8.9
parent ranges. This is a bounded same-major repair, selected before larger
parent migrations; it is not a comparative exploitability ranking.

A fresh complete production audit reports 28 findings (20 high, 8 moderate,
zero critical). The ip-address node has four advisories: link-local /10
classification, local-use NAT64 classification, cross-family subnet comparison,
and unbounded IPv6 parse diagnostics. Verify all against the release and fresh
post-change audit. Parent presence alone does not prove customer SSRF exposure.

The user explicitly said to implement after writing the prompt, authorizing
execution without the ordinary approval pause. Automatic approval review first
rejected npm audit metadata disclosure; the user subsequently explicitly
authorized sending dependency names and versions to registry.npmjs.org. That
authorization covers the baseline, post-change audit, and existing audit gate.
Record the restriction and its resolution honestly.

## References and prerequisites

- `AGENTS.md`: workflow, phase resolution, prompt, verification and local commit.
- `docs/build-plan.md` Phase 12 and records 281–287: unfinished launch hardening.
- `docs/operations.md` topology, audit policy and latest dependency evidence.
- `docs/backend.md` resolved dependency context; no backend source change.
- `docs/security.md` scope and `docs/system-architecture.md` binding principles.
- `docs/launch-checklist.md` preflight: local checks do not approve production.
- `docs/skills.md`, root/client/server manifests and root lockfile.
- Installed socks IPv4/integer/IPv6 byte conversion helpers and
  express-rate-limit `ipKeyGenerator` implementation, using Address6 subnet APIs.
- Public npm `ip-address@10.7.3` metadata: MIT, Node >=12, no runtime
  dependencies, published SHA-512 integrity and tarball URL.
- https://github.com/beaugunderson/ip-address/releases
- https://raw.githubusercontent.com/beaugunderson/ip-address/v10.7.3/src/ipv6.ts
- https://raw.githubusercontent.com/beaugunderson/ip-address/v10.7.3/src/ipv4.ts
- https://raw.githubusercontent.com/beaugunderson/ip-address/v10.7.3/src/common.ts
- https://github.com/advisories/GHSA-rpw4-54j3-4h4q
- https://github.com/advisories/GHSA-2vr4-cq9g-pvrc
- https://github.com/advisories/GHSA-j6r3-76f7-8jcv
- https://github.com/advisories/GHSA-h3mg-xc3c-68pw

No visual surface or geometry changes; comp measurements do not apply. No
dedicated dependency-update skill is installed; use primary sources and the
security/testing/gate skills. No framework API is authored in this lock repair.

## Files and resulting behavior

1. `package-lock.json`: npm-generated ip-address node version, URL and integrity
   only. Preserve all manifests, parents, overrides and other package nodes.
2. `docs/operations.md`: append Prompt 288 results, actual outputs and limits.
3. `docs/build-plan.md`: append concise Phase 12K implemented evidence.
4. This new prompt accompanies the implementation commit.

Routes, DTOs, auth and UI retain their contracts. Internal IP semantics follow
the upstream fixes; verify benign parent behavior. No schema, provider,
architecture, CI, audit policy, suppression, production or deployment change.

## Detailed execution

1. Re-read this prompt and all skills before mutation. Record base SHA, clean
   main, Node/npm versions and baseline lock inventory in disposable `/tmp`.
   Preserve unrelated work. Use fresh audits, not historical temporary files.
2. Verify public registry metadata and tagged source; inspect all four advisory
   ranges and patched classifier/subnet/parse APIs. Stop for revised scope if
   the selected version is affected or unavailable. Never silently choose a major.
3. Inventory all callers via npm ls/explain and caller-relative `createRequire`.
   Check both actual parent ranges. Verify targeted npm update flags locally.
4. Run targeted lock-only npm update with scripts/audit/fund disabled. Reject
   incidental node churn; never fabricate integrity or use audit fix --force.
5. Run reproducible npm ci with audit/fund disabled. Verify the lock hash,
   unchanged manifests/parents and registry integrity. No secret/customer data
   or application source goes to external services.
6. Build disposable offline semantic fixtures against real APIs:
   - benign IPv4 and IPv6 parsing, canonical forms, subnet positive/negative,
     byte-array round trips and mapped IPv4 behavior;
   - link-local boundaries across fe80::/10 and adjacent non-link-local cases;
   - local-use NAT64 prefix and adjacent standard/global NAT64 behavior;
   - both subnet APIs reject cross-family membership in both directions while
     preserving same-family matches;
   - bounded invalid/overlength IPv6 input rejects with short diagnostics;
   - reverse-DNS parsing preserves valid forms and rejects overlength input;
   - actual express-rate-limit key generation preserves IPv4/mapped IPv4,
     IPv6 subnet aggregation and disabled aggregation;
   - actual socks helpers preserve integer/byte conversions and IPv6 decode.
     Resolve the repaired module relative to both parents. Keep synthetic
     fixtures bounded with child timeouts, never open proxy/network connections.
     Inspect source before asserting exact output. Do not add permanent tests
     that simply mirror third-party implementation.
7. Run audit-wrapper tests, operations aggregate, root lint/typecheck/build,
   formatting and diff checks. Typecheck and build run sequentially. Report
   failures/retries/unreached stages honestly. No real DB/browser/production
   drill is required or claimed for this lock-only transitive repair.
8. Fetch complete post-change production audit. Compare every finding object,
   advisory range and path, identifying metadata drift independently. Expect
   ip-address to clear but derive actual totals, additions and residual list.
9. After self-verification, dispatch the mandatory read-only reviewer subagent
   under AGENTS.md §2.1 with base/head (same HEAD plus uncommitted diff), this
   prompt, registry metadata, lock comparison, fixture and logs. Verify feedback
   before fixing; rerun affected checks and re-review significant changes.
10. Record actual results and limits in owning docs; format new material without
    rewriting historical records. Inspect final/staged diff, commit to main
    with caveman-commit, and report inspection commands. Do not push.

## SKILLS USED

- `security-best-practices`: Dependency hygiene and evidence-based exposure claims.
- `deployment-pipeline-design`: Preserve existing audit/launch gates and rollback.
- `javascript-testing-patterns`: Bounded real-library and parent compatibility checks.
- `requesting-code-review`: Dispatch independent reviewer after self-verification.
- `receiving-code-review`: Verify review feedback before implementing fixes.
- `caveman-commit`: Required Conventional Commit for the local implementation.

All six skills were loaded during planning; apply their guidance during
execution. No UI, Nest source, SQL, CI, credential, telemetry or trust boundary
changes are planned, so those conditional surface skills are not triggered.

## Verification and rollback

Run from repository root and retain real outputs/exits:

```bash
npm ls ip-address --all
npm explain ip-address
npm run ops:audit-test
npm audit --omit=dev --audit-level=critical
npm run ops:audit
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Also run the disposable semantic fixture, complete before/after audit comparison,
and installed Prettier on changed files/new doc sections. Scope rollback to a
normal reviewed revert of the lock repair with exposure reassessment. Phase 12,
prompt 201, other dependency findings and operator sign-offs remain open.
