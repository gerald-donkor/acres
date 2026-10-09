# Phase 12K — Patch qs security release

## Scope and why this is next

Continue Phase 12K's residual dependency repairs from clean `main`, commit
`a08f803`. The recorded inventory still contains qs 6.15.3. Maintainer advisory
GHSA-4mjr-xmp4-gh2g / CVE-2026-82417 identifies 6.16.0 as the fix for a
parse/stringify failure involving a non-callable constructor.isBuffer property.
Repair all installed qs callers without a new override or an application change.
This closes a known inventory exposure; deployed exploitability is not established.

Installed Express 4.22.2 and body-parser 1.20.6 constrain qs to ~6.15.1.
Update that Apollo-transitive branch to upstream Express **4.22.3** and
body-parser **1.20.8**, whose qs range is ~6.16.0. Express 5.2.1,
body-parser 2.3.0 and superagent 10.3.0 already accept qs 6.16.0.
Keep those parents unchanged. No broad npm update, audit fix or major upgrade.

## References read and verified

- `AGENTS.md`: prompt, immediate-execution, review, validation and local commit rules.
- `docs/build-plan.md`: Phase 12 and committed repairs through Prompt 293.
- `docs/operations.md`: dependency inventory, audit disclosure restriction and prior checks.
- `docs/skills.md`: skill paths and conditional surface ownership.
- `docs/backend.md`, `docs/system-architecture.md`: current stack and runtime boundaries.
- `docs/security.md`: dependency/resource exhaustion risks, existing controls.
- `docs/launch-checklist.md`: operator approval and local-fixture evidence limits.
- Root lockfile and manifests; installed qs package/API, Express query parser
  callers and body-parser urlencoded implementation; `server/src/app.setup.ts`
  uses extended:false. No application parse-to-stringify request path was established.
- https://github.com/ljharb/qs/security/advisories/GHSA-4mjr-xmp4-gh2g
- Public npm version/dependency/tarball/integrity metadata for qs 6.16.0,
  Express 4.22.3 and body-parser 1.20.8, fetched during planning.

qs remains BSD-3-Clause with Node >=0.6 and unchanged side-channel and
es-define-property ranges. Both parent patches remain MIT with their existing
Node support. Verify every changed lock node against registry metadata.
No dedicated dependency-update skill is available; primary release metadata
owns version facts. No visual work, comp measurement or breakpoint change applies.

## Expected files and behavior

1. `prompts/294-patch-qs-security-release.md`: this implementation brief.
2. `package-lock.json`: npm-generated qs and necessary Express 4/body-parser 1
   repair closure only. Preserve every unrelated node and workspace manifest,
   override, platform dependency and package approval. Compare dependency maps:
   additional closure changes must be necessary to satisfy the repaired parents,
   inspected and documented before accepting them.
3. `docs/operations.md`: provenance/integrities, exact lock closure, compatibility,
   actual output, review, audit/environment limits and normal-revert rollback.
4. `docs/build-plan.md`: concise verified Prompt 294 implementation record.

All routes retain behavior. UI, schemas, tenant/auth controls, topology, scanner
policy and gate thresholds remain unchanged. Production activity, online audit,
live load, deployment, push and operator sign-off are outside this task.

## Execution steps

1. Re-read this prompt and load the skills below. The user's instruction to
   implement immediately after writing supplies approval under AGENTS.md §2.8.
   Keep baseline lock/manifests, fixtures and logs in disposable `/tmp/acres-294`.
2. Generate the targeted lock repair with `npm update qs express body-parser
--package-lock-only --ignore-scripts --no-audit --no-fund`. Inspect the whole
   lock diff and reject unrelated changes. If npm selects unrelated newer major
   parents, restore the baseline lock and use a targeted resolution procedure
   retaining the precise scope above; never hand-invent package metadata.
3. Match all changed tarball URLs and integrities to public registry metadata.
   Run `npm ci --no-audit --no-fund`, preserving existing install-script approval
   policy. Prove installation did not change the lock hash. Run
   `npm ls qs express body-parser --all` and assert all five qs caller edges
   resolve to 6.16.0 with valid declared ranges.
4. Inspect installed qs README/changelog/source before writing disposable
   real-library fixtures. Verify ordinary nested/array/Unicode/duplicate query
   parsing and encoding, Buffer serialization, bounded depth/parameter limits,
   prototype protection, malformed escapes, CJS/ESM loading and small hostile
   constructor.isBuffer parse-to-stringify cases with both documented options.
   Assert behavior rather than timing. Never run a large denial-of-service input.
5. Exercise both actual Express branches and both body-parser branches with
   bounded synthetic requests or middleware harnesses: extended queries,
   extended and simple form bodies, strict limits and normal error propagation.
   Exercise superagent serialization through the installed supertest path.
   These disposable checks do not substitute for a real Nest/database E2E run.
6. Run selected Prettier, root `npm run lint`, `npm run typecheck`,
   `npm run build`, and `git diff --check`. Run the independent offline stages
   derived from the current `ops:check` script, preserving order and omitting
   only `ops:audit` under the existing metadata-disclosure restriction.
   Report failures honestly; do not claim fresh audit counts or a complete
   `ops:check` pass. Avoid repeating successful checks without a reason.
7. Dispatch one independent read-only reviewer with base/current HEAD
   `a08f803`, actual unstaged diff, this prompt, requirements and check logs.
   Use requesting-code-review; evaluate every finding with receiving-code-review.
   Fix valid issues, recheck and obtain follow-up review for significant changes.
8. Record verified results in owning docs, inspect final/staged changes and
   commit only this task's files locally on main using caveman-commit. No push.

## Exit, inspection and rollback

Require scoped reproducible lock/install, primary-source integrity, valid
caller resolution, semantic/integration fixtures, repository checks, offline
operations checks, independent review and local commit. Inspect from repo root:

```bash
npm ls qs express body-parser --all
```

Host Node 26 checks do not establish Node 24, Docker, production, browser or
real database acceptance. Phase 12, prompt 201, other advisories and operator
sign-offs remain open. Roll back with a reviewed normal revert of the lock
repair, reassessing security exposure before deploying the older dependencies.

## SKILLS USED

- `security-best-practices`: evidence-based dependency repair and unchanged controls.
- `javascript-testing-patterns`: bounded real-library parsing and middleware fixtures.
- `deployment-pipeline-design`: preserve gates, release evidence and rollback semantics.
- `sast-configuration`: keep scanner policy and distinguish audit from offline evidence.
- `requesting-code-review`: independent read-only implementation review after checks.
- `receiving-code-review`: verify reviewer claims before any corrections.
- `caveman-commit`: concise conventional commit with security rationale.
