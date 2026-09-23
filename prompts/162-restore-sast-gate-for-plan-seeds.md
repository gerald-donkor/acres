# 162 — restore the SAST gate for fixed query-plan `ANALYZE` calls

## Scope and why this is next

The committed baseline is `4fe0785003fcf2ebae039c5321737c3d94d0283a` on
`main`; the worktree was clean before this prompt was written. Prompt 161 is
committed, and 161 was the highest existing prompt number. The twelve ordered
phases in `docs/build-plan.md` have implementation records through Phase 12K.
This is a dependency-safe Phase 12 CI/security verification repair. CI already
runs `npm run ops:check`, but its SAST substep currently fails, so the rest of
the `checks` job and its dependent Docker job cannot complete on this commit.

The live `npm run ops:sast` run on 2026-09-23 scanned 360 files, found ten rule
matches, triaged three, and failed on seven active `SAST-01` blockers. Every
blocker is a fixed, source-literal `ANALYZE` call in the geography or analytics
query-plan seed runner. Existing approved suppressions `SUP-001` and `SUP-002`
already document this exact offline/test-only exception, but their line arrays
refer to older locations (geography 134–135 vs current 137–138; analytics
82–86 vs current 155–159). The source SQL strings are constant; no request,
tenant, dataset, or other dynamic input is interpolated into these seven
`ANALYZE` calls. The separately constructed `EXPLAIN` calls retain their
current query and parameter handling and are outside this repair.

Repair only the approved exception's scope, and strengthen it so changing an
approved call into dynamic SQL at the same line cannot inherit the exception.
Do not weaken `SAST-01`, exclude the seed directories, move code just to evade
the scanner, or change the CI workflow. The operator launch checklist still
requires separate live evidence and approval.

## Reference material read

- `AGENTS.md` §§2, 2.1, 4–10 and `docs/build-plan.md` Phase 12 (§13),
  sequence gates (§14), and Phase 12K record (§22).
- `docs/operations.md` “CI State,” including the recorded `ops:check` failure
  from prompt 161; `docs/launch-checklist.md` preflight and launch distinction;
  `docs/security.md` CI/image supply-chain trust boundary; and
  `docs/automation.md` verification recipes (no visual measurement applies).
- `.github/workflows/ci.yml` existing blocking `npm run ops:check` step and
  dependent `docker` job; root `package.json` `ops:sast`, `ops:sast-test`, and
  `ops:check` scripts.
- `scripts/ops/run-sast-scan.js` `SAST-01`, `scanFile()`, and
  `evaluateTriage()` semantics: suppression matching is exact path and rule,
  optional line/lines, then (at planning time) substring `snippet`; expired matched findings
  fail closed. `scripts/ops/run-sast-scan.spec.js` includes a repository-wide
  clean-scan assertion and line-scoping regression coverage.
- `infra/security/sast-triage.json` existing `SUP-001`/`SUP-002` approval,
  rationale, dates, expiration, and current line arrays;
  `infra/security/sast-triage.schema.json` supports single `line`, `lines`,
  and `snippet` fields.
- `server/src/geography/seed/check-geography-plans.ts` lines 137–138 and
  `server/src/analytics/seed/check-analytics-plans.ts` lines 155–159, plus
  their specs: all seven fixed `ANALYZE` arguments are asserted and must stay
  unchanged. Confirm current locations at execution time, since line numbers
  can move.
- Loaded during prompt planning: `sast-configuration` for targeted triage and
  fail-closed scanner behavior; `javascript-testing-patterns` for a meaningful
  negative regression check. No UI, Next, Tailwind, shadcn, or visual skill is
  triggered by this policy/documentation-only repair.

## Exact scope and acceptance criteria

1. In `infra/security/sast-triage.json`, replace the stale two grouped
   `SAST-01` line scopes with seven narrowly matched suppressions, one per
   fixed `ANALYZE` statement. Retain the existing approval identity,
   rationale, `approved_date: 2026-09-09`, `expires_at: 2027-09-09`, and LOW
   downgraded severity; do not silently extend expiration or claim a new
   security-owner approval. Assign unique IDs (`SUP-001`, `SUP-002`, and new
   IDs after the existing `SUP-005`) while preserving all other entries. Each
   exception must match the exact file, current line, rule, and a snippet
   containing the complete fixed `$executeRawUnsafe('ANALYZE ...');` call for
   its one table. The seven table names are `RegionGeometry`, `Region`,
   `MetricAggregate`, `MetricObservation`, `MetricDefinition`,
   `MetricAggregateLineage`, and `DashboardView`. Do not use a path-wide or
   blanket `ANALYZE` snippet. Avoid duplicate overlapping exceptions.
