# Phase 12K — Patch the fast-uri security release

## Scope and why this is next

Continue the unfinished Phase 12 operations and launch-hardening work after
committed source-map-js repair `276ab82fc5dc246cce2a48a1e421bde2c5f4be1f`.
Planning found clean `main`, highest prompt number 286, and no pending prompt.
Implement one bounded dependency family: **fast-uri 3.1.5 → 3.1.8**. All ten
lockfile AJV parents declare `^3.0.1`; the single root fast-uri node can move
within those ranges without a manifest edit or override. This is a dependency-safe
patch before larger remaining GraphQL/tooling migrations, an engineering choice
rather than a comparative exploitability claim.

The committed operations record reports 29 production findings, 21 high and
eight moderate, zero critical. Planning inspected the retained disposable audit
at `/tmp/acres-286/current-audit.json`, which lists six fast-uri advisories.
That temporary file is prior evidence only and never an execution prerequisite;
execution must acquire a fresh baseline and compare complete findings.

The user explicitly directed: “after you are done writing the prompt, just
implement”. This authorizes immediate execution after writing and re-reading
this file, replacing the ordinary pause for the AGENTS.md approval question.

## References read and execution prerequisites

- `AGENTS.md`: phase-control, prompt, verification, review and commit contracts.
- `docs/build-plan.md` §§13–14 and records 281–286: Phase 12 and residual work.
- `docs/operations.md` records 281–286: residual inventory, audit policy and limits.
- `docs/backend.md` resolved dependency context; no server contract change.
- `docs/system-architecture.md` binding architecture principles and
  `docs/security.md` scope: no new boundary, runtime or persistence change.
- `docs/launch-checklist.md` preflight: repository checks do not approve launch.
- `docs/skills.md`: installed skill selection and scope.
- Root, client and server manifests, root lockfile, installed fast-uri manifest,
  and AJV `dist/runtime/uri.js` under MCP SDK and conf, both importing fast-uri.
- `scripts/ops/audit-dependencies.sh` and root operations/check scripts.

Verified primary sources; recheck advisory ranges and registry metadata:

- https://github.com/fastify/fast-uri/releases/tag/v3.1.8
- https://raw.githubusercontent.com/fastify/fast-uri/v3.1.8/package.json
- https://raw.githubusercontent.com/fastify/fast-uri/v3.1.8/README.md
- https://github.com/fastify/fast-uri/security/advisories/GHSA-hrr3-gc8f-f4qj
- https://github.com/fastify/fast-uri/security/advisories/GHSA-qw65-cvwx-89v3

Read the other four advisory URLs from the fresh baseline: GHSA-5jgf-p345-68v8,
GHSA-f65p-4m7j-42xc, GHSA-fph4-wmhf-6fwf and GHSA-jqff-g426-hqxp. Inspect
the tagged upstream regression tests and patched source before defining exact
assertions. The latest inspected advisory repairs percent-encoded uppercase host
normalization in 3.1.8; authority serialization repair requires at least 3.1.7,
and the other four baseline advisories require at least 3.1.6.

No dedicated dependency remediation skill is installed. Primary maintainer/npm
sources and the security, testing and gate skills below cover this repair.
No visual reference, measurement or breakpoint change applies. If code changes
become necessary, read the relevant installed framework guide before editing
and obtain revised scope for changes beyond this dependency family.

## Intended files and impact

1. `package-lock.json`: only npm-generated fast-uri 3.1.8 node metadata,
   distribution URL and integrity; no parent upgrades or manifest changes.
2. `docs/operations.md`: append Prompt 287 record with integrity, caller
   resolutions, meaningful smoke checks, complete audit comparison, actual
   verification output, rollback and limits.
3. `docs/build-plan.md`: append concise implemented Phase 12K record.
4. This prompt accompanies the local implementation commit.

Every route and UI retains its contract. URI handling follows the upstream
security repairs while benign URI and JSON Schema reference handling remains
compatible. Package presence alone does not prove customer SSRF or an exposed
host allowlist bypass. Preserve unrelated dependency versions and all existing
overrides. No new runtime, provider, route, schema, CI policy or token is added.

## Detailed execution

1. Re-read this file, relevant guidance and every listed skill before mutation.
   Record branch, base SHA, worktree, Node/npm versions. Preserve unrelated work.
2. Save baseline lockfile/hash, manifests and full package-node inventory to a
   restricted disposable `/tmp` directory. Run `npm ls fast-uri --all` and
   `npm explain fast-uri`; inventory every AJV caller, including dev callers.
   Use caller-relative Node `createRequire` to verify actual resolved versions.
3. Obtain fresh complete production audit JSON. npm audit transmits dependency
   names/versions to registry.npmjs.org; this task's implementation authorization
   covers that normal audit and targeted registry metadata/package downloads,
   update, clean install and audit calls inside `ops:check`. Never transmit
   credentials, customer records or source. Treat network or malformed JSON
   failure as missing evidence, never a pass; obey automatic approval review.
