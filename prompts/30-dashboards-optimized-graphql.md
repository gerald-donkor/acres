# 30 - dashboards and optimized GraphQL

## Scope, and why it is next

The committed repository is on `main` at `deb53f8` (`feat(analytics): add
metric foundation`). `docs/analytics.md` records Phase 8 as implemented and
explicitly says no dashboard UI, saved view, report, export, or AI path exists.
The earliest ordered target whose dependencies are now committed is therefore
Phase 9, "dashboards and optimized GraphQL."

Implement Phase 9 as the first real product analytics surface:

- add organization-scoped saved analytical views and dashboard composition
  persistence;
- extend the existing authenticated, read-only `/graphql` surface with
  dashboard-ready metric, aggregate, observation, evidence, and saved-view read
  models backed by the Phase 8 analytics services;
- replace the `/app` placeholder dashboard state with accessible browse and
  compare dashboards using real analytics data, not invented values;
- add filters for metric, region, period, dataset version, and dimension hash
  where the existing analytics model supports them;
- surface metric definition, unit, calculation version, quality state, dataset
  version, and evidence links wherever a value is shown;
- preserve tenant isolation, selected-organization context, RLS, GraphQL
  complexity limits, query-count controls, and server-side permission checks;
- record the implemented dashboard/GraphQL state in a new
  `docs/dashboards.md` file and add that file to the `AGENTS.md` docs index in
  the same implementation.

This is a prompt-sized Phase 9 slice. It should make a permitted member browse
and compare real published analytics and save/reopen a view. It must not build
reports, exports, AI, public sharing, billing, or upload/mapping UI.

## Reference material read while preparing this prompt

Repository and workflow authority:

- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first execution,
  skill loading, checks, review/commit flow, prompt numbering, design prompt
  requirements, and no-fabrication rules.
- `docs/build-plan.md` §§1, 10, and 14: Phase 9 dependency, behavior,
  subsystems, non-goals, security/failure cases, tests, observability,
  rollback, documentation owner, skill manifest, and sequence gates.
- `docs/skills.md`: exact local skill paths, hashes, triggers, and the Phase 9
  required and conditional skills.

Current implementation and product authority:

- `docs/authenticated-app.md`: current same-origin bridge, server/browser API
  clients, active organization preference, `/app` shell, responsive behavior,
  and Playwright setup.
- `docs/analytics.md`: current Phase 8 schema, mapping contract, publication
  semantics, analytics REST routes, query-plan evidence gap, verification, and
  residual dashboard gap.
- `docs/backend.md`: current Nest, Prisma, REST/GraphQL, envelope, generated
  contract, RLS, worker, and package state.
- `docs/product.md`: B2B regional analytics product job, roles/permissions,
  browse regional metrics, save a view/dashboard, V1 boundary, data
  classification, success criteria, and glossary.
- `docs/system-architecture.md`: modular-monolith principles, tenant/RLS
  request flow, current/target component inventory, analytics/dashboard target,
  and GraphQL/security boundaries.
- `docs/security.md`: TM-01 cross-tenant access, TM-10 GraphQL abuse, TM-15
  secrets, TM-17 SQL/RLS bypass, TM-20 DoS, and the security acceptance suite.
- `docs/design-system.md`, `docs/components.md`, `docs/polish.md`, and
  `docs/automation.md`: Acres tokens, component primitives, accessibility
  layer, measurement/browser recipes, and Tailwind snapshot limitation.

Current implementation inspected:

- `client/app/app/page.tsx`: protected workspace route, session/org loading,
  active organization selection, and error handling.
- `client/components/acres/app/app-shell.tsx`: current shell, role-filtered
  navigation, dashboard placeholder, organization switcher, and no-data empty
  state.
- `client/lib/api/server.ts` and `client/lib/api/browser.ts`: existing
  no-store authenticated server reads and CSRF browser mutation client.
- `client/components/ui/`: installed base-nova shadcn primitives, including
  chart, table, tabs, badge, empty, skeleton, select, tooltip, and sidebar.
- `server/src/graphql/**`: current read-only GraphQL resolver/types/loaders,
  cursor codec, pagination, limits, context, and error filter.
- `server/src/analytics/**`: current analytics service, repository, DTOs,
  publication service, tests, and REST read models.
