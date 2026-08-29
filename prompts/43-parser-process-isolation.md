# 43 - Isolate ingestion parser execution

## Scope and why this is next

`d1fe7b6` is the committed `main` tip. It closes XLSX container hardening,
while [`docs/ingestion.md`](../docs/ingestion.md) identifies hostile parser
process isolation as the next bounded Phase 7A hardening gap. The remaining
geography/PostGIS and real-service gaps require a source decision or a
dependency-capable environment; this one does not.

Today `IngestionProcessorService` fetches accepted bytes and runs
`SourceParserService.inspect()` in the long-lived Nest worker. Existing byte,
row, column, cell, feature, coordinate, and XLSX container guards remain
necessary, but a parser bug or non-terminating decode can still disturb the
worker that owns database, queue, storage, scanner, and report adapters. This
increment introduces a narrow Node child-process boundary for parser execution.

This is fault containment, **not** an OS sandbox: the child shares the service
account and image, so a compromised parser is not prevented from attacking that
host. It must receive no Nest application context, database/queue/storage/scanner
credentials, arbitrary command/path, or user-controlled environment. The parent
retains storage reads, tenant/database work, mapping, publication, retries,
progress, and logging.

No geography provider, `RegionGeometry` writer, migration, public route,
media type, browser UI, upload product limit, analytics behavior, or launch
decision is authorized.

## Reference material and skills

Before changing files, re-read `AGENTS.md`, this approved prompt,
`docs/build-plan.md` §§1/8/13–14, `docs/ingestion.md`,
`docs/security.md` TM-07/TM-15/TM-20, `docs/system-architecture.md`,
`docs/backend.md`, and `docs/operations.md` if config/runbook text changes.
Reconcile them with the live worker, ingestion, parser, configuration, metrics,
Jest, build, and Docker files; do not treat a prior prompt as implementation
proof.

Load and follow these complete skills before implementation:
`architecture-patterns`, `nestjs-best-practices`,
`security-best-practices` (including its relevant JavaScript/Express backend
reference), `error-handling-patterns`, `javascript-testing-patterns`,
`requesting-code-review`, `receiving-code-review`, and `caveman-commit`.
Verify the installed Node 24 type declarations for `child_process.fork()`,
IPC serialization, lifecycle events, and fixed `execArgv` before coding.
`security-threat-model` is not required because this updates an existing
threat record rather than producing a new threat model. Browser, REST/GraphQL,
OpenAPI, Postgres/query, and E2E skills are conditional but do not apply: this
does not change their surfaces.

## Required implementation

### 1. Define the parser-execution boundary

1. Add a framework-free port in `server/src/ingestion/parsers/` (for example,
   `parser-executor.port.ts`). It accepts only a `Buffer`, the already
   accepted media type, and the serializable existing `ParserLimits`, and
   resolves only a `ParsedSourceSummary` or a typed safe failure. It must not
   accept an object key, filename, URL, tenant/account ID, database client,
   queue payload, arbitrary module/command, or callback.
2. Keep `SourceParserService` the only format dispatcher. Extract a shared
   pure parser factory/dispatch function only as needed so the parent and child
   use the same CSV/XLSX/GeoJSON implementations. Do not duplicate parser
   logic, create Nest in the child, or let parser code access infrastructure.
3. Keep `SourceParserService.inspect()` stable for callers and bind the child
   implementation through constructor injection/a Nest token in
   `IngestionModule`. An explicit in-process implementation may remain for
   deterministic direct parser tests, but production must bind the child
   executor exactly once and not export child internals.
4. Validate every IPC response as untrusted before it reaches the processor:
   exact requested source kind, bounded counts/arrays, safe scalar preview
   values, and bounded issue codes/messages. Missing, malformed, or mismatched
   responses become a generic parser-execution failure; arbitrary child data
   must never reach `ValidationIssue.createMany()`.

