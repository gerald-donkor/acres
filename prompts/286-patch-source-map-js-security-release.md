# Phase 12K — Patch the source-map-js security release

## Scope and why this is next

Continue Phase 12 operations and launch hardening after prompt 285's committed
js-yaml repair, `bd1c08a`. Planning found a clean worktree and no pending prompt.
The highest existing prompt number is 285. Phase 12 remains the earliest
unfinished phase; prompt 201 and real operator launch sign-offs remain open.

Repair one dependency family, **source-map-js 1.2.1 → 1.2.2**. This is a small,
dependency-safe step in the remaining security inventory: the permitted ranges
already admit the patch, and no framework migration or new override is expected.
Prioritize this available high-severity patch in the existing CSS build chain
before broader GraphQL or tooling-family migrations. This selection is an
engineering judgment, not a claim that the other findings are less exploitable.

The committed prompt 285 record reports **30 production findings: 22 high,
eight moderate, zero critical**. Its disposable full audit was inspected during
planning and includes source-map-js under GHSA-68fv-2mgg-jv7q. This is prior
evidence, not a fresh successful audit for this prompt. A new planning request
failed with `getaddrinfo EAI_AGAIN registry.npmjs.org`; automatic approval review
then rejected the network retry because the user's planning command did not
authorize disclosing the production dependency inventory to npm. No workaround
or indirect audit request is permitted. Reacquire the baseline only after the
explicit execution approval described below.

Planning verified these lockfile parents and caller-relative imports:

| parent/caller         | installed version | declared source-map-js range | current resolution |
| --------------------- | ----------------- | ---------------------------- | ------------------ |
| root PostCSS          | 8.5.26            | `^1.2.1`                     | root 1.2.1         |
| Next's nested PostCSS | 8.5.23            | `^1.2.1`                     | root 1.2.1         |
| `@tailwindcss/node`   | 4.3.3             | `^1.2.1`                     | root 1.2.1         |

There is one source-map-js package node in the inspected lockfile. Both PostCSS
implementations import its consumer/generator APIs. Tailwind's installed Node
bundle imports it as well. These are actual dependency paths, not proof that
untrusted customer source maps reach Acres. Do not claim a customer exploit,
production compromise, or launch approval from package inventory remediation.

## References read and execution prerequisites

- `AGENTS.md`, especially phase-control resolution, §§2–7 and §§8–10.
- `docs/build-plan.md` §§13–14 and records 281–285: unfinished Phase 12 and
  the committed dependency repair sequence.
- `docs/operations.md` Prompt 281 inventory and records 281–285: audit policy,
  remaining advisories, repository checks and live-fixture limitations.
- `docs/backend.md` resolved dependency/verification context; the application
  and server dependency contracts must remain unchanged.
- `docs/system-architecture.md` binding principles and `docs/security.md`
  scope/supply-chain context; no new boundary or topology is proposed.
- `docs/launch-checklist.md` introduction and preflight: static repository
  checks cannot approve operator categories.
- `docs/skills.md`: skill paths, triggers and exclusions.
- Root/workspace manifests and `package-lock.json`; installed source-map-js,
  PostCSS and Tailwind Node manifests; `client/postcss.config.mjs`.
- `node_modules/postcss/lib/{map-generator,previous-map}.js`, the corresponding
  nested Next PostCSS files, and `node_modules/@tailwindcss/node/dist/index.js`.
- Installed Next CSS guide:
  `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`.
  The current client production script is `next build --webpack`; retain it.
- `scripts/ops/audit-dependencies.sh`, its tests and root operations aggregate.

Primary sources fetched during planning; recheck relevant advisory/release
information and registry metadata before editing:

- [Advisory GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q):
  high, affected `>=1.0.0 <1.2.2`, patched 1.2.2.
