# 135 — narrow scheduled job-run `jobName` carrier to the closed `ScheduledJobName` union

## Scope, and why it is next

The committed repository is on `main` at `784b48b`
(`refactor(queue): narrow job name union`, the prompt 134 implementation).
The worktree is clean (verified this session via `git status --short`, empty
output). All 12 ordered phases in `docs/build-plan.md` are implemented and
committed through the Phase 12K exit gate (verification records §§16–22,
operator checklist in `docs/launch-checklist.md`), plus dependency-safe residual
hardening through prompt 134 — which narrowed the work queue port and adapter
`jobName` carrier to the closed three-member union `QueueJobName`.

There is no unbuilt ordered phase left. A repo-wide inspection over internal
service boundaries, asynchronous tasks, and scheduled job management proves that
exactly one open `jobName` write carrier remains in the Phase 6 scheduled
maintenance jobs layer (`server/src/jobs/job-runs.service.ts`), while a closed
five-member vocabulary is already defined by every job producer, documented in
`docs/operations.md:315–322`, and recorded in `docs/backend.md`:

```ts
// server/src/jobs/job-runs.service.ts:44–51 — OPEN
  async start(jobName: string): Promise<string> {
    const run = await this.prisma.jobRun.create({
      data: { jobName, status: 'running' },
      select: { id: true },
    });
    this.metrics?.recordJobRun(jobName, 'running');
    return run.id;
  }
```

against the scheduled job producers across the entire codebase:
- `server/src/jobs/session-maintenance.job.ts:10,43`:
  ```ts
  export const SESSION_MAINTENANCE_JOB = 'sessions.purge-expired';
  ...
  runId = await this.runs.start(SESSION_MAINTENANCE_JOB);
  ```
- `server/src/jobs/retention-maintenance.job.ts:14–17,48,104,148,227`:
  ```ts
  export const UPLOADS_RETENTION_JOB = 'uploads.purge-expired';
  export const IDEMPOTENCY_RETENTION_JOB = 'idempotency.purge-expired';
  export const TOKENS_RETENTION_JOB = 'tokens.purge-expired';
  export const EXPORTS_RETENTION_JOB = 'exports.purge-expired';
  ...
  runId = await this.runs.start(UPLOADS_RETENTION_JOB);
  ...
  runId = await this.runs.start(IDEMPOTENCY_RETENTION_JOB);
  ...
  runId = await this.runs.start(TOKENS_RETENTION_JOB);
  ...
  runId = await this.runs.start(EXPORTS_RETENTION_JOB);
  ```
No other callers invoke `runs.start(...)` in the entire codebase.

against the test specifications:
- `server/src/jobs/session-maintenance.job.spec.ts:71`:
  `expect(runs.start).toHaveBeenCalledWith(SESSION_MAINTENANCE_JOB);`
- `server/src/jobs/retention-maintenance.job.spec.ts:109,318,522,823`:
  `expect(runs.start).toHaveBeenCalledWith(UPLOADS_RETENTION_JOB);`
  `expect(runs.start).toHaveBeenCalledWith(IDEMPOTENCY_RETENTION_JOB);`
  `expect(runs.start).toHaveBeenCalledWith(TOKENS_RETENTION_JOB);`
  `expect(runs.start).toHaveBeenCalledWith(EXPORTS_RETENTION_JOB);`

against the operational documentation:
- `docs/operations.md:315–322`:
  - `sessions.purge-expired`: cleans expired session tokens.
  - `uploads.purge-expired`: cleans uncompleted uploads and pending quarantine objects older than configured TTL.
  - `idempotency.purge-expired`: cleans idempotency records past retention window.
  - `tokens.purge-expired`: cleans expired password recovery and invitation tokens.
  - `exports.purge-expired`: reclaims `ExportArtifact` rows and marks expired downloads.

This prompt continues the durability and type-narrowing hardening lineage established
in prompts 77 (scheduled failure constants), 79 (batch bound), 85 (`JobRunsService.finish()`
message narrowing), 133 (outbox event type narrowing), and 134 (queue job name narrowing).
In `server/src/jobs/job-runs.service.ts`, `JobRunsService.start()`'s `jobName` parameter is
typed as open `string`, allowing any arbitrary string to be written into the `JobRun` table.

