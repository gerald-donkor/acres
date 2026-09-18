# 133 — narrow outbox `eventType` carrier to the closed `OutboxEventType` union

## Scope, and why it is next

The committed repository is on `main` at `da72057`
(`refactor(ai): narrow evidence type union`, the prompt 132 implementation).
The worktree is clean (verified this session via `git status --short`, empty
output). All 12 ordered phases in `docs/build-plan.md` are implemented and
committed through the Phase 12K exit gate (verification records §§16–22,
operator checklist in `docs/launch-checklist.md`), plus dependency-safe residual
hardening through prompt 132 — which closed the two open AI evidence type
carriers to `ReportEvidenceType`.

There is no unbuilt ordered phase left. A repo-wide inspection over internal
domain boundaries and asynchronous dispatch pipelines proves that exactly one
open `eventType` carrier remains in the Phase 6 outbox/worker subsystem, while a
closed two-member vocabulary is already defined by every outbox appender and
consumed by the worker dispatch loop:

```ts
// server/src/outbox/outbox.service.ts:9–17 — OPEN
export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly organizationId: string | null;
  readonly eventType: string; // ← open ('upload.completed' | 'export.requested', see below)
  readonly aggregateId: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly maxAttempts: number;
}
```

against the producer authority in `server/src/outbox/outbox.service.ts`:
- `appendUploadCompleted` (`:34–49`): writes `eventType: 'upload.completed'`
  (`aggregateType: 'Upload'`);
- `appendExportRequested` (`:51–66`): writes `eventType: 'export.requested'`
  (`aggregateType: 'ExportRequest'`).
No other outbox event producers exist in the entire codebase.

against the consumer authority in `server/src/worker/upload-worker.service.ts`:
- Line 100: `const deterministicKey = \`\${event.eventType}:\${event.aggregateId}\`;`
- Line 102–103: `const uploadId = event.eventType === 'upload.completed' ? event.aggregateId : null;`
- Line 112: `jobType: event.eventType,`
- Line 121: `jobType: event.eventType,`
- Line 129: `jobName: event.eventType,`
- Line 130–136:
  ```ts
  payload:
    event.eventType === 'export.requested'
      ? {
          exportRequestId: event.aggregateId,
          outboxEventId: event.id,
        }
      : { uploadId: event.aggregateId, outboxEventId: event.id },
  ```

against the unit test specifications:
- `server/src/outbox/outbox.service.spec.ts`: lines 81, 103, 120, 129 mock only
  `eventType: 'upload.completed'` and `eventType: 'export.requested'`.
- `server/src/worker/upload-worker.service.spec.ts`: lines 190, 226, 262, 287 mock
  only `eventType: 'upload.completed'` and `eventType: 'export.requested'`.

In `server/src/outbox/outbox.service.ts`, `ClaimedOutboxEvent.eventType` is typed
as open `string`, despite the fact that `OutboxEvent` rows claimed from PostgreSQL
are produced solely by `appendUploadCompleted` and `appendExportRequested`, and
consumed solely by `UploadWorkerService.dispatchOutboxEvents()`.

Narrowing `ClaimedOutboxEvent.eventType` to the closed union
`OutboxEventType = 'upload.completed' | 'export.requested'` aligns the outbox
claiming interface with the concrete producer contracts and worker dispatch
branching. Zero casts (`as OutboxEventType`) will be required, zero runtime
conversions are needed, and no public REST or GraphQL API contracts change.

## Reference material read for it, by path

- `server/src/outbox/outbox.service.ts`: outbox producer methods and `ClaimedOutboxEvent`.
- `server/src/outbox/outbox.service.spec.ts`: outbox unit tests.
- `server/src/worker/upload-worker.service.ts`: outbox event consumer and queue dispatch loop.
- `server/src/worker/upload-worker.service.spec.ts`: worker dispatch unit tests.
- `server/prisma/schema.prisma:380–403`: `OutboxEvent` model definition.
- `docs/backend.md`: Phase 6 outbox, storage, queues, and worker architecture.
- `docs/build-plan.md`: Phase 6 outcomes and verification records §§16–22.

## Measurements and procedure

Verified by static typechecking and TypeScript AST inspection:
1. `server/src/outbox/outbox.service.ts`:
   - Define and export the closed literal union:
     ```ts
     export type OutboxEventType = 'upload.completed' | 'export.requested';
     ```
   - Change `readonly eventType: string;` in `ClaimedOutboxEvent` to:
     ```ts
     readonly eventType: OutboxEventType;
     ```
2. Verify that `upload-worker.service.ts` consumes `event.eventType` without type
   assertions or casts.
3. Verify that `outbox.service.spec.ts` and `upload-worker.service.spec.ts` pass
   cleanly without errors or casts.

## Expected impact

- `server/src/outbox/outbox.service.ts`:
  - `OutboxEventType` defined and exported.
  - `ClaimedOutboxEvent.eventType` typed strictly as `OutboxEventType`.
- `docs/backend.md`:
  - Update Phase 6 outbox documentation record with the prompt 133 narrowing.
- No other runtime files modified.
- No public REST or GraphQL API changes (OpenAPI contracts check passes cleanly).

## Non-goals

- No change to outbox polling interval, lease acquisition (`lockedUntil`), or batch sizing.
- No change to `ClaimedOutboxEvent.payload: unknown` or SQL query generation.
- No change to queue adapters (`BullQueueService`) or port interfaces.
- No database schema alteration or Prisma migration.
- No client-side component changes.

## Checks to run

```bash
# 1. Outbox and worker subsystem unit tests
npm run test --workspace=@acres/server -- src/outbox src/worker

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
- Any outbox or worker unit test fails or changes behavior.
- Any caller passes an unmapped event type string that cannot be assigned.
- `npm run contracts:check` detects drift in OpenAPI or GraphQL contracts.
- A runtime error, cast, or type assertion is required to satisfy typechecking.

## Completion criteria

- `ClaimedOutboxEvent.eventType` admits strictly `OutboxEventType`.
- Zero casts (`as OutboxEventType`) introduced in repository mapping or worker logic.
- All outbox and worker test suites (`src/outbox`, `src/worker`) pass cleanly.
- Workspace-wide lint, typecheck, and build succeed with exit code 0.
- `docs/backend.md` updated with the prompt 133 record.
- Changes committed locally to `main` using `caveman-commit`.

## SKILLS USED

- `architecture-patterns` — preserve clean modular-monolith boundaries between
  the outbox and worker modules; ensure event contracts across boundaries are
  strictly typed and immutable.
- `nestjs-best-practices` — keep changes restricted to typed port and service
  interfaces without changing dependency injection, module wiring, or controllers.
- `error-handling-patterns` — preserve existing outbox retry, exponential backoff,
  and dead-lettering invariants.
- `javascript-testing-patterns` — execute Jest test suites for outbox and worker
  modules to confirm type safety and behavioral parity.
- `requesting-code-review` — dispatch reviewer subagent with structured context
  and verify diff against requirements before commit.
- `receiving-code-review` — evaluate reviewer findings with technical rigor and
  verify code before acting.
- `caveman-commit` — format the final commit message following Conventional
  Commits guidelines.

Not loaded, with reason: `playwright` (no UI or browser flow touched); frontend/
Tailwind/shadcn/GSAP skills (pure server-side backend event dispatch type change).
