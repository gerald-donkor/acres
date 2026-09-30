# Phase 12K follow-up — separate deployment preflight from live evidence

## Scope and why this is next

Close the Category 10 (`deployment_and_rollback`) evidence-kind gap in the
Phase 12 launch-readiness gate. Classify the existing deployment runner as
preflight/rehearsal and require separately supplied live operator evidence,
bound to the approved release, before production approval can clear. This
prompt defines and validates that receipt; it does not execute a deployment.

Planning baseline: clean `main` at
`bf633f78019b55ebdbfd12df1b6f580a3a0cd9f8` (prompt 235, live rotation receipt
enforcement). Re-establish committed state at execution and preserve unrelated
changes. Phase 12 remains the unfinished launch phase in `docs/build-plan.md`
§13/§22. The operator evidence and sign-off work governed by prompt 201 remains
open. This is a dependency-safe repository-owned unit within that phase.

Verified gap:

- `validateDeploymentDrillReport(report, now)` accepts configuration booleans
  without checking `dry_run`, evidence mode, live promotion, live rollback or
  the images actually exercised.
- The approved-readiness `validDeploymentDrillReport` fixture explicitly uses
  `dry_run: true` and `probe_live_tested: false`.
- `run-deployment-drill.sh` parses Caddy/Compose, searches local migrations,
  runs static preflights, optionally queries PostgreSQL and API health, then
  prints a rollback command. It never executes promotion or rollback. Its
  `rollback_procedure_verified: true` is therefore preflight evidence.
- Omitting `--dry-run`, enabling HSTS acceptance, or obtaining successful health
  probes does not turn these operations into a live deployment drill.
- Category 10 has an immutable release record, but the child receipt is not
  compared with its reviewed commit or current/previous image pairs.
- The checklist says static checks alone do not establish live readiness,
  while its sign-off row still presents the dry-run command as the verifier.

Preserve the useful checks and enforce the documented distinction. Other
categories and missing operator values are separate work.

## References read and execution prerequisites

Read during planning: `AGENTS.md`, including phase control, prompt/check/review/
commit contracts, product contract and standing rules; `docs/build-plan.md`
Phase 12 and Phase 12K records; `docs/skills.md`; `docs/operations.md` deployment
runbook, Phase 12G and prompt 235; `docs/launch-checklist.md` Category 10 and
formal sign-off matrix; `docs/security.md` §18 and Phase 12K evidence integrity;
`docs/system-architecture.md` §11 and change gates.

Inspected code: root `package.json`; complete
`scripts/ops/run-deployment-drill.sh`; runner harness and evidence assertions
in `scripts/ops/run-deployment-drill.spec.js`; deployment candidate, timestamp,
helper, Category 10 release validation and evidence-file diagnostic boundary
in `scripts/ops/check-launch-readiness.js`; approved deployment fixture,
release record and deployment regression locations in its spec; Stage 3 in
`scripts/ops/run-launch-drills.sh`; deployment baseline assembly in
`scripts/ops/assemble-launch-dossier.js`; deployment text checks in
`scripts/ops/check-production-templates.sh`; complete
`infra/launch/readiness.example.json`.

At execution reread these files and the approved prompt. Read the complete
affected test files, `scripts/ops/check-release-images.js`,
`scripts/ops/launch-target-evidence.js`,
`scripts/ops/assemble-launch-dossier.spec.js`,
`scripts/ops/run-launch-drills.spec.js`,
`scripts/ops/check-readiness-schema.spec.js` and
`infra/launch/readiness.schema.json` before changing related fixtures. Reuse
verified image validation, reference validation and date utilities where their
contracts fit. Verify any new Node API through installed references or a small
local executable probe. No Next/React/Tailwind/Nest API is changed.

There is no visual surface, route change, pixel measurement or breakpoint
behavior; static comps and the design board do not apply. Numerical receipt
constraints below come from existing validator/producer contracts, not visual
judgment or newly selected production objectives.

## Implementation plan

### 1. Identify the existing producer as preflight evidence