Narrowing `JobRunsService.start()` to accept the closed union
`ScheduledJobName = 'sessions.purge-expired' | 'uploads.purge-expired' | 'idempotency.purge-expired' | 'tokens.purge-expired' | 'exports.purge-expired'`
exported from `@acres/shared` aligns the scheduled-job initiation interface with the
canonical producer constants, prevents arbitrary strings from creating `JobRun` records,
requires zero casts (`as ScheduledJobName`), needs zero runtime conversions, and preserves
full compatibility with public REST OpenAPI schemas.

## Reference material read for it, by path

- `packages/shared/src/jobs.ts`: `JOB_RUN_STATUSES`, `JobRunStatus`, and `JobRunSummary` definitions.
- `packages/shared/src/index.ts`: barrel exports for `@acres/shared`.
- `server/src/jobs/job-runs.service.ts`: `JobRunsService.start` and `finish` implementation.
- `server/src/jobs/session-maintenance.job.ts`: `SESSION_MAINTENANCE_JOB` definition and invocation.
- `server/src/jobs/retention-maintenance.job.ts`: retention purge job definitions and invocations.
- `server/src/jobs/session-maintenance.job.spec.ts`: session maintenance unit tests and mock declarations.
- `server/src/jobs/retention-maintenance.job.spec.ts`: retention maintenance unit tests and mock declarations.
- `server/src/metrics/metrics.service.ts`: `recordJobRun` telemetry recorder.
- `server/test/database.e2e-spec.ts`: real-database retention purge integration assertions.
- `docs/backend.md`: scheduled job and `JobRun` architecture record.
- `docs/operations.md`: scheduled retention maintenance jobs inventory.
- `docs/build-plan.md`: Phase 6 outcomes and verification records §§16–22.

## Measurements and procedure

Verified by static typechecking and TypeScript AST inspection:
1. `packages/shared/src/jobs.ts`:
   - Define and export the constant array and closed union:
     ```ts
     export const SCHEDULED_JOB_NAMES = [
       'sessions.purge-expired',
       'uploads.purge-expired',
       'idempotency.purge-expired',
       'tokens.purge-expired',
       'exports.purge-expired',
     ] as const;

     export type ScheduledJobName = (typeof SCHEDULED_JOB_NAMES)[number];
     ```
   - Keep `JobRunSummary.jobName` as `string` to preserve exact wire and OpenAPI contract compatibility.
2. `server/src/jobs/job-runs.service.ts`:
   - Import `ScheduledJobName` from `@acres/shared`.
   - Update `start`:
     ```ts
     async start(jobName: ScheduledJobName): Promise<string> {
       const run = await this.prisma.jobRun.create({
         data: { jobName, status: 'running' },
         select: { id: true },
       });
       this.metrics?.recordJobRun(jobName, 'running');
       return run.id;
     }
     ```
3. `server/src/jobs/session-maintenance.job.ts`:
   - Import `type { ScheduledJobName }` from `@acres/shared`.
   - Type `SESSION_MAINTENANCE_JOB`:
     ```ts
     export const SESSION_MAINTENANCE_JOB: ScheduledJobName = 'sessions.purge-expired';
     ```
4. `server/src/jobs/retention-maintenance.job.ts`:
   - Import `type { ScheduledJobName }` from `@acres/shared`.
   - Type the four retention constants:
     ```ts
     export const UPLOADS_RETENTION_JOB: ScheduledJobName = 'uploads.purge-expired';
     export const IDEMPOTENCY_RETENTION_JOB: ScheduledJobName = 'idempotency.purge-expired';
     export const TOKENS_RETENTION_JOB: ScheduledJobName = 'tokens.purge-expired';
     export const EXPORTS_RETENTION_JOB: ScheduledJobName = 'exports.purge-expired';
     ```
5. `server/src/jobs/session-maintenance.job.spec.ts`:
   - Import `type { ScheduledJobName }` from `@acres/shared`.
   - Update `runs.start` mock signature:
     ```ts
     start: jest.Mock<Promise<string>, [ScheduledJobName]>;
     ```
6. `server/src/jobs/retention-maintenance.job.spec.ts`:
   - Import `type { ScheduledJobName }` from `@acres/shared`.
   - Update `runs.start` mock signature:
     ```ts
     start: jest.Mock<Promise<string>, [ScheduledJobName]>;
     ```