- `packages/shared/src/**`: existing shared organization, region, API, job, and
  validation contracts.

Skills loaded while preparing this prompt:

- `.agents/skills/frontend-design/SKILL.md`
- `.agents/skills/tailwind-design-system/SKILL.md`
- `.agents/skills/tailwind-4-docs/SKILL.md`
- `.agents/skills/tailwind-4-docs/references/engineering-playbook.md`
- `.agents/skills/tailwind-4-docs/references/gotchas.md`
- `.agents/skills/shadcn/SKILL.md`
- `.agents/skills/vercel-react-best-practices/SKILL.md`
- `.agents/skills/web-design-guidelines/SKILL.md`
- `.agents/skills/accessibility-compliance/SKILL.md`
- `.agents/skills/api-design-principles/SKILL.md`
- `.agents/skills/kpi-dashboard-design/SKILL.md`
- `.agents/skills/data-storytelling/SKILL.md`
- `.agents/skills/postgres-best-practices/SKILL.md`
- `.agents/skills/postgres-best-practices/references/schema-design.md`
- `.agents/skills/sql-optimization-patterns/SKILL.md`
- `.agents/skills/security-best-practices/SKILL.md`
- `.agents/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`
- `.agents/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md`
- `.agents/skills/security-best-practices/references/javascript-general-web-frontend-security.md`
- `.agents/skills/nestjs-best-practices/SKILL.md`
- `.agents/skills/architecture-patterns/SKILL.md`
- `.agents/skills/e2e-testing-patterns/SKILL.md`
- `.agents/skills/javascript-testing-patterns/SKILL.md`
- `.agents/skills/playwright/SKILL.md`
- `.agents/skills/requesting-code-review/SKILL.md`
- `.agents/skills/receiving-code-review/SKILL.md`
- `.agents/skills/caveman-commit/SKILL.md`

## SKILLS USED

- `frontend-design` — design the authenticated dashboard as a focused
  operational product surface, not a marketing page.
- `tailwind-design-system` — compose with existing v4 tokens/utilities and add
  new tokens only when they are reusable product primitives.
- `tailwind-4-docs` — verify any Tailwind v4 API before use; the local official
  snapshot is currently uninitialized, so implementation must initialize it
  with user-approved network access or use the documented fallback while
  avoiding unverified v4 claims.
- `shadcn` — inspect local base-nova component APIs before using chart, table,
  tabs, select, empty, skeleton, tooltip, or sidebar primitives.
- `vercel-react-best-practices` — keep Next Server Component reads parallel,
  no-store, user/org-safe, and avoid unnecessary client bundle/data
  serialization.
- `web-design-guidelines` — audit final UI interaction, hierarchy, focus,
  layout, and responsive behavior against the current guidelines.
- `accessibility-compliance` — ensure WCAG 2.2 AA-oriented tables, charts,
  filters, states, live errors, keyboard order, and responsive touch targets.
- `api-design-principles` — shape GraphQL read models and any supporting REST
  compatibility without leaking database structure or breaking envelopes.
- `kpi-dashboard-design` — keep the dashboard decision-useful, limited to
  meaningful metrics, with visible definitions, units, context, and drilldown.
- `data-storytelling` — present comparisons and evidence without invented
  causality, unsupported recommendations, or hidden methodology.
- `postgres-best-practices` — add saved-view/dashboard schema with typed IDs,
  timestamptz fields, scoped uniqueness, and additive migrations.
- `sql-optimization-patterns` — prove dashboard queries, GraphQL loaders, and
  saved-view reads avoid N+1 behavior and have representative plans.
- `security-best-practices` — keep frontend/server code secure by default:
  no client secrets, no raw HTML sinks, no unsafe redirects, no leaked PII or
  tenant data in logs/errors.
- `nestjs-best-practices` — implement GraphQL resolvers, services, DTOs, guards,
  and tests with focused Nest modules and DI.
- `architecture-patterns` — keep dashboard/query application services separate
  from transport adapters and preserve bounded-context ownership.
- `e2e-testing-patterns` — add focused real-browser journeys for dashboard
  browse, compare, save/reopen, empty/error/loading, and responsive behavior.
- `javascript-testing-patterns` — add unit/integration tests for serializers,
  filters, GraphQL query behavior, saved-view permissions, and React helpers.