4. Verify 3.1.8 registry publication, SHA-512 integrity, license, module shape,
   types, engines and runtime dependencies against the tag. If 3.1.8 is newly
   affected or unavailable, report it and propose revised scope rather than
   selecting a major or unrelated upgrade silently. Read upstream fixes/tests.
5. Verify installed npm update options, then use a targeted lock-only update
   with install scripts and incidental audit/fund output disabled. Inspect the
   entire diff; reject unrelated node churn. Do not hand-invent integrity or
   run `npm audit fix --force`. All manifests stay byte-for-byte unchanged.
6. Run `npm ci --no-audit --no-fund`, confirm the lock hash is preserved,
   fast-uri is 3.1.8 everywhere, and all ten AJV callers/versions remain fixed.
7. Create disposable bounded offline fixtures using real package APIs:
   - Parse and serialize ordinary HTTP/HTTPS URIs with port/query/fragment,
     resolve relative references, and preserve reserved path escapes.
   - Verify scheme-relative percent-encoded uppercase hosts normalize equally
     to lowercase canonical hosts; check parse, normalize and equal together.
   - Exercise IDN canonicalization, repeated hostname percent-decoding,
     encoded scheme handling and malformed IPv6 using small upstream test
     cases. Assert the documented rejection/error behavior or preserved
     semantics, not assumptions about thrown exceptions.
   - Exercise serialize with untrusted port values against the actual patched
     contract; preserve valid numeric/default ports while preventing injected
     authority delimiters. Do not make network requests to any fixture URI.
   - Through each installed AJV v8 branch, compile a schema containing `$id`,
     relative external `$ref` and local fragment `$ref`; validate positive and
     negative data. Exercise escaped JSON Pointer definitions and retained
     unresolved-reference failures. Use synthetic `https://example.test/`
     identifiers with preloaded schemas, no remote loading or application data.
   - Confirm every caller imports the same repaired fast-uri module. Include
     production MCP/conf/ajv-formats and dev Angular/Nest/Prisma/webpack callers
     that inventory actually finds. Root AJV 6 is a distinct branch and is not
     claimed to use fast-uri. Capture actual counts and outputs.
     Bound child execution with timeouts. Compare benign baseline behavior where
     needed. No permanent dependency, synthetic mirror test or exploit service.
8. Run audit-wrapper tests and the full existing operations aggregate, root
   lint, typecheck and build. Typecheck/build run sequentially to avoid races.
   No live database/server/browser drill is required for a lock-only URI patch;
   do not claim those checks. If an aggregate stops, record the stage and run
   needed unaffected tests independently without bypassing a genuine failure.
9. Fetch complete post-change production audit JSON. Compare every package,
   advisory identity/range and affected path, including propagated findings;
   distinguish unrelated upstream metadata drift from changed dependencies.
   Expect fast-uri to clear but never hard-code totals. Keep critical-only
   policy and all suppressions unchanged. Preserve the complete residual list.

## SKILLS USED

- `security-best-practices`: Dependency hygiene, URI parsing semantics and
  cautious reachability claims; relevant JS backend/frontend guidance.
- `deployment-pipeline-design`: Preserve audit/launch gates and rollback limits.
- `javascript-testing-patterns`: Isolated semantic URI and AJV reference checks.
- `requesting-code-review`: Independent reviewer after self-verification with
  SHAs, requirements, diff, integrity, caller and audit evidence.
- `receiving-code-review`: Verify feedback before fixes; recheck affected paths.
- `caveman-commit`: Required compact Conventional Commit on local main.

Planning loaded the security, gate and testing skills. Re-read all six during
execution. No application component, Nest implementation, SQL, secret, CI,
telemetry or architecture-boundary work is planned; expand skill loading only
if approved scope changes.

## Verification, review and completion

Run from repository root and quote real exits/output:

```bash
npm ls fast-uri --all
npm explain fast-uri
npm run ops:audit-test
npm audit --omit=dev --audit-level=critical
npm run ops:audit
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Capture the actual fixture command/output and full audits separately in `/tmp`.
Use installed Prettier on the prompt, lockfile and appended doc regions,
preserving historical documentation formatting. Inspect all changed files and
compare package nodes and manifests against baseline. Report restrictions and
unreached checks honestly; synthetic operations tests are not live sign-off.

After self-verification, dispatch the mandatory reviewer subagent under
AGENTS.md §2.1. Provide base/head SHA (same HEAD with uncommitted diff), this
prompt, exact scope, registry integrity, real caller resolutions, smoke script
and output, full audit comparison and verification logs. Request review for
unrelated churn, actual security semantics, AJV compatibility and unchanged
fail-closed policy. Evaluate findings using receiving-code-review, fix verified
defects and rerun affected checks; re-review significant changes. Record results
in the owning docs after implementation review, then inspect final docs/diff.

Rollback is a reviewed normal revert of the lock repair, preserving retained
evidence and reassessing exposure before deployment. No live operation,
production approval, credential mutation, audit suppression, family expansion
or push. Phase 12, prompt 201, residual findings and operator sign-offs remain
open. Stage approved files only, inspect staged diff, and commit locally to
`main` using caveman-commit. Give inspection commands and meaningful limits.