### 2. Use one fixed, least-privilege child per request

1. Add a compiled entrypoint next to parser sources (for example,
   `parser-child.entry.ts`). It accepts one discriminated IPC request, calls
   the shared pure dispatch, returns one serializable result, then
   disconnects/exits. It imports no Nest module, Prisma, storage, queue,
   scanner, reports, analytics, config service, logger, HTTP, filesystem, or
   network API.
2. The parent uses `child_process.fork()` only with `process.execPath` and
   a hard-coded emitted sibling entrypoint resolved from its own module
   directory. Use an empty fixed argument array, no shell, hidden/ignored
   stdio plus IPC, and advanced IPC serialization for the buffer. Never derive
   executable, module path, arguments, env values, or child options from upload
   metadata or persisted customer data.
3. Pass a minimal explicit child environment: only a validated `NODE_ENV`
   needed by Node. Do not inherit `DATABASE_URL`, session/CSRF, Valkey,
   Garage, ClamAV, SMTP, Gemini, or other credentials. Do not log child
   environment, request/response payload, raw bytes, samples, paths, PID, or
   library exception text.
4. One child handles one request only. On success, spawn error, message error,
   early exit, timeout, abort, worker shutdown, and parent exception, clear all
   timers/listeners, disconnect IPC, and terminate an unfinished child. Never
   reuse a child between jobs or leave an orphan.
5. The runtime path must target the emitted `.js` entrypoint in `dist/`;
   never depend on a source `.ts` path, ts-node, current working directory, or
   a global loader. Verify the normal compiled worker layout after a fresh
   `npm run build`.

### 3. Add measured operational resource controls

1. Before fixing a new duration or heap value, benchmark benign bounded CSV,
   minimal OOXML XLSX, and representative bounded GeoJSON through the compiled
   child entrypoint. Record command, Node/runtime context, and observed duration
   and memory evidence in the implemented-state record. Do not invent a product
   capacity/SLO or copy a library limit.
2. Then add two validated server-only abuse guards: maximum child execution
   duration and Node old-space heap. Document names, defaults, lower/upper
   bounds, and their relationship to the existing 25 MiB parser input ceiling
   as temporary operational controls, not customer file limits. Add matching
   config-service getters, `server/.env.example`, production placeholders,
   and template checks only where needed; do not change `UPLOAD_MAX_BYTES` or
   existing parser row/column/feature limits.
3. Form the child heap `execArgv` solely from validated numeric config. Use a
   parent watchdog, not solely the child-process timeout, so termination and
   the returned result are deterministic.
4. Setup/IPC/exit/heap/timeout failures return one blocking bounded summary
   using stable codes such as `parser_execution_failed` and
   `parser_execution_timed_out`. Do not expose signals, exit codes, stacks,
   Node/parser errors, memory measurements, filenames, byte sizes, or child
   output to persisted issues, API responses, metrics labels, or logs.
5. Preserve all normal parser outcomes unchanged across IPC: existing size,
   malformed-format, XLSX encrypted/macro/container, formula warning, and
   row/column/cell/feature/coordinate issue codes remain their current
   validation outcomes.

### 4. Preserve durable worker behavior

1. Parser execution failure/timeout must be a blocking validation outcome:
   `IngestionProcessorService` persists only the safe bounded issue, marks the
   mapping/run invalid/`validation_failed`, and creates no DatasetVersion,
   observations, or aggregates. It must not lose durable run state or publish
   partially.
2. Keep storage, database, cancellation, queue, shutdown, and analytics
   publication error/retry/dead-letter behavior unchanged. Narrow catches to the
   parser boundary; do not reclassify unrelated operational errors as bad files.
3. Add low-cardinality parser outcome/duration telemetry only if it fits the
   existing metrics module. Never label tenant/run/upload ID, filename, raw
   resource value, or exception. Otherwise document the residual telemetry gap;
   do not create a parallel metrics system.
