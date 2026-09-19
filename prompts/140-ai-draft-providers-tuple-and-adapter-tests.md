# 140 — export canonical AI draft providers tuple, support optional client injection, and add FakeDraftAdapter unit tests

## Scope, and why it is next

The committed repository is on `main` at `6510abd`
(`refactor(mail): export transports tuple and tests`, the prompt 139 implementation).
The worktree is clean (verified this session via `git status`, clean output).
All 12 ordered phases in `docs/build-plan.md` are implemented and committed through
the Phase 12K exit gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), followed by dependency-safe external I/O adapter hardening
and type narrowing across the storage, queue, scanner, and mail subsystems (prompts 136–139).

Prompts 136 through 139 established consistent, robust architecture patterns across
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

An inspection of the AI drafting subsystem (`server/src/ai/`, Phase 11A) reveals the following
residual gaps:

1. In `server/src/ai/ai.port.ts`, `GenerateDraftsResponse.provider` is loosely typed as `string`.
   No canonical runtime const tuple `AI_DRAFT_PROVIDERS = ['gemini', 'fake-gemini'] as const` or
   narrowed union type `AiDraftProviderKind = (typeof AI_DRAFT_PROVIDERS)[number]` is exported.
2. In `server/src/ai/adapters/fake-draft.adapter.ts`, `FakeDraftAdapter` implements `AiDraftProvider`
   and is used as the in-memory test provider across integration tests (`test-app.ts`) and unit tests
   (`ai.service.spec.ts`), but has zero dedicated unit tests (`fake-draft.adapter.spec.ts` does not exist).
3. In `server/src/ai/adapters/gemini-draft.adapter.ts`, `GeminiDraftAdapter` constructs the `GoogleGenAI`
   SDK client internally via lazy initialization, with no constructor injection point. This forced
   `server/src/ai/adapters/gemini-draft.adapter.spec.ts` to monkey-patch private state via
   `(adapter as unknown as { client: MockClient }).client = ...`.
   Exporting a canonical `GEMINI_CLIENT = Symbol('GEMINI_CLIENT')` injection token and accepting
   an optional `@Optional() @Inject(GEMINI_CLIENT) client?: GoogleGenAI` constructor parameter
   enables standard NestJS dependency injection and clean unit test construction without monkey-patching.

This prompt resolves these gaps, completing the external I/O adapter unit testing and tuple hardening
for the AI drafting subsystem across `GeminiDraftAdapter` and `FakeDraftAdapter`.

Exporting `AI_DRAFT_PROVIDERS` and `AiDraftProviderKind`, supporting optional client injection,
and adding dedicated unit test suites for `FakeDraftAdapter` and updating `GeminiDraftAdapter`:

- Exposes a canonical runtime array `AI_DRAFT_PROVIDERS = ['gemini', 'fake-gemini'] as const` and type
  `AiDraftProviderKind = (typeof AI_DRAFT_PROVIDERS)[number]` in `server/src/ai/ai.port.ts`.
- Narrows `GenerateDraftsResponse.provider` from `string` to `AiDraftProviderKind`.
- Exports `GEMINI_CLIENT = Symbol('GEMINI_CLIENT')` from `server/src/ai/adapters/gemini-draft.adapter.ts`.
- Supports optional `client?: GoogleGenAI` in `GeminiDraftAdapter` constructor for flexible DI and testing.
- Refactors `server/src/ai/adapters/gemini-draft.adapter.spec.ts` to pass mock clients cleanly through
  the constructor rather than monkey-patching private properties.
- Adds `server/src/ai/adapters/fake-draft.adapter.spec.ts` covering:
  - Grounded default proposal generation from provided evidence items.
  - Fallback logic for evidence label, value, and unit (from direct properties, snapshot object properties,
    and defaults `'Metric ${index + 1}'`, `'100'`, `''`).
  - Correct formatting of generated heading, body, and `citedEvidenceIds`.
  - Bounding proposal count by `request.maxProposals`.
  - Empty evidence array handling returning empty proposals array.
  - Setting, slicing, and clearing custom proposals via `setCustomProposals(...)`.
  - Setting and clearing injectable errors via `setErrorToThrow(...)`.
  - Provider identifier returning `'fake-gemini'` (conforming to `AiDraftProviderKind`).
- Introduces zero breaking changes to public REST or GraphQL contracts (`npm run contracts:check`).

## Reference material read for it, by path

- `server/src/ai/ai.port.ts`: `AiDraftProvider`, `GenerateDraftsRequest`, `GenerateDraftsResponse`, `NormalizedEvidenceItem`.
- `server/src/ai/adapters/fake-draft.adapter.ts`: In-memory fake provider implementation, proposal generation, error injection.
- `server/src/ai/adapters/gemini-draft.adapter.ts`: Gemini SDK provider implementation, prompt compilation, schema validation.
- `server/src/ai/adapters/gemini-draft.adapter.spec.ts`: Existing Gemini adapter test suite with mock client monkey-patching.
- `server/src/ai/ai.service.ts`: Domain orchestration service consuming `AI_DRAFT_PROVIDER`.
- `server/src/ai/ai.service.spec.ts`: Service-level unit tests using `FakeDraftAdapter`.
- `server/src/ai/ai.module.ts`: NestJS provider wiring for `AI_DRAFT_PROVIDER`.
- `server/src/mail/adapters/smtp-mail.adapter.ts`: Architectural precedent for optional injection token (`SMTP_TRANSPORTER`).
- `server/src/mail/adapters/memory-mail.adapter.spec.ts`: Architectural precedent for in-memory adapter testing (prompt 139).
- `docs/ai.md`: Phase 11A architecture, ports, adapters, and evaluation records.
- `docs/build-plan.md`: Phase 11A and exit records §§16–22.

