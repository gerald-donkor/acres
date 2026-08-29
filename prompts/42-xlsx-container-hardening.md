# 42 - XLSX macro and encrypted-container hardening

## Scope and why it is next

`18dbbcf` is the current committed `main` tip and records the Phase 11A/Phase
12 no-AI launch reconciliation. The ordered product phases now have committed
foundations, but their canonical records retain dependency-safe hardening gaps.

The first unresolved Phase 7 safety gap that can be completed without choosing
a geography provider, operator-owned production values, or a new product
workflow is XLSX container hardening. `docs/ingestion.md` records that
`read-excel-file` currently reports parse failures but does not deliberately
reject encrypted or macro-enabled workbooks. These upload bytes are untrusted;
they must be classified before the spreadsheet parser reads them. This prompt
implements that bounded parser-layer safeguard.

Do **not** implement the adjacent `RegionGeometry` raw-SQL helper in this
increment. There is no approved provider geography import or mapping contract
that associates an uploaded GeoJSON feature with a global `Region`. Adding a
write helper without an authorized caller would either be dead code or invent
geography-publication semantics.

## Reference material read while preparing this prompt

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5–10: prompt-first workflow,
  phase selection, verification/review/commit requirements, and no-fabrication
  rule.
- `docs/build-plan.md` §§1, 8, 13–14: Phase 7 parser safety boundary, Phase 12
  launch hardening, sequencing, and exit evidence.
- `docs/ingestion.md` §§Current boundary, Parser behavior, Worker publication
  flow, and Residual gaps: current 25 MiB/row/column limits, the parser-only
  storage boundary, and the exact macro/encryption gap.
- `docs/security.md` §12 and TM-07/TM-17: untrusted parser input, bounded
  parsing, safe validation issues, and the restriction against unsafe raw SQL.
- `docs/system-architecture.md` §9.1 and the Phase 7 status: reject unsafe
  parser input before publication; preserve durable, restartable worker state.
- `server/src/ingestion/parsers/xlsx-source.parser.ts`,
  `parser-utils.ts`, `parser.types.ts`, `source-parser.service.ts`, and
  `source-parsers.spec.ts`: the existing source-parser contract and its
  established test fixture style.
- `server/src/ingestion/ingestion-processor.service.ts`: parser issues become
  bounded durable `ValidationIssue` rows and prevent publication.
- `server/src/uploads/dto/initiate-upload.dto.ts` and
  `server/src/config/env.validation.ts`: XLSX is the existing accepted media
  type; do not expand that allowlist.
- Installed `read-excel-file` 9.3.10 and its declared `fflate` dependency;
  local `fflate` 0.8.3 is MIT. Its checked declarations expose asynchronous
  `unzip(data, { filter })`, whose metadata filter can examine ZIP entry names
  without extracting their contents.
- `.agents/skills/security-best-practices/SKILL.md` and its
  `javascript-express-web-server-security.md` reference; the relevant
  requirements are to treat uploaded bytes as untrusted, use bounds, avoid raw
  errors/secrets in responses/logs, and prefer vetted libraries.
- `.agents/skills/nestjs-best-practices/SKILL.md`,
  `.agents/skills/error-handling-patterns/SKILL.md`, and
  `.agents/skills/javascript-testing-patterns/SKILL.md`.

No static design comp applies: this is server-side parser behavior, with no
route, client, visual, breakpoint, or motion change. The applicable measured
limits are the existing `PARSER_MAX_BUFFER_BYTES = 25 * 1024 * 1024` (25 MiB)
and the existing parser row, column, cell, sample, feature, and coordinate
limits. Preserve them; do not introduce an unmeasured upload-size or expansion
limit in this prompt.

## SKILLS USED

- `nestjs-best-practices` — keep the parser as a focused injected Nest leaf and
  preserve the existing worker/service boundary.
- `security-best-practices` — classify hostile uploaded containers safely,
  avoid error disclosure, and keep the existing media-type/security controls.
- `error-handling-patterns` — convert expected hostile-container/parser
  failures into stable, bounded validation outcomes instead of leaked errors.
- `javascript-testing-patterns` — add hermetic unit fixtures for positive and
  hostile XLSX container paths.
