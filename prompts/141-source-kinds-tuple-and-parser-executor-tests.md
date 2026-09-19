# 141 — export canonical source kinds tuple and add InProcessParserExecutor and SourceParserService unit tests

## Scope, and why it is next

The committed repository is on `main` at `16049f5`
(`refactor(ai): export providers tuple and tests`, the prompt 140 implementation).
The worktree is clean (verified this session via `git status --short`, empty output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by dependency-safe external I/O adapter hardening,
canonical tuple exports, and isolated unit testing across scanner, queue, storage, mail,
and AI subsystems (prompts 136–140).

Prompts 136 through 140 established consistent, robust architecture patterns across
external I/O ports and adapters:
- Prompt 136 (`9a0c46d`): ClamAV scanner port canonical const tuples (`SCAN_STATUSES`,
  `SCAN_ERROR_CODES`) and unit tests (`server/src/scanner/clamav-scanner.adapter.spec.ts`).
- Prompt 137 (`85a8534`): BullMQ queue port canonical const tuple (`QUEUE_JOB_NAMES`) and
  unit tests (`server/src/queue/bullmq-queue.adapter.spec.ts`).
- Prompt 138 (`6e25880`): S3 object storage port canonical const tuple
  (`STORAGE_PRESIGNED_METHODS`), helper functions, and unit tests
  (`server/src/storage/s3-object-storage.adapter.spec.ts`).
- Prompt 139 (`6510abd`): Mail delivery port canonical const tuple (`MAIL_TRANSPORTS`),
  transporter injection via `SMTP_TRANSPORTER`, and unit tests
  (`server/src/mail/adapters/smtp-mail.adapter.spec.ts`, `server/src/mail/adapters/memory-mail.adapter.spec.ts`).
- Prompt 140 (`16049f5`): AI draft provider port canonical const tuple (`AI_DRAFT_PROVIDERS`),
  client injection via `GEMINI_CLIENT`, and unit tests
  (`server/src/ai/adapters/fake-draft.adapter.spec.ts`, `server/src/ai/adapters/gemini-draft.adapter.spec.ts`).

An inspection of the ingestion parser subsystem (`server/src/ingestion/parsers/`, Phase 7A)
reveals the following residual gaps in port boundaries and adapter unit test coverage:

1. In `server/src/ingestion/parsers/parser.types.ts`, `SourceKind` is defined as a bare type
   union:
   ```ts
   export type SourceKind = 'csv' | 'xlsx' | 'geojson';
   ```
   without exporting a canonical runtime const tuple `SOURCE_KINDS = ['csv', 'xlsx', 'geojson'] as const`.
   Furthermore, in `server/src/metrics/metrics.service.ts`, `recordParserExecution` defines its
   `status` parameter as an inline union:
   ```ts
   status: 'success' | 'validation_issue' | 'failed' | 'timeout'
   ```
   without a canonical exported runtime const tuple `PARSER_EXECUTION_STATUSES` or named
   type `ParserExecutionStatus` in `parser.types.ts`.
2. In `server/src/ingestion/parsers/in-process-parser.executor.ts`, `InProcessParserExecutor`
   implements `ParserExecutorPort` for direct in-process execution via `parseSourceBuffer()`.
   While `ChildProcessParserExecutor` has comprehensive test coverage in
   `child-process-parser.executor.spec.ts` and `compiled-child-process-parser.spec.ts`,
   `InProcessParserExecutor` currently lacks dedicated unit test coverage
   (`in-process-parser.executor.spec.ts` does not exist).
3. In `server/src/ingestion/parsers/source-parser.service.ts`, `SourceParserService` serves as
   the primary NestJS domain service orchestrating media-type validation, payload buffer bounds,
   delegation to `ParserExecutorPort`, issue categorization into execution status, and metrics
   reporting. It currently lacks dedicated unit test coverage (`source-parser.service.spec.ts`
   does not exist).

This prompt resolves these gaps, completing the port tuple hardening and executor/service unit
testing lineage for the ingestion parser subsystem across `InProcessParserExecutor` and
`SourceParserService`.

Exporting `SOURCE_KINDS` and `PARSER_EXECUTION_STATUSES`, narrowing `recordParserExecution`'s
status, and adding dedicated unit test suites for `InProcessParserExecutor` and `SourceParserService`:

- Exposes canonical runtime arrays `SOURCE_KINDS = ['csv', 'xlsx', 'geojson'] as const` and
  `PARSER_EXECUTION_STATUSES = ['success', 'validation_issue', 'failed', 'timeout'] as const`
  alongside derived types `SourceKind` and `ParserExecutionStatus` in `server/src/ingestion/parsers/parser.types.ts`.
- Replaces the inline status union in `server/src/metrics/metrics.service.ts` with `ParserExecutionStatus`.
- Annotates `status` in `server/src/ingestion/parsers/source-parser.service.ts` with `ParserExecutionStatus`.
- Adds `server/src/ingestion/parsers/in-process-parser.executor.spec.ts` covering:
  - Invocation of `parseSourceBuffer` with valid CSV buffer, returning parsed summary with `sourceKind: 'csv'`.
  - Invocation of `parseSourceBuffer` with valid GeoJSON buffer, returning parsed summary with `sourceKind: 'geojson'`.
  - Handling of unsupported media types, returning structured error summary with `unsupported_media_type`.
  - Exact limits forwarding to underlying parser instances.
- Adds `server/src/ingestion/parsers/source-parser.service.spec.ts` covering:
  - Immediate rejection with `ApiException.validationFailed(['mediaType is not accepted.'])` for unaccepted media types.
  - Fail-closed buffer size check: buffers exceeding `PARSER_MAX_BUFFER_BYTES` return deterministic
    `file_size_limit_exceeded` error summary without invoking the executor, and record metric status `'validation_issue'`.
  - Normal execution: maps `AcresConfigService` parser limits to `ParserLimits` and forwards to executor.
  - Status categorization:
    - Reports `'timeout'` when an issue has code `parser_execution_timed_out`.
    - Reports `'failed'` when an issue has code `parser_execution_failed`.
    - Reports `'validation_issue'` when issues contain any `severity === 'error'`.
    - Reports `'success'` when summary has no error issues.
  - Duration calculation and metrics reporting via `metrics.recordParserExecution(...)`.
  - Graceful execution when `metrics` service is omitted (optional injection).
- Introduces zero breaking changes to public REST or GraphQL contracts (`npm run contracts:check`).

## Reference material read for it, by path

- `server/src/ingestion/parsers/parser.types.ts`: `SourceKind`, `ParsedSourceSummary`, `ParserLimits`.
- `server/src/ingestion/parsers/parser-executor.port.ts`: `PARSER_EXECUTOR` symbol and `ParserExecutorPort` definition.
- `server/src/ingestion/parsers/in-process-parser.executor.ts`: `InProcessParserExecutor` implementation.
- `server/src/ingestion/parsers/source-parser.service.ts`: `SourceParserService` media type validation, executor invocation, status categorization, and metrics reporting.
- `server/src/ingestion/parsers/child-process-parser.executor.spec.ts`: test pattern reference for parser executor assertions.
- `server/src/metrics/metrics.service.ts`: `recordParserExecution` definition and metric recording.
- `docs/ingestion.md`: Phase 7A parser port, dispatch, and isolation architecture records.
- `docs/backend.md`: server module map and parser execution architecture.

## Measurements and procedure

Verified by static typechecking, Jest execution, and AST inspection:
- `SOURCE_KINDS` is a `readonly ['csv', 'xlsx', 'geojson']` array.
- `PARSER_EXECUTION_STATUSES` is a `readonly ['success', 'validation_issue', 'failed', 'timeout']` array.
- `InProcessParserExecutor` and `SourceParserService` unit tests run in isolation with fast in-memory execution and mocks.
- Zero monkey-patching of private properties.

## Expected impact

- `server/src/ingestion/parsers/parser.types.ts`: `SOURCE_KINDS` and `PARSER_EXECUTION_STATUSES` const tuples exported.
- `server/src/metrics/metrics.service.ts`: `recordParserExecution` status narrowed to `ParserExecutionStatus`.
- `server/src/ingestion/parsers/source-parser.service.ts`: annotated status local and imports updated.
- `server/src/ingestion/parsers/in-process-parser.executor.spec.ts`: new isolated unit test suite.
- `server/src/ingestion/parsers/source-parser.service.spec.ts`: new isolated unit test suite.
- `docs/ingestion.md`: updated with prompt 141 documentation.
- Zero changes to public REST or GraphQL API contracts (`npm run contracts:check`).
- Zero changes to route handling, authorization, or database models.

## Non-goals

- No change to `ChildProcessParserExecutor` behavior or IPC protocols.
- No changes to CSV, XLSX, or GeoJSON core parser implementations.
- No changes to database models, Prisma schema, or PostgreSQL migrations.
- No changes to public REST or GraphQL contracts.

## Checks to run

```bash
npm run contracts:check
npm run test --workspace=@acres/server -- src/ingestion/parsers/in-process-parser.executor.spec.ts src/ingestion/parsers/source-parser.service.spec.ts
npm run test:server
npm run typecheck
npm run lint
npm run build
```

## SKILLS USED

- `nestjs-best-practices`: NestJS service design, dependency injection tokens, and optional provider patterns.
- `javascript-testing-patterns`: Isolated Jest unit testing, mock injection, and edge-case boundary verification.
- `architecture-patterns`: Hexagonal port/adapter boundaries, pure dispatch, and in-process execution seams.
