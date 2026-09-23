# 165 — require release image binding for launch approval

## Scope and why this is next

The committed baseline is `c8f5dc4` on `main`, with a clean worktree before
this prompt. All ordered product phases reach the Phase 12K repository gate;
actual Phase 12 launch approval still needs operator decisions, published images,
provenance inspection, and live drills. Prompt 163 pinned production Compose
images, and prompt 164 recorded reviewed source, current and prior digest pairs,
and evidence. This is the earliest dependency-safe Phase 12 follow-up: the
standard `npm run ops:launch-readiness -- <record>` path invokes
`scripts/ops/launch-readiness.sh`, which runs `check-launch-readiness.js` **without**
`--bind-images`. The CLI currently binds `release.current` to exported
`ACRES_CLIENT_IMAGE`/`ACRES_SERVER_IMAGE` only when that optional flag is
present. Consequently, a fully approved record can produce a passing launch
result while the current shell has absent or different release image inputs.

Make image binding mandatory for any approved `deployment_and_rollback`
section, through both the direct Node CLI and the aggregate shell command.
Keep the checked-in, unapproved template runnable without release exports so
CI's inert checks remain useful. This closes a local approval-path bypass; it
does not prove cryptographic provenance, registry publication, deployment, or
operator sign-off.

## References read for planning

- `AGENTS.md` §§2–7, 8.2, 9–10; `docs/build-plan.md` Phase 12 (§13),
  sequence gate (§14), and Phase 12K evidence record (§22).
- `docs/operations.md` release evidence binding, CI state, preflight/deploy
  sequence; `docs/launch-checklist.md` category 10 and final sign-off;
  `docs/security.md` TM-18. These own the implemented-state update.
- `scripts/ops/check-launch-readiness.js`: `validateReadiness()`'s
  `deployment_and_rollback` block at approximately lines 435–530 checks the
  release record and gates environment matching on `options.bindImages ===
  true`; `main()` at approximately lines 598–652 defaults the flag to false.
  Re-read exact lines at execution.
- `scripts/ops/launch-readiness.sh`: after baseline checks it invokes the Node
  CLI with only the record path, so the documented `ops:launch-readiness`
  command currently omits binding. `package.json` maps that script to the
  shell wrapper. `.github/workflows/ci.yml` runs `ops:check` against the inert
  template and does not run an operator-approved launch.
- `scripts/ops/check-launch-readiness.spec.js`: synthetic fully approved
  fixture, release-record negative matrix, explicit bound-mode test, and CLI
  subprocess test. `scripts/ops/check-release-images.js` owns the digest
  grammar and is unchanged.
- No visual reference applies: this changes an operator CLI gate, focused
  tests, and runbooks. No component, route, breakpoint, or measurement is
  involved.

## Implementation contract

1. In `scripts/ops/check-launch-readiness.js`, remove the *approval-bypassing*
   optional behavior. When `sections.deployment_and_rollback.status` is
   `approved`, `validateReadiness()` must require both current image environment
   values and compare each exactly to `release.current.client_image` and
   `.server_image`. Accept an explicit `options.env` for deterministic tests;
   production CLI passes `process.env`. A missing value or mismatch is a
   `deployment_and_rollback` blocker. Messages name the field or environment
   variable only; never echo an operator-supplied image, secret, or full record.
   Preserve all prompt-164 record validation, registry-prefix checks, and
   local/external evidence-reference checks. If the section is unresolved,
   do not require image exports solely for checking the inert template.
2. The direct CLI must enforce the invariant with its ordinary documented
   invocation, `node scripts/ops/check-launch-readiness.js <record>`. Decide
   whether to accept `--bind-images` as a backward-compatible no-op alias or
   remove it and update all references; choose one behavior and cover it in
   tests. There must be no CLI flag or environment setting that allows a fully
   approved record to pass unbound. Unknown options still fail with usage.
   `scripts/ops/launch-readiness.sh` must inherit the same behavior without
   requiring operators to remember a flag. Preserve `--with-drills`, `--help`,
   and existing baseline checks.
3. Update `scripts/ops/check-launch-readiness.spec.js` with a behavioral
   matrix: fully approved record + exact pair passes; no exports, one absent,
   swapped images, one mismatch, and both mismatched fail; diagnostics redact
   deliberately sensitive supplied values; unapproved template still reports
   its existing operator blockers without manufacturing image-env blockers;
   ordinary direct CLI and aggregate wrapper both refuse approval without the
   matching pair. Keep tests hermetic with synthetic records and environment
   variables; do not use production secrets, registry calls, or live drills.
   Refactor the synthetic fixture or test helper so every existing approved
   record assertion explicitly supplies its expected pair. Do not use global
   mutable `process.env` as a shortcut that can hide missing-env cases.
