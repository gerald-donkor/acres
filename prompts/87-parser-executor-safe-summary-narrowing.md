# 87 — narrow `createSafeErrorSummary()` message to the fixed parser-executor message union

## Scope, and why it is next

The committed repository is on `main` at `d43c1b3`
(`refactor(analytics): narrow quality message union`, i.e. prompt 86). All 12
ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus residual follow-ups 68 (saved-view
`schemaVersion`), 69 (frozen dashboard-evidence `schemaVersion`), 70 (hourly
`exports.purge-expired` reclamation), 71 (download-time expiry enforcement),
72 (incompatible-metric-remap pre-publication validation), 73 (unexpected
publication-failure message sanitization), 74 (`parser_exception` fixed
message), 75 (`worker_exception` fixed message), 76 (infected `scanResult`
bounded to `'infected'`), 77 (scheduled-job `JobRun.message` fixed strings),
78 (`jobs.read` owner/admin gate on `GET /jobs/runs`), 79 (shared
`RETENTION_PURGE_BATCH_LIMIT = 500` across all five purges), 80
(`IngestionProcessorService.fail()` narrowed to the fixed publication
code/message union), 81 (inline `validation_failed` write narrowed to fixed
literals), 82 (`ExportFailure` narrowed to the fixed export failure union),
83 (`ScanResult.errorCode` narrowed to the fixed scan-error union plus
`'infected'` / `'failed'` status fallbacks), 84 (`OutboxService`
retry/dead-letter writes narrowed to the fixed dispatch-exhausted union), 85
(`JobRunsService.finish()` narrowed to the fixed job-run message union), and
86 (`invalidValue()` narrowed to the 3 fixed observation-quality literals).

There is no unbuilt ordered phase left, so this prompt scopes the smallest
unblocked residual gap, parent Phase 7 (geography and ingestion — the
child-process parser-isolation surface, continuing the prompt 43 fault
containment / prompt 74 sanitization lineage and the prompts 80–86
writer-narrowing lineage), dependency-safe against prompts 68–86 (no schema,
migration, contract, route, permission, timeout/memory-bound, or
version-marker change).

The gap is the last open-`string` producer into the durable validation-issue
path that still compiles with an arbitrary string. `createSafeErrorSummary()`
in `server/src/ingestion/parsers/child-process-parser.executor.ts`
(lines 251–272), already bounds `message` at runtime with
`message.slice(0, MAX_STRING_LENGTH)` and allow-lists `code` via
`ISSUE_CODE_REGEX` fallback, but leaves `message` open at the type level:

```ts
function createSafeErrorSummary(
  sourceKind: SourceKind,
  code: string,
  message: string,
): ParsedSourceSummary {
```

Its output flows verbatim via `summary.issues[].message` through
`IngestionProcessorService` `validationIssue.createMany`
(`ingestion-processor.service.ts:167–185`, `message: issue.message`) into the
durable `ValidationIssue.message` column, and is served verbatim by
`IngestionService.listIssues`
(`ingestion.service.ts:327–336`, `message: issue.message`). Any future caller
passing `String(error)`, `(error as Error).message`, or `describe(child)`
would persist raw exception text, paths, or child internals into a column that
survives in PostgreSQL backups and restore drills and is served to every
future reader. That is the exact inversion prompts 80–86 eliminated on the
ingestion/export/scan/outbox/job-run/observation-quality surfaces; this
prompt closes it at the type level with zero runtime behavior change.

Today's 9 `createSafeErrorSummary()` call sites (the complete set — the
function is module-private and a repo-wide search for
`createSafeErrorSummary` returns only its definition plus these 9 sites, all
inside the same file) pass only 2 message literals:

