# AI Evidence-Draft Preview Foundation (Phase 11A)

This document records the design, implementation, safety architecture, and operational posture of Phase 11A: the Gemini Free-Tier Evidence-Draft Preview for report authoring in Acres.

---

## 1. Executive Summary & Product Boundary

Phase 11A introduces an optional, assistive drafting workflow for report authors. Given a user-provided purpose and a set of attached evidence items from an active draft report revision, the AI subsystem generates candidate structured insight proposals (heading, body, cited evidence IDs).

### Core Invariants:
1. **Assistive Drafting Only**: AI draft generation is never autonomous and never mutates report revisions directly. Generated proposals are returned ephemerally to the client for human inspection. The author must explicitly click "Use as draft" to populate form fields, review/edit text, and submit updates.
2. **Strict Grounding Enforcement**: Every candidate proposal must explicitly cite one or more valid evidence items attached to the active draft revision. Proposals with missing, foreign, or empty citations are rejected server-side with `AI_GROUNDING_REJECTED` (HTTP 400).
3. **Mandatory Unpaid Tier Disclosure & Acknowledgement**: Because this phase uses Google's unpaid Gemini Developer API, users are shown an explicit disclosure stating that data sent to this API may be used for model improvement and human review. An explicit, unchecked confirmation checkbox is required on every request.
4. **Metadata-Only Audit Ledger**: The database persists only operational audit metadata (`AiGeneration` table with SHA-256 canonical input hash, token counts, duration, proposal count, and completion state). **Raw prompt text, evidence snapshots, generated output text, and API keys are never stored in the database or logged.**
5. **Fail-Closed Production Posture**: `AI_DRAFT_ENABLED` defaults to `false`. Launch hardening and production templates fail closed without AI enabled. Enabling requires explicit operator configuration and acknowledgement.

---

## 2. System Architecture: Ports & Adapters

The AI subsystem is structured according to the Ports and Adapters (Hexagonal) architecture pattern:

```
+-------------------------------------------------------------------------------+
|                             Acres Server Core                                 |
|                                                                               |
|  [AiDraftController]  -->  [AiService]  -->  [AiDraftProvider (Port)]         |
|         |                        |                     |                      |
|         v                        v                     v                      |
|  [OpenAPI / REST]         [Prisma/RLS]     +-----------------------+          |
|                                            | GeminiDraftAdapter    |          |
|                                            | (Adapter - @google/   |          |
|                                            |  genai Developer API) |          |
|                                            +-----------------------+          |
|                                            | FakeDraftAdapter      |          |
|                                            | (Adapter - Test Mock) |          |
|                                            +-----------------------+          |
+-------------------------------------------------------------------------------+
```

### 2.1 Provider Port (`server/src/ai/ai.port.ts`)
- **Symbol**: `AI_DRAFT_PROVIDER = Symbol('AI_DRAFT_PROVIDER')`
- **Interface**: `AiDraftProvider`
  - `generateDraftProposals(request: GenerateDraftsRequest): Promise<GenerateDraftsResponse>`

### 2.2 Gemini Adapter (`server/src/ai/adapters/gemini-draft.adapter.ts`)
- The sole consumer of `@google/genai` in the codebase.
- Enforces structured JSON output schema via `responseSchema`.
- Applies temperature 0.2 and `maxOutputTokens`.
- Wraps API calls in an abortable timeout race (`AI_DRAFT_TIMEOUT_MS`).
- Maps upstream status codes to typed domain exceptions (`AiRateLimitedException`, `AiUnavailableException`, `AiTimeoutException`) without leaking API keys or raw error payloads.

### 2.3 Fake Adapter (`server/src/ai/adapters/fake-draft.adapter.ts`)
- In-memory deterministic fake used for automated test suites (`api.e2e-spec.ts`, unit tests).
- Supports configuring mocked proposals and injectable errors.

---

## 3. Grounding Verification & Prompt Engineering

### 3.1 Versioned Prompt Builder (`server/src/ai/prompt/draft-prompt.builder.ts`)
- Template Version: `v1`
- Formats evidence context using structured delimiters:
  ```xml
  <evidence_context>
    <evidence_item id="...">
      <type>aggregate</type>
      <metric>Crop Yield</metric>
      <value>185</value>
      <unit>bushels/acre</unit>
      <snapshot_json>{ ... }</snapshot_json>
    </evidence_item>
  </evidence_context>
  <user_purpose>
    Highlight regional yield anomalies and water efficiency trends
  </user_purpose>
  ```
- Strict system instructions mandate that every claim must be grounded in the supplied `<evidence_context>`. Hallucinated metrics, unprovided IDs, and ungrounded statements are forbidden.
- Computes canonical SHA-256 hash of the normalized prompt input for auditability.

