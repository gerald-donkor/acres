# 107 — make parser summary metadata validation fail closed

## Scope, and why it is next

The committed repository is on `main` at `47a3e73`
(`refactor(ingestion): reject empty response ids`, the prompt 106
implementation). All 12 ordered phases in `docs/build-plan.md` are implemented
and committed through the Phase 12K exit gate, followed by the dependency-safe
residual hardening prompts 68–106.

There is no unbuilt ordered phase left. The next smallest unblocked residual is
the Phase 7 child-process parser IPC validation gap explicitly deferred by
prompt 106: `validateUntrustedSummary()` rejects malformed rows, issues, and
details, but its `metadata` branch silently discards an invalid metadata
container, too many entries, oversized keys, unsupported values, and oversized
string values. The rest of the child success summary is then accepted and the
parent returns it with `metadata: {}` or with only the surviving entries.

That behavior conflicts with the existing fail-closed treatment of every other
untrusted summary field and makes a malformed child payload look conformant.
This prompt makes metadata validation atomic: valid metadata is copied exactly;
any invalid metadata property rejects the entire summary and the unchanged
executor maps it to the fixed `parser_execution_failed` result. It introduces
no new public contract, limit, message, code, route, database shape, or valid
parser behavior.

Prompt-file state is not implementation state. The untracked files
`prompts/92-remapping-compatibility-message-narrowing.md` and
`prompts/93-parsed-observation-quality-message-narrowing.md` are older prompt
artifacts whose implementations are already committed in `ff18e5e` and
`2a3e26b`. Leave both files untouched and untracked; do not stage them.

## Reference material read for it, by path

- `AGENTS.md` — §2 workflow, phase-control resolution rules, §5 prompt-file
  contract, §6 checks, §10 evidence rules, and the ALWAYS review/commit ledger.
- `docs/build-plan.md` — Phase 7 ingestion outcome, hostile-parser test and
  fail-safe requirements, skill manifest, and the rule against inventing open
  operational limits.
- `docs/ingestion.md` — `Child-process parser isolation`, especially the
  untrusted IPC validation paragraph; this is the owning implementation record.
- `docs/security.md` — TM-07 and the parser-isolation boundary: child responses
  are untrusted, bounded, and fail closed. This task strengthens that existing
  boundary; it does not create or move a trust boundary.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` —
  `ChildProcessParserExecutor.execute()`, `createSafeErrorSummary()`,
  `isParserChildResponse()`, and the complete `validateUntrustedSummary()`
  implementation. Re-read exact lines at execution time rather than editing
  from this prompt's snapshot.
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` — the
  fake child-process harness, executor safe-failure tests, and the current
  `describe('validateUntrustedSummary', ...)` cases.
- `server/src/ingestion/parsers/parser.types.ts` —
  `ParsedSourceSummary.metadata: Record<string, unknown>` and the surrounding
  parser summary contract; the type remains unchanged.
- `server/src/ingestion/parsers/{csv-source.parser.ts,xlsx-source.parser.ts,
geojson-source.parser.ts,parse-source-buffer.ts}` — every production metadata
  producer. Their current values are plain objects with no more than four
  scalar entries, so they remain valid without modification.
- `server/src/ingestion/parsers/parser-ipc.types.ts` and
  `parser-child.entry.ts` — the IPC response envelope and child sender; both are
  reference-only and remain unchanged.
- `prompts/104-parser-child-response-guard-hardening.md`,
  `prompts/105-parser-child-request-guard-hardening.md`, and
  `prompts/106-parser-child-response-id-nonempty-hardening.md` — the immediately
  preceding bidirectional IPC hardening sequence and the explicit metadata
  deferral this prompt resolves.

No visual reference is applicable. This is an internal server-only validation
change, so the PDF, landing PNGs, and recorded chrome flows provide no evidence
for it and must not be opened or cited as if they did.

## Measurements and verified invariants

These are code-enforced bounds already present at `47a3e73`; re-verify them in
the source before editing:

1. `MAX_STRING_LENGTH = 200` applies to metadata keys and string values.
   Exactly 200 characters remains valid; 201 is rejected.
2. Metadata permits at most 20 own enumerable string-keyed entries. Exactly 20
   remains valid; 21 is rejected.
