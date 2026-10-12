# Phase 12K — Validate reconciliation comparison options

## Scope and why this is next

Continue the open Phase 12 recovery-evidence gate in `docs/build-plan.md`
§§13–14 after committed Prompt 308 (`ec5ab7b`). Inventories now validate, but
comparison options still rely on JavaScript coercion. Offline planning probes
returned `clean` for a missing quarantined object with
`excludeQuarantined: "false"`, with `bucket: 42`, and with infinite quarantine
retention. An unsupported execution mode was echoed into the report. A global
ignore regex excluded storage but then treated the same DB key as missing.
These are fixture observations, not production incidents. Make valid comparison
policy explicit and matching independent of regex state.

The user instructed implementation when planning is finished. Write and re-read
this prompt, then execute without another permission question.

## References and API authority

- `AGENTS.md`: phase control, prompt, verification, review and local commit.
- `docs/build-plan.md` §§13–14 and committed Prompts 305–308 records.
- `docs/skills.md`: bounded continuation skill selection.
- `docs/operations.md`: Restore & Drill Execution, Prompts 306–308.
- `docs/launch-checklist.md` Category 6: simulation versus live acceptance.
- `docs/security.md`: recovery evidence and Prompts 306–308 boundaries.
- `docs/system-architecture.md` §11: recovery and diagnostic boundaries.
- `scripts/ops/reconcile-storage-objects.js`, `.spec.js`, `.ts`: existing pure
  helper, adapter, runner, publication and type contracts.
- `scripts/ops/run-launch-drills.sh` Stage 7 and root `package.json` gates.
- Local Node runtime probes: coercion, `RegExp.source`/`flags`, `lastIndex`,
  Date validation and isolated regex matching. Verify these before coding.

No visual changes or measurements: comps and Next/React/Tailwind APIs do not
apply. No installed skill owns framework-free Node option validation; use the
inspected implementation and runtime probes. The security skill has no Node
CLI reference; use its general validation/redaction guidance.

## Impact and compatibility

No routes, flags, SQL, inventory contracts, state/checksum policy, receipt
publication, report schema or Stage 7 caller change. The programmatic helper
rejects malformed known options instead of coercing them. Preserve omitted and
explicit-undefined defaults, nullable filters, empty-string filters (existing
no-filter meaning), fractional retention days, valid Date/string clocks,
simulation/live modes and empty/custom regex lists. Unknown option fields remain
ignored; this is not an extensibility-breaking allowlist. Valid global/sticky
regexes remain supported with deterministic per-key matching from index zero.
No caller regex, options object, Date or inventory is mutated.

Do not expand into runner dependency-lifecycle refactoring, new options,
scope inference, state/date/checksum inventory validation, retries/timeouts,
resource caps, schema/tenancy changes, dependency changes, live services,
production drills, online audit, deployment, push or launch approval. Hostile
getters/proxies/regex overrides, catastrophic regex cost, cross-realm objects,
inventory authenticity/completeness, snapshot consistency and byte integrity
remain outside this ordinary programmatic-input boundary.

## Implementation steps

1. Add behavior-focused regressions in the existing Node spec before changing
   source. Retain all 192 prior tests. Demonstrate red coercion and regex-state
   behavior using valid inventories, including empty inventories so validation
   cannot be skipped for a zero-object report.
2. Add a small private option-normalization/validation boundary in the JS
   utility. `options` must be a non-null, non-array object. Throw a fixed,
   value-free `Reconciliation options are invalid` Error for malformed known
   options. Keep omitted/undefined defaults. Validate before comparison filters
   execute and before any report is returned.
3. Known option contract:
   - `bucket`, `organizationId`, `prefix`: undefined/default, null or string;
     preserve text exactly, including empty/opaque whitespace strings.
   - `excludeQuarantined`, `failOnOrphans`: undefined/default or actual boolean.
   - `quarantineRetentionDays`: undefined/default 7 or finite nonnegative number
     whose conversion to milliseconds is at most `Number.MAX_SAFE_INTEGER`.
     Zero disables age-window exclusion; fractional days remain supported.
   - `now`: undefined/default current Date, a valid Date, or a nonempty string
     accepted by the existing Date parser with finite epoch milliseconds. Reject
     null, numbers, booleans, objects and invalid Date/string clocks. Do not add
     a new canonical timestamp grammar to the existing Date/string interface.
   - `ignorePatterns`: undefined/default `DEFAULT_IGNORE_PATTERNS`, or dense
     array of actual RegExp instances. Reject null, nonarrays, holes, strings
     and objects that merely expose `.test`. Empty array means no ignores.
   - `execution_mode`: undefined/default `simulation`, or exactly `simulation`
     or `live`. This preserves the runner's existing mode selection; it does
     not authenticate a live report.
