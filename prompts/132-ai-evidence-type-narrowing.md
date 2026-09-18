# 132 — narrow AI normalized evidence type carriers to the closed `ReportEvidenceType` union

## Scope, and why it is next

The committed repository is on `main` at `576e7b8`
(`refactor(geography): narrow geometry type union`, the prompt 131
implementation). The worktree is clean (verified this session via
`git status --short`, empty output). All 12 ordered phases in
`docs/build-plan.md` are implemented and committed through the Phase 12K exit
gate (verification records §§16–22, operator checklist in
`docs/launch-checklist.md`), plus dependency-safe residual hardening through
prompt 131 — which closed the two open geography geometry type carriers to
`SupportedGeometryType`.

There is no unbuilt ordered phase left. A repo-wide inspection over internal
domain boundaries and port interfaces this session proves that exactly two open
`evidenceType` carriers remain in the Phase 11A AI draft preview subsystem, while
a closed two-member vocabulary is already defined by the shared reports contract,
enforced by PostgreSQL schema enums, and returned by Prisma client models:

```ts
// server/src/ai/ai.port.ts:5–15 — OPEN
export interface NormalizedEvidenceItem {
  id: string;
  evidenceType: string; // ← open (ReportEvidenceType, see below)
  label?: string;
  value?: string | number | boolean | null;
  unit?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  regionId?: string | null;
  snapshot: Record<string, unknown>;
}
```

```ts
// server/src/ai/evaluation/ai-evaluation-fixtures.ts:1–22 — OPEN
export interface AiEvalTestCase {
  id: string;
  name: string;
  category:
    | 'grounded_positive'
    | 'injection_resilience'
    | 'citation_validation'
    | 'schema_boundary'
    | 'formatting';
  purpose: string;
  evidence: Array<{
    id: string;
    evidenceType: string; // ← open (ReportEvidenceType, see below)
    label: string;
    value: string | number;
    unit?: string;
    snapshot: Record<string, unknown>;
  }>;
  mockRawOutput: string;
  expectedOutcome: 'success' | 'grounding_rejected' | 'malformed_output';
  expectedProposalCount?: number;
}
```

against the single authority the codebase already defines and enforces for
report evidence types:

```ts
// packages/shared/src/reports.ts:7 — CLOSED
export type ReportEvidenceType = 'aggregate' | 'dashboard_view';
```

and PostgreSQL database schema authority:

```prisma
// server/prisma/schema.prisma:1108–1111 — CLOSED
enum ReportEvidenceType {
  aggregate
  dashboard_view
}
```

and the service mapping layer that feeds `NormalizedEvidenceItem`:

```ts
// server/src/ai/ai.service.ts:97–133
const evidenceRows = await tx.reportEvidence.findMany({
  where: {
    organizationId: organization.organizationId,
    revisionId,
    id: { in: input.evidenceIds },
  },
});

const normalizedEvidence: NormalizedEvidenceItem[] =
  evidenceRows.map((row) => {
    // ...
    return {
      id: row.id,
      evidenceType: row.evidenceType, // row.evidenceType is already Prisma generated ReportEvidenceType ('aggregate' | 'dashboard_view')
      // ...
    };
  });
```

and the reports service read mapper:

```ts
// server/src/reports/reports.service.ts:978–989 (prompt 122)
evidence: Array<{
  id: string;
  evidenceType: 'aggregate' | 'dashboard_view';
  // ...
}>;
```

In `server/src/ai/ai.port.ts`, `NormalizedEvidenceItem.evidenceType` discards the
exact typing provided by `row.evidenceType` from Prisma. In
`server/src/ai/evaluation/ai-evaluation-fixtures.ts`, `AiEvalTestCase.evidence`
similarly broadens the evidence type to open `string` even though all 10 synthetic
fixtures (`eval-pos-01` through `eval-fmt-02`) supply the literal `'aggregate'`,
and all mock test specs (`ai.service.spec.ts`, `gemini-draft.adapter.spec.ts`,
`draft-prompt.builder.spec.ts`) pass either `'aggregate'` or `'dashboard_view'`.

Narrowing both carriers to `ReportEvidenceType` from `@acres/shared` aligns the
AI provider port and evaluation suite with the reports domain model and database
schema invariants. Zero casts (`as ReportEvidenceType`) will be required, zero
runtime conversions are needed, and no public REST or GraphQL API contracts
change.

## Reference material read for it, by path

- `packages/shared/src/reports.ts:7`: canonical `ReportEvidenceType` definition
  (`'aggregate' | 'dashboard_view'`).
- `server/prisma/schema.prisma:1108–1111`: PostgreSQL enum `ReportEvidenceType`.
- `server/src/ai/ai.port.ts`: provider port interface and `NormalizedEvidenceItem`.
- `server/src/ai/ai.service.ts`: evidence normalization mapping in `generateDraftProposals`.
- `server/src/ai/prompt/draft-prompt.builder.ts`: prompt serialization of `NormalizedEvidenceItem`.
- `server/src/ai/prompt/draft-prompt.builder.spec.ts`: prompt builder unit tests.
- `server/src/ai/adapters/gemini-draft.adapter.spec.ts`: Gemini adapter unit tests.
- `server/src/ai/evaluation/ai-evaluation-fixtures.ts`: synthetic AI evaluation fixtures.
- `server/src/ai/evaluation/ai-evaluation.spec.ts`: evaluation runner suite.
- `server/src/reports/reports.service.ts:980`: report revision mapper evidence type union.
- `docs/ai.md`: Phase 11A architecture and port/adapter record.
- `docs/build-plan.md`: verification records §§16–22.

