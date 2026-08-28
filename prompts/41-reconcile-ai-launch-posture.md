# 41 - Reconcile the Phase 11A preview with the Phase 12 launch gate

## Scope and why this is next

`2646f3f` implements the optional, disabled-by-default Gemini evidence-draft
preview from prompt 40.  That change correctly keeps the production path
no-AI, but it left canonical product and operations records referring to Phase
11 as unimplemented/blocked.  The launch-readiness validator likewise reports
that AI is rejected because Phase 11 is unimplemented, rather than because the
unpaid Gemini preview is deliberately excluded from launch.

This is the next dependency-safe remediation: make the recorded architecture,
operator-facing readiness model, and test evidence agree with the code already
shipped.  It must preserve the stronger safety property: a production
readiness record can be approved only with `AI_DRAFT_ENABLED=false` and without
a Gemini key.  This is documentation/launch-gate reconciliation, not an
expansion of the AI feature or authorization to enable it in production.

## Required reading and inspection before changing files

1. Re-read `AGENTS.md`, this approved prompt, and `docs/ai.md`,
   `docs/operations.md`, `docs/product.md`, `docs/system-architecture.md`,
   `docs/security.md`, `docs/backend.md`, `docs/build-plan.md`, and
   `docs/skills.md`.
2. Read the complete `SKILL.md` for `security-best-practices`,
   `security-threat-model`, `secrets-management`, `deployment-pipeline-design`,
   `javascript-testing-patterns`, `e2e-testing-patterns`,
   `prompt-engineering-patterns`, `llm-evaluation`, `requesting-code-review`,
   `receiving-code-review`, and `caveman-commit`.  Load the JavaScript/Nest
   security references selected by `security-best-practices` before changing a
   runtime validator.  The Phase 11A port/adapter and prompt/evaluation skills
   apply because this task is defining its production exclusion boundary; no
   model request is authorized.
3. Inspect the live behavior and callers of:
   - `scripts/ops/check-launch-readiness.js` and its package-script wrapper;
   - `infra/launch/readiness.example.json` and any schema or test fixture that
     defines the readiness record;
   - `infra/env/production.env.example`, production Compose/Caddy templates,
     and tracked-file/secret scans;
   - `server/src/config/env.validation.ts`, `server/.env.example`, and the AI
     module only to confirm actual enablement semantics; and
   - existing unit/integration test conventions for `scripts/` and server
     configuration.
4. Do not rely on prompt 40 or the target docs as proof.  Reconcile claims with
   the code and `2646f3f`; retain no unverified statement about Gemini
   retention, quotas, model availability, or production suitability.

## Required implementation

### 1. Make the launch decision model truthful and fail closed

1. Keep `optional_ai_posture` as a required launch-readiness section.  Rename
   or refine fields only if the resulting record is backwards-compatible for
   the checked-in template and has a documented migration path.  Its precise
   meaning must be: Phase 11A's preview code exists, **but the unpaid Gemini
   Developer API is not approved for the production launch profile**.
2. Require an approved production record to explicitly assert all of the
   following, with auditable evidence:
   - the deterministic no-AI journeys were exercised;
   - `AI_DRAFT_ENABLED` is false in the deployed server configuration;
   - no `GEMINI_API_KEY` is provisioned to the production API/worker image or
     runtime secret set; and
   - the unpaid provider is excluded from launch.  Do not accept a statement
     that merely says "AI disabled" without this evidence.
3. Continue to reject `ai_enabled: true` (or its compatible successor) as a
   fatal launch blocker.  Change the message to state the actual reason:
   launch excludes the unpaid Gemini preview, rather than falsely saying that
   Phase 11 is absent.  Never make a paid/provider migration an implicit
   approval path.
4. The validator must fail closed for missing, null, wrongly typed, or
   contradictory AI posture fields.  It must not inspect raw environment files
   or print secret values.  It may validate a secret **reference policy** or
   explicit absence attestation, but never require a real key or key-shaped
   literal in the readiness record.
5. Update the example record so it is deliberately unresolved yet accurately
   describes the implementation and the required operator evidence.  Preserve
   the existing generic placeholder scanning and the intended non-zero result
   of `npm run ops:launch-readiness` against the template.

### 2. Add focused, deterministic validator coverage

1. Locate the repository's appropriate Node/script test harness; do not add a
   second test framework just for this checker.  Refactor the checker only as
   needed to expose a pure validation function while retaining its executable
   CLI behavior and stable output summary.