4. Clone each validated regex using source/flags; perform every match with
   internal `lastIndex` reset to zero. Preserve all flags, including global and
   sticky, and never change the caller's regex state. Use one private matching
   helper consistently for storage and database keys. Do not introduce new
   exports or a validation package.
5. Use normalized options for filters, retention, clock and report mode. Keep
   the existing comparison/exclusion algorithm otherwise intact. Keep inventory
   validation before filters. Preserve CLI signatures and TypeScript facade;
   no signature changes are necessary for this runtime validation.
6. Test the runner with an invalid effective bucket from an injected env plus
   injected inventories: fixed execution error, exit 1, no summary/success log,
   staging artifact or receipt. Keep valid injected runner receipts unchanged.

## Acceptance coverage

- Null/array/primitive option containers reject with the exact fixed error;
  ordinary and null-prototype option records work. Unknown fields stay ignored.
- Each filter rejects nonstrings/non-null values even for empty inventories.
  Valid nullable/empty/opaque filters and organization/bucket/prefix scoping
  retain behavior.
- String/number/null boolean options reject; true/false exclusion and orphan
  policies still work. Missing quarantine objects cannot be hidden by a string
  `"false"`. Valid true exclusion still intentionally excludes them.
- Negative/nonfinite/coercible/overflow retention rejects; zero, fractional
  and seven-day retention produce expected missing/excluded outcomes, including
  the exact retention boundary. Valid and invalid clocks exercise validation.
- Invalid/sparse regex lists reject. Default markers, empty list and multiple
  custom regexes work. Global/sticky patterns, nonzero caller `lastIndex`,
  repeated calls and reordered keys yield the same comparison results; frozen
  caller regex/options/Date objects are usable without mutation.
- Only supported modes appear in valid reports. Invalid modes reject, with no
  input sentinel reflected by errors. Runner failure publishes nothing.
- All prior listing, inventory, publication, clean/error/orphan, query and CLI
  tests remain intact.

## Verification, review and completion

Re-read this prompt and confirm every named skill is loaded at implementation.
Run runtime API probes; focused red then green tests (`npm run
ops:reconcile-test`); changed-region Prettier comparisons; changed JS syntax
checks; `npm run lint`, `npm run typecheck`, `npm run build`; help command and
`git diff --check`. Run every independent offline stage in `ops:check` with
separate recorded output. Omit online `ops:audit` under the standing metadata
disclosure restriction and do not claim the aggregate passed. Record failed
attempts and unchanged permitted reruns where sandbox limits require them.

Self-review the complete diff, then dispatch the independent read-only reviewer
required by `requesting-code-review`, with baseline SHA, actual working diff,
this prompt and real checks. Verify feedback with `receiving-code-review`, fix
valid issues and recheck; re-review significant changes. After review record
implementation, planning fixtures, compatibility, exact outputs, limitations
and ordinary revert rollback in `docs/operations.md`; add concise records in
`docs/build-plan.md`, Category 6 of `docs/launch-checklist.md`, and
`docs/security.md`. Prompt 201, Category 6 live approval and Phase 12 exit stay
open. Stage only prompt, JS utility/spec and those four docs. Inspect staged
diff and commit locally to main using `caveman-commit` with the evidence-integrity
reason. Return commit ID and safe help/test instructions; no push.

## SKILLS USED

- `architecture-patterns`: preserve pure comparison and adapter boundaries.
- `deployment-pipeline-design`: keep Stage 7 evidence fail-closed.
- `error-handling-patterns`: reject malformed policy before partial success.
- `secrets-management`: keep diagnostics free of private option/provider data.
- `security-best-practices`: validate evidence policy inputs securely by default.
- `javascript-testing-patterns`: coercion, determinism and publication regressions.
- `requesting-code-review`: dispatch independent review after self-verification.
- `receiving-code-review`: verify findings and recheck valid fixes.
- `caveman-commit`: required local commit and concise security rationale.

Other full-phase skills are conditional: no server/framework, SQL, CI workflow,
telemetry/dashboard, SAST, browser/E2E, visual or architectural decision change.
Load the relevant owner if scope changes; do not silently broaden the task.