Add `execution_mode: "simulation"` to every receipt currently emitted by
`run-deployment-drill.sh`, including its existing failed-schema receipt. Always
emit simulation with either CLI dry-run flag and regardless of health/database
reachability. Preserve boolean `dry_run` as invocation metadata. Never emit
live mode from this runner.

Correct its introduction, help, stage labels, success summary and relevant
comments: it performs configuration/preflight rehearsal, optionally observes
health, and displays a suggested rollback command; it does not exercise release
promotion, service draining or rollback. Retain existing booleans as structural
preflight results for compatibility, with the new explicit qualification.
Describe the DDL search as a heuristic, not proof that every migration is
backward-compatible. Do not broaden that search into a SQL parser here.

Keep CLI flags, checks, output naming and existing probe behavior. Do not add
deployment commands, registry access, migration execution, receipt signatures,
new failure-publication machinery or a live mode switch. Do not expand the
scope to the runner's optional database-query handling. Tests below must stub
all probes so inherited targets cannot be contacted during verification.

### 2. Separate structural validation from live approval

Keep `validateDeploymentDrillReport(report, now)` as the structural helper and
add an optional context, e.g. `{ requireLive: true, expectedRelease }`. Maintain
all existing required success booleans, matching four service drain strings
(`caddy: '30s'`, `next: '30s'`, `api: '45s'`, `worker: '60s'`), at least 12
routes and nonnegative migration count. Validate route/migration counts as safe
integers. Keep optional duration validation finite and nonnegative; validate
`duration_seconds` too when present. Do not invent an `errors` array or a
`drill_type` requirement the current producer does not emit.

Require boolean `dry_run`, boolean `probe_live_tested` and exactly recognized
`execution_mode: "simulation"` or `"live"`. Reject legacy/missing/unknown mode.
Do not infer live mode from `dry_run: false` or a successful health probe.
Preserve supported basic/canonical ISO UTC timestamps, reject impossible and
future dates, and reject an invalid explicit evaluation clock. If both
`drill_timestamp` and `timestamp` are present they must be valid and describe
the same instant; a valid alternate field cannot hide a malformed primary one.

Simulation may structurally pass with either boolean dry-run flag and either
boolean probe result; it always fails `requireLive: true`. Live-mode receipts
must satisfy the entire live contract even when called without `requireLive`.
An absent expected release permits standalone structural checking of the live
receipt; the Category 10 call site must always supply the approved release.

The following is a **new operator-supplied child contract**, not a claim about
existing producer capabilities. A live receipt additionally requires:

- `execution_mode: "live"`, `dry_run: false`, `probe_live_tested: true`,
  `environment: "production"`;
- trimmed nonempty opaque `environment_reference`, `authorization_reference`
  and `operator_reference`, without control characters;
- `release`, containing exactly `reviewed_source_commit`, `current` and
  `previous`; a 40-character ASCII hex source commit; and exactly
  `client_image`/`server_image` keys in each pair;
- all four images valid immutable references using the existing image helper;
  distinct client/server references in each pair; and differing current and
  previous pairs, using the existing parent semantics (one unchanged image is
  allowed). Do not impose the current registry prefix on previous known-good
  images, which the existing parent contract permits elsewhere;
- `live_verification`, with exactly the eight keys below, each an object with
  exactly `status: "passed"`, `verified: true`, and `evidence_reference`.

| live_verification key | independently inspectable observation required |
| --- | --- |
| `promotion` | authorized promotion exercised the receipt's current image pair |
| `rollback` | authorized rollback exercised the previous known-good pair and recovered service |
| `ingress` | production same-origin routing, headers and S3 SigV4 behavior observed through the actual edge |
| `migration_compatibility` | actual deployed schema compatible with both exercised release pairs |
| `readiness` | actual liveness/deep readiness observed during the exercise |
| `graceful_drain` | actual bounded service/request/job draining observed |
| `network_isolation` | deployed network/service exposure inspected |
| `image_provenance` | source/image provenance independently inspected for the exercised release |

All observation references obey the same opaque-string rule. Reject arrays,
null, missing/extra verification keys, wrong statuses, false/string booleans,
empty/whitespace/control-character references and placeholder/development-secret
text. Apply existing placeholder/literal-secret rejection to the live child
without printing its diagnostics. Source pointers need not resolve on this
machine and must never be dereferenced by the validator.

