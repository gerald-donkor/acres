# 40 - Gemini free-tier evidence-draft preview

## Scope, decision, and why it is next

This is Phase 11A (optional AI) and is the next dependency-safe build unit after
the committed analytics query-plan harness in `4d132d1`. Phase 10 governed
reports and Phase 12’s no-AI path are already implemented; the current
unimplemented target phase is optional AI.

The user has made an explicit product/architecture deviation from the approved
local-only Phase 11 target: Acres will use the **unpaid Gemini Developer API**
temporarily, with an intentional later migration path to a paid Gemini API or
local provider. This prompt authorizes that boundary only. It does not silently
represent the free tier as private or production-ready.

The delivered behavior is a disabled-by-default, authenticated, organization
scoped report-draft preview. An analyst or higher-role member can explicitly
ask Gemini to propose one or more structured insights from the evidence already
attached to a *draft* report revision. The browser must state, before the
request, that report evidence and the resulting text will be sent to Google’s
unpaid service, whose terms permit product-improvement use and human review.
The user must actively acknowledge that disclosure on every request. The model
never publishes a revision, changes a metric, creates evidence, starts a job,
or invokes tools. A human must explicitly copy/accept a proposed draft through
the existing draft-editing path; publishing remains the existing owner/admin
permission and evidence-gated workflow.

This is deliberately a preview, not launch approval. It is feature-flagged
off unless the server has both the explicit preview switch and a configured API
key. The no-AI journey must remain fully usable when the key, feature switch,
network, quota, or Gemini service is absent.

## Decisions and non-negotiable constraints

- **Provider and tier:** Gemini Developer API, unpaid tier; the implementation
  must not substitute OpenAI, Vertex AI, Gemini paid API, llama.cpp, vLLM, an
  aggregator, or a browser-direct SDK.
- **Privacy exception:** Acres classifies organization business data as
  tenant-confidential by default. The user has nevertheless authorized this
  temporary unpaid-tier preview. Treat it as a documented exception with a
  clear acknowledgement, not as a security control or a claim that the data is
  private. Do not enable it in a production template or launch-readiness record.
- **Server-only credential:** `GEMINI_API_KEY` never appears in client code,
  `NEXT_PUBLIC_*`, source control, response payloads, error messages, logs,
  traces, metrics, fixtures, screenshots, or the generated contracts.
- **No autonomous action:** Gemini receives bounded, selected report/evidence
  context and returns a schema-constrained proposal only. It has no tool calls,
  URL fetching, storage access, database access, shell access, queue access,
  email access, or authority to write report state.
- **No fabricated evidence:** proposals must contain zero or more claims, each
  referencing only a supplied evidence public ID. Server-side validation rejects
  unknown, duplicate, mismatched-organization, or omitted evidence references;
  model prose alone never counts as evidence.
- **No raw model telemetry:** store only the minimum audit metadata needed to
  investigate the request—organization/report/revision/account IDs, provider,
  configured model identifier, prompt-template version, request outcome/error
  category, bounded timestamps, and a hash of the canonical input. Do not store
  raw prompts, source evidence text, generated text, API response bodies,
  API keys, provider request IDs if they can identify customer content, or
  token content in logs/metrics.
- **No invented commercial limits:** Gemini free-tier quotas, exact model name,
  and spend controls are provider/operator configuration, not constants guessed
  in source. Require an operator-supplied model identifier and expose a safe
  configuration error when absent. Local request body/output/context ceilings
  must derive from existing validated report bounds or newly documented
  configuration values, with their purpose stated as abuse controls rather than
  product capacity promises.

## Reference material read while preparing this prompt

- `AGENTS.md` §§2–10: prompt/approval workflow, records, server-first,
  tenant-isolation, accessibility, verification, review, and commit rules.
- `docs/build-plan.md` §12: the optional-AI prerequisites, human authority,
  no-AI fallback, evaluation, failure cases, and required skills.