- `requesting-code-review` — request the mandatory reviewer subagent after
  self-verification, with actual base/head SHAs and check results.
- `receiving-code-review` — evaluate each reviewer claim against the code and
  requirements before making a correction.
- `caveman-commit` — form the concise Conventional Commit message required for
  the final local commit to `main`.

## Required implementation

### 1. Make XLSX container inspection a small, explicit parser helper

1. Add `server/src/ingestion/parsers/xlsx-container-inspector.ts` (or an
   equivalently focused sibling with that single responsibility). It accepts
   only a `Buffer` and returns a typed, bounded classification; it must not
   write files, call the network, execute a process, log raw bytes, or touch
   Prisma/worker state.
2. Promote the already lockfile-present MIT `fflate` **0.8.3** to a direct
   runtime dependency of `@acres/server`, then regenerate the root lockfile
   using the normal root-workspace npm workflow. Do not rely on the incidental
   transitive hoist from `read-excel-file`, and do not add a second spreadsheet
   parser, an antivirus engine, or a native ZIP binary.
3. Preserve the current 25 MiB raw-buffer check as the first, cheapest check in
   `XlsxSourceParser`. Only inspect a buffer within that limit.
4. Detect and reject the Office encrypted-package/OLE compound-file signature
   (`D0 CF 11 E0 A1 B1 1A E1`) before `readSheet()` is invoked. Classify it as a
   stable blocking parser issue such as `encrypted_workbook_unsupported`; do
   not attempt password handling, decryption, or fallback parsing.
5. For ZIP-based OOXML containers, use the vetted `fflate` archive metadata
   filter to enumerate entry names without extracting worksheet contents.
   Treat entry names case-insensitively and reject a macro payload represented
   by `xl/vbaProject.bin` (including an equivalent path after ZIP path
   normalization) with a stable blocking issue such as
   `macro_enabled_workbook_unsupported`. Do not scan arbitrary compressed
   payload bytes for a substring, and do not treat a filename/MIME declaration
   as proof of safety.
6. Reject malformed, encrypted-at-ZIP-layer, unsupported-compression, or
   otherwise unreadable containers as a stable blocking `invalid_xlsx_container`
   issue when metadata inspection fails. Do not surface the library exception,
   archive entry name, upload filename, password hint, stack, or raw bytes to a
   client, a persisted issue, or a log.
7. Cap inspection at a small constant number of ZIP entries derived from the
   existing 25 MiB upload limit (for example, an explicit `MAX_XLSX_ENTRIES`
   documented beside the helper). If the archive exceeds it, return a blocking
   `xlsx_entry_limit_exceeded` issue. Select the exact value only after
   inspecting normal minimal/workbook fixtures and record why it is a parser
   abuse guard rather than a customer product limit. Do not silently truncate
   inspection or continue to `readSheet()` after the cap is crossed.
8. Preserve ordinary `.xlsx` behavior: a normal OOXML workbook still reaches
   `readSheet()`, the first-sheet rule remains unchanged, formula-looking cell
   values remain data with the existing warning, and all current row/column/
   cell limits retain their exact codes and semantics.

### 2. Make expected parser failure fail closed and safely

1. Integrate the helper in `XlsxSourceParser.inspect()` before `readSheet()`.
   Its rejection must return the existing empty XLSX summary shape with one
   blocking `ParserIssue`, zero rows/columns/samples/validation rows, and the
   existing `sourceKind: 'xlsx'` metadata. Extend metadata only with static,
   non-sensitive classification if it aids internal diagnostics; never persist
   ZIP entry names or parser exception text.
2. Catch `readSheet()` failures after a container has passed inspection and
   convert them to the same stable `invalid_xlsx_container` validation outcome.
   This prevents malformed user input from reaching the generic worker catch,
   which currently could persist a library-derived failure message. Do not
   broadly catch failures outside the XLSX parser or recategorize storage,
   queue, database, cancellation, or analytics-publication failures.
3. Do not change public REST paths, DTOs, OpenAPI/GraphQL schema, upload media
   allowlists, RLS, queue payloads, dataset-version identity, or browser UI.
   The existing ingestion flow should turn a returned blocking parser issue into
   `validation_failed`, leave mapping validation invalid, create no published
   version/observations/aggregates, and continue to use its existing safe issue
   table/API presentation.

