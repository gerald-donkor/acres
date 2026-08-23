# Acres skills catalog

Status: generated/verified against `skills-lock.json` and the local skill trees
on 2026-08-23. The lockfile is the machine-readable source of exact hashes;
this file records why and when each skill belongs in the workflow.

## 1. Storage convention

Each skill is a real directory at the exact `.agents/skills/<name>` path listed
below. `.claude/skills/<name>` is a relative symlink to that directory. A new
installer-created top-level `agent/` mirror is not part of the Acres convention
and must be rejected. The only exception is a future explicitly approved
convention change recorded here and in `AGENTS.md`.

The catalog is instructions, not repository truth. Every execution reads the
complete `SKILL.md`, follows its routing to required references, and reconciles
the guidance with pinned dependencies, local framework docs, actual code, and
the owning Acres documentation.

## 2. Locked catalog

| name | upstream | exact local path | SHA-256 content hash | purpose and trigger |
| --- | --- | --- | --- | --- |
| `accessibility-compliance` | `wshobson/agents` | `.agents/skills/accessibility-compliance` | `e76877abeed83f3751d1e18c8205f02c8b5d3e7cc2e060670805b449f6faefdb` | WCAG 2.2-oriented semantics and assistive technology; load for application UI or accessibility audits |
| `api-design-principles` | `wshobson/agents` | `.agents/skills/api-design-principles` | `19715a3a3ff7bf7b1e2ab1cb631ebe810d5b050ed6b3ab0c358e39e5e2e6d33a` | REST/GraphQL responsibility and contract design; load for any API surface |
| `architecture-decision-records` | `wshobson/agents` | `.agents/skills/architecture-decision-records` | `bffeafc71791924809ca9e24bfe3f18e87b2a060dbe5484468b4ff06c8e693b2` | Durable architecture decisions and supersession; load when a significant system choice changes |
| `architecture-patterns` | `wshobson/agents` | `.agents/skills/architecture-patterns` | `a66aaa5aa49b75bec12b6270dcde8794b1f0cc75fbb9ecb999e43f8b723b461f` | Modular monolith, ports/adapters, DDD boundaries; load for backend/module architecture |
| `auth-implementation-patterns` | `wshobson/agents` | `.agents/skills/auth-implementation-patterns` | `f97118b792830d928ce691a44d0f38fb55a2032e2fa15b22b482c229d2853e87` | Sessions, RBAC, invitations, recovery; load for identity/authorization work |
| `caveman-commit` | `juliusbrussee/caveman` | `.agents/skills/caveman-commit` | `790a4eeace0be35c6691faf923518ba5bd50f1f1305d1101d09dd4971be94e00` | Compact Conventional Commit messages; load for every commit |
| `data-storytelling` | `wshobson/agents` | `.agents/skills/data-storytelling` | `90acc4df00f162fc2e22edab91ba4792a81b6d4868e6f2dd89a3d3a4da131fa3` | Evidence-led reporting and narrative; load for dashboards, reports, and AI drafts |
| `deployment-pipeline-design` | `wshobson/agents` | `.agents/skills/deployment-pipeline-design` | `57b928db2182b0fae02581e95a3b77f0354d2b1f5a48dd12eadf2f0ddbb34db8` | Promotion gates and rollback; load for deploy/release pipelines |
| `e2e-testing-patterns` | `wshobson/agents` | `.agents/skills/e2e-testing-patterns` | `6daed3254a84348588532aca327ec82a57cafefd7c97c50e75879788f7c1a18d` | Stable journey tests and fixture isolation; load for cross-system E2E work |
| `error-handling-patterns` | `wshobson/agents` | `.agents/skills/error-handling-patterns` | `73f0570edd3ddc740ba5411932a67954df375530bbffbe7fa0cecd8e59b0711e` | Stable errors, retry taxonomy, degradation; load for APIs and async workflows |
| `extract-design-system` | `arvindrk/extract-design-system` | `.agents/skills/extract-design-system` | `5f231fda377e304b202848f09ecc0fd42839355e76f60e06c3ceb7a643c15500` | Extract tokens from a public site; load only for an approved external design extraction |
| `frontend-design` | `anthropics/skills` | `.agents/skills/frontend-design` | `4eabc66183767153e404b39d1b839b1c37f2d82d86f0a0d7e880a579d8d62336` | Deliberate visual direction; load for any new or reshaped UI surface |
| `github-actions-templates` | `wshobson/agents` | `.agents/skills/github-actions-templates` | `93e92fd674dea084628e95f9c48af806f9672ac08f815c84f85adedb55742c59` | Hardened GitHub Actions workflows; load when CI changes |
| `grafana-dashboards` | `wshobson/agents` | `.agents/skills/grafana-dashboards` | `e9b692daf06faf96fa28b2b98f50b362e68b974db5ab503963a610c719cda79b` | Operator dashboards over telemetry; load for Grafana, never customer analytics UI |
| `gsap-core` | `greensock/gsap-skills` | `.agents/skills/gsap-core` | `c4a01101d9e1aafbf4b49f75d74f9349790d8741981ba0237c990093863035a6` | Core GSAP tweens/easing/responsive motion; load for GSAP work |
| `gsap-frameworks` | `greensock/gsap-skills` | `.agents/skills/gsap-frameworks` | `4852e85a48088d9044b08ebd1db607915b628c0c3ec7e04300713f546728fbdf` | Vue/Svelte GSAP lifecycle; load only if such a framework is introduced |
| `gsap-performance` | `greensock/gsap-skills` | `.agents/skills/gsap-performance` | `863842ac2d7aee53fd4f0025c960173d7ad3e658a5715b89b2211fa280213c1f` | Smooth transform/batching patterns; load for motion performance or all production GSAP review |
| `gsap-plugins` | `greensock/gsap-skills` | `.agents/skills/gsap-plugins` | `791bda0e6e460511fe82a78e745db519b88ffaeeab4d04a74879a03ca4f41740` | GSAP plugin registration and plugin APIs; load when an exact plugin is used |
| `gsap-react` | `greensock/gsap-skills` | `.agents/skills/gsap-react` | `7d3b52822681a4158e371f895c58fb7030ecaf33f585a534b7162f9e92c5d893` | React GSAP scoping/cleanup; mandatory with GSAP in this React client |
| `gsap-scrolltrigger` | `greensock/gsap-skills` | `.agents/skills/gsap-scrolltrigger` | `1cdc5647693783cb7a662d84a5de434c88a051ed56b4d33597c9b5782b5973e6` | ScrollTrigger pin/scrub/trigger behavior; load for scroll-linked GSAP |
| `gsap-timeline` | `greensock/gsap-skills` | `.agents/skills/gsap-timeline` | `54981c2feec5a9c0d57988aeb32315af32bdeadd261550d5e9db7a7b1f08b487` | Choreographed GSAP sequences; load when timelines are used |
| `gsap-utils` | `greensock/gsap-skills` | `.agents/skills/gsap-utils` | `1ab2387f6e694718a4f1b5acf2a4ab16e1b884c3428adf5f6b26d830f00826cf` | GSAP mapping/clamp/snap helpers; load when those utilities are used |
| `handoff` | `mattpocock/skills` | `.agents/skills/handoff` | `20e5f4afdef502637510bc5c64d27645d3c85c88df9cb006824bbb0980166319` | Compact conversation handoff; load only when a handoff is requested |
| `javascript-testing-patterns` | `wshobson/agents` | `.agents/skills/javascript-testing-patterns` | `8d0a8d7615ff343770af0218720691d56c55ae258793565936c8b3a97e188f51` | Jest/Testing Library unit/integration structure; load for TS test work |
| `kpi-dashboard-design` | `wshobson/agents` | `.agents/skills/kpi-dashboard-design` | `d886fe70e98d7555ece81ae8c53579f0fd4a0042c646cf88a1054651ce14fb72` | Consistent, decision-useful metrics; load for analytics/dashboard hierarchy |
| `llm-evaluation` | `wshobson/agents` | `.agents/skills/llm-evaluation` | `af89a6013eacc5db7afe102b4a2af95ad8dcad4721e35700cba24b1ebd35c94f` | Grounding/safety/quality regression; load for optional AI evaluation |
| `nestjs-best-practices` | `Kadajett/agent-nestjs-skills` | `.agents/skills/nestjs-best-practices` | `58f8a630637be3acce1f118c747d68160346ada8a43d76cb52a5b4c4edaa2d37` | Nest modules, DI, security, performance; load for every `server/` change |
| `openapi-spec-generation` | `wshobson/agents` | `.agents/skills/openapi-spec-generation` | `d062c891d58ef7e38c56360d4c325aff70247d1b5880b8b299098d7e51e38294` | Generate/check OpenAPI; load for REST contract generation or drift checks |
| `playwright` | `openai/skills` | `.agents/skills/playwright` | `595a334de3bd5335f442a33d1bdefb01207c88c99fe43e3bd99b0d5435f230de` | Real-browser automation and evidence; load for browser acceptance/debugging |
| `postgres-best-practices` | `neondatabase/postgres-skills` | `.agents/skills/postgres-best-practices` | `76ad432ee02cdc525f24fe8a483b17de8a730c56118380852b60ce0159948a88` | PostgreSQL schema/index/migration/RLS guidance; load for DB work |
| `prometheus-configuration` | `wshobson/agents` | `.agents/skills/prometheus-configuration` | `afeed1538c349e46d0e047c0cf5089dcdf0c0e6d450598bba1f86634a15d37dd` | Prometheus scrape/record/alert design; load when operational metrics are added |
| `prompt-engineering-patterns` | `wshobson/agents` | `.agents/skills/prompt-engineering-patterns` | `6a8cf3a5e9120641c1c1953c870c156377c57be4a806e1df6fc5f073a41cc639` | Versioned constrained prompts and structured output; load for optional AI prompts |
| `receiving-code-review` | `obra/superpowers` | `.agents/skills/receiving-code-review` | `59361179fc9225173e0c145ffd9bafbf9fdbf8b43ce3dc308497a0b4f83a6063` | Verify reviewer feedback before fixes; load for every implementation review |
| `requesting-code-review` | `obra/superpowers` | `.agents/skills/requesting-code-review` | `004f340ae65811095d6a9bb0a759c87d0a8085c5e705dbb019b011626293d2e9` | Prepare/dispatch reviewer subagent; load after self-verification every implementation |
| `sast-configuration` | `wshobson/agents` | `.agents/skills/sast-configuration` | `6169b0d02b289a8264010f9601ceb4f57b0ca1e9d463f2f8936b2d88a58267b8` | Static security analysis and triage; load when adding/maintaining SAST |
| `secrets-management` | `wshobson/agents` | `.agents/skills/secrets-management` | `ca8d6e0507564a438424b9408922f469ceb20827d6f60d845c103df8e5ac11e7` | Secret injection, privilege, rotation, response; load for CI/runtime credentials |
| `security-best-practices` | `openai/skills` | `.agents/skills/security-best-practices` | `c27616fb4e27999605b90b261dc729784420c8d77bd1a98748384ffaa5b35704` | Secure-by-default JS/TS web guidance; load for explicit security design/review and security-sensitive implementation |
| `security-threat-model` | `openai/skills` | `.agents/skills/security-threat-model` | `b3ad2dc0b2eee1f189680fdb8cf3b17853f12ab3403d389393f4237ebc6f9821` | Repository-grounded assets/boundaries/abuse paths; load for explicit threat-model work or a changed trust boundary |
| `shadcn` | `shadcn/ui` | `.agents/skills/shadcn` | `c1a68ee06a668aced9ab2b5fbdea5f989864123794eb2e056b339a072dbb7f10` | Base-UI shadcn component management; load for `components.json` or `client/components/ui/` work |
| `sql-optimization-patterns` | `wshobson/agents` | `.agents/skills/sql-optimization-patterns` | `19ff8ce86d20aa39cace441e15d23feb9b91be5fbed95526b5bd9ee3bffb6411` | Query plans, indexes, N+1 performance; load for measured SQL/query optimization |
| `tailwind-4-docs` | `Lombiq/Tailwind-Agent-Skills` | `.agents/skills/tailwind-4-docs` | `de756f5f03cc20a029983875b00b9dfef9d0ba8567d242c5cbb0262037d0a134` | Tailwind v4 verified utilities/config; load for any unverified v4 API |
| `tailwind-design-system` | `wshobson/agents` | `.agents/skills/tailwind-design-system` | `cd61afd28f594e8b6712b61749209cbb4466e3eec4e4223793bbd97fc85c1b63` | Token/component-system design; load for tokens or component variants |
| `vercel-react-best-practices` | `vercel-labs/agent-skills` | `.agents/skills/vercel-react-best-practices` | `ca7b0c0c6e5f2750043f7f0cd72d16ac4e2abc48f9b5500d047a4b77a2506212` | React/Next performance and server/client boundaries; load for component work |
| `vercel-react-view-transitions` | `vercel-labs/agent-skills` | `.agents/skills/vercel-react-view-transitions` | `b1be40dfc6e714612020c7583b574cc4c92a1b5bc185a7dd3eea5c0123653d1c` | React View Transition API; load for route/state/shared-element transitions |
| `web-design-guidelines` | `vercel-labs/agent-skills` | `.agents/skills/web-design-guidelines` | `f3bc47f890f42a44db1007ab390709ec368e4b8c089baee6b0007182236ac474` | UI accessibility/interaction audit floor; load before calling UI finished |

