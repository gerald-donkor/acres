# Phase 12K — Patch the js-yaml security releases

## Scope and why this is next

Continue the earliest unfinished phase, Phase 12 operations and launch hardening,
after prompt 284's committed Nodemailer repair (`c37aaac`). Planning found a clean
worktree. A fresh complete production audit on 2026-10-09 returned valid JSON,
exit 1 for findings, and **32 findings: 23 high, nine moderate, zero critical**.
The initial restricted request failed with `getaddrinfo EAI_AGAIN
registry.npmjs.org`; the permitted read-only retry succeeded. Raw planning JSON
is disposable `/tmp/acres-p285-audit.json`, not a required execution artifact.
Reacquire evidence during execution rather than depending on that file.

Address one dependency family: `js-yaml`. Launch template checks, release-image
checks, deployment fixtures, and alert/container/volume verifiers resolve the
root **4.3.1** copy. Several hardened verifiers explicitly pass `maxDepth: 100`
and `maxTotalMergeKeys: 10000`. The maintainer documents that empty merge sources
bypass the latter budget in affected versions. This is directly relevant to
operational evidence parsing; an installed advisory is not proof of deployed
exploitation or customer-controlled input reaching that parser.

Installed/locked branches and selected targets:

| branch | observed dependency ownership                                                        | current | target     |
| ------ | ------------------------------------------------------------------------------------ | ------- | ---------- |
| v4     | ESLint/cosmiconfig parents; root resolution used by operations scripts               | 4.3.1   | **4.3.2**  |
| v5     | `@nestjs/swagger` 11.4.7 declares exact `js-yaml: 5.3.0`                             | 5.3.0   | **5.4.3**  |
| v3     | `@istanbuljs/load-nyc-config` 1.1.0 declares `^3.13.1`, through Jest instrumentation | 3.15.1  | **3.15.2** |

Patch all installed branches of this same family without migrating any consumer
to another major. The v3 development-only copy is absent from the production
audit but is covered by the maintainer advisory. Treat its repair as tooling
inventory remediation, not a runtime exposure claim. Select v5 5.4.3 to include
the security repair and later scalar loading/dumping fixes; the 5.3→5.4 changes
require explicit serializer compatibility checks. Avoid a Swagger 12 migration
merely because npm recommends it. Other dependency families and operator launch
sign-offs remain open; this step cannot close Phase 12 or prompt 201.

## References inspected and required execution reads

- `AGENTS.md` §§2–7 and §§8–10: phase resolution, prompt/approval, checks,
  independent review, documentation and local commit requirements.
- `docs/build-plan.md` §§13–14 and records 281–284: dependency remediation
  sequence and unresolved Phase 12 exit requirements.
- `docs/operations.md` dependency inventory and records 274, 277, 278, 281–284:
  parser limits, static evidence contracts, prior audit state and fixture limits.
- `docs/backend.md`: installed Swagger/Nest and contract-generation ownership.
- `docs/system-architecture.md` binding principles and `docs/security.md`
  supply-chain/availability risks: preserve existing boundaries and topology.
- `docs/launch-checklist.md` introduction/preflight: checks are not live approval.
- `docs/skills.md`: installed skills, paths and bounded-scope triggers.
- Root/workspace manifests, `package-lock.json`, installed js-yaml manifests
  and parent dependency declarations; `scripts/ops/audit-dependencies.sh`.
- `scripts/ops/check-production-templates.js`, `check-release-images.js`,
  `verify-alert-rules.js`, `verify-container-security.js`,
  `verify-volume-encryption.js`, `run-deployment-drill.sh` and their tests.
- `server/src/contracts/generate-contracts.ts`, contract tests, guarded e2e
  setup and installed `@nestjs/swagger/dist/swagger-module.js`. Swagger's YAML
  path uses `dump`; the contract generator writes JSON and SDL, so its drift
  check alone does not exercise YAML dumping.

Primary sources fetched during planning, to recheck before editing:

- [v3/v4 maintainer advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh):
  high; affected `>=3.0.0 <3.15.2` and `>=4.0.0 <4.3.2`; patched 3.15.2/4.3.2.
