# Phase 12K — Patch brace-expansion security releases

## Scope and why this is next

Continue unfinished Phase 12 dependency hardening after committed ip-address
repair `c52c35c`, on clean `main`. Highest existing prompt is 288. Repair the
installed brace-expansion branches within their existing major and parent ranges:
v5 5.0.9 to 5.0.12, plus the v1/v2 security backports where available. Verify
exact backport versions from npm before updating. This single package family
is a bounded unit before larger framework migrations, not an exploitability ranking.
The user explicitly requested implementation immediately after prompt preparation;
that instruction overrides the normal approval pause for this execution only.

Historical production audit records one high brace-expansion finding at the
v5 node. Fresh audit evidence must replace historical totals before claiming
improvement. Online npm audit disclosure is pending explicit authorization after
automatic approval review rejected sending private dependency metadata. Do not
bypass that restriction or claim an offline audit is fresh.

## References read and verified

- `AGENTS.md`, `docs/build-plan.md` Phase 12 and latest repair records.
- `docs/operations.md` audit gate and Prompt 288 record.
- `docs/security.md` scope and dependency boundary; `docs/system-architecture.md`
  binding principles; `docs/backend.md` dependency and workspace contracts.
- `docs/launch-checklist.md` prerequisites: repository checks are not launch approval.
- `docs/skills.md`, root manifest/lockfile and installed brace-expansion package.
- Installed npm update help; actual minimatch dependency ranges: v3 `^1.1.7`,
  v9 `^2.0.2`, v10 `^5.0.8`.
- Public npm metadata for brace-expansion 5.0.12: MIT, Node `20 || >=22`,
  balanced-match `^4.0.2`, registry tarball and SHA-512 integrity.
- https://github.com/advisories/GHSA-6j4f-fj2g-mc7p
- https://github.com/advisories/GHSA-qhr7-859c-m2p7
- https://github.com/advisories/GHSA-q2hr-2g5m-vwhr
- https://raw.githubusercontent.com/juliangruber/brace-expansion/v5.0.12/src/index.ts

These cover comma-parser recursion, nested expansion recursion and quadratic
rewrite behavior. Verify every selected branch clears each affected range.
No dedicated dependency-update skill is available; primary package sources and
security/testing skills cover this repair. No visual changes, measurements,
Next API or Nest source changes are involved.

## Files, behavior and non-goals

1. `package-lock.json`: npm-generated version, tarball and integrity changes
   for brace-expansion only; preserve all manifests, parent versions, other
   package nodes and overrides. Reject incidental lock churn.
2. `docs/operations.md`: append actual provenance, compatibility, audit comparison,
   check outputs, restrictions, review, residual work and rollback.
3. `docs/build-plan.md`: append concise Phase 12K evidence.
4. This prompt is committed with the executed work.

Routes, UI, DTOs and data schemas retain their contracts. No new dependency,
override, suppression, audit policy, CI, provider or deployment change. Package
presence does not prove an exposed customer request path. Do not claim launch,
real database/browser acceptance or Node 24 validation from local Node 26 checks.

## Detailed execution

1. Re-read this prompt and named skills before mutation. Record base SHA,
   branch, toolchain, manifests and baseline lock in disposable `/tmp/acres-289`.
2. Verify public metadata, advisories and installed caller source. Fetch security
   backport metadata for v1/v2; choose same-major patched versions satisfying
   all callers. Stop for revised scope if a major/parent change is necessary.
3. Fetch a fresh complete baseline production audit once disclosure is authorized.
   If authorization remains pending, continue independent local repair/checks;
   retain the unchanged baseline lock for a later isolated baseline audit.
   Keep audit failures distinct from findings; no bypass.
4. Use targeted `npm update brace-expansion --package-lock-only --ignore-scripts
--no-audit --no-fund`. Compare all lock nodes; retain only intended family
   changes. Never hand-invent registry integrity or run audit fix --force.
5. Run `npm ci --no-audit --no-fund`, confirm stable lock hash and caller-relative
   resolution on every minimatch branch. Verify each updated integrity against
   npm metadata and unchanged dependency/engine requirements.
6. Create bounded disposable offline fixtures using actual installed library APIs:
   ordinary literals, sets, nested alternatives, ascending/descending/stepped
   and padded ranges, escapes and malformed groups; include minimatch positive
   and negative matching and brace expansion on every actual parent. Verify
   v5 CommonJS and ESM entrypoints. Exercise each advisory pattern with bounded
   synthetic inputs in subprocesses with timeouts, checking completion and sane
   output/limits from actual source. Do not run unbounded payloads or add permanent
   tests that mirror upstream code. Record any intentional truncation semantics.
7. Run audit-wrapper tests, existing full operations aggregate, lint, typecheck,
   build, selected formatting and diff checks. Run typecheck/build sequentially.
   Obtain fresh post-change audit and compare all finding objects, removals,
   additions and metadata drift. Critical-only gate remains unchanged.
8. Dispatch mandatory independent read-only reviewer after self-verification:
   provide base/head (same HEAD plus working diff), prompt, exact lock inventory,
   registry integrity, fixture, logs and audit comparison. Reviewer must not
   mutate the checkout or dispatch agents. Verify feedback before fixes; rerun
   affected checks and re-review significant changes.
9. Record results in owning docs, format only new sections, inspect final/staged
   diff and commit locally to main using caveman-commit. No push.

## SKILLS USED

- `security-best-practices`: Dependency hygiene and evidence-based risk claims.
- `sast-configuration`: Preserve scanner policy and distinguish scan evidence.
- `deployment-pipeline-design`: Preserve release gates and reviewed rollback.
- `javascript-testing-patterns`: Real-library and parent compatibility fixtures.
- `requesting-code-review`: Independent implementation review after checks.
- `receiving-code-review`: Verify feedback against repository evidence.
- `caveman-commit`: Required local Conventional Commit with security rationale.

All were loaded in planning and must be re-read before execution. UI, Nest source,
SQL, telemetry, credentials and architecture changes are outside this unit;
other Phase 12 surface skills are not triggered.

## Verification and rollback

Run from the repository root; retain real output and exits:

```bash
npm ls brace-expansion --all
npm explain brace-expansion
npm run ops:audit-test
npm audit --omit=dev --json
npm run ops:audit
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Also verify all-node lock comparison, registry integrity, clean-install hash,
semantic fixtures and installed Prettier on prompt/lock/new doc sections. Report
blocked/unreached checks honestly. Rollback is a normal reviewed revert of the
lock repair with exposure reassessed. Other findings, prompt 201, operator
sign-offs and Phase 12 exit remain open.