### 2.1 Exact upstream skill paths

These are the `skillPath` values copied from `skills-lock.json`; together with
the source, local path, hash, and trigger table above they make every lock entry
reproducible without duplicating skill contents.

| name | exact upstream `skillPath` |
| --- | --- |
| `accessibility-compliance` | `plugins/ui-design/skills/accessibility-compliance/SKILL.md` |
| `api-design-principles` | `plugins/backend-development/skills/api-design-principles/SKILL.md` |
| `architecture-decision-records` | `plugins/documentation-generation/skills/architecture-decision-records/SKILL.md` |
| `architecture-patterns` | `plugins/backend-development/skills/architecture-patterns/SKILL.md` |
| `auth-implementation-patterns` | `plugins/developer-essentials/skills/auth-implementation-patterns/SKILL.md` |
| `caveman-commit` | `skills/caveman-commit/SKILL.md` |
| `data-storytelling` | `plugins/business-analytics/skills/data-storytelling/SKILL.md` |
| `deployment-pipeline-design` | `plugins/cicd-automation/skills/deployment-pipeline-design/SKILL.md` |
| `e2e-testing-patterns` | `plugins/developer-essentials/skills/e2e-testing-patterns/SKILL.md` |
| `error-handling-patterns` | `plugins/developer-essentials/skills/error-handling-patterns/SKILL.md` |
| `extract-design-system` | `skills/extract-design-system/SKILL.md` |
| `frontend-design` | `skills/frontend-design/SKILL.md` |
| `github-actions-templates` | `plugins/cicd-automation/skills/github-actions-templates/SKILL.md` |
| `grafana-dashboards` | `plugins/observability-monitoring/skills/grafana-dashboards/SKILL.md` |
| `gsap-core` | `skills/gsap-core/SKILL.md` |
| `gsap-frameworks` | `skills/gsap-frameworks/SKILL.md` |
| `gsap-performance` | `skills/gsap-performance/SKILL.md` |
| `gsap-plugins` | `skills/gsap-plugins/SKILL.md` |
| `gsap-react` | `skills/gsap-react/SKILL.md` |
| `gsap-scrolltrigger` | `skills/gsap-scrolltrigger/SKILL.md` |
| `gsap-timeline` | `skills/gsap-timeline/SKILL.md` |
| `gsap-utils` | `skills/gsap-utils/SKILL.md` |
| `handoff` | `skills/productivity/handoff/SKILL.md` |
| `javascript-testing-patterns` | `plugins/javascript-typescript/skills/javascript-testing-patterns/SKILL.md` |
| `kpi-dashboard-design` | `plugins/business-analytics/skills/kpi-dashboard-design/SKILL.md` |
| `llm-evaluation` | `plugins/llm-application-dev/skills/llm-evaluation/SKILL.md` |
| `nestjs-best-practices` | `skills/nestjs-best-practices/SKILL.md` |
| `openapi-spec-generation` | `plugins/documentation-generation/skills/openapi-spec-generation/SKILL.md` |
| `playwright` | `skills/.curated/playwright/SKILL.md` |
| `postgres-best-practices` | `skills/postgres-best-practices/SKILL.md` |
| `prometheus-configuration` | `plugins/observability-monitoring/skills/prometheus-configuration/SKILL.md` |
| `prompt-engineering-patterns` | `plugins/llm-application-dev/skills/prompt-engineering-patterns/SKILL.md` |
| `receiving-code-review` | `skills/receiving-code-review/SKILL.md` |
| `requesting-code-review` | `skills/requesting-code-review/SKILL.md` |
| `sast-configuration` | `plugins/security-scanning/skills/sast-configuration/SKILL.md` |
| `secrets-management` | `plugins/cicd-automation/skills/secrets-management/SKILL.md` |
| `security-best-practices` | `skills/.curated/security-best-practices/SKILL.md` |
| `security-threat-model` | `skills/.curated/security-threat-model/SKILL.md` |
| `shadcn` | `skills/shadcn/SKILL.md` |
| `sql-optimization-patterns` | `plugins/developer-essentials/skills/sql-optimization-patterns/SKILL.md` |
| `tailwind-4-docs` | `skills/tailwind-4-docs/SKILL.md` |
| `tailwind-design-system` | `plugins/frontend-mobile-development/skills/tailwind-design-system/SKILL.md` |
| `vercel-react-best-practices` | `skills/react-best-practices/SKILL.md` |
| `vercel-react-view-transitions` | `skills/react-view-transitions/SKILL.md` |
| `web-design-guidelines` | `skills/web-design-guidelines/SKILL.md` |