## Measurements and procedure

Verified by static typechecking and TypeScript AST inspection:
1. `server/src/ai/ai.port.ts`:
   - Import `ReportEvidenceType` from `@acres/shared` alongside `AiDraftProposal`.
   - Change `evidenceType: string;` in `NormalizedEvidenceItem` to
     `evidenceType: ReportEvidenceType;`.
2. `server/src/ai/evaluation/ai-evaluation-fixtures.ts`:
   - Import `ReportEvidenceType` from `@acres/shared`.
   - Change `evidenceType: string;` in `AiEvalTestCase.evidence` to
     `evidenceType: ReportEvidenceType;`.
3. Verify that `row.evidenceType` in `server/src/ai/ai.service.ts:132` assigns
   to `NormalizedEvidenceItem.evidenceType` without type assertions or casts.
4. Verify that `draft-prompt.builder.ts`, all AI unit test files, and
   `ai-evaluation.spec.ts` pass cleanly without errors or casts.

## Expected impact

- `server/src/ai/ai.port.ts`:
  - `NormalizedEvidenceItem.evidenceType` typed strictly as `ReportEvidenceType`.
- `server/src/ai/evaluation/ai-evaluation-fixtures.ts`:
  - `AiEvalTestCase.evidence[number].evidenceType` typed strictly as
    `ReportEvidenceType`.
- `docs/ai.md`:
  - Update §2.1 and documentation record with the prompt 132 narrowing.
- No other runtime files modified.
- No public REST or GraphQL API changes (OpenAPI contracts check passes cleanly).

## Non-goals

- No change to prompt templates, delimiters (`<evidence_context>`, `<user_purpose>`),
  or system instructions in `draft-prompt.builder.ts`.
- No change to `validateAndParseModelOutput` or `draft-output.validator.ts`.
- No change to Gemini API integration or `@google/genai` client settings.
- No change to public REST API schemas (`aiDraftProposalSchema`, `aiDraftResultSchema`
  in `ai-draft.controller.ts`).
- No database schema alteration or Prisma migration.
- No client-side component changes.

## Checks to run

```bash
# 1. AI subsystem unit and evaluation tests
npm run test --workspace=@acres/server -- src/ai

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

`docs/ai.md` owns the documentation record. Quote real command outputs.

## Rollback and stop conditions

Rollback is a clean git revert of modified source and documentation files.
Stop and re-evaluate if any of the following occurs:
- Any AI unit or evaluation test fails or changes behavior.
- Any caller passes an unmapped evidence type string that cannot be assigned.
- `npm run contracts:check` detects drift in OpenAPI or GraphQL contracts.
- A runtime error, cast, or type assertion is required to satisfy typechecking.

## Completion criteria

- `NormalizedEvidenceItem.evidenceType` and `AiEvalTestCase.evidence[number].evidenceType`
  admit strictly `ReportEvidenceType`.
- Zero casts (`as ReportEvidenceType`) introduced in repository mapping or service logic.
- All AI test suites (`src/ai`) pass cleanly.
- Workspace-wide lint, typecheck, and build succeed with exit code 0.
- `docs/ai.md` updated with the prompt 132 record.
- Changes committed locally to `main` using `caveman-commit`.

## SKILLS USED

- `architecture-patterns` — preserve clean hexagonal port/adapter separation in
  the AI subsystem; keep provider port types (`NormalizedEvidenceItem`) aligned
  with domain types without leaking ORM or persistence details.
- `nestjs-best-practices` — keep changes restricted to typed port and fixture
  interfaces without changing dependency injection, module wiring, or controllers.
- `api-design-principles` — guard duty: ensure internal provider port types do not
  alter or leak into public REST contracts (`AiDraftController`).
- `javascript-testing-patterns` — run focused Jest suites for the AI subsystem,
  prompt builder, evaluation fixtures, and adapters to verify zero regression.
- `prompt-engineering-patterns` — verify that structured prompt delimiters and
  serialized evidence payload in `draft-prompt.builder.ts` remain unchanged.
- `llm-evaluation` — ensure all synthetic evaluation test fixtures in
  `ai-evaluation-fixtures.ts` adhere to `ReportEvidenceType` without impacting
  evaluation assertions.
- `requesting-code-review` — dispatch reviewer subagent with structured context
  and verify diff against requirements before commit.
- `receiving-code-review` — evaluate reviewer findings with technical rigor and
  verify code before acting.
- `caveman-commit` — format the final commit message following Conventional
  Commits guidelines.

Not loaded, with reason: `playwright` (no UI or browser flow touched); frontend/
Tailwind/shadcn/GSAP skills (pure server-side backend persistence type change).