- `playwright` — use real browser evidence and screenshots at 375, 800, and
  1280 after implementation.
- `requesting-code-review` — mandatory review after self-verification and
  before finishing implementation.
- `receiving-code-review` — mandatory evaluation of reviewer feedback before
  applying any fix.
- `caveman-commit` — mandatory final local commit message.

## Reference Deltas

There is no static dashboard comp in `client/public/assets/ui/`; the four visual
references cover the marketing site and global design system, not authenticated
analytics. Therefore:

- use the measured Acres palette, typography, radii, container, rules, focus
  treatment, and component rules from `docs/design-system.md`,
  `docs/components.md`, and `docs/polish.md`;
- treat the authenticated shell constraints in `docs/authenticated-app.md` as
  the app-surface visual authority;
- do not invent decorative marketing hero sections, oversized cards, gradient
  backgrounds, fake data illustrations, or comp-derived pixel claims for a
  surface that has no comp;
- use charts only when backed by real analytics values and always provide a
  table or textual equivalent that carries the same meaning;
- record every deliberate deviation from existing shell design in
  `docs/dashboards.md`.

## Breakpoint Behaviour

- `375px`: one-column shell content; filters collapse into an accessible
  disclosure or stacked controls; charts never require horizontal scrolling to
  understand the headline; data tables may scroll horizontally only inside a
  labelled region with keyboard access; core controls keep at least 44px touch
  targets; no text overlaps or overflows its control.
- `800px`: persistent app navigation remains; dashboard summary, filters, chart,
  comparison table, and evidence panels use a two-column or stacked hybrid
  layout based on available content; organization switching and saved-view
  actions remain reachable without layout shift.
- `1280px`: use the existing `max-w-page` shell width; keep dashboard density
  appropriate for repeated analytical work; avoid nested cards; chart/table and
  evidence/detail regions align to a stable grid and do not change size when
  filters or loading states update.

## Target Behavior

### GraphQL read models

Extend the existing authenticated read-only `/graphql` API. Reuse the current
GraphQL context, session guard, selected organization, permission policy,
cursor codec, request-scoped DataLoader pattern, query limits, timeout behavior,
and sanitized error filter.

Add GraphQL types and queries for:

- active metric definitions;
- aggregate windows filtered by metric, region, dataset version, period range,
  aggregate type, and dimension hash;
- observation detail windows where needed for drilldown;
- aggregate evidence resolving to observations and dataset versions;
- saved dashboard views and their selected filters/presentation state;
- a dashboard summary query that returns enough data for the initial `/app`
  dashboard without a client-side waterfall.

Requirements:

- require `analytics.read` for all analytics/dashboard reads;
- add write permission checks for saved views using an existing suitable role
  policy or a new centralized permission such as `dashboards.manage`;
- keep GraphQL mutations out of scope unless saving a view cannot be cleanly
  represented through existing REST/idempotency patterns. Prefer a small
  `/api/v1/dashboard-views` REST mutation if that better matches existing CSRF
  and idempotency conventions;
- use opaque cursors for windowed reads and indistinguishable not-found behavior
  for foreign IDs;
- do not expose raw Prisma JSON shapes directly when a typed GraphQL shape is
  reasonable; JSON may remain only for bounded dimensions/quality summaries
  whose schema is already documented in analytics.

### Saved views and dashboards

Add the smallest durable schema needed for Phase 9:

- `DashboardView` or equivalent organization-owned saved view with public ID,
  organization ID, owner/creator account ID, name, description if needed,
  filter state, presentation state, created/updated timestamps, and optional
  soft deletion/status;
- optional dashboard composition rows only if one saved-view table is
  insufficient. Avoid building a full report/editor model;
- RLS forced on all tenant-owned rows, runtime/test role privileges updated,
  and real DB negative tests for absent/foreign organization context;
- additive Prisma migration with reviewed SQL, no destructive rewrite of
  analytics tables, and no migration that needs existing product data to be
  fabricated.

Saved views must store query/presentation intent, not copied metric values.
Opening a saved view re-runs authorized analytics reads against current
permitted evidence. If a referenced metric/region/version is missing or no
longer visible, show a concrete empty/error state and keep the saved view
recoverable.

### Client dashboard UI

Replace the placeholder dashboard affordance inside `/app` with real product
navigation and pages. Prefer route structure that keeps the workspace shell
stable, for example:

- `/app` redirects or renders an overview dashboard when an active organization
  exists;
- `/app/dashboards` lists saved views and recent/current analytics summaries;
- `/app/dashboards/[viewId]` opens a saved view;
- `/app/dashboards/new` may be omitted if inline save from filtered browse is
  simpler and accessible.

Make the UI usable with the current backend data:

- if no metrics exist, render an `Empty` state that names the missing
  prerequisite without suggesting fake data;
- if metrics exist, render filter controls, a compact summary, a comparison
  chart using `client/components/ui/chart.tsx`/Recharts, a table alternative,
  quality/evidence details, and save/reopen controls;
- show metric label, key, unit, value type, allowed aggregation, calculation
  version, period, region, observation count, quality summary, and dataset
  version/evidence where available;
- keep body copy plain and operational. Do not reintroduce the removed auth
  status ledger or marketing promises inside `/app`;
- avoid client-only authorization. UI may hide actions by role, but server
  routes/resolvers must enforce permission.

### Data fetching and caching

- Initial dashboard reads should happen in Server Components through
  server-only helpers and `cache: "no-store"` unless a user/org-safe cache key
  is explicitly implemented and tested.
- Browser mutations for saving/updating/deleting saved views must use
  same-origin `/api/v1`, credentials, CSRF, and idempotency where applicable.
- Do not import server-only API helpers, DB clients, secrets, or GraphQL server
  code into `"use client"` components.
- Avoid request waterfalls: start independent session/organization/dashboard
  reads in parallel where the dependency graph allows it.

## Measurements and verification procedure

There are no dashboard comp coordinates to hit. The implementation must produce
evidence through live browser measurement:

- inspect layout at 375, 800, and 1280 viewport widths;
- confirm no horizontal document overflow at those widths;
- confirm primary interactive controls are at least 44px in both dimensions;
- confirm chart and table alternatives are both present when data exists;
- confirm loading, empty, error, and saved-view states do not resize the shell
  in a way that causes incoherent overlap;
- run a color/theme scan of touched CSS/TSX to ensure the app still uses Acres
  tokens and does not become a one-note palette or introduce unapproved raw
  colors.

Use `docs/automation.md` recipes and Playwright/browser screenshots for
evidence. If exact pixel assertions are added, derive them from the live DOM or
documented token measurements, not from memory.

## Expected Impact

Routes likely to change or be added:

- `client/app/app/page.tsx`
- `client/app/app/layout.tsx` only if nested app routing needs a route-level
  shell adjustment
- `client/app/app/dashboards/**`
- `client/components/acres/app/**`
- `client/lib/api/**`
- `server/src/graphql/**`
- `server/src/analytics/**` only for query/read-model helpers, not for changing
  Phase 8 publication semantics unless a bug is found
- `server/src/organizations/permissions.ts`
- `server/prisma/schema.prisma` and a new migration if saved views are added
- `packages/shared/src/**` for shared dashboard/saved-view DTOs if REST
  mutations are added
- `docs/api/openapi.json`, `docs/api/schema.graphql`, and
  `docs/api/contracts.md` through `npm run contracts:generate`
- `docs/dashboards.md`, `AGENTS.md` docs index, and any precise updates needed
  in `docs/product.md`, `docs/backend.md`, `docs/security.md`, or
  `docs/system-architecture.md`

Do not edit marketing landing sections, global chrome, image assets, upload
pipeline, ingestion parser behavior, analytics calculation semantics, report
models, export models, AI code, CI, deployment manifests, or unrelated shadcn
primitives unless implementation proves a direct dependency and records why.

## Non-goals

- No reports, report revisions, exports, PDF/CSV/XLSX generation, or formula
  escaping UI.
- No optional AI, narrative generation, forecasts, recommendations, or
  unsupported "insight" claims.
- No upload UI, mapping UI, ingestion-run management UI, or public data
  connector.
- No public dashboard sharing, anonymous access, external viewers, billing, or
  entitlement model.
- No GraphQL mutations except if saving a view is explicitly justified against
  the existing REST/CSRF/idempotency path.
- No new animation library usage. Exact GSAP skills are not required unless the
  implementation introduces approved GSAP interactions; prefer no new motion
  beyond existing CSS transitions and respect reduced motion.