7. `server/src/metrics/metrics.service.ts`:
   - Retain `recordJobRun(jobName: string, ...)`: `ScheduledJobName` is a strict subtype of `string` so passing `ScheduledJobName` from `JobRunsService.start()` satisfies typechecking cleanly, while preserving `string` for Prisma reads (`updated.jobName`) and preventing `@typescript-eslint/no-redundant-type-constituents` lint errors.
8. Verify that zero casts (`as ScheduledJobName`) are introduced at call sites.

## Expected impact

- `packages/shared/src/jobs.ts`:
  - `SCHEDULED_JOB_NAMES` and `ScheduledJobName` defined and exported.
- `server/src/jobs/job-runs.service.ts`:
  - `JobRunsService.start` admits strictly `ScheduledJobName`.
- `server/src/jobs/session-maintenance.job.ts` & `retention-maintenance.job.ts`:
  - Constants annotated with `ScheduledJobName`.
- `server/src/jobs/session-maintenance.job.spec.ts` & `retention-maintenance.job.spec.ts`:
  - Mock signatures updated with `ScheduledJobName`.
- `docs/backend.md`:
  - Update Phase 6 scheduled jobs documentation record with the prompt 135 narrowing.
- No public REST or GraphQL API changes (`npm run contracts:check` passes cleanly).

## Non-goals

- No change to cron schedules (`CronExpression.EVERY_HOUR`).
- No change to `JobRunsService.finish()` or `JobRunMessage` definitions (settled in prompt 85).
- No change to `JobRunSummary` wire schema or `/api/v1/jobs/runs` controller.
- No database schema alteration or Prisma migration (`jobName` remains `String` in PostgreSQL).
- No change to client-side components.

## Checks to run

```bash
# 1. Jobs and metrics unit test suites
npm run test --workspace=@acres/server -- src/jobs src/metrics

# 2. Public API and contract parity check
npm run contracts:check

# 3. Workspace-wide lint, typecheck, and build
npm run lint
npm run typecheck
npm run build

# 4. Git whitespace and status review
git diff --check
git status --short
git diff --stat
```

`docs/backend.md` owns the documentation record. Quote real command outputs.

## Rollback and stop conditions

Rollback is a clean git revert of modified source and documentation files.
Stop and re-evaluate if any of the following occurs:
- Any unit test in `src/jobs` or `src/metrics` fails.
- Any caller attempts to start an unmapped job name string.
- `npm run contracts:check` detects drift in OpenAPI or GraphQL contracts.
- A runtime error, cast, or type assertion is required to satisfy typechecking.

## Completion criteria

- `JobRunsService.start` admits strictly `ScheduledJobName`.
- `SCHEDULED_JOB_NAMES` and `ScheduledJobName` exported from `@acres/shared`.
- Zero casts (`as ScheduledJobName`) introduced at call sites.
- All server test suites (`src/jobs`, `src/metrics`) pass cleanly.
- Workspace-wide lint, typecheck, and build succeed with exit code 0.
- `docs/backend.md` updated with the prompt 135 record.
- Changes committed locally to `main` using `caveman-commit`.

## SKILLS USED

- `architecture-patterns` — preserve clean modular-monolith boundaries and port/adapter
  isolation; guarantee that scheduled job names are governed by a single canonical
  shared contract across producer and consumer services.
- `nestjs-best-practices` — enforce type safety in service method signatures without
  altering NestJS dependency injection, lifecycle hooks, or module exports.
- `error-handling-patterns` — preserve existing exception handling and unexpected failure
  message sanitization in scheduled purge jobs.
- `javascript-testing-patterns` — execute Jest unit test suites for jobs and metrics
  modules to verify type safety and mock behavioral parity.
- `requesting-code-review` — dispatch reviewer subagent with structured context and
  verify diff against requirements before commit.
- `receiving-code-review` — evaluate reviewer findings with technical rigor and verify
  code before acting.
- `caveman-commit` — format the final commit message following Conventional Commits
  guidelines.

Not loaded, with reason: `playwright` (no UI or browser flow touched); frontend/
Tailwind/shadcn/GSAP skills (pure server-side and shared contract type narrowing).
