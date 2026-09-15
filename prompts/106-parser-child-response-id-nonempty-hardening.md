# 106 — require non-empty `id` in `isParserChildResponse` parent IPC guard

## Scope, and why it is next

The committed repository is on `main` at `21087d5`
(`refactor(ingestion): harden child request guard`, i.e. the prompt 105
implementation). All 12 ordered phases in `docs/build-plan.md` are implemented
and committed through the Phase 12K exit gate (verification records §§16–22,
operator checklist in `docs/launch-checklist.md`), plus residual follow-ups 68
(saved-view `schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70
(hourly `exports.purge-expired` reclamation), 71 (download-time expiry
enforcement), 72 (incompatible-metric-remap pre-publication validation), 73
(unexpected publication-failure message sanitization), 74 (`parser_exception`
fixed message), 75 (`worker_exception` fixed message), 76 (infected
`scanResult` bounded to `'infected'`), 77 (scheduled-job `JobRun.message` fixed
strings), 78 (`jobs.read` owner/admin gate on `GET /jobs/runs`), 79 (shared
`RETENTION_PURGE_BATCH_LIMIT = 500` across all five purges), 80
(`IngestionProcessorService.fail()` narrowed to the fixed publication
code/message union), 81 (inline `validation_failed` write narrowed to fixed
literals), 82 (`ExportFailure` narrowed to the fixed export failure union), 83
(`ScanResult.errorCode` narrowed to the fixed scan-error union plus `'infected'`
/ `'failed'` status fallbacks), 84 (`OutboxService` retry/dead-letter writes
narrowed to the fixed dispatch-exhausted union), 85 (`JobRunsService.finish()`
narrowed to the fixed job-run message union), 86 (`invalidValue()` message
narrowed to the 3 fixed observation-quality literals), 87
(`createSafeErrorSummary()` message narrowed to the 2 fixed parser-executor
literals), 88 (`parsePeriod()` message narrowed to the fixed `period_invalid`
literal), 89 (`validateMapping()` in `analytics-publication.service.ts` message
narrowed to the 5 fixed mapping-validation literals), 90
(`malformedMetricMappingIssues()` message narrowed to the 3 fixed
mapping-shape literals), 91 (private `IngestionProcessorService.validateMapping()`
message narrowed to the 4 fixed region-mapping literals), 92
(`validateRemappingCompatibility()` message narrowed to the single fixed
remapping literal), 93 (`ParsedObservation` quality carrier message narrowed to
the 4 fixed observation-quality literals), 94
(`validateRemappingCompatibility()` code narrowed to the single fixed
`metric_definition_incompatible` literal), 95
(`malformedMetricMappingIssues()` code narrowed to the single fixed
`metric_mapping_invalid` literal), 96 (`validateMapping()` code narrowed to the
5 fixed mapping-validation literals), 97 (private
`IngestionProcessorService.validateMapping()` code narrowed to the 4 fixed
region-mapping literals), 98 (`parsePeriod()` code narrowed to the single fixed
`period_invalid` literal), 99 (`invalidValue()` code narrowed to the fixed
2-literal union `'value_missing' | 'value_invalid'`), 100
(`ParsedObservation` quality carrier code narrowed to the 3 fixed
observation-quality literals), 101 (`createSafeErrorSummary()` code narrowed
to the 2 fixed parser-executor literals), 102 (`ParserChildErrorResponse`
message narrowed to the 2 fixed child error message literals), 103
(`ParserChildErrorResponse` code narrowed to the fixed parser-child error code
literal `'parser_execution_failed'`), 104 (`isParserChildResponse` runtime
guard hardened and dead executor timeout comparison eliminated), and 105
(`isParserChildRequest` runtime guard hardened with `isParserLimits` and
non-empty `id`/`mediaType` validation plus malformed-request integration test).

Note on prompt files vs committed state (§10 rule 5): `prompts/92-…` and
`prompts/93-…` exist on disk as untracked files; their implementations landed
in `ff18e5e` (`refactor(analytics): narrow remapping message`) and `2a3e26b`
(`refactor(analytics): narrow quality carrier message`). Committed state is
resolved from `git log`, not from prompt files. This prompt leaves those two
untracked files untouched — do not stage them.

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion — child-process
parser isolation IPC contract, directly concluding the bidirectional IPC
hardening begun in prompts 43, 74, 87, 101, 102, 103, 104, and 105),
dependency-safe against prompts 68–105 (no schema, migration, contract,
route, permission, timeout/memory-bound, retention-window, or version-marker
change).

The gap is a one-condition asymmetry between the two IPC guards, verifiable by
reading the two files side by side:

1. Child receiver side, `server/src/ingestion/parsers/parser-child.entry.ts`
   (prompt 105, `isParserChildRequest`): requires non-empty identifiers —
   `typeof req.id === 'string' && req.id.trim().length > 0` and
   `typeof req.mediaType === 'string' && req.mediaType.trim().length > 0`.
2. Parent receiver side,
   `server/src/ingestion/parsers/child-process-parser.executor.ts`
   (`isParserChildResponse`, hardened in prompt 104): checks only
   `typeof res.id !== 'string'` before discriminating on `res.type`. An empty
   string `''` or whitespace-only `'   '` id passes the guard and the function
   still claims `value is ParserChildResponse`.

Practical impact is bounded defense-in-depth, stated honestly: the message
handler (`child.on('message', …)`) additionally compares
`rawMessage.id !== requestId` where `requestId` is a `randomUUID()` that is
never empty, so an empty-id response already settles to the safe
`parser_execution_failed` summary through the existing mismatch branch. No
valid flow changes value, order, or shape. The defect is that the guard's
type predicate over-claims: it certifies IPC conformance for payloads that
violate the non-empty-id invariant the counterpart guard enforces. This prompt
closes that asymmetry at the guard level with zero runtime behavior change on
valid flows.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, ingestion/publication
  surface) with its skill manifest; §§16–22 confirming 12E–12K committed;
  §1 rule that open numeric limits need real input and must not be invented
  (why no new limit, timeout, or bound appears here).
- `docs/ingestion.md` — § Child-process parser isolation (the untrusted-IPC
  validation paragraph recording `isParserChildResponse()` strict
  discrimination and the counterpart `isParserChildRequest()` /
  `isParserLimits()` strict request validation); the owning record for the
  doc update. Resolve the exact paragraph lines from the file — do not cite
  line numbers from memory.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` — the
  `child.on('message', …)` handler with the `!isParserChildResponse(…) ||
  rawMessage.id !== requestId` mismatch branch (verify exact lines from the
  file, ~161–171 at prompt-105 time), and `isParserChildResponse()`
  (verify exact lines from the file, ~292–313 at prompt-105 time, currently
  `if (typeof res.id !== 'string') return false;`).
- `server/src/ingestion/parsers/parser-child.entry.ts` — `isParserChildRequest()`
  (verify exact lines from the file, ~38–59 at prompt-105 time) with the
  `req.id.trim().length > 0` non-empty rule to mirror, and `isParserLimits()`
  (~11–36, untouched reference).
- `server/src/ingestion/parsers/parser-ipc.types.ts` (all 39 lines:
  `ParserChildRequest`, `ParserChildSuccessResponse`,
  `ParserChildErrorResponse`, `ParserChildResponse`) — the wire shape,
  untouched.
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts` —
  the `describe('isParserChildResponse', …)` block (verify exact lines from
  the file, ~547–658 at prompt-105 time: accepts valid success/error,
  rejects unknown code / arbitrary message / missing fields / non-string id /
  missing summary / non-object payloads) as the test pattern to extend. Note
  what is absent: no empty-string-id or whitespace-only-id case exists.
- `server/src/ingestion/parsers/compiled-child-process-parser.spec.ts` —
  compiled child integration pattern (valid UUID-id flows must stay green;
  no new integration test needed because prompt 105 already covers the
  malformed-request child path and this prompt changes no child behavior).
- `prompts/104-parser-child-response-guard-hardening.md` (parent-guard
  pattern hardened here) and `prompts/105-parser-child-request-guard-hardening.md`
  (child-guard non-empty rule and `trim().length > 0` idiom to mirror).

## Measurements and verified invariants

1. Current parent guard (read from the file at implementation time; the
   snippet below is the prompt-105-time shape — re-verify before editing,
   do not edit from memory):
   ```ts
   export function isParserChildResponse(
     value: unknown,
   ): value is ParserChildResponse {
     if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
     const res = value as Partial<ParserChildResponse>;
     if (typeof res.id !== 'string') return false;
     if (res.type === 'success') { … }
     if (res.type === 'error') { … }
     return false;
   }
   ```
   The gap: `typeof res.id !== 'string'` accepts `''` and `'   '`.

2. Required hardening, mirroring the child-side idiom exactly:
   ```ts
   if (typeof res.id !== 'string' || res.id.trim().length === 0) return false;
   ```
   `trim()` (not bare `length`) so whitespace-only ids are rejected, matching
   `isParserChildRequest`. No other line of the guard changes: the
   top-level null/array rejection, the `success` summary-object check, and
   the `error` exact code/message-literal checks from prompt 104 stay
   byte-identical.

3. Handler invariant (no change): `child.on('message')` keeps
   `if (!isParserChildResponse(rawMessage) || rawMessage.id !== requestId)`
   followed by the existing safe-`parser_execution_failed` settle. Valid
   flows use `randomUUID()` request ids, never empty, so acceptance of valid
   responses is unchanged. Empty-id responses move from "guard passes,
   mismatch branch settles safe error" to "guard rejects, same mismatch
   branch settles the identical safe error" — one identical outcome via a
   stricter predicate.

4. Wire contract invariant: `docs/api/contracts.md` / `generate-contracts.ts`
   untouched — verify with `npm run contracts:check`. IPC guard strictness is
   not a wire-contract literal.

## Expected impact

- Routes touched: None (internal child-process parser IPC boundary,
  parent receiver side only).
- APIs / schemas touched: None.
- Valid parent/child IPC flows behave byte-identically; hostile or corrupt
  empty/whitespace-id responses are rejected one predicate earlier and settle
  to the same deterministic safe blocking issue via the unchanged mismatch
  branch. No new branch, no new message, no new code literal.

## Implementation plan

1. `server/src/ingestion/parsers/child-process-parser.executor.ts`:
   - In `isParserChildResponse()`, replace the id check
     `if (typeof res.id !== 'string') return false;` with
     `if (typeof res.id !== 'string' || res.id.trim().length === 0) return false;`.
   - Touch nothing else in the file: not the message handler, not the
     `success`/`error` discrimination, not `validateUntrustedSummary()`,
     not `createSafeErrorSummary()`, not `ISSUE_CODE_REGEX`,
     `MAX_ISSUES_COUNT`, or `MAX_STRING_LENGTH`. If the one-line change does
     not compile or any valid-path test fails, stop: the premise (pure
     strictness increase with identical valid-flow acceptance) is broken.
2. `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`:
   - Inside `describe('isParserChildResponse', …)`, add cases proving
     rejection of empty and whitespace-only ids for BOTH discriminated
     shapes, e.g.:
     - `{ type: 'success', id: '', summary: { … } }` → `false`;
     - `{ type: 'success', id: '   ', summary: { … } }` → `false`;
     - `{ type: 'error', id: '', code: PARSER_CHILD_EXECUTION_FAILED_CODE,
       message: PARSER_CHILD_EXECUTION_FAILED_MESSAGE }` → `false`;
     - `{ type: 'error', id: '   ', code: PARSER_CHILD_EXECUTION_FAILED_CODE,
       message: PARSER_CHILD_MALFORMED_REQUEST_MESSAGE }` → `false`;
     - existing valid `id: 'req-1'` success/error cases still → `true`.
   - Do NOT add, remove, or reword any existing asserted value. If any
     existing spec constructs a response with an empty id and expects `true`,
     stop and explain — the premise is broken.
3. Spec checks:
   - `npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts`
   - `npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts`
   - `npm --workspace=@acres/server test -- parser-child.entry.spec.ts`
     (untouched, must stay green as the counterpart-guard regression check).
4. Full repository verification:
   - `npm run contracts:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm run build`
5. Documentation update:
   - Update `docs/ingestion.md` child-process parser isolation section with
     one clause beside the prompt 104/105 sentences recording that
     `isParserChildResponse()` additionally rejects empty/whitespace-only
     response ids, mirroring the child-side non-empty `id` rule
     (defense-in-depth; valid UUID-id flows unchanged; mismatch branch
     outcome identical). No new semantics; say so in the summary.
6. Two-stage code review:
   - Dispatch reviewer subagent via `requesting-code-review` with BASE/HEAD
     SHAs and the exact one-line guard diff plus new spec cases as context.
   - Evaluate reviewer feedback via `receiving-code-review` with codebase
     verification before any fix.
7. Commit:
   - Commit locally to `main` using `caveman-commit`. Stage ONLY the three
     approved paths (executor, executor spec, `docs/ingestion.md`) plus the
     new prompt file per repo convention. Leave the untracked
     `prompts/92-…` / `prompts/93-…` files untracked and unmodified.

## Non-goals

- No changes to `parser-child.entry.ts` (`isParserChildRequest` /
  `isParserLimits` already hardened in prompt 105).
- No changes to `parser-ipc.types.ts` (`ParserChildRequest`,
  `ParserChildResponse` shapes untouched).
- No changes to `ParserLimits` or `parser.types.ts` (including the shared
  `ParserIssue.message: string` / `code: string` carrier — narrowing it
  would force every parser, mapping, and remapping producer into one change
  and is separately scoped if ever).
- No changes to `validateUntrustedSummary()` — including its metadata
  handling, which silently drops oversized/invalid metadata entries instead
  of returning `null` like the issues/sampleRows/validationRows paths. That
  silent-drop-vs-fail-closed inconsistency is real, is explicitly deferred
  as a separately scoped hardening step, and must not ride along in this
  one-line guard change. Name it in the summary so it is not mistaken for
  an oversight.
- No changes to `createSafeErrorSummary()`, `validateUntrustedSummary()`
  issue code/message validation, or `ISSUE_CODE_REGEX`.
- No changes to `parseSourceBuffer.ts` or parser engines.
- No database schema migrations or Prisma model alterations.
- No changes to read APIs, client types, contracts, permissions,
  timeout/memory bounds, retention windows, or version markers.
- No browser suites for this server-only change (state this; do not run
  them).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: IPC responses that previously passed the
parent type guard with an empty or whitespace-only `id` no longer pass it.
No committed valid runtime path changes value, order, or shape — the same
safe-error settle handles them through the unchanged mismatch branch.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run, and the owning doc

```bash
# Targeted specs (must all pass)
npm --workspace=@acres/server test -- child-process-parser.executor.spec.ts
npm --workspace=@acres/server test -- compiled-child-process-parser.spec.ts
npm --workspace=@acres/server test -- parser-child.entry.spec.ts

# Wire contracts check (expected: passes unchanged)
npm run contracts:check

# Lint check
npm run lint

# Typecheck
npm run typecheck

# Full production build
npm run build

# Diff hygiene; stage only approved files (leave prompts/92 + prompts/93 untracked)
git diff --check
git status --short
```

The owning documentation is `docs/ingestion.md`.

## SKILLS USED

- `nestjs-best-practices` — NestJS service and child-process IPC structure; no provider, wiring, module, or service-shape change.
- `architecture-patterns` — clean parent-supervisor vs child-parser boundary; guard symmetry across the IPC seam with no new module edges.
- `error-handling-patterns` — fail-closed predicate strictness; identical safe-error settle through the unchanged mismatch branch.
- `security-best-practices` — untrusted cross-process payload defense; non-empty-id invariant enforced before discrimination.
- `javascript-testing-patterns` — negative boundary tests (empty / whitespace-only ids on both success and error shapes) plus valid-path regression.
- `requesting-code-review` — structured dispatch of reviewer subagent with BASE/HEAD SHAs and the exact guard diff (§2.1 Stage 1).
- `receiving-code-review` — technical evaluation and codebase verification of reviewer feedback before any fix (§2.1 Stage 2).
- `caveman-commit` — conventional commit formatting with concise why-over-what rationale (ALWAYS rule, §3/§7).
- Loaded and deliberately not used: `postgres-best-practices` / `sql-optimization-patterns` (no migration, column, or query-plan change), `api-design-principles` / `openapi-spec-generation` (no contract change — verified by `contracts:check`), `e2e-testing-patterns` / `playwright` (server-only change, no browser surface), `security-threat-model` (no trust-boundary change — isolation posture unchanged).