- No Tailwind config file. Tailwind v4 tokens remain in
  `client/app/globals.css` `@theme`.

## Implementation plan

1. Re-read `AGENTS.md`, this prompt, and all owning docs named above.
2. Re-load every skill listed in `SKILLS USED`; additionally load
   `openapi-spec-generation` if REST contracts change and exact GSAP or
   `vercel-react-view-transitions` skills only if those APIs are actually used.
3. Verify framework APIs from local sources before code:
   - Next 16.3 routing, `headers()`, `cookies()`, caching, forms/actions, and
     route-handler conventions in `client/node_modules/next/dist/docs/`;
   - local base-nova shadcn component props in `client/components/ui/`;
   - Nest GraphQL and installed package behavior in `node_modules/` or
     official docs if local docs are insufficient.
4. Inspect current Prisma schema, migrations, GraphQL contracts, analytics
   service/repository, API bridge, app shell, and client E2E fixtures.
5. Design the saved-view schema and permission contract. Prefer one additive
   table and a small centralized permission addition. Write the migration and
   forced RLS policies before using the model.
6. Implement server application services/repositories for saved views and
   dashboard query read models. Keep controllers/resolvers as adapters.
7. Extend GraphQL types/resolvers/loaders with bounded analytics and saved-view
   queries. Add query-count/complexity/foreign-ID tests.
8. Add REST saved-view mutations only if chosen. Use DTO validation, CSRF via
   the existing bridge, idempotency for creation, OpenAPI generation, and
   shared DTOs if needed.
9. Build the client route structure and components. Keep server data fetching
   in Server Components, isolate interactive filters/save controls into small
   client leaves, and avoid importing server-only modules into browser code.
10. Add accessible chart/table/filter/detail states:
    - `Empty` for no metrics or no matching results;
    - `Skeleton` or stable loading states where suspense/client transitions are
      introduced;
    - `Alert` with request ID for API failures;
    - table alternative for every chart;
    - keyboard-reachable evidence/details.
11. Add focused tests:
    - server unit/integration tests for saved views, permissions, RLS,
      GraphQL read models, cursors, foreign IDs, and query counts;
    - client tests/helpers for API parsing or filter serialization if added;
    - Playwright E2E against built client/server for authenticated dashboard
      browse, compare, save/reopen, no-metrics empty state, forbidden action,
      organization switch cache residue, and 375/800/1280 layout.
12. Regenerate contracts if REST or GraphQL schema changes and inspect the diff.
13. Update docs in the same implementation: add `docs/dashboards.md`, add its
    row to `AGENTS.md`, and update existing docs only where current
    implemented state changed.
14. Run all verification commands, quote real output, fix failures, then run
    the mandatory requesting/receiving code-review loop. Re-review if feedback
    causes significant architecture, GraphQL, schema, or UI changes.
15. Stage only approved files, inspect staged diff, write the commit message
    with `caveman-commit`, and commit locally to `main`. Do not push.

## Verification commands

Run from the repository root unless noted and quote real output:

```bash
git diff --check
npm run prisma:validate --workspace=@acres/server
npm run prisma:migrate:deploy --workspace=@acres/server
npm run test --workspace=@acres/server
npm run test:e2e --workspace=@acres/server
npm run contracts:generate
npm run contracts:check
npm run lint
npm run typecheck
npm run build
npm run test:server
npm run test:client:e2e
git status --short
git diff --stat
git diff --check --cached
```

If a database, browser, or network-restricted command fails because of the
sandbox, rerun it with the required approval path and quote both the failed and
successful outputs. If the Tailwind docs snapshot must be initialized, request
approval for the documented sync command rather than proceeding from memory.

## Documentation owner

Create `docs/dashboards.md` as the implemented-state record for Phase 9. It
must include:

- schema and permission contract for saved views/dashboards;
- GraphQL query/type matrix and any REST mutation matrix;
- UI route/component structure and breakpoint behavior;
- data semantics for values, units, quality, filters, and evidence display;
- tenant/cache/security controls and negative tests;
- verification output and residual gaps.

Add `docs/dashboards.md` to the `AGENTS.md` docs index in the same change.
Update `docs/backend.md`, `docs/product.md`, `docs/system-architecture.md`,
`docs/security.md`, and `docs/analytics.md` only where the current implemented
state materially changed.