## Measurements and procedure

Verified by static typechecking, Jest execution, and AST inspection:

1. `server/src/ai/ai.port.ts`:
   - Define and export `AI_DRAFT_PROVIDERS`:
     ```ts
     export const AI_DRAFT_PROVIDERS = ['gemini', 'fake-gemini'] as const;

     export type AiDraftProviderKind = (typeof AI_DRAFT_PROVIDERS)[number];
     ```
   - Update `GenerateDraftsResponse.provider`:
     ```ts
     export interface GenerateDraftsResponse {
       proposals: AiDraftProposal[];
       provider: AiDraftProviderKind;
       model: string;
       promptTemplateVersion: string;
       rawTokensUsed?: number;
     }
     ```

2. `server/src/ai/adapters/gemini-draft.adapter.ts`:
   - Export injection token:
     ```ts
     export const GEMINI_CLIENT = Symbol('GEMINI_CLIENT');
     ```
   - Update constructor to accept optional client:
     ```ts
     constructor(
       private readonly config: AcresConfigService,
       @Optional()
       @Inject(GEMINI_CLIENT)
       client?: GoogleGenAI,
     ) {
       this.client = client ?? null;
     }
     ```
   - Update `getClient()`:
     ```ts
     private getClient(): GoogleGenAI {
       if (!this.config.aiDraftEnabled) {
         throw new AiDisabledException();
       }
       if (!this.client) {
         if (!this.config.geminiApiKey) {
           throw new AiDisabledException('GEMINI_API_KEY is not configured.');
         }
         this.client = new GoogleGenAI({ apiKey: this.config.geminiApiKey });
       }
       return this.client;
     }
     ```

3. `server/src/ai/adapters/gemini-draft.adapter.spec.ts`:
   - Refactor tests to instantiate `new GeminiDraftAdapter(mockConfig as unknown as AcresConfigService, mockClient as unknown as GoogleGenAI)`
     directly rather than assigning to private property `(adapter as unknown as { client: MockClient }).client`.

4. `server/src/ai/adapters/fake-draft.adapter.spec.ts`:
   - Create new unit test file testing `FakeDraftAdapter`:
     - Initial instantiation and default generation.
     - Evidence with full explicit properties (`label`, `value`, `unit`).
     - Evidence with fallback snapshot properties (`snapshot.label`, `snapshot.value`, `snapshot.unit`).
     - Evidence with missing/invalid snapshot properties falling back to defaults.
     - Output proposal capping via `request.maxProposals`.
     - Empty evidence array returning empty proposals array.
     - Custom proposals via `setCustomProposals` and reset with `null`.
     - Error injection via `setErrorToThrow` and reset with `null`.
     - Output metadata (`provider: 'fake-gemini'`, `model: 'gemini-test'`, etc.).

5. `docs/ai.md`:
   - Update §2.1 and §2.3 to record `AI_DRAFT_PROVIDERS`, `GEMINI_CLIENT`, and the dedicated unit test suite for `FakeDraftAdapter`.

## Expected impact

- `server/src/ai/ai.port.ts`: canonical runtime const tuple and narrowed union type exported.
- `server/src/ai/adapters/gemini-draft.adapter.ts`: `GEMINI_CLIENT` injection token exported and optional DI supported.
- `server/src/ai/adapters/gemini-draft.adapter.spec.ts`: clean constructor-based test setup without monkey-patching.
- `server/src/ai/adapters/fake-draft.adapter.spec.ts`: complete unit test suite for in-memory fake provider.
- `docs/ai.md`: updated with prompt 140 documentation.
- Zero changes to public REST or GraphQL API contracts (`npm run contracts:check`).
- Zero changes to route handling, authorization, or database models.

## Non-goals

- No new AI provider implementations (such as OpenAI, Anthropic, or Ollama) — provider scope remains strictly `'gemini'` and `'fake-gemini'`.
- No modification of prompt templates in `draft-prompt.builder.ts`.
- No modification of output validation schemas in `draft-output.validator.ts`.
- No changes to database models, Prisma schema, or PostgreSQL migrations.
- No changes to client `/app` drafting UI or forms.

## Checks to run

```bash
npm run contracts:check
npm run test --workspace=@acres/server -- src/ai/adapters/gemini-draft.adapter.spec.ts src/ai/adapters/fake-draft.adapter.spec.ts
npm run test:server
npm run typecheck
npm run lint
npm run build
```

## SKILLS USED

- `nestjs-best-practices`: NestJS provider injection patterns, tokens, and constructor design.
- `javascript-testing-patterns`: Isolated Jest unit testing for adapters, mocks, and edge case coverage.
- `architecture-patterns`: Hexagonal port/adapter boundaries and test fake isolation.