When `expectedRelease` is supplied, compare the source commit (hex casing may
be normalized) and all four image strings with the corresponding parent values;
image comparisons are exact. Invalid expected release shape fails, rather than
silently disabling comparison. The existing parent provenance references remain
independently required; do not copy them into the child or invent signatures.

These confirmations and source references are assertions, not authenticated
production provenance, measured downtime guarantees or automatic evidence that
a live operation occurred. Document independent operator inspection explicitly.
No top-level readiness schema change or production receipt generator is needed.

### 3. Enforce the live, release-bound child in Category 10

Preserve content-based custom filenames, relative-path resolution, wildcard
behavior, release-image/environment gates, provenance refs, approvers and all
other category checks. Exclude unified dossiers from deployment candidates even
if a filename resembles a child or they contain similarly named booleans.

Every referenced deployment child must pass structural validation. Require at
least one complete live receipt bound to `depSec.release` before approved
Category 10 clears. A structurally valid simulation may accompany live evidence;
simulation-only, legacy-only, dossier-only, prose-only or external-pointer-only
records cannot clear the gate. A failed/malformed child blocks beside a good
one, including wildcard matches. Every live-shaped child must match the approved
release, so an unrelated live receipt cannot hide beside a matching one.

Retain the existing ability to carry stable external release evidence refs;
they do not replace an inspectable JSON live child in the existing evidence
collection. Do not automatically fetch private artifacts or rewrite retained
receipts into live evidence.

Extend the existing narrow Category 3 safe evidence-file boundary to Category
10. Use fixed deployment evidence failure messages for missing files, parse
failures, failed child/dossier diagnostics and exceptions caused by malformed
nested JSON values. No private file path, status text, JSON diagnostic, scan
result or exception message may escape into Category 10 blockers. Preserve the
existing safe field-name/image-mismatch blockers and Category 3/5 behavior;
do not refactor diagnostics for the remaining categories.

### 4. Preserve Stage 3 and add hermetic behavioral regressions

The unified dossier remains a drill; its deployment baseline summarizes
preflight/rehearsal. Verify that a successful classified simulation can still
support Stage 3 in dry-run orchestration. Preserve existing live-ingress health
and target binding in non-dry runs: that evidence can pass the drill without
being a production promotion/rollback approval. No assembler schema redesign
or new mutation path is authorized. Change only necessary fixture
classifications and descriptive wording in launch/dossier tests.

Replace the approved-readiness deployment fixture with a clearly test-only
live-shaped receipt whose release matches the test parent. Keep a distinct
producer-shaped simulation fixture. Never track production-looking sign-off
artifacts. Update assertions expecting raw deployment failure messages to the
new safe diagnostic contract.

Test the real runner with and without `--dry-run` in a disposable repository
fixture and a scrubbed subprocess environment. Stub all curl/PostgreSQL probes
and static preflight children; execute the real receipt generation and relevant
configuration checks. Do not inherit service credentials or contact localhost
services. Both outputs must be simulation, pass structural validation and fail
live validation. Include successful stubbed probes to prove reachability does
not elevate evidence mode. Include a schema-failure receipt classification.
Make existing affected runner execution tests hermetic too; retain real
Compose validation regressions. Clean only temporary roots owned by each test.

Cover helper and full readiness behavior for missing/unknown/legacy modes;
nonboolean flags; simulation with live probes; manually relabeled simulation
without full observations; live dry-run true or probe false; malformed maps and
references; missing/extra observation keys; failed/string assertions; every
source/image mismatch; malformed expected release; invalid/unpinned images;
identical current/previous pairs; timestamps, invalid clocks, contradictory
timestamp fields and unsafe numeric counts; incomplete live receipts with
`requireLive` omitted; valid standalone live helper; matching live child clearing
only the fixture Category 10 gate; valid simulation plus live child; custom
filenames; wildcard bad child beside good child; unrelated live child beside
matching child; dossier disguised as child; missing/invalid JSON; private
canaries in errors, file paths, nested diagnostics and formatting exceptions.
Keep all other readiness regression expectations intact.