### 3. Test concrete behavior without external services

Extend `server/src/ingestion/parsers/source-parsers.spec.ts` or add a tightly
scoped sibling spec. Keep fixtures in memory using the established `fflate`
`zipSync` pattern; never use real customer files, passwords, macros, network,
or a database.

Required cases:

1. The current minimal, benign `.xlsx` fixture still summarizes its first
   sheet and retains the formula-as-data warning.
2. An OOXML ZIP containing `xl/vbaProject.bin` returns only the stable macro
   blocking issue and does not invoke spreadsheet parsing. Use a spy/mock at
   the module boundary only if needed to prove the latter without coupling to
   `read-excel-file` internals.
3. A Buffer beginning with the encrypted Office compound-file magic returns
   the encrypted-workbook issue and does not invoke spreadsheet parsing.
4. Corrupt/non-ZIP bytes and malformed ZIP metadata return the stable invalid
   container issue, with no thrown raw parser/library text.
5. A container exceeding the exact entry cap returns the entry-limit issue,
   without extracting entries or calling `readSheet()`.
6. Every rejection produces no validation rows/sample rows and has an error
   severity, so `IngestionProcessorService` treats it as validation failure.
7. Existing CSV, GeoJSON, and XLSX limit/formula unit cases remain green.

If direct helper tests are clearer than parser tests, include both pure-helper
and parser integration coverage. Do not make a live Garage, Valkey, ClamAV,
PostGIS, or browser dependency a prerequisite for these deterministic tests.

### 4. Update the implemented-state records

1. Update `docs/ingestion.md`: replace the XLSX residual gap with the actual
   fail-closed encrypted/macro/container policy, direct `fflate` dependency,
   entry-count guard, stable issue outcomes, and test evidence. Keep the
   unrelated GeoJSON/PostGIS, provider-import, and dependency-capable proof
   gaps explicit.
2. Update `docs/security.md` Phase 7A parser-control/residual-risk language to
   state that encrypted and macro-enabled XLSX containers are rejected before
   workbook parsing, while hostile parser isolation and the remaining GeoJSON
   PostGIS-write work remain outstanding. Do not claim full malware scanning or
   external-worker isolation from this change.
3. Update `docs/backend.md` only if its Phase 7A parser description would
   otherwise contradict the new implementation. Do not alter product scope,
   production-launch status, or the no-AI posture.

## Explicit non-goals

- No geography provider selection, reference-region import, `RegionGeometry`
  persistence helper, PostGIS SQL, schema migration, or GeoJSON behavior
  change. Those need an approved source/provenance and region-mapping contract.
- No password support, macro stripping/sanitization, workbook repair, Office
  automation, arbitrary ZIP extraction, or user-configurable parser limits.
- No ClamAV/real storage/queue infrastructure change, client UI change,
  endpoint/contract change, or launch-readiness approval.
- No mutation of existing upload data, dataset versions, analytics, reports,
  dashboards, AI preview, tenancy/RLS, or operational operator-owned values.

## Verification and handoff

Run the focused parser unit suite first, then the repository gates:

```bash
npm run test --workspace=@acres/server -- --runInBand
npm run prisma:validate --workspace=@acres/server
npm run lint
npm run typecheck
npm run build
npm run test:server
npm run contracts:check
npm run ops:check
git diff --check
git status --short
git diff --cached --check
git diff --cached --stat
```

Quote the real command output. If the environment cannot run the real
database-backed server suite, report its exact failure and run every
deterministic parser/format/type/contract check that remains available; do not
weaken the parser tests or fabricate a passing integration result.

Inspect the whole diff. Then invoke `requesting-code-review` with the actual
base and head SHAs, the requirement summary, files changed, hardening decisions,
and check outputs. Evaluate every finding through `receiving-code-review`,
verifying it against the code and this prompt before changing anything. Re-run
the focused test and affected repository checks after valid fixes; request a
follow-up review if feedback materially changes parser security behavior.

Record the final evidence in `docs/ingestion.md` (and the narrow security/
backend corrections above), stage only approved-task files, and commit locally
to `main` with a concise `caveman-commit` Conventional Commit message. Do not
push.
