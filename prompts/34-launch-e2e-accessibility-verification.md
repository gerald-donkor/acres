# 34 - launch e2e, accessibility, and multi-tenant browser verification

## Scope, and why it is next

The committed repository is on `main` at `229e42b` (`feat(ops): add telemetry metrics
and retention`). `docs/operations.md` records Phase 12A (inert Compose/Caddy
topology, production env templates, ops preflights) and Phase 12B (low-cardinality
Prometheus `/metrics` telemetry, alert rules, Grafana panels, automated retention
jobs, backup/restore helpers, CI action pinning) as committed. Phase 11 (optional
local AI) remains deliberately skipped without separate approval.

Per `docs/build-plan.md` §13 (Phase 12 — operations and launch hardening) and the exit
gates in `docs/dashboards.md`, `docs/reports.md`, and `docs/authenticated-app.md`,
launch readiness requires complete end-to-end browser and accessibility verification
across all three viewports (375px, 800px, 1280px) and multi-tenant isolation. Currently,
`client/e2e/authenticated-shell.spec.ts` covers only initial auth and organization
creation. The full product surfaces implemented across Phases 7–10 (geography datasets,
analytics, dashboards, saved views, GraphQL queries, report revisions, and async export
downloads) require comprehensive browser E2E test coverage.

This prompt implements Phase 12C:
1. **Full Product E2E Test Suite (`client/e2e/product-journeys.spec.ts`)**:
   - Authenticated journey from login through organization selection to `/app/dashboards`.
   - GraphQL dashboard query execution and rendering (KPI summary cards, metric trend visualization, tabular fallbacks).
   - Saved view lifecycle (filter selection, view creation, switching, persistence).
   - Report and export lifecycle in `/app/reports` (draft authoring, revision publication, asynchronous CSV/PDF export request, and secure download verification).
2. **Multi-Tenant Isolation E2E Tests (`client/e2e/multi-tenant-isolation.spec.ts`)**:
   - Two distinct organizations with independent accounts.
   - Verification that Organization B's browser session cannot access, list, or download Organization A's saved views, reports, or export artifacts.
   - Verification that switching active organization updates the data context immediately without cross-org client cache bleed.
3. **WCAG 2.2 Accessibility & Responsive Audit (`client/e2e/accessibility-responsive.spec.ts`)**:
   - Strict horizontal overflow check (`scrollWidth <= clientWidth`) across 375px, 800px, and 1280px on marketing `/`, `/login`, `/register`, `/app`, `/app/dashboards`, and `/app/reports`.
   - Minimum 44×44px interactive touch target size verification on all mobile viewports (375px) for buttons, links, select menus, and disclosure triggers.
   - Skip-link landmark verification (`#main-content` target exists and is reachable on every route).
   - Keyboard focusability and visible focus outline verification across form controls.
   - Screen-reader table alternatives and accessible names on data visualizations.
4. **Operational & Telemetry Verification**:
   - Validate that browser interactions across the E2E suite produce normalized, low-cardinality `acres_http_requests_total` counter increments in the private NestJS `GET /metrics` endpoint.
5. **Documentation**:
   - Update `docs/operations.md`, `docs/authenticated-app.md`, and `docs/dashboards.md` with the Phase 12C E2E test record and launch verification evidence.

## Reference material read while preparing this prompt

Repository and workflow authority:
- `AGENTS.md` §§2, 2.1, phase-control commands, §§5-10: prompt-first workflow,
  phase resolution, skill loading, verification, review, documentation, commit rules,
  product constraints, and no-fabrication rules.
- `docs/build-plan.md` §§1, 6, 10, 11, 13, 14: Phase 5 shell, Phase 9 dashboards,
  Phase 10 reports, Phase 12 launch hardening, required skills, and exit evidence.
- `docs/operations.md`: Phase 12A/12B implemented state, Prometheus telemetry,
  alert rules, and launch blockers.
- `docs/authenticated-app.md`: Next API bridge, server/browser clients, auth forms,
  organization preference cookie, shell layout, and test harness.
- `docs/dashboards.md`: dashboard views, GraphQL schema, chart/table components.
- `docs/reports.md`: report drafts, revisions, asynchronous exports, download URLs.
- `docs/security.md` §§8, 9, 10, 15: tenant boundaries, RLS, threat mitigations.

Current implementation inspected:
- `client/playwright.config.ts`: Playwright configuration with webServer orchestration for Nest (3101) and Next (3100).
- `client/e2e/authenticated-shell.spec.ts`: existing Phase 5 E2E test specs and helper patterns.
- `client/app/(app)/app/dashboards/page.tsx`: dashboard server component and GraphQL query execution.
- `client/app/(app)/app/reports/page.tsx`: reports list and revision viewer.
- `client/lib/api/browser.ts` & `client/lib/api/server.ts`: API clients and CSRF handling.
- `server/src/metrics/metrics.service.ts`: Prometheus metrics collector and text exposition.

## Measurements and test assertions

- **Viewport widths**: exact comp breakpoints `375px` (Mobile), `800px` (Tablet), and `1280px` (Desktop).
- **Touch target minimum**: `>= 44px` height and `>= 44px` width for all interactive elements at mobile viewport (`375px`).
- **Horizontal overflow**: `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (strictly 0px horizontal scroll).
- **Skip link**: `#main-content` landmark element exists on all route layouts and receives focus when triggered.
- **Metrics assertion**: `GET /metrics` on the API reports `acres_http_requests_total` with normalized route labels (`/api/v1/auth`, `/api/v1/organizations`, `/api/v1/reports`, `/graphql`).

## Non-goals

- No implementation of Phase 11 optional local AI.
- No live production deployment or external cloud provider provisioning.
- No modification of core database schema, RLS policies, or backend API contracts.
- No third-party analytics or tracking pixels.

## Breakpoint behaviour

- `375px`: Compact mobile navigation disclosure, single-column dashboard cards, stacked report actions, full 44px touch targets.
- `800px`: Two-column dashboard layout, persistent sidebar navigation, tablet table scrolling.
- `1280px`: Full multi-column dashboard grid, persistent navigation inside `max-w-page` (1200px container with 40px gutters).

## SKILLS USED

- `playwright`: Automate browser execution, test flows, snapshots, and assertions.
- `e2e-testing-patterns`: Design reliable, isolated, deterministic Playwright test suites.
- `accessibility-compliance`: Enforce WCAG 2.2 AA standards, keyboard navigation, touch targets, and landmarks.
- `web-design-guidelines`: Audit UI elements, contrast, responsive behavior, and accessibility.
- `security-best-practices`: Validate multi-tenant isolation, CSRF protection, and credential safety.
- `api-design-principles`: Verify GraphQL and REST API integration across client and server.
- `kpi-dashboard-design`: Validate dashboard hierarchy, metric explanations, and table alternatives.
- `data-storytelling`: Verify report evidence, revision lineage, and structured export data.
- `requesting-code-review`: Prepare structured context and dispatch reviewer subagent before committing.
- `receiving-code-review`: Evaluate feedback with technical rigor and codebase verification.
- `caveman-commit`: Author commit message adhering to repository conventions.

## Checks to run

```bash
npm run lint
npm run typecheck
npm run build
npm run ops:check
npm run test:server
npm run test:client:e2e
```

Record results in `docs/operations.md`, `docs/authenticated-app.md`, and `docs/dashboards.md`.