## 3. Why the architecture skills were selected

The 24 skills added by the architecture-foundation phase cover the exact later
surfaces: modular boundaries; REST/GraphQL/OpenAPI/ADRs; PostgreSQL and SQL;
security/threat modeling/auth/secrets/SAST; browser, unit, and E2E tests; errors;
analytics/reporting/AI; CI/deployment; telemetry; and application accessibility.
They complement the existing Acres visual, Tailwind, shadcn, React, GSAP,
NestJS, review, and commit disciplines.

The exact required/conditional phase manifests live beside every phase in
[`build-plan.md`](build-plan.md). This compact index identifies the phases that
require each architecture-foundation addition; “conditional” means the phase
loads it only when the named surface is present.

| newly added skill | required phase(s); conditional phase(s) |
| --- | --- |
| `accessibility-compliance` | required 1, 5, 9, 10; conditional 12 |
| `api-design-principles` | required 1, 4, 5, 6, 9, 10; conditional 3, 7, 8, 11 |
| `architecture-decision-records` | required 1; conditional whenever a later phase changes a durable decision |
| `architecture-patterns` | required 1–4, 6–8, 11–12 |
| `auth-implementation-patterns` | required 1, 3–5 |
| `data-storytelling` | required 1, 8–11 |
| `deployment-pipeline-design` | required 1, 12; conditional 2 |
| `e2e-testing-patterns` | required 1, 4–7, 9–12 |
| `error-handling-patterns` | required 1, 3–4, 6–8, 10–11 |
| `github-actions-templates` | required 1–2, 12 |
| `grafana-dashboards` | required 1, 12 |
| `javascript-testing-patterns` | required 1–11 |
| `kpi-dashboard-design` | required 1, 8–9; conditional 10 |
| `llm-evaluation` | required 1, 11 |
| `openapi-spec-generation` | required 1, 4; conditional 7, 9–11 |
| `playwright` | required 1, 5, 9–10, 12; conditional 7 |
| `postgres-best-practices` | required 1–3, 7–9; conditional 4, 6, 10–12 |
| `prometheus-configuration` | required 1, 12; conditional 2, 6 |
| `prompt-engineering-patterns` | required 1, 11 |
| `sast-configuration` | required 1, 12; conditional 2 |
| `secrets-management` | required 1–2, 6, 11–12 |
| `security-best-practices` | required 1–7, 9–12; conditional 8 |
| `security-threat-model` | required 1, 3, 6–7, 11–12; conditional 4 |
| `sql-optimization-patterns` | required 1, 7–9; conditional 3–4, 6, 10, 12 |