3. Permitted metadata values remain exactly the current scalar allowlist:
   `null`, `string`, `number`, or `boolean`. Do not add arrays, nested objects,
   `bigint`, symbols, functions, coercion, serialization, or recursive walking.
4. `metadata` is required by `ParsedSourceSummary`. A conformant child success
   summary must therefore carry a non-null, non-array object. Missing,
   `undefined`, `null`, primitive, and array containers reject the summary
   instead of becoming `{}`.
5. Empty metadata `{}` remains valid. Empty keys and non-finite numbers are
   accepted by the current allowlist and are outside this prompt; do not invent
   a new key grammar or numeric-finiteness rule without separately established
   product/security evidence.
6. The metadata copy remains a newly constructed object containing only the
   validated scalar entries. Do not return the untrusted object by reference.
7. Every committed production parser currently emits a plain metadata object
   within these bounds: CSV uses scalar encoding/delimiter/header/formula
   fields, XLSX uses scalar sheet-selection/formula fields, GeoJSON uses scalar
   SRID/CRS/coordinate-count fields, and error summaries use `{}`. Their output
   value, order, and shape must not change.
8. The executor's existing failure mapping remains unchanged. When
   `validateUntrustedSummary()` returns `null`, `execute()` settles with
   `createSafeErrorSummary(expectedKind, 'parser_execution_failed',
'Parser execution failed.')`; no rejected metadata value reaches a database,
   response, or log.

Current problematic structure, shown only to identify the branch (re-read the
real file before editing):

```ts
const metadata: Record<string, unknown> = {};
if (/* metadata is a non-null, non-array object */) {
  const metaEntries = Object.entries(summary.metadata);
  if (metaEntries.length <= 20) {
    for (const [mk, mv] of metaEntries) {
      // Invalid entries are skipped.
    }
  }
}
```

Required semantic structure:

```ts
if (
  summary.metadata === undefined ||
  summary.metadata === null ||
  typeof summary.metadata !== "object" ||
  Array.isArray(summary.metadata)
) {
  return null;
}

const metadata: Record<string, unknown> = {};
const metaEntries = Object.entries(summary.metadata);
if (metaEntries.length > 20) return null;

for (const [mk, mv] of metaEntries) {
  if (mk.length > MAX_STRING_LENGTH) return null;
  if (
    mv !== null &&
    typeof mv !== "string" &&
    typeof mv !== "number" &&
    typeof mv !== "boolean"
  ) {
    return null;
  }
  if (typeof mv === "string" && mv.length > MAX_STRING_LENGTH) return null;
  metadata[mk] = mv;
}
```

Equivalent formatting that follows the repository lint style is acceptable.
The behavior and bounds are not negotiable.

## Expected impact

- Routes changed: none.
- Public REST/GraphQL/OpenAPI/SDL contracts changed: none.
- Database schema, Prisma model, migration, RLS, or persisted data changed:
  none.
- Valid CSV/XLSX/GeoJSON parser flows: byte-for-byte equivalent summary
  semantics.
- Malformed child success summaries: any invalid metadata container or entry
  now rejects the whole summary and produces the existing deterministic safe
  parser failure instead of partial or empty metadata.
- Logging/observability: unchanged; rejected child metadata is not logged.

## Implementation plan

1. In
   `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`, extend
   the existing `validateUntrustedSummary` suite before changing production
   code:
   - keep the conformant-summary case and additionally assert that its valid
     metadata survives unchanged;
   - add a boundary case proving exactly 20 entries and exactly 200-character
     key/string values are accepted and preserved;
   - add table-driven or clearly grouped negative cases for missing metadata,
     `undefined`, `null`, a primitive, and an array;
   - add negative cases for 21 entries, a 201-character key, a 201-character
     string value, a nested object, and an array value;
   - include at least one mixed metadata object with valid entries plus one
     invalid entry and assert the entire summary is `null`, proving no partial
     sanitization remains;
   - use the existing full minimal valid summary shape as a fixture/helper only
     if doing so reduces repetition without obscuring the malformed field under
     test. Do not introduce a broad test abstraction for this small matrix.