- `docs/product.md` §§1, 3.7, 4–7: reports are evidence-governed; organization
  data is confidential by default; AI remains optional, tenant-bound,
  evidence-minimized, disabled by default, and subject to a human decision.
- `docs/system-architecture.md` §12: hosted AI is an explicit architecture
  change gate, not an incidental dependency.
- `docs/security.md` §§1–4 and §10: the new third-party AI trust boundary must
  protect tenant isolation, defend prompt injection and output abuse, prevent
  raw-prompt logging, and prove no-AI fallback.
- `docs/reports.md`: existing draft/revision/evidence lifecycle, permissions,
  CSRF/idempotency/envelope requirements, report UI structure, and the rule
  that publishing requires human action and frozen evidence.
- `docs/backend.md`: current Nest configuration, standardized error envelope,
  request protections, `AcresConfigService`, tenant transactions/RLS, route
  conventions, and existing contract-generation workflow.
- `docs/operations.md` §No-AI Posture: launch remains no-AI; this feature must
  not alter the fail-closed readiness posture.
- Google’s current official Gemini API documentation, read 2026-08-28:
  [Additional Terms](https://ai.google.dev/gemini-api/terms),
  [zero-data-retention guidance](https://ai.google.dev/gemini-api/docs/zdr?hl=en),
  and [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output?lang=rest).
  The unpaid tier may use submitted content and generated responses to improve
  Google products and may involve human review. Paid service terms differ, so
  do not copy their privacy claims to this mode. Structured output supports a
  subset of JSON Schema; implementation must verify the installed SDK/API
  syntax and supported schema subset immediately before coding.
- Existing authenticated-app/reports surfaces rather than the marketing PNG
  comps: this is a product-app addition and has no approved static comp.

## Expected route, schema, and module changes

### 1. Establish a narrow provider port and configuration boundary

1. Inspect `server/src/config/env.validation.ts`,
   `server/src/config/acres-config.service.ts`, `server/src/app.module.ts`,
   existing report modules, and the installed Nest/TypeScript versions before
   modifying them. Verify the current Gemini JavaScript SDK and its supported
   Node/runtime requirements in Google’s official docs immediately before
   adding any dependency. Do not write from recalled SDK APIs.
2. Add a focused `server/src/ai/` feature module—not Gemini calls embedded in
   `ReportsService`, a controller, a Prisma repository, or a client component.
   Use an injection token for an `AiDraftProvider`/port so changing to paid
   Gemini or a local model later replaces one adapter. The Gemini adapter is
   the only module allowed to import the provider SDK or read the API key.
3. Add validated server-only configuration with safe defaults:
   - a boolean that leaves AI disabled unless explicitly enabled;
   - a second explicit acknowledgement that the configured provider tier is
     `unpaid`, so setting only a key cannot accidentally enable the feature;
   - required `GEMINI_API_KEY` and provider model identifier only when enabled;
   - validated, bounded request timeout, maximum proposal count, and context/
     output limits, with names and defaults derived from a documented security
     need rather than guessed provider quotas.
   Production must fail closed if an AI enablement flag is set without the
   required explicit unpaid-tier acknowledgement, key, model, or safe limits.
   When disabled, boot must neither require the key nor initialize/import a
   network client.
4. Update `server/.env.example` with placeholders and comments that call out
   the unpaid-tier disclosure; update production examples/readiness validation
   only to reject AI enablement for launch, never to solicit a real key. Extend
   tracked-file/secret checks if needed to recognise a Gemini key without
   exposing any pattern that leaks real credentials.
5. Do not put an API key into test fixtures. Unit tests inject a fake provider;
   HTTP/e2e tests use the Nest test-module override. No test contacts Google.

### 2. Model the auditable request, but not raw customer/model content

1. Read the live Prisma schema and current migration conventions. Add an
   additive `AiGeneration` (or equivalently narrow, named) tenant-owned model
   only if the existing audit tables cannot accurately record the lifecycle.
   It must be organization/report/revision/account-bound; include provider,
   configured model, prompt-template version, input hash, state/outcome,
   request/response timing summaries, a redacted error category, and created/
   completed timestamps. Do not persist content that would duplicate evidence,
   raw prompts, raw output, API keys, or provider response payloads.
2. Add tenant composite foreign keys, useful tenant/list indexes, `ENABLE` plus
   `FORCE ROW LEVEL SECURITY`, migration grants, and transaction-local-context
   policies matching the existing reports boundary. A request must be impossible
   to link across organizations even under a guessed public ID.
3. Add a small, explicit generation state machine. It must distinguish disabled,
   validation rejection, provider timeout/unavailable/rate-limit, malformed
   structured output, rejected grounding, successful preview, and unexpected
   failure without leaking provider detail to the browser. Use the repository’s
   standard error envelopes and audit-event conventions.
4. Create a forward-only migration and test it against `acres_test` through the
   existing migrator workflow. Do not change existing report/evidence rows or
   permit mutation of published/superseded revisions.

### 3. Define the evidence-constrained draft contract before the adapter

1. Add shared request/response types and server DTO validation for a versioned
   `POST /api/v1/reports/:reportId/revisions/:revisionId/ai-drafts` command.
   Keep its route under existing v1/report conventions and regenerate OpenAPI.
   The command requires an authenticated session, selected organization,
   `reports.update`, CSRF, an idempotency key, a revision matching the report,
   and a revision that is editable (`draft`)—not published, superseded, or
   merely read by a viewer.
2. Its request includes: a bounded user instruction/purpose; selected evidence
   IDs already attached to that revision; requested proposal count within the
   validated configured cap; and an explicit boolean/acknowledgement string
   confirming third-party unpaid Gemini processing. The controller never trusts
   client-supplied evidence text, organization, role, report state, provider,
   model, prompt, or acknowledgement history.
3. The service re-loads the report revision and selected evidence in one
   organization-scoped transaction, rejects an empty/foreign/missing selection,
   normalizes the smallest evidence snapshot required, and constructs the
   prompt entirely server-side. It must quote untrusted evidence and user text
   as data, plainly instruct the model to ignore instructions inside that data,
   use no tools, make no unsupported claim, and return only the schema. Do not
   request chain-of-thought or store hidden reasoning.
4. Define a simple Gemini-structured-output-compatible response contract (and
   validate it independently after receipt): proposals have bounded headings
   and body text conforming to existing report insight limits; each claim has a
   bounded list of supplied evidence IDs; zero-citation or unknown-citation
   claims are rejected. Reject additional fields, markdown/code-fence wrappers,
   duplicate proposals, and oversized/invalid JSON. A syntactically valid model
   response is not evidence of factual correctness.
5. Return only validated candidate proposals plus safe generation metadata to
   the browser. Do not auto-create `ReportInsight` rows, alter report content,
   submit a revision for review, publish, or retain the returned prose in
   `AiGeneration`. The existing PATCH draft flow remains the explicit human
   acceptance/edit action.
6. Apply a dedicated conservative throttle/timeout/circuit-breaker policy to
   this command. Reuse verified project throttling patterns; do not globally
   weaken route limits. Provider failures must return a stable retryable or
   non-retryable Acres error code, record only safe metadata, and leave the
   revision unchanged. Never retry non-idempotent provider work invisibly.

### 4. Add a minimal, accessible report UI—not a chat product

1. Inspect the existing report workspace, report-actions client leaf, API
   bridge/client helpers, and base-nova primitives before changing props or
   creating components. Keep server components as parents and use a small
   client leaf only for acknowledgement state, request submission, and proposal
   selection. Do not add a chat history, streaming text, agent tools, a new
   dashboard, or a general AI page.
2. In an editable report-draft workspace, add a clearly named “Draft with
   Gemini preview” control only when the authenticated response says the
   feature is enabled and the member has `reports.update`. It must not display
   for published/review/superseded revisions, viewers, or when disabled.
3. Before submission, show a persistent plain-language disclosure: the
   selected report evidence and generated text are sent to Google’s unpaid
   Gemini API; this service may use content to improve products and may involve
   human review; do not use it for data the organization cannot send to that
   service. Require an unchecked native checkbox with a precise accessible
   label; disable the submit button until checked. The acknowledgement is
   request-specific and never prechecked or stored as blanket consent.
4. Render candidates as untrusted text, never HTML/Markdown, and present their
   cited report-evidence IDs/types alongside each candidate. Provide an explicit
   “Use as draft” action that copies a candidate into the normal editable
   insight fields, where the member can edit it before saving through the
   existing report update endpoint. Include clear pending, unavailable,
   timeout, rate-limited, malformed-output, grounding-rejected, and success
   messages in an `aria-live="polite"` region. Preserve keyboard focus after
   submit and do not remove an author’s unsaved report text on failure.
5. No raw prompt or provider response appears in the UI, browser console,
   error boundary, analytics, URL, cache key, or client state beyond the
   validated candidates needed for the current interaction. Use the existing
   visual system and focus styles; do not create tokens or reference marketing
   imagery without a documented need.

## Breakpoint behaviour

- **375 px:** report controls remain a single-column flow; the disclosure,
  checkbox, request button, candidate cards, citation list, and “Use as draft”
  actions fit inside the existing application gutter with 44×44 px minimum
  touch targets. No horizontal scroll or hover-only explanation.
- **800 px:** retain the existing report workspace hierarchy; proposal cards
  can align their title/state/action rows only if text still wraps safely and
  keyboard order remains disclosure → request → candidate citation → use action.
- **1280 px:** preserve the established report content width and status panel;
  candidates complement rather than replace the evidence/readiness workspace.
  The disclosure remains visible at the point of action, never relegated to a
  tooltip or a settings page.

## Reference deltas

- There is no approved static comp for the authenticated report AI preview, so
  this uses the existing application/report visual language rather than
  inventing a landing-page treatment.
- The unpaid-tier disclosure is intentionally more prominent than ordinary
  report controls. This is a legal/security constraint, not a visual departure
  to be optimized away.

## Security, failure, and compatibility matrix

| case | required result |
| --- | --- |
| Feature/key/model/acknowledgement absent | no Gemini client initialization; UI absent; no-AI report flow works |
| Anonymous, stale session, no org, viewer, foreign report/revision/evidence | existing authz/RLS path denies before provider invocation |
| Published/in-review/superseded revision | command rejects; no generation/audit side effect beyond safe denial policy |
| Missing disclosure acknowledgement | validation rejection; provider not called |
| Prompt injection in user instruction or evidence | server prompt treats it as data; model has no tools; output validation and citation allow-list still apply |
| Network error/timeout/5xx/rate limit | stable safe error; bounded audit metadata; revision unchanged; no raw provider error/response leaked |
| Invalid/oversized/non-schema output | reject candidate; safe outcome record; no draft mutation |
| Cross-tenant or fabricated citation | reject; candidate cannot be accepted as evidence |
| Gemini disabled/unavailable | existing report creation, editing, review, publishing, export, and browser journeys remain usable |
| Future paid/local migration | implement another provider adapter/configuration; preserve audit metadata and no client contract tied to a Gemini SDK |

## Evaluation and tests

1. Build a versioned, committed, **synthetic/public-only** evaluation fixture
   set. It must contain no real tenant reports, uploads, account PII, API keys,
   or production evidence. Include positive evidence-grounded examples plus
   prompt injection, unsupported claim, missing citation, foreign citation,
   invalid JSON, duplicate proposal, excessive length, and empty evidence cases.
2. Unit-test the prompt-context builder, canonical input hash, output parser,
   citation allow-list, error classifier, and provider adapter boundary using
   fakes. Test that untrusted text is delimited/treated as data and that model
   output cannot select a citation outside the supplied IDs.
3. Add Nest service/controller/e2e tests against real `acres_test` proving:
   permission and RLS negative matrix; CSRF/idempotency parity; draft-only
   restriction; acknowledgement gate; no adapter call when denied/disabled;
   safe provider timeout/rate-limit/malformed-response handling; audited
   metadata contains no raw content; accepted browser candidates do not write
   report insights until the existing human save action; and two organizations
   cannot cross-read generations or evidence.
4. Add a narrow real-browser test at 375, 800, and 1280 that exercises:
   disclosure is visible and unchecked; keyboard/screen-reader labels/focus and
   live status; disabled feature absence; success candidate → manual draft
   editing; provider failure preserves unsaved text; and a complete no-AI
   report journey. Mock the server provider at the test boundary—never call
   Gemini from CI.
5. Regenerate and check OpenAPI/GraphQL artifacts as required by current
   repository scripts. Add query-plan/index work only if actual generation
   history queries require it; do not introduce speculative indexing.
6. The initial quality gate is categorical, not an invented percentage: every
   accepted automated-evaluation candidate must parse, meet size/schema rules,
   cite only supplied evidence, contain at least one citation for every claim,
   and leave human publication authoritative. Any failing fixture blocks the
   preview. Record the absence of a user-approved semantic-quality threshold as
   a launch blocker rather than claiming factual accuracy from format checks.

## Documentation and architecture-record changes

In the same implementation commit:

1. Update `AGENTS.md` where Phase 11/local-only and the architecture change
   gate are stated, recording the explicit temporary unpaid Gemini preview,
   its disclosure/feature-gate/no-launch constraint, and the later provider
   replacement seam. Do not weaken tenant-confidential defaults elsewhere.
2. Update `docs/build-plan.md`, `docs/product.md`, `docs/system-architecture.md`,
   and `docs/security.md` to distinguish the implemented preview from the
   original local-only target; add the Gemini third-party boundary, data-use
   exception, new threat paths, mitigations, tests, unresolved semantic quality
   threshold, and the required paid/local migration decision before launch.
3. Create a focused `docs/ai.md` implementation record in the same commit and
   add it to the `AGENTS.md` documentation index. It must document provider
   tier, environment contract, port/adapter seam, exact route and permissions,
   data minimization/disclosure, prompt/output/evaluation versioning, audit
   metadata policy, failure/no-AI behavior, tests run, and migration path.
4. Update `docs/reports.md`, `docs/backend.md`, `docs/api/contracts.md`, and
   generated OpenAPI only with the facts delivered. Update `docs/operations.md`
   and launch-readiness documentation to keep AI disabled for launch and reject
   a production free-tier configuration.

## Non-goals

- No paid Gemini API, Vertex AI, OpenAI, Anthropic, local model runtime,
  fallback provider, automatic provider routing, or billing integration.
- No general chat, RAG/vector database, document uploads to Gemini, external
  web retrieval, function calling, tools, autonomous agent, or AI action.
- No AI-created metric, dashboard, evidence, export, publication, or report
  revision mutation.
- No claim of zero data retention, privacy, compliance, factual correctness,
  production readiness, or paid-tier equivalence for the unpaid provider.
- No launch-readiness approval, production secret provisioning, or Google Cloud
  project/account creation. Operator-owned keys and free-tier availability are
  external prerequisites, not implementation-agent defaults.
- No redesign of the marketing site, dashboard, report information architecture,
  or existing deterministic report/export pipeline.

## SKILLS USED

- `architecture-patterns` — preserve modular-monolith boundaries with an AI
  provider port and replaceable adapter.
- `nestjs-best-practices` — implement a focused Nest feature module, DI token,
  guards, validated configuration, error handling, and tests.
- `api-design-principles` — define the narrow v1 draft-proposal command and
  stable error semantics.
- `openapi-spec-generation` — update the committed REST contract and drift
  checks for the new command.
- `postgres-best-practices` — review any additive generation/audit migration,
  indexes, grants, and RLS policies.
- `security-best-practices` — secure TypeScript/Nest/Next boundaries, server
  secrets, untrusted output rendering, and disclosure handling.
- `security-threat-model` — update the repository-grounded third-party Gemini
  boundary, abuse paths, and mitigations.
- `prompt-engineering-patterns` — build a versioned server-side, bounded,
  injection-resilient structured-output prompt without chain-of-thought.
- `llm-evaluation` — define synthetic fixture evaluation and a non-fabricated
  quality gate for schema/grounding regressions.
- `data-storytelling` — constrain drafts to evidence-led report insight form.
- `error-handling-patterns` — classify provider/validation failures safely and
  preserve the no-AI fallback.
- `javascript-testing-patterns` — unit and Nest integration coverage with
  provider fakes and deterministic fixtures.
- `e2e-testing-patterns` — focused accessible real-browser preview/no-AI
  journey coverage without real provider calls.
- `secrets-management` — document and validate the server-only Gemini key and
  prevent tracked/logged secrets.
- `accessibility-compliance` — validate WCAG 2.2 disclosure, checkbox,
  focus, touch targets, and live error/status behavior in the authenticated UI.
- `web-design-guidelines` — review the new report interaction for accessible,
  intentional UI quality before completion.
- `vercel-react-best-practices` — keep Next server/client boundaries and
  browser bundle ownership correct.
- `tailwind-4-docs` — verify any new Tailwind 4 utility/variant rather than
  relying on Tailwind v3 memory.
- `shadcn` — inspect and correctly use existing base-nova UI primitive APIs.
- `requesting-code-review` — dispatch the mandatory post-verification reviewer
  subagent with requirements, paths, checks, and base/head SHAs.
- `receiving-code-review` — evaluate any review finding against the repository
  before changing code and re-review material fixes.
- `caveman-commit` — produce the required concise conventional local commit
  message after accepted implementation.

## Required verification before completion

Run and quote real output for the repository’s relevant checks, adding any
new focused test command only after it exists:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:server
npm run test:client:e2e
npm run contracts:check
npm run ops:check
git diff --check
git status --short
git diff --cached --check
git diff --cached --stat
```

Run the schema validation/migration status and focused AI test command through
the established real-PostgreSQL test workflow when dependencies are available.
Do not claim a Gemini live call passed unless the user separately provides a
non-sensitive test key and authorizes that external use. The default check suite
must prove behavior using fakes/mocks at the provider boundary.

Before committing, self-review the complete diff, invoke the mandatory
`requesting-code-review` reviewer subagent with the actual base/head SHAs and
check output, assess all feedback through `receiving-code-review`, make and
re-test valid fixes, re-review material boundary/API/security changes, update
the owning documents above, stage only approved files, then commit locally to
`main` with a `caveman-commit` message. Do not push.

## Acceptance criteria

- The user can explicitly request a schema-validated, evidence-cited Gemini
  preview only from an editable report draft and only after per-request unpaid
  third-party-processing acknowledgement.
- The API key is server-only and absent from all source, generated artifacts,
  tests, client bundles, logs, metrics, and responses.
- The provider receives only bounded server-selected evidence and user purpose;
  it has no tools or write authority; untrusted instructions cannot alter that.
- Every returned candidate is independently schema-, length-, and citation-
  validated, and no candidate mutates report data or publishes anything until
  a human uses the existing draft-editing workflow.
- Feature-disabled, unavailable, timeout, quota, malformed-output, and
  grounding-rejection paths are safe, user-comprehensible, auditable without
  raw content, and leave reports unchanged.
- Tenant/RLS/permission, CSRF, idempotency, accessibility, responsive, and
  no-AI regression tests pass without a live Gemini request.
- Canonical product/architecture/security/operations/report/backend/API/AI
  records accurately document the temporary unpaid Gemini exception and retain
  a paid/local migration seam; launch remains fail-closed/no-AI.