The phase deliberately excludes:

- `postgresql-table-design`, which duplicates the selected broader PostgreSQL
  skill;
- `nodejs-backend-patterns`, which targets raw Express/Fastify and overlaps the
  Nest-specific skill and verified Nest docs;
- `microservices-patterns`, because Acres is modular-monolith-first and will
  load it only after an approved extraction;
- `data-quality-frameworks`, whose Great Expectations/dbt-oriented stack is not
  part of this TypeScript/PostgreSQL build; Acres still builds native data
  contracts and quality checks;
- `rag-implementation`, because optional AI receives already-authorized
  evidence and has no approved vector/retrieval system;
- Kubernetes, Terraform, multi-cloud, service-mesh, and provider deployment
  skills until an operator/provider decision replaces Compose+Caddy;
- Prisma 8 RC and hosted/claimable-Postgres skills while Prisma 7.9.1 and
  self-hosted PostgreSQL remain the approved baseline.

## 4. Installation and update procedure

From the repository root, use `npx skills add` with an explicit upstream,
explicit `--skill` names, `--agent '*'`, and `-y`; the wshobson multi-skill
install also uses `--full-depth`. Do not hand-copy folders.

The architecture-foundation phase ran these exact commands:

```bash
npx skills add openai/skills \
  --skill security-best-practices security-threat-model playwright \
  --agent '*' -y

npx skills add neondatabase/postgres-skills \
  --skill postgres-best-practices \
  --agent '*' -y

npx skills add wshobson/agents \
  --skill architecture-patterns api-design-principles \
  openapi-spec-generation architecture-decision-records \
  auth-implementation-patterns javascript-testing-patterns \
  e2e-testing-patterns error-handling-patterns \
  sql-optimization-patterns kpi-dashboard-design data-storytelling \
  prompt-engineering-patterns llm-evaluation \
  deployment-pipeline-design github-actions-templates \
  prometheus-configuration grafana-dashboards secrets-management \
  sast-configuration accessibility-compliance \
  --agent '*' --full-depth -y
```

After any install/update:

1. Confirm each requested `.agents/skills/<name>` is a real directory and its
   complete `SKILL.md` can be read.
2. Confirm `.claude/skills/<name>` is a valid relative symlink to it.
3. Inspect `skills-lock.json` source, `skillPath`, and computed hash.
4. Compare the changed skill contents and lock diff; remove unrelated generated
   mirrors or metadata. Never delete an existing user skill to make an install
   look clean.
5. Read upstream release/instruction changes. If triggers or behavior changed
   materially, update this catalog, `AGENTS.md`, and affected phase manifests.
6. Run repository checks and the mandatory two-stage review before committing.

The prompt rationale is preserved in
`prompts/16-acres-system-architecture.md`; the exact resulting state is the
lockfile and this catalog. A future phase repeats exact required skill names
from [`build-plan.md`](build-plan.md), never “use the prior phase's skills.”