| call site | code today | message today |
| --- | --- | --- |
| fork threw (`child-process-parser.executor.ts:74`) | `'parser_execution_failed'` | `'Parser execution failed.'` |
| watchdog timeout (`:114`) | `'parser_execution_timed_out'` | `'Parser execution timed out.'` |
| child `error` event (`:125`) | `'parser_execution_failed'` | `'Parser execution failed.'` |
| child `exit` before response (`:135`) | `'parser_execution_failed'` | `'Parser execution failed.'` |
| malformed/mismatched IPC (`:146`) | `'parser_execution_failed'` | `'Parser execution failed.'` |
| child `type: 'error'` (`:157`; code is `rawMessage.code \|\| 'parser_execution_failed'`) | open code, regex-allow-listed inside helper | `'Parser execution failed.'` |
| untrusted summary rejected (`:173`) | `'parser_execution_failed'` | `'Parser execution failed.'` |
| `child.send` callback error (`:197`) | `'parser_execution_failed'` | `'Parser execution failed.'` |
| `child.send` threw (`:207`) | `'parser_execution_failed'` | `'Parser execution failed.'` |

No spec calls `createSafeErrorSummary()` directly: specs execute through
`executor.execute()` with a fake `forkFn` and assert the same fixed literals
(`child-process-parser.executor.spec.ts`: timeout literal, failed literal, and
the no-raw-leakage `/secret/path` negative assertion) — verify exact line
numbers from the file, do not cite them from memory, and do not reword any
asserted value.

## Reference material read for it, by path

- `docs/build-plan.md` — Phase 7 definition (§8, geography/ingestion and its
  skill manifest) with §§16–22 confirming 12E–12K committed; §1 rule that
  open numeric limits need real input and must not be invented (why no new
  message value appears here — only narrowing to the existing produced set).
- `docs/ingestion.md` — Child-process parser isolation section (executor,
  least-privilege environment, untrusted IPC validation, `parser_execution_failed`
  / `parser_execution_timed_out` safe issues) and the `ValidationIssue`
  durable-record paragraph; the owning record for the doc update. Resolve the
  exact paragraph lines from the file — do not cite line numbers from memory.
- `server/src/ingestion/parsers/child-process-parser.executor.ts` (516 lines;
  read 50–215 for all 9 call sites, 251–272 for the helper, 283–478 for
  `validateUntrustedSummary` bounds proving the second open-`message` path is
  a separately scoped taxonomy) — the helper, the call-site matrix above, the
  `ISSUE_CODE_REGEX` / `MAX_STRING_LENGTH` runtime guards that stay untouched.
- `server/src/ingestion/ingestion-processor.service.ts` (`validationIssue.createMany`
  at ~167–185, `message: issue.message` — proves the durable write; `fail()`
  at ~399–421 already narrowed by prompt 80 — untouched).