2. Add focused tests for at least:
   - an otherwise complete approved record with every no-AI attestation passes
     this category (other independently unresolved categories may be isolated
     in the test fixture);
   - `ai_enabled: true` fails with the launch-exclusion reason;
   - each absent/false/malformed attestation fails closed;
   - a key literal, client-exposed key name, or key/reference contradiction is
     rejected without echoing that secret; and
   - the checked-in template remains intentionally non-launchable.
3. Keep AI provider calls completely out of tests.  These are configuration
   and launch-policy tests, not live Gemini, model-quality, or browser tests.
   Reuse existing no-AI server/browser coverage rather than duplicating it;
   add a focused E2E assertion only if current coverage cannot evidence the
   feature-disabled report path.

### 3. Correct all owned documentation records

1. Update `docs/operations.md` and the associated launch/readiness runbook:
   Phase 11A is implemented, disabled by default, and deliberately rejected
   from production launch while it uses the unpaid Gemini Developer API.  State
   that the launch criterion is a verified deterministic no-AI deployment, not
   nonexistence of AI source code.  Do not weaken the no-AI posture.
2. Update `docs/product.md` to replace the stale "optional local AI may be
   added" language with the actual temporary Gemini preview exception.  Keep
   organization data tenant-confidential by default; make clear that invoking
   the preview requires the user-facing disclosure/acknowledgement and is not
   a launch entitlement.
3. Update `docs/system-architecture.md` from its local-only target wording to
   distinguish (a) the implemented unpaid Gemini adapter behind the
   provider port and (b) a future paid/local private provider decision.  The
   current production reference topology remains no-AI.
4. Update `docs/security.md` TM-14 and the Phase 12D section so the current
   mitigation and remaining risk match the new gate.  Preserve the explicit
   third-party trust boundary, minimal evidence, no raw-content persistence,
   grounding checks, human authority, and production exclusion.
5. Update `docs/backend.md` and any API/operations record only where it makes a
   contradictory claim.  Do not transcribe marketing claims, raw provider
   errors, an API key, or unsupported exact quota/retention promises.
6. Update `docs/ai.md` with the authoritative launch-policy statement and the
   resulting test evidence.  Do not overwrite its implementation record with a
   target-state-only narrative.
7. Keep `docs/build-plan.md` Phase 11A and Phase 12 descriptions consistent
   with the implemented preview and no-AI launch gate.  Do not mark launch
   readiness approved or reduce any operator-owned blocker.

## Explicit non-goals

- Do not enable `AI_DRAFT_ENABLED` in any production template, Compose file,
  CI workflow, readiness record, or test that could reach Google.
- Do not add a Gemini key, secret-store entry, cloud account, billing,
  provider fallback, paid Gemini, Vertex AI, local runtime, RAG, tools, model
  streaming, or a new AI product workflow.
- Do not change the report API, evidence-selection contract, prompt template,
  generated OpenAPI, Prisma schema, RLS policies, client UI, or deterministic
  report/export behavior unless a concrete reconciliation test proves a small
  change is indispensable; if so, stop and record the scope expansion before
  proceeding.
- Do not approve a real production readiness record, invent an operator,
  deployment target, legal review, SLO/RPO/RTO, or production secret source.

## Acceptance criteria

- Canonical docs consistently say that Phase 11A exists as an unpaid,
  disabled-by-default preview; it is not represented as an approved production
  service or as a local-only implementation.
- The launch validator describes and enforces the true policy: deterministic
  no-AI launch, explicit `AI_DRAFT_ENABLED=false`, no Gemini key provisioned,
  and unpaid-provider exclusion.  Missing or contradictory policy evidence
  blocks approval.
- The sample readiness record remains intentionally unresolved and
  `npm run ops:launch-readiness` still fails closed for its placeholders,
  without misleading Phase-11-absent language.
- Tests are deterministic and make no network/model calls; raw secret values
  never occur in fixtures, assertions, logs, or output.
- No external contract, tenant boundary, report state, or production launch
  authorization changes.

## Required verification and handoff

Run the focused validator tests and quote their real output, then run:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:server
npm run contracts:check
npm run ops:check
npm run ops:launch-readiness
git diff --check
git status --short
git diff --cached --check
git diff --cached --stat
```

`npm run ops:launch-readiness` is expected to exit non-zero against the checked
in example.  Capture its result as proof that it fails closed; do not make the
suite pass by approving or removing its operator-owned blockers.

Before committing, inspect the whole diff and invoke the mandatory
`requesting-code-review` reviewer subagent with the requirement summary,
changed files, check outputs, and actual base/head SHAs.  Evaluate every
finding using `receiving-code-review`; verify before changing anything, fix and
re-test valid findings, and request a follow-up review for material
security/launch-gate changes.  Update the documentation records above, stage
only approved files, then commit locally to `main` with a concise
`caveman-commit` conventional message.  Do not push.