2. Add a focused test to `scripts/ops/run-sast-scan.spec.js` that loads the
   actual policy and verifies each approved call is triaged, while a changed
   SQL statement at the same file and line (for example, an interpolated or
   concatenated table name) remains active and blocking. Test the existing
   `evaluateTriage()` and `SAST-01` detector together; preserve the test that
   a repository scan has zero unreviewed blockers and zero expired matches.
   Do not write a test that only repeats seven JSON line numbers without
   checking the security property.
3. Keep the seven source calls and their query-plan specs unchanged. If a
   source call has changed by execution time, investigate whether it is still
   a fixed trusted literal before editing policy. If any call accepts
   dynamic input, do not suppress it; fix the unsafe SQL path in a separately
   justified scope or stop with the finding.
4. Update `docs/operations.md` “CI State” with the observed baseline failure,
   the exact policy repair, new local `ops:sast`/`ops:check` result, and the
   fact that a GitHub-hosted run is still pending unless actually observed.
   Update `docs/security.md` only if the trust-boundary assessment changes;
   this planned change only restores an existing bounded test-only exception.

The expected acceptance is ten total findings with all ten triaged (seven
fixed `SAST-01` calls plus the three existing unrelated findings), zero active
blockers, zero expired suppressions, and exit 0 from `npm run ops:sast`. Treat
these counts as the measured 2026-09-23 baseline, not a hard-coded future
test count: if source changes create a different set, inspect each difference.
`npm run ops:check` must also pass end to end, rather than merely reaching the
next substep. No source route, API contract, schema, query text, seed volume,
CSS breakpoint, or container packaging changes are expected.

## Failure and compatibility cases

- A newly introduced unsafe raw call, a moved or modified approved call, or an
  expired approval must become an active/failing finding; the negative test
  covers the modified-call case. Keep `SAST-01`'s general detection rule and
  the fail-closed CI invocation intact.
- Suppression `snippet` used substring matching at planning time. Use the complete closed call
  as the snippet and keep exact file and line constraints. If this is
  insufficient to reject the tested dynamic mutation, improve the scanner's
  matching semantics in a narrowly scoped, tested way before claiming this
  gate is repaired; do not broaden the exception.
- Existing seed scripts are offline query-plan tools against disposable test
  databases, not public request handlers. Their parameterized `EXPLAIN`
  calls, tenant context, and guards remain unchanged. Rollback of this policy
  change restores the current fail-closed CI result, so any rollback must
  explain how the scanner gate will be made green safely.

## Non-goals

- No SAST rule disablement, directory exclusion, threshold downgrade,
  `continue-on-error`, or blanket suppressions.
- No PostgreSQL query or Prisma API refactor unless investigation proves a
  real dynamic SQL risk; this prompt is scoped to stale exception location.
- No action upgrade, CI graph change, live production drill, launch sign-off,
  deployment, registry publication, or secret handling change.
- No UI work; 375, 800, and 1280 CSS-pixel behavior is unaffected, so no comp
  crop, screenshot, or browser suite is required for this repair.

## Verification and review

1. Re-read this approved prompt, `AGENTS.md`, owning docs, and every skill in
   `SKILLS USED` before implementation. Re-run `npm run ops:sast` first to
   confirm the live seven-finding baseline and inspect all seven source calls.
2. Validate the updated JSON against the checked-in schema using the existing
   operational template/scan path. Run `npm run ops:sast-test`,
   `npm run ops:sast`, and full `npm run ops:check`. Record their actual exit
   codes and relevant scanner counts. If `ops:check` fails later in its chain,
   diagnose and fix only a directly related regression; report an unrelated
   blocker with its actual output rather than claiming completion.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`,
   `npm run contracts:check`, and `git diff --check`; quote actual output.
   Server, geography-plan, analytics-plan, and browser suites are unchanged
   by this policy-only change, so run them only if the implementation expands
   into their code paths or a concrete regression indicates need.
4. Inspect all changed files and the final diff. Complete the
   `requesting-code-review` Stage 1 reviewer subagent pass with this prompt,
   changed paths, `BASE_SHA=4fe0785003fcf2ebae039c5321737c3d94d0283a`,
   current `HEAD_SHA`, and real checks. Evaluate each finding with
   `receiving-code-review`, fix valid issues, and re-review if scanner
   semantics change materially. Update the owning docs with final evidence,
   stage only scoped files, inspect the staged diff, and commit locally to
   `main` using `caveman-commit`. Do not push.

## SKILLS USED

- `sast-configuration` — preserve fail-closed scanning and narrowly justified
  source-specific triage.
- `javascript-testing-patterns` — prove approved fixed SQL is triaged while a
  dynamic mutation on the same line is blocked.
- `requesting-code-review` — Stage 1 reviewer subagent after self-verification.
- `receiving-code-review` — Stage 2 technical evaluation of findings.
- `caveman-commit` — required local commit message at execution time.