- [Maintainer release v1.2.2](https://github.com/7rulnik/source-map-js/releases/tag/v1.2.2):
  includes the indexed-map availability repair and CSP-related compatibility fix.
- [Maintainer security fix PR 79](https://github.com/7rulnik/source-map-js/pull/79):
  section-offset validation and nested-offset bounds, nested source lookup,
  mapping serialization and SourceNode padding changes. Read its actual diff
  and regression fixtures before choosing negative smoke assertions.
- [Tagged package manifest](https://raw.githubusercontent.com/7rulnik/source-map-js/v1.2.2/package.json):
  CommonJS main `./source-map.js`, bundled declarations, BSD-3-Clause,
  Node `>=0.10.0`, no runtime dependencies declared.
- [Maintainer API README](https://github.com/7rulnik/source-map-js/blob/v1.2.2/README.md):
  generator, consumer, indexed maps and SourceNode semantics.

The registry distribution/integrity was not fetched during planning. Verify it
during execution rather than substituting the Git tag's metadata. No dedicated
dependency-remediation skill is installed; primary maintainer/npm sources and
the named security/testing/gate skills cover this work. No visual comp, crop,
pixel measurement or breakpoint change applies to this dependency-only step.

## Execution approval and data disclosure

Approval of this prompt explicitly authorizes targeted npm registry metadata
and package downloads, installation/clean reinstall, and complete before/after
production audit requests to **https://registry.npmjs.org**. npm audit sends
production dependency names and versions to that external registry; it does not
need source files, credentials, customer data or production records. This
authorization also covers the existing audit wrapper inside `npm run ops:check`.
Do not send those excluded data classes. Do not treat transport failure or
invalid audit JSON as a clean result. Report any new automatic approval rejection
and continue only unaffected work, without bypassing the rejection.

## Intended files and behavioral impact

1. `package-lock.json`: npm-generated source-map-js 1.2.2 resolution, registry
   URL and integrity only, plus strictly necessary metadata if npm produces it.
   Preserve every parent and unrelated package version. No root/workspace
   manifest edit, override or new direct dependency is expected or authorized.
2. `docs/operations.md`: append a complete Prompt 286 remediation record with
   resolution/integrity, reachability limits, compatibility evidence, actual
   checks, before/after full audit comparison and remaining launch blockers.
3. `docs/build-plan.md`: append a concise implemented-state Phase 12K record.
4. This prompt accompanies the executed local commit.

All routes keep their current contracts and intended rendering. The repaired
dependency validates source maps according to the upstream patch while valid
CSS/source-map processing must remain compatible. No application source,
stylesheet, token, component, PostCSS configuration, Next configuration, generated
contract, server manifest, production template or launch approval field changes
are planned. If compatibility fails and needs one of those changes, report the
reproduced failure and proposed revised scope before editing that surface.

## Detailed execution sequence

1. Re-read this approved prompt, guidance, references and every skill below.
   Record branch, `BASE_SHA`, worktree state, Node and npm versions. Preserve
   unrelated edits. Read installed npm help for the targeted transitive update
   flags; do not rely on remembered flags or use `npm audit fix --force`.
2. Inventory the lockfile and installed tree with `npm ls source-map-js --all`
   and `npm explain source-map-js`. Use Node `createRequire` from each of the
   three caller manifest paths above to record actual resolved file/version.
   Inspect all other parents, if any appear during execution. Save the baseline
   lockfile hash and package-node/version inventory in restricted disposable
   `/tmp` evidence, never in committed fixtures.
3. Obtain fresh complete production audit JSON after authorized network access.
   Validate retrieval, JSON shape and actual counts; exit 1 can represent
   findings, whereas network failure is not evidence. Verify 1.2.2 registry
   publication, tarball integrity, engines, declarations, exports/main and
   dependencies against the tag/release. Recheck all relevant advisory entries.
   If this target is newly affected or not available, stop with the concrete
   proposed alternative rather than silently selecting another version.
4. Use a targeted npm lockfile update that respects existing parent ranges and
   disables incidental audit/fund output. Inspect the entire diff immediately.
   Reject unrelated upgrades or lockfile churn; regenerate cleanly from the
   baseline with a narrower command rather than manually inventing integrity.
   Keep all three existing overrides and all manifests byte-for-byte unchanged.
5. Run `npm ci --no-audit --no-fund`. Verify the lock hash is unchanged by the
   clean install, every source-map-js copy resolves to 1.2.2, and all parent
   versions remain fixed. Compare its lock integrity with registry metadata.
6. Write disposable bounded offline smoke fixtures using the real resolved
   package APIs, with semantic assertions rather than version-only assertions:
   - Generate a small basic map containing names and source content; consume it
     and check original/generated positions and content preservation.
   - Consume a small valid indexed map with multiple sections and modest nested
     offsets. Exercise generator conversion and SourceNode round-trip, checking
     expected mappings/code without assuming cosmetic serialization identity.
   - After reading the patched source/tests, assert malformed negative,
     fractional or unsafe section offsets and an over-limit numeric line reject
     at consumer construction. Construct only tiny map objects: never serialize
     giant gaps or run a pre-patch exhaustion payload. Verify nested summed
     offset rejection if supported by the actual patched validation path.
   - Exercise small nested source lists and SourceNode mappings beyond a short
     code string, checking bounded semantic output and absence of spurious
     `undefined` padding according to the verified upstream behavior.
   - Use each real installed PostCSS branch with synthetic CSS, a harmless local
     transform and map generation/previous-map composition. Assert transformed
     CSS, original positions and sourcesContent survive composition. Explicitly
     enable source maps in this fixture; a default build alone may not exercise
     incoming maps. Compare benign baseline behavior where needed.
   - Exercise the installed Tailwind Node source-map API on a tiny synthetic
     input if its verified exports provide one; otherwise exercise the actual
     PostCSS plugin with a tiny explicit candidate fixture using verified v4
     APIs. Report exactly which path executed; do not infer coverage from imports.
     Put safety timeouts on child fixtures and keep payloads small. No permanent
     framework, test dependency or mirror-implementation test is needed.
7. Run the existing audit-wrapper tests, complete operations aggregate and root
   lint/typecheck/build. Run typecheck and build sequentially because generated
   client files are shared. The actual production build exercises the current
   Tailwind/PostCSS integration. No unrelated live server/database/browser drill
   is required for this lock-only change; report that coverage limit plainly.
8. Fetch fresh complete post-change production audit JSON. Compare every finding
   object, advisory identity/range and node path, including propagated findings.
   Expect this family to clear if the registry still reports the verified ranges;
   do not hard-code an expected total or hide upstream changes. Distinguish
   unchanged findings from unrelated advisory-metadata drift. Keep all policy
   thresholds and suppressions unchanged.

## SKILLS USED

- `security-best-practices`: Bound availability remediation, dependency hygiene,
  untrusted source-map semantics and actual exposure claims; read relevant JS guidance.
- `deployment-pipeline-design`: Preserve audit/launch gates and distinguish local
  repository evidence from deployment acceptance and rollback approval.
- `javascript-testing-patterns`: Meaningful bounded mapping/composition fixtures
  and existing Node test assertions, using verified APIs and isolated inputs.
- `requesting-code-review`: Dispatch the required independent read-only reviewer
  after self-verification with SHAs, prompt, diff and complete dependency evidence.
- `receiving-code-review`: Verify feedback against actual caller resolutions,
  patched behavior, audit evidence and requirements before acting on it.
- `caveman-commit`: Required compact Conventional Commit for the local repair.

Planning loaded the security, gate and testing skills. Execution must re-read
all six; planning reads do not replace the implementation-stage skill pass.
No Nest, React, UI, motion, SQL, trust-boundary, CI, secrets or telemetry change
is planned. Reassess applicable skills if the approved scope changes.

## Verification, review, documentation and completion

Run from repository root and quote real exits/output/counts:

```bash
npm ls source-map-js --all
npm explain source-map-js
npm run ops:audit-test
npm audit --omit=dev --audit-level=critical
npm run ops:audit
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Record the actual offline fixture command/output separately. Capture complete
before/after audit JSON in restricted disposable evidence. The aggregate can
satisfy earlier audit-wrapper checks when no intervening change requires reruns.
If the aggregate stops, name reached/unreached stages and run needed affected
checks independently. Existing synthetic operations tests are not live sign-off.
Use installed Prettier on the changed lockfile/prompt and newly appended document
regions; preserve unrelated historical formatting. Inspect all changed files and
confirm manifests, parent nodes, application source and configuration are unchanged.

After passing self-verification, dispatch a reviewer subagent as AGENTS.md §2.1
requires. Give `BASE_SHA`/`HEAD_SHA`, this prompt, uncommitted diff, parent/caller
resolution table, registry integrity, complete audit comparison, fixture script
and output, checks and limits. Require independent inspection of lock-only scope,
real patched paths and fail-closed audit policy. Evaluate feedback with
`receiving-code-review`, fix verified defects, rerun affected checks, and request
follow-up review for significant changes. Append the owning documentation record
after review; preserve all operator-owned values and launch approval states.

Rollback is a reviewed normal revert of the lockfile repair, preserving retained
evidence and reassessing affected-version exposure before deployment. No live
drill, dependency-family expansion, framework migration, suppression, audit policy
change, production action, credential mutation, deployment or push is authorized.
Stage only approved files, inspect the staged diff, and commit locally to `main`
using `caveman-commit`. Provide exact inspection commands (`npm ls source-map-js
--all`, `npm run ops:audit`) and material limits. Phase 12, prompt 201, remaining
advisories and operator sign-offs stay open.

Preparing this prompt ends with exactly this new file uncommitted. It authorizes
no installation, implementation, staging, commit or push before user approval.