2. In the executor-level suite in the same file, add one integration-style
   fake-child case:
   - start `execute()` and read the generated request id from
     `fakeChild.sentMessages`;
   - emit a structurally valid success response whose complete summary differs
     only by one invalid metadata value (a nested object is sufficient);
   - assert the resolved result is the existing safe summary with the fixed
     `parser_execution_failed` issue and empty metadata;
   - assert the raw invalid metadata content is absent from the serialized
     result and the child is cleaned up. Do not add a new failure code/message.
3. Run the focused spec and confirm the new rejection assertions fail against
   the current silent-drop behavior for the expected reason. Do not commit a
   red test state.
4. In
   `server/src/ingestion/parsers/child-process-parser.executor.ts`, replace
   only the permissive metadata block inside `validateUntrustedSummary()` with
   fail-closed validation matching the verified invariants above:
   - reject an absent or invalid container;
   - reject more than 20 entries;
   - reject an oversized key;
   - reject a value outside the scalar allowlist;
   - reject an oversized string value;
   - copy every validated entry into the new `metadata` object.
5. Touch no other validator branch. In particular, do not change row/column
   bounds, `sampleRows`, `validationRows`, issues/details handling,
   `ISSUE_CODE_REGEX`, `MAX_ISSUES_COUNT`, `MAX_STRING_LENGTH`, response-id
   validation, failure literals, watchdog behavior, or process lifecycle.
6. Run focused regression tests for the executor and all three real parser
   producers. If a production parser fails because it emits non-scalar or
   missing metadata, stop and report the contradicted premise rather than
   weakening the guard or changing parser output opportunistically.
7. Update `docs/ingestion.md` in the `Child-process parser isolation` / untrusted
   IPC validation paragraph. Record that metadata is now required to be a
   non-null, non-array object of at most 20 scalar entries with 200-character
   key/string limits, and that any violation rejects the whole summary rather
   than silently dropping entries. State that valid parser output and the
   existing safe-error contract are unchanged.
8. Self-verify, inspect the complete diff, and run the two-stage review loop:
   - dispatch a read-only reviewer subagent using `requesting-code-review` with
     the prompt path, `BASE_SHA=47a3e73`, the implementation `HEAD_SHA` or
     working-tree diff context, changed paths, and real check outputs;
   - evaluate every finding through `receiving-code-review`; verify it against
     source and requirements before changing code;
   - re-run affected tests after any valid fix; request follow-up review only if
     feedback causes significant architecture, public-contract, data-flow, or
     security-boundary changes.
9. Commit locally on `main` using `caveman-commit`. Stage only:
   - `prompts/107-parser-summary-metadata-fail-closed.md`;
   - `server/src/ingestion/parsers/child-process-parser.executor.ts`;
   - `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`;
   - `docs/ingestion.md`.
     Leave the unrelated untracked prompt 92/93 files untouched and unstaged. Do
     not push.

## Non-goals

- No changes to `ParsedSourceSummary`, `ParserIssue`, `ParserLimits`, or any IPC
  TypeScript interface.
- No new metadata schema per source kind, key allowlist, empty-key rule,
  finite-number rule, aggregate byte limit, recursive object support, or shared
  validator abstraction. Each would require separate evidence and scope.
- No change to the existing constants: 20 metadata entries and 200 characters
  are retained, not re-measured or replaced.
- No changes to CSV, XLSX, GeoJSON, or `parseSourceBuffer` producers unless a
  focused regression exposes that the verified premise is false; in that case,
  stop rather than expanding scope.
- No changes to `isParserChildResponse()`, `isParserChildRequest()`,
  `isParserLimits()`, `parser-child.entry.ts`, or parser process isolation.
- No changes to issue/details validation, including its current 10-entry and
  200-character bounds.
- No schema migration, repository, tenant/RLS, worker, queue, storage, route,
  API contract, client, design, accessibility, motion, or browser work.
- No general parser-validator refactor and no cleanup of unrelated style or
  test code.
- No staging or deletion of the unrelated untracked prompt 92/93 files.

## Reference deltas

No visual delta; this is server-only. The deliberate behavior delta is that a
child success summary containing any invalid metadata is rejected atomically.
Previously, the same payload could be accepted with partial or empty metadata.
Valid summaries and public output remain unchanged.

## Breakpoint behaviour