## File scope, impact, exclusions and rollback

Expected edits: `scripts/ops/run-deployment-drill.sh`, its spec,
`scripts/ops/check-launch-readiness.js`, its spec, narrowly necessary fixture
updates in existing launch/dossier specs; `docs/operations.md`,
`docs/launch-checklist.md`, `docs/security.md` and a concise Phase 12K record
in `docs/build-plan.md`. Read other named paths for context; do not edit them
incidentally. No new documentation index row is needed.

Routes, user journeys, product data and runtime topology are unchanged. No
application code, Compose/Caddy config, CI workflow, dependency, migration,
secret store, release image, approval state or other child contract changes.
No production promotion, rollback, registry access, service drain, credential
operation, SMTP send, database/storage mutation, live benchmark or launch
approval. Live actions still require separately specified operator authorization.

Legacy/unclassified reports require regeneration as simulation or separate
inspected live receipts. Retain private evidence; never automatically relabel
it. Rollback is reverting this implementation commit; no persistence changes.

This focused subset does not touch Nest/React/browser, SQL, GitHub Actions,
Prometheus/Grafana or SAST implementation. Their broad Phase 12 skills do not
own an edited surface here. No matching standalone Node/Bash CLI reference is
available in the loaded security skill; use verified repository contracts and
behavioral tests. Consult the existing threat model; no new architecture
decision, provider selection or full threat-model report is requested.

## Verification, review and completion

1. Inspect installed formatting tools; check changed JS/Markdown without
   dependency installation and preserve unrelated formatting. Quote output.
2. Run `bash -n scripts/ops/run-deployment-drill.sh`,
   `npm run ops:deployment-test`, `npm run ops:readiness-test`,
   `npm run ops:readiness-schema-test` and `npm run ops:launch-drill-test`.
   Do not run standalone operational drills against inherited/live targets.
3. Run `npm run ops:templates`, `npm run ops:check`, `npm run lint`,
   `npm run typecheck`, `npm run build` and `git diff --check`. Follow current
   permissions for registry audit/network or execution retries. Disclose blocked
   checks; never bypass checks or report historical output as current.
4. Run `node scripts/ops/check-launch-readiness.js
   infra/launch/readiness.example.json`. It must still fail closed. Quote
   actual category/blocker counts; leave the unresolved example unchanged.
5. Inspect the complete diff and dispatch the independent read-only reviewer
   required by `requesting-code-review`, with this prompt, baseline/HEAD SHAs,
   working-tree diff, changed files and actual check results. Evaluate findings
   using `receiving-code-review`; verify before fixes, rerun affected checks and
   re-review significant changes. No planning subagent is needed.
6. Record the contract and compatibility impact in owning docs. Correct current
   deployment runbook, Category 10, Stage 3 description and sign-off row to
   distinguish preflight from separate live release-bound evidence. Qualify
   dated historical claims without erasing their recorded verification. Explain
   limits of the DDL heuristic, structural drain assertions, source references
   and unauthenticated receipts. Prompt 201 and Phase 12 remain open.
7. Stage only approved changes and this prompt, inspect the staged diff, and
   commit locally to `main` using `caveman-commit`. Do not push. Give safe
   inspection commands: `npm run ops:deployment-test` and
   `npm run ops:readiness-test`.

## SKILLS USED

- `deployment-pipeline-design` — separate preflight gates from actual promotion/rollback and preserve release approval semantics.
- `error-handling-patterns` — strict child validation and fixed, private-safe Category 10 failures.
- `javascript-testing-patterns` — separate simulation/live fixtures and hermetic actual-producer regressions.
- `secrets-management` — keep private operator references and diagnostic data out of public blockers and test environments.
- `security-best-practices` — secure-by-default JavaScript evidence parsing; no matching standalone CLI reference is available.
- `security-threat-model` — consult and update the existing launch-evidence integrity boundary and limitations.
- `requesting-code-review` — dispatch the independent implementation reviewer after self-verification.
- `receiving-code-review` — verify reviewer findings against the approved contract before fixes.
- `caveman-commit` — write the required local implementation commit message.