### 3.2 Structured Output Validation (`server/src/ai/validation/draft-output.validator.ts`)
- Validates JSON payload against strict boundary schema:
  - `heading`: 1–160 characters.
  - `body`: 1–4000 characters.
  - `citedEvidenceIds`: non-empty array of valid UUID strings.
- Enforces citation allow-listing: every cited ID must exist in `allowedEvidenceIds` (the evidence items attached to the active draft revision).
- Strips any accidental markdown fences (` ```json `).
- Rejects empty proposal arrays or citation violations with `GroundingRejectionError`.

---

## 4. Security & Tenant Isolation

### 4.1 Database Model & RLS Migration (`server/prisma/schema.prisma`)
- Model `AiGeneration`:
  - `id`: UUIDv7 primary key.
  - `organizationId`: UUID foreign key to `Organization`.
  - `reportId`: UUID foreign key to `Report`.
  - `revisionId`: UUID foreign key to `ReportRevision`.
  - `accountId`: UUID foreign key to `Account`.
  - `provider`: String (`gemini`).
  - `model`: String (`gemini-2.5-flash`).
  - `promptTemplateVersion`: String (`v1`).
  - `inputHash`: String (64-character SHA-256 hex digest, enforced by database regex constraint `^[a-f0-9]{64}$`).
  - `state`: Enum `AiGenerationState` (`succeeded`, `validation_rejected`, `rate_limited`, `timeout`, `unavailable`, `malformed_output`, `grounding_rejected`, `failed`).
  - `errorCategory`: Nullable String.
  - `proposalCount`: Integer.
  - `evidenceCount`: Integer.
  - `rawTokensUsed`: Nullable Integer.
  - `durationMs`: Integer.
  - `createdAt`, `completedAt`: Timestamps.
- **Row Level Security**: Enabled and forced (`ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;`) with tenant isolation policy matching `current_setting('acres.organization_id', true)::uuid`.

### 4.2 Permission & Guard Enforcements
- Authentication: Valid session cookie required.
- Tenant Scope: `x-acres-organization-id` header required.
- CSRF Protection: `x-csrf-token` header required.
- RBAC: `reports.update` permission required (viewers denied with HTTP 403).
- Revision State: Target revision must be in `draft` status (published or in-review revisions rejected with HTTP 409).
- Acknowledgement: `acknowledgement: true` required in request body (rejected with HTTP 400 if missing or false).

---

## 5. Evaluation & Testing Suite

### 5.1 Synthetic Evaluation Dataset (`server/src/ai/evaluation/ai-evaluation-fixtures.ts`)
Comprehensive synthetic test fixtures covering:
1. `positive_grounded_claim`: Valid metrics with proper single/multi-evidence citations.
2. `prompt_injection_in_purpose`: Hostile instructions attempting jailbreaks and system prompt extraction.
3. `prompt_injection_in_snapshot`: Hostile payload embedded within snapshot JSON.
4. `hallucinated_citation`: Proposal citing unprovided or foreign evidence IDs.
5. `empty_citation`: Proposal making claims without citing evidence.
6. `malformed_json`: Truncated or non-JSON output.

### 5.2 Automated Evaluation Suite (`server/src/ai/evaluation/ai-evaluation.spec.ts`)
- Validates prompt builder delimiter isolation.
- Validates citation allow-list filtering.
- Validates deterministic rejection of injection attacks and hallucinated citations.

---

## 6. Configuration & Environment Variables

| Variable | Type | Default | Description |
| --- | --- | --- | --- |
| `AI_DRAFT_ENABLED` | boolean | `false` | Master toggle for AI draft preview endpoint |
| `AI_DRAFT_PROVIDER_TIER_UNPAID_ACKNOWLEDGED` | boolean | `false` | Mandatory acknowledgment of unpaid Gemini terms when `AI_DRAFT_ENABLED="true"` |
| `GEMINI_API_KEY` | string | `""` | Google Gemini API key (must not be placeholder in production) |
| `AI_DRAFT_MODEL` | string | `gemini-2.5-flash` | Gemini model name |
| `AI_DRAFT_TIMEOUT_MS` | integer | `15000` | Upstream API timeout in milliseconds (1000..60000) |
| `AI_DRAFT_MAX_PROPOSALS` | integer | `3` | Maximum candidate proposals generated per request (1..5) |
| `AI_DRAFT_MAX_CONTEXT_BYTES` | integer | `16384` | Context payload byte limit |
| `AI_DRAFT_MAX_OUTPUT_TOKENS` | integer | `2048` | Output token generation limit |