Not applicable. No UI changes at 375, 800, or 1280 pixels, and no browser suite
is required for this internal server-only change.

## Checks to run, and the owning doc

```bash
# Focused parent-boundary and executor behavior
npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts

# Real parser-producer compatibility
npm --workspace=@acres/server test -- source-parsers.spec.ts
npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts

# Public contracts must remain unchanged
npm run contracts:check

# Required repository verification
./node_modules/.bin/prettier --check \
  prompts/107-parser-summary-metadata-fail-closed.md \
  docs/ingestion.md \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/parsers/child-process-parser.executor.spec.ts
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short
git diff --stat
git diff -- \
  prompts/107-parser-summary-metadata-fail-closed.md \
  server/src/ingestion/parsers/child-process-parser.executor.ts \
  server/src/ingestion/parsers/child-process-parser.executor.spec.ts \
  docs/ingestion.md
```

Quote the real exit status and meaningful pass/build totals in the completion
report. If a named parser spec does not exist, identify the actual repository
test file with `rg --files server/src/ingestion/parsers`, run the closest
focused equivalent, and record that evidence rather than inventing a result.
Browser E2E, real PostgreSQL, and operations drills are deliberately omitted
because this scope touches none of those surfaces.

`docs/ingestion.md` owns the implementation record. Update no other canonical
doc unless implementation evidence proves a statement there has become stale.

## Rollback and stop conditions

Rollback is a source/test/doc revert; there is no migration or persisted-data
rollback. Stop before expanding scope if any of these occur:

- a committed production parser emits missing, non-object, oversized, or
  non-scalar metadata;
- a public contract snapshot changes;
- a valid parser summary changes shape or values;
- the change requires a new limit, error code/message, schema, or parser output
  rewrite;
- focused tests show that malformed metadata is intentionally tolerated by a
  documented consumer.

Report the evidence and prepare a separate prompt if the premise is false.

## Completion criteria

- `validateUntrustedSummary()` requires a non-null, non-array metadata object.
- At most 20 scalar metadata entries are accepted; exactly 20 remains valid.
- Metadata keys and string values are bounded at 200 characters; exactly 200
  remains valid.
- Any invalid container or entry rejects the entire summary; no partial or
  silent-drop behavior remains.
- A fake-child executor test proves invalid metadata resolves to the existing
  fixed safe failure without leaking the rejected value.
- Current CSV, XLSX, GeoJSON, and compiled child-process parser tests pass.
- Contracts, format, lint, typecheck, build, whitespace, diff, and status checks
  pass with real output recorded.
- The two-stage requesting/receiving review loop is complete and all verified
  blocking/important findings are fixed and re-tested.
- `docs/ingestion.md` records the new fail-closed metadata invariant.
- Only the four approved paths are committed locally to `main`; the unrelated
  untracked prompt 92/93 files remain untouched; nothing is pushed.

## SKILLS USED

- `nestjs-best-practices` — keep validation inside the existing Nest ingestion
  service boundary and validate untrusted cross-process input before use.
- `architecture-patterns` — preserve the parent-supervisor/child-parser port
  boundary with no new module or domain dependency.
- `error-handling-patterns` — replace silent partial acceptance with fail-fast,
  deterministic safe failure at the correct boundary.
- `security-best-practices` — apply strict allowlist validation to the untrusted
  TypeScript IPC payload without leaking rejected content.
- `javascript-testing-patterns` — boundary-value, negative-matrix, and
  executor-path Jest coverage for the fail-closed behavior.
- `requesting-code-review` — dispatch the mandatory structured read-only review
  with precise requirements, changed paths, SHAs, and verification evidence.
- `receiving-code-review` — verify reviewer claims against repository reality
  before applying fixes or pushing back.
- `caveman-commit` — produce the required terse Conventional Commit message
  with security rationale in the body if the subject alone is insufficient.

Deliberately excluded as inapplicable: `postgres-best-practices` and
`sql-optimization-patterns` (no schema/query work), `api-design-principles` and
`openapi-spec-generation` (no public contract change), `e2e-testing-patterns`
and `playwright` (no cross-system/browser journey), and `security-threat-model`
(the existing TM-07 boundary is strengthened but not added or moved).