- [v5 maintainer advisory](https://github.com/nodeca/js-yaml/security/advisories/GHSA-r3ph-w7gj-g6xm):
  moderate; affected `>=5.0.0 <=5.4.0`, patched 5.4.1; merging must be enabled.
- [v3 changelog](https://github.com/nodeca/js-yaml/blob/v3/CHANGELOG.md),
  [v4 changelog](https://github.com/nodeca/js-yaml/blob/v4/CHANGELOG.md) and
  [v5 changelog](https://github.com/nodeca/js-yaml/blob/master/CHANGELOG.md):
  security fixes count empty mappings and introduce a merge-sequence cap of 100.
  v5 5.4.0 changes scalar presentation, AST styles and `sortKeys`; 5.4.2 fixes
  `forceQuotes`, 5.4.3 fixes whitespace-only block scalar loading.
- [Maintainer advisory index](https://github.com/nodeca/js-yaml/security/advisories):
  inspect every relevant entry and any pagination, not just these two entries.
- [npm override contract](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides):
  overrides belong in the root and can be constrained by parent version.

Verify registry publication, integrity, engines, dependencies and exports during
execution; those values were not fetched in planning. No visual reference, crop,
breakpoint or pixel measurement applies. Measure exact resolution, integrity,
finding identity/path changes, meaningful parser behavior and actual exits/counts.
No dedicated dependency-remediation skill is installed; primary npm/maintainer
sources and the named security, testing and framework skills cover this step.

## Execution authorization and intended files

Approval authorizes targeted npm registry metadata/package downloads,
installation/clean reinstall, and before/after audit requests to
`https://registry.npmjs.org`, including dependency names/versions sent by npm and
the existing audit wrapper/operations aggregate. Source, credentials, customer
data and production records must not be transmitted. Transport failure is not
a clean audit. Explain any remaining automatic approval rejection; do not bypass it.

Expected changes:

1. Root `package.json`: add only the parent-version-scoped override
   `"@nestjs/swagger@11.4.7": { "js-yaml": "5.4.3" }` after confirming the
   installed parent version. Preserve the existing deepmerge-ts and Multer
   overrides. Record removal when a supported Swagger version resolves a safe
   js-yaml itself; do not make this a permanent cross-major override.
2. Root `package-lock.json`: npm-generated js-yaml branch resolutions,
   override metadata and strictly necessary closure only. v3/v4 parents already
   permit their targets; use targeted transitive updates, not overrides for those
   branches. Preserve all parent package versions and other families.
3. `docs/operations.md`: full remediation, compatibility, audit and limits record.
4. `docs/build-plan.md`: concise Phase 12K implemented-state record.
5. `docs/backend.md`: narrowly document Swagger's dependency exception and its
   removal condition alongside the resolved dependency record.
6. This prompt accompanies the executed local commit.

No production source/test change is expected. Use disposable synthetic smoke
fixtures rather than persistent version-assertion tests. If a reproduced
consumer regression requires source changes, a parent upgrade or unrelated
dependency repair, report the concrete failure and revised scope before editing
those surfaces. Do not add a new direct root js-yaml dependency, change its
existing hoisting ownership, or force v3/v4 consumers onto v5 in this task.

## Execution sequence

1. Re-read the approved prompt, guidance, owning docs and every named skill.
   Record branch, `BASE_SHA`, worktree state and tool versions; preserve unrelated
   edits. Inventory all copies with `npm ls js-yaml --all`, `npm explain js-yaml`
   and lockfile inspection. Resolve operations and Swagger imports from their
   actual caller locations using Node `createRequire`; do not assume hoisting.
2. Capture fresh complete production audit JSON in a restricted disposable
   directory. Also inspect the v3 tooling path against the maintainer advisory;
   optionally retain a full audit separately, clearly distinguished from the
   production baseline. Verify all three target manifests and current advisory
   ranges, release changes, exports and registry integrity. If a selected target
   is newly affected or unpublished, stop with the proposed replacement scope.
3. Add the one scoped Swagger override, then use locally verified npm commands
   to regenerate the targeted js-yaml branches, disabling incidental audit/fund
   output. Consult local npm help before selecting flags. Immediately inspect
   the entire diff. Remove unrelated churn via clean targeted regeneration;
   never hand-edit registry integrity or run `npm audit fix --force`.
4. Run `npm ci --no-audit --no-fund`; compare lockfile hashes before/after it.
   Reinventory every copy and caller-relative resolution. Confirm targets
   3.15.2, 4.3.2 and 5.4.3, unchanged parent versions, correct override and
   no affected copy left. Confirm the operations root still selects v4.
5. Run small bounded offline parser fixtures against the real caller-resolved
   packages in a disposable Node script. Verify benign aliases/merges, mappings,
   sequences and scalar values retain intended semantics. For v3 use its verified
   safe loading API; for v5 use the verified explicit YAML 1.1 merge schema when
   testing merges. Retain ordinary v5 default-schema behavior in consumer checks.
   A short sequence of empty merge mappings with an intentionally tiny budget
   must throw after consuming that budget; a small over-100-source merge sequence
   must reject. Assert exceptions and parsed values rather than timing thresholds.
   Do not reproduce the advisory's 20,000-by-20,000 CPU payload.
6. Exercise actual installed Swagger YAML serialization options on synthetic
   OpenAPI-like data containing strings, booleans, nested schemas and whitespace
   text. Load the result back and assert semantic equality using the same
   package. Check valid output/round-trip and formatting effects of 5.4, not
   equality to a remembered string. Run contract drift checks separately; never
   regenerate committed contracts to hide a regression.
7. Run existing affected operations suites and the full aggregate, server
   contract units/e2e and root checks. Root lint/build also exercise v4 tooling;
   actual instrumented coverage must exercise the v3 Jest path. Confirm selected
   contract unit tests really run and use existing guarded fixture configuration.
8. Fetch fresh post-change production audit JSON. Compare complete finding
   objects, advisory IDs, paths and propagated findings. js-yaml and its
   Swagger propagation should clear if they remain solely this family; record
   actual changes and upstream advisory drift instead of promising a count.
   Retain unchanged critical thresholds and record residual findings honestly.

## SKILLS USED

- `security-best-practices`: Scope parser availability/inventory remediation and
  real reachability; load relevant Express dependency guidance.
- `nestjs-best-practices`: Swagger/Nest module and compiled serializer compatibility
  while retaining parent versions and application behavior.
- `deployment-pipeline-design`: Preserve fail-closed launch/dependency gates and
  distinguish repository evidence from production acceptance and rollback.
- `javascript-testing-patterns`: Existing contract/unit coverage, actual instrumented
  Jest path and bounded offline parser/serializer assertions.
- `requesting-code-review`: Dispatch independent read-only review after self-checks
  with precise SHAs, requirements, resolution evidence and diff.
- `receiving-code-review`: Verify reviewer claims against actual resolution and
  consumer behavior; fix valid issues and re-review significant changes.
- `caveman-commit`: Required concise Conventional Commit with security-fix rationale.

This is a bounded dependency step within Phase 12; no architecture, trust
boundary, CI, secrets, telemetry, browser, database schema or UI change is
planned. Reassess skills if scope changes. Planning reads do not replace
execution-stage skill reads.

## Verification and completion

Run from the repository root and quote actual exits/output/counts:

```bash
npm ls js-yaml --all
npm explain js-yaml
npm run ops:templates
npm run ops:templates-test
npm run ops:release-images-test
npm run ops:alert-test
npm run ops:container-test
npm run ops:volume-test
npm run ops:deployment-test
npm run ops:launch-drill-test
npm run ops:audit-test
npm audit --omit=dev --audit-level=critical
npm run ops:audit
npm run test --workspace=@acres/server -- --runInBand --coverage --testPathPatterns='generate-contracts.spec|contracts-runner.spec'
npm run contracts:check
npm run test:e2e --workspace=@acres/server -- --runInBand
npm run ops:check
npm run lint
npm run typecheck
npm run build
git diff --check
```

Verify the real contract spec names before using the selection above; adjust
the pattern to existing contract tests rather than reporting a no-tests pass.
Coverage artifacts remain untracked. Capture full before/after JSON separately;
successful audit retrieval and policy success are separate outcomes. Execute
typecheck/build sequentially. Use only the test database guarded by
`server/test/setup-env.ts`; report real DB versus doubles and missing fixtures.
No production mutation, service reset or test relaxation is authorized.
The synthetic smoke command/output must be recorded. The full aggregate can
satisfy a previously run affected suite if no intervening change warrants
repetition. If it stops, identify reached/unreached stages and run necessary
affected checks separately. Run selected Prettier on changed JSON/prompt and
new document regions, preserving historical unrelated formatting.

After self-verification, dispatch the required reviewer subagent with this
prompt, `BASE_SHA`/`HEAD_SHA`, uncommitted diff, all branch/parent resolutions,
registry integrity, before/after advisory evidence, override rationale/removal
condition, checks and fixture limits. Evaluate feedback rigorously, fix verified
defects, rerun affected checks and re-review significant changes. Record actual
results in owning docs only after review; no launch approval field changes.

Rollback is a reviewed normal revert of the root manifest and lockfile together,
preserving retained evidence and reassessing affected-version exposure before
deployment. No live drill, deployment, push, suppression, threshold change,
consumer-major migration or acceptance of operator categories is authorized.
Stage only approved files, inspect the staged diff and commit locally to `main`
using `caveman-commit`. Provide inspection commands (`npm ls js-yaml --all`,
`npm run ops:templates`, `npm run ops:audit`) and any verification limitations.
Preparing this prompt leaves exactly this new file uncommitted and performs
no installation, implementation, staging, commit or push.