- `server/src/ingestion/ingestion.service.ts` (`listIssues` at ~310–339,
  qualities mapped verbatim — proves no contract-shape change; the read value
  stays a string).
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`
  (timeout/failed/no-leak assertions) — existing coverage that must stay green.
- `prompts/86-observation-quality-message-narrowing.md` (writer-narrowing
  pattern, constant-placement rule, and negative-probe procedure to mirror),
  `prompts/80-*.md` through `prompts/85-*.md` plus `prompts/74-*.md` and
  `prompts/43-*.md` (lineage premise).
- Verified closed this session, no change: `ingestion-processor.service.ts`
  (`fail()` narrowed by prompt 80; `VALIDATION_FAILURE_*` narrowed by prompt
  81), `reports.service.ts` (`ExportFailure` narrowed by prompt 82),
  `upload-worker.service.ts` + `scanner.port.ts` (prompts 75/76/83),
  `outbox.service.ts` (prompt 84), `jobs/job-runs.service.ts` (prompt 85),
  `analytics-publication.service.ts` (`invalidValue()` narrowed by prompt 86;
  `parsePeriod` fixed literal and `validateMapping` fixed literals untouched),
  `geoboundaries-import.service.ts` / `geoboundaries-provider.ts` /
  `postgis-region-geometry.repository.ts` (thrown-only or read-only
  classification, nothing persisted).

## Measurements and procedures (no eyeballed numbers)

No comp measurement is involved (server-only, type-only change). The
normative matrix is derived from the existing code:

| producer / value | value today | after |
| --- | --- | --- |
| 9 `createSafeErrorSummary` messages | any `string` compiles (the gap) | only the 2 fixed literals compile (`typeof` constants or an inline literal union) |
| `code` param | `string` with runtime regex fallback | unchanged — the `ISSUE_CODE_REGEX` allow-list stays the guard for the one open-code site (`rawMessage.code \|\| 'parser_execution_failed'`) |
| `ValidationIssue.message` column / REST `issues[].message` | `string` | unchanged — read shape, no contract change |
| spec literals (`Parser execution failed.`, `Parser execution timed out.`, no-`/secret/path`) | assert fixed values | unchanged |
| `.slice(0, MAX_STRING_LENGTH)` runtime bound | present | unchanged |

The guard is compile-time, so verification includes a deliberate temporary
negative probe: pass a `string`-typed variable (e.g. an `(error as Error).message`
value) as `createSafeErrorSummary()`'s `message`, confirm `tsc` rejects it,
quote the error, then revert the probe. The probe is not committed.

## Expected impact — which routes change, and how

- **No route changes.** No controller, contract, OpenAPI artifact, SDL shape,
  permission, purge behavior, parser bound, timeout, memory ceiling, aggregate,
  or schedule change. Parser isolation behaves byte-identically; all 9
  fallback summaries carry the same strings as today, now type-checked.
- `docs/api/contracts.md` / `generate-contracts.ts` untouched — verify with
  `npm run contracts:check` and state that it passes unchanged
  (`issues[].message` stays a string on the wire).

## Implementation steps

1. `server/src/ingestion/parsers/child-process-parser.executor.ts`: narrow
   `createSafeErrorSummary()`'s `message` parameter from `string` to the union
   of the 2 fixed literals from the matrix above (exported `as const`
   constants with `typeof` union preferred, mirroring prompts 84/85/86;
   module-private unless a spec needs the import — the specs assert through
   `execute()`, so module-private is the expected outcome). All 9 call sites
   must compile unchanged with no casts. If any needs a cast — e.g. a message
   is not exactly one of the 2 literals — stop: the union is wrong and the
   premise of this prompt is broken. Leave the `code` parameter (`string`,
   regex-allow-listed), the `.slice(0, MAX_STRING_LENGTH)` bound,
   `validateUntrustedSummary` (separately scoped untrusted-child taxonomy),
   `ParserIssue.message` (`string` — the shared issue shape), the `createMany`
   shape, and the executor class untouched. If the narrow rewrite requires
   touching any of those, stop — the premise is broken.
2. Spec expectations: no changes expected (fixed literals only). If any spec
   asserts a message literal, keep the identical literal; only move to a const
   import if the implementation exports one. Do NOT add, remove, or reword any
   asserted value. If any spec reaches `createSafeErrorSummary()` with a raw
   string (the pre-prompt-80-style case — verified absent since specs execute
   through `execute()` with fake fork, but re-verify), re-point it at the
   fixed set rather than enshrining it; if re-pointing changes asserted
   behavior, stop and explain.
3. Run the temporary negative probe from the matrix above; quote the `tsc`
   rejection; revert the probe before staging.
4. Docs in the same change: `docs/ingestion.md` — one clause recording that
   `createSafeErrorSummary()` accepts only the 2 fixed literals
   (compile-time guard; runtime values unchanged; raw child/exception text
   never reaches `ValidationIssue.message` via this helper; the `code`
   regex fallback and length bound are unchanged). No new semantics; say so
   in the summary.
5. Then the §2.1 two-stage review loop (`requesting-code-review` subagent
   with BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
   verification) and the `caveman-commit` message.

## Non-goals

- No new message text, code, or severity.
- No `code`-param narrowing (the `ISSUE_CODE_REGEX` fallback for
  `rawMessage.code` stays the guard; changing it would alter IPC failure
  semantics).
- No `validateUntrustedSummary` / `ParserIssue` taxonomy change (broader
  untrusted-child producer surface, separately scoped if ever).
- No `validateMapping` / `malformedMetricMappingIssues` / region-mapping
  message change (broader validation taxonomy, separately scoped if ever).
- No `MAX_STRING_LENGTH`, `MAX_ISSUES_COUNT`, timeout, or memory-bound change.
- No schema or migration change: the `ValidationIssue` table is untouched;
  only the TypeScript parameter narrows.
- No permission change.
- No `JobRun` self-retention purge (prompts 79/84/85 name it: five ticks
  write ≥ five rows an hour with no reclamation, but the window is an
  explicit open operator decision per `docs/operations.md`
  `data_retention_policy`; build-plan §1 forbids inventing it).
- No live Docker drills (restart/orphan/Garage/Valkey/ClamAV remain future
  operational work per prompts 72–84).
- No OS/container sandboxing (fault containment only, per
  `docs/ingestion.md`; infrastructure concern).
- No ingestion/export/scan/outbox/job-run/observation-quality failure-code
  change (prompts 80–86 own those surfaces; verify they stay green).

## Reference deltas

None visual (server-only). The one deliberate property delta, stated so it
is not mistaken for a regression: code that previously compiled when passing
an arbitrary string as the executor fallback message no longer compiles. No
committed runtime path changes value, order, or shape.

## Breakpoint behaviour

Not applicable — no UI is added or altered at 375, 800, or 1280. State this
in the completion summary; do not run browser suites for this change.

## Checks to run (§6), with real quoted output

- `npm run lint` (all three workspaces, exit 0).
- `npm run typecheck` (shared + client + server, Prisma 7.9.1 generation) —
  including the temporary negative probe rejection, quoted, then reverted.
- Targeted server suite: `child-process-parser.executor.spec.ts` (all
  timeout/failed/no-leak assertions) plus `parse-source-buffer.spec.ts` and
  `ingestion-processor.service.spec.ts`, then the full `npm run test:server`
  — do not claim the full suite from a targeted run.
- `npm run contracts:check` (expected: passes unchanged; if it fails, stop —
  no contract artifact should move for this change).
- `git diff --check` and `git status --short` review; stage only approved
  files.
- Then the §2.1 two-stage review loop (`requesting-code-review` subagent with
  BASE/HEAD SHAs, `receiving-code-review` evaluation with codebase
  verification) and the `caveman-commit` message.
- Record the result in `docs/ingestion.md` in the same change.

## SKILLS USED

- `architecture-patterns` — const/union placement beside the module-private
  helper vs the 9 call sites (no new module edges; mirrors prompts 84/85/86
  layering).
- `nestjs-best-practices` — no provider, wiring, module, or service-shape
  change.
- `security-best-practices` — durable-column sanitization; raw child and
  exception text never reaches persisted validation-issue rows via this helper.
- `error-handling-patterns` — fixed executor-failure taxonomy preserved;
  compile-time guard so verbatim text can never reach
  `ValidationIssue.message` (fail-fast at the type level).
- `javascript-testing-patterns` — existing executor specs stay green in
  expectation; negative type-probe procedure.
- `requesting-code-review` — Stage 1 reviewer subagent dispatch after
  self-verification (§2.1).
- `receiving-code-review` — Stage 2 technical evaluation of review feedback
  before any fix.
- `caveman-commit` — the commit message (ALWAYS rule, §3/§7).
- Loaded and deliberately not used: `postgres-best-practices` /
  `sql-optimization-patterns` (no migration, column, or query-plan change),
  `api-design-principles` / `openapi-spec-generation` (no contract change —
  verified by `contracts:check`), `e2e-testing-patterns` / `playwright`
  (server-only change, no browser surface), `security-threat-model` (no trust
  boundary change — fault containment is unchanged and still not an OS
  sandbox).