4. Update `docs/operations.md` and `docs/launch-checklist.md`: the normal
   `ops:launch-readiness` and direct Node commands must be run in the release
   shell with the exact current pair exported, followed by the existing
   release-image preflight and Compose `config --quiet` in that shell. State
   that the template still intentionally fails without exports because it is
   unapproved. Remove any wording that makes binding sound optional or specific
   to `--bind-images`. Update `docs/security.md` TM-18 in place to record that
   approved CLI launch checks always compare the recorded pair to the exported
   pair; keep the still-open cryptographic and operator-owned boundaries clear.

## Impact, failure cases, and compatibility

- No API, UI route, database schema, migration, image build, CI publication,
  or production deployment changes. Operator launch validation gets stricter:
  any previously passing approved record with absent or mismatched image
  exports must fail until the exact pair is present. The checked-in template
  remains unresolved and nonzero with no exports; CI `ops:check` remains
  independent of production registry values.
- The pair comparison is a local consistency check. It cannot validate image
  existence, digest signature, attestation origin, source-to-image linkage,
  successful promotion, or a live rollback. Those remain separate operator
  approval gates in the existing runbook.
- Roll back this implementation by reverting the validator, focused tests,
  and documentation together. Do not relax image grammar, use mutable tags,
  add a bypass flag, or mutate the readiness template to make a test pass.

## Verification and execution sequence

1. On approval, re-read this prompt, `AGENTS.md`, owning docs, scoped code,
   and every skill below. Record `BASE_SHA`, `HEAD_SHA`, and initial status.
   Verify the actual shell/Node behavior against checked-in code before edit.
2. Run `npm run ops:readiness-test` and `npm run ops:release-images-test`.
   Exercise the direct CLI and `npm run ops:launch-readiness -- <synthetic-file>`
   with exact, absent, and mismatched pairs. Capture exit codes and redacted
   output. Run `npm run ops:launch-readiness` on the checked-in template and
   report its expected nonzero result, not as a pass. Run `npm run ops:check`
   and `npm run ops:templates`; use no actual production values.
3. Run `npm run lint`, `npm run typecheck`, `npm run build`,
   `npm run contracts:check`, and `git diff --check`. Quote the real outputs and
   inspect the full scoped diff. Broaden tests only for a concrete remaining
   risk. If a required check is blocked by unavailable network/process/Docker
   support, report the actual failure and do not claim it passed.
4. Dispatch a reviewer subagent using `requesting-code-review` with the
   requirement, scoped paths, `BASE_SHA`/`HEAD_SHA`, actual checks, and the
   local-consistency limit. Evaluate findings against code with
   `receiving-code-review`, fix confirmed issues, recheck, and request a
   follow-up review for material gate changes. Record implementation and
   verification in `docs/operations.md`; stage only scoped paths, inspect the
   staged diff, then commit locally to `main` using `caveman-commit`. Do not
   push.

## Non-goals

- Registry/provider selection, OCI publication, signing/attestation
  verification, protected GitHub promotion, and live operator approval; these
  need operator-owned inputs outside this repository.
- Changing the 11-category readiness schema, approving any category, or
  changing the no-AI production posture.
- Any visual surface. At 375, 800, and 1280 pixels, UI behavior is unchanged.

## SKILLS USED

- `deployment-pipeline-design` — preserve release approval, evidence, and
  rollback ordering while closing the standard-command bypass.
- `github-actions-templates` — verify that CI's inert template checks remain
  separate from operator launch approval; no workflow edit is planned.
- `secrets-management` — keep environment values out of errors and fixtures.
- `javascript-testing-patterns` — exercise actual CLI and wrapper outcomes,
  missing exports, mismatches, and redaction.
- `security-best-practices` — assess the Node gate's fail-closed behavior and
  diagnostic handling; no broad security report is in scope.
- `security-threat-model` — reconcile this release approval boundary with the
  existing TM-18 record; no new threat-model artifact is in scope.
- `requesting-code-review` — dispatch Stage 1 reviewer after self-verification.
- `receiving-code-review` — verify and address reviewer findings.
- `caveman-commit` — write the required local commit message at execution.