4. Ensure in-flight parser children are terminated before Nest worker shutdown.
   Do not increase queue concurrency or grace periods as a substitute.

### 5. Test both semantics and the emitted boundary

1. Retain existing direct parser tests through the explicit in-process executor.
2. Add executor tests using an injectable fork/child seam for benign response,
   fixed env/entrypoint/arguments, timeout termination, child error/early exit,
   malformed/mismatched response rejection, cleanup, and no raw error leak.
   Do not invoke a shell or test Node internals.
3. Add a hermetic compiled-artifact test after `npm run build`: use the
   production executor with in-memory benign CSV/XLSX/GeoJSON fixtures; assert
   equivalent bounded summaries and prove a sentinel parent credential is absent
   in the child. It needs no PostgreSQL, Garage, Valkey, ClamAV, browser, or
   network.
4. Add processor tests with fake storage/tenant/analytics ports proving timeout
   and execution failures persist one blocking issue and prevent publication,
   while a real storage failure remains on its existing operational path.
5. Clean up child processes in test teardown and repeat focused tests once to
   surface open handles/orphans. Never use customer files, real secrets,
   passwords, macros, network sockets, or unbounded loops.

### 6. Document the exact implementation

1. Update `docs/ingestion.md` with the parent/child split, IPC boundary,
   measured limits/evidence, stable failures, compiled-artifact proof, and the
   residual fact that process isolation is not OS/container sandboxing.
2. Update `docs/security.md` TM-07 and its acceptance suite to distinguish
   current containment/resource controls from remaining sandbox,
   archive-expansion, and malicious-parser risks. Do not claim malware scanning
   or host compromise prevention.
3. Update `docs/backend.md`, `docs/system-architecture.md`, and
   `docs/operations.md` only where parser/worker/config/shutdown wording would
   otherwise contradict code. Do not change topology, provider choices, no-AI
   posture, operator launch blockers, or product scope.

## Explicit non-goals

- No provider import, mapping contract, `RegionGeometry` writer, raw PostGIS
  SQL, schema migration, analytics semantic change, or dataset-version change.
- No Docker/seccomp/AppArmor/gVisor/Kubernetes sandbox, UID/network namespace,
  VM, external parser service, queue topology, or arbitrary command execution.
- No temporary upload files, user-derived filesystem paths, raw archive
  extraction, browser/UI/REST/GraphQL/OpenAPI change, or media/size expansion.
- No changes to RLS, storage, ClamAV, queue concurrency, retry policy,
  secret-management, AI preview, reports, or launch approval.

## Acceptance criteria

- One killable child executes each untrusted parse without Nest context or
  application credentials; the parent validates all IPC data before persistence.
- Setup, IPC, exit, timeout, and resource failures fail closed safely, terminate
  the child, and leave no partial publication.
- Existing accepted CSV/XLSX/GeoJSON semantics—including prompt 42 XLSX
  hardening—are unchanged.
- New resource defaults are locally measured/documented operational guards, not
  fabricated customer limits or SLOs.
- Deterministic tests prove parser semantics and the emitted production child
  boundary; docs honestly retain the lack of OS sandboxing.

## Required verification and handoff

Run focused parser/executor/processor tests and the compiled-artifact check
first, then quote real output for:

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

If the real database-backed server suite cannot run, report the exact dependency
failure and run every deterministic parser/executor, format, type, build,
contract, and operations check available. Do not weaken proof or fabricate a
passing result.

Inspect the complete diff. Invoke `requesting-code-review` with actual
base/head SHAs, requirements, changed files, guard benchmark evidence, and
checks. Evaluate each finding through `receiving-code-review` before changing
anything; fix valid findings, retest, and request follow-up review if feedback
materially changes the boundary, config, or failure semantics. Update the owning
docs, stage only approved-task files, and commit locally to `main` with a
concise `caveman-commit` Conventional Commit. Do not push.
