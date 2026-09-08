# 60 - authenticated loading and error boundaries

## Scope, and why it is next

The committed repository is on `main` at `32704ab` (`feat(auth): manage members
and issue invitations`). Phases 1 through 4 are complete. In Phase 5
(client/backend connection and authenticated shell), Phase 5A
(`prompts/24-authenticated-shell-foundations.md`) established the shell and API
bridge, Phase 5B (`prompts/57-invitation-acceptance-ui.md`) delivered
`/accept-invitation`, Phase 5C (`prompts/58-account-recovery-mail-delivery.md`)
delivered account recovery and mail delivery, and Phase 5D
(`prompts/59-member-administration-invitation-issuance.md`) delivered member
administration and invitation issuance.

Per `docs/authenticated-app.md` §9 and `docs/build-plan.md` §6, the remaining open
work in Phase 5 is:
1. Richer authenticated loading boundaries and route-level error files (this step).
2. Production Caddy same-origin routing (requires live host/operator deployment).

Currently, none of the authenticated application routes (`client/app/app/`,
`client/app/app/members/`, `client/app/app/dashboards/`, `client/app/app/datasets/`,
`client/app/app/reports/`) or auth routes (`client/app/(auth)/`) provide Next.js
`loading.tsx` streaming fallbacks or `error.tsx` error boundaries. In the event of
an uncaught API error, network drop, or slow data query during navigation, the
interface falls back to Next.js unstyled generic 500 error screens, unhandled
promise rejections, or frozen navigation without visual feedback or recovery
controls.

This unit implements **Phase 5E**:
1. **Shared Accessible Error Boundary Component (`client/components/acres/app/route-error-boundary.tsx`)**:
   - Reusable `"use client"` component standardizing authenticated error views.
   - Displays brand-aligned alert card (`role="alert"`):
     - Section heading in Crimson Text (`font-serif`).
     - Plain-language description in DM Sans (`font-sans text-ink-muted`).
     - Technical error digest (`error.digest`) or code in Roboto Mono (`font-mono text-label`).
     - Primary pill button (48px height, `#485C11` background, `#8E9C78` hover) invoking Next.js `reset()`.
     - Secondary navigation links ("Return to Workspace" -> `/app`, "Sign Out" -> `/login`) with minimum 44px touch targets.
2. **Route-Level Error Boundaries (`error.tsx`)**:
   - `client/app/app/error.tsx`: Root authenticated shell error boundary catching uncaught runtime exceptions in the workspace.
   - `client/app/app/members/error.tsx`: Member administration error boundary providing localized retry without destroying the AppShell.
   - `client/app/app/dashboards/error.tsx`: Dashboards error boundary for visualization/GraphQL fetch errors.
   - `client/app/app/datasets/error.tsx`: Datasets error boundary for upload/table view errors.
   - `client/app/app/reports/error.tsx`: Reports error boundary for document drafting/export errors.
   - `client/app/(auth)/error.tsx`: Auth layout boundary catching token or form processing errors.
3. **Shared Accessible Skeleton Components (`client/components/acres/app/workspace-skeleton.tsx`)**:
   - Reusable skeleton primitives built with Acres design tokens and `Skeleton` (`client/components/ui/skeleton.tsx`):
     - `WorkspaceHeaderSkeleton`: breadcrumb, heading, and action pill skeleton.
     - `TableSkeleton`: customizable rows/columns with realistic avatar/badge/button widths.
     - `CardGridSkeleton`: responsive grid of card skeletons with header, metric, and sparkline placeholders.
   - All skeleton elements declare accessible roles (`role="status"`, `aria-busy="true"`, `aria-label="Loading content..."`) and honor `prefers-reduced-motion` (replacing pulse animations with static low-contrast borders/backgrounds).
4. **Route-Level Loading Skeletons (`loading.tsx`)**:
   - `client/app/app/loading.tsx`: Default workspace loading layout (stats overview, quick action cards, recent activity list).
   - `client/app/app/members/loading.tsx`: Members workspace skeleton (tabs, search bar, active members table with 5 placeholder rows, pending invitations table).
   - `client/app/app/dashboards/loading.tsx`: Dashboards listing skeleton (filter controls, view selector, 4 responsive metric/chart cards).
   - `client/app/app/datasets/loading.tsx`: Datasets listing skeleton (table layout, upload button placeholder, status badges).
   - `client/app/app/reports/loading.tsx`: Reports listing skeleton (draft reports list, export button placeholder).
5. **Verification & Tests**:
   - Component unit tests verifying error boundary reset invocation, digest rendering, and accessibility attributes.
   - Playwright E2E browser tests (`client/e2e/loading-error-boundaries.spec.ts`):
     - Test error boundary display on synthetic error route or simulated failure.
     - Verify `reset()` retry button functionality.
     - Verify loading skeleton structure, ARIA status attributes, and reduced-motion behavior.
     - Verify 375px, 800px, and 1280px viewports for zero horizontal overflow and >=44px touch targets.
6. **Documentation Updates**:
   - Update `docs/authenticated-app.md` and `docs/build-plan.md` to record the completion of Phase 5 loading and error boundaries.

## Reference material read while preparing this prompt

Repository and product authorities:
- `AGENTS.md` §§0–10: phase control, prompt contract, design invariants, skill-loading rules, checks, review/commit flow, and verified-source discipline.
- `docs/build-plan.md` §§1, 6, and 14: Phase 5 scope, dependencies, security/test gates.
- `docs/authenticated-app.md` §§1–9: auth routes, API bridge, shell layout, and open Phase 5 work.
- `docs/design-system.md`: Acres palette (`#485C11`, `#DFECC6`, `#8E9C78`, `#000000`, `#6F6F6F`, `#E9E9E9`), typography, spacing, radii, focus, responsive tokens.
- `docs/components.md`: Acres/base-nova primitive contracts, `cn()` usage, button/link semantics.
- `docs/skills.md`: locked skill locations, triggers, and Phase 5 manifest.

Implementation and contract evidence inspected:
- `client/app/app/layout.tsx`: authenticated application root shell layout.
- `client/components/acres/app/app-shell.tsx`: persistent shell navigation and organization switcher.
- `client/components/ui/skeleton.tsx`: base-nova skeleton primitive.
- `client/app/app/members/page.tsx`: member administration route structure.
- `client/app/app/page.tsx`: authenticated workspace dashboard home.

## Measurements the implementation must hit

- **Buttons and interactive controls**: minimum 48px height on primary actions (`reset()` retry pills), 44px touch target minimum on secondary return links and icon buttons.
- **Corner radii**: 14px for container cards, 8px for small icon buttons/badges, full pill (height 48px, `rounded-full`) for primary action buttons.
- **Palette**: `#485C11` primary accents/buttons, `#DFECC6` secondary fills, `#8E9C78` hover fills, `#000000` headings, `#6F6F6F` body copy, `#E9E9E9` hairline rules, `#FFFFFF` canvas.
- **Typography**: Crimson Text for section/error headings, DM Sans for descriptions and button labels, Roboto Mono for error digests and status labels.
- **Breakpoints**: 375px, 800px, 1280px with zero horizontal scroll (`scrollWidth === clientWidth`).

## Reference deltas

- **Error and Loading States**: The marketing comps (`Desktop.png`, `Tablet.png`, `Mobile.png`) specify marketing landing pages only; the authenticated workspace loading and error states follow the design system rules established in `docs/design-system.md` and `docs/authenticated-app.md` §6: restrained product canvas, white background, hairline rules, and base-nova shadcn primitives.

## Breakpoint behaviour

- **375px (Mobile)**:
  - Error card renders full-width within the container with stacked action buttons (Retry and Return to Workspace), maintaining >=44px touch targets.
  - Skeletons collapse multi-column tables into stacked card skeletons, preventing any horizontal overflow.
- **800px (Tablet)**:
  - Error card is neatly framed within the main workspace area with inline action buttons.
  - Skeletons display 3–4 visible column bars with proportional widths.
- **1280px (Desktop)**:
  - Contained within `max-w-page` container.
  - High-fidelity skeletons matching exact table and grid layouts with subtle, smooth pulse animations.

## Expected impact

- **Client Components & Primitives**:
  - `client/components/acres/app/route-error-boundary.tsx`: created.
  - `client/components/acres/app/workspace-skeleton.tsx`: created.
- **Client Route Files**:
  - `client/app/app/error.tsx`: created.
  - `client/app/app/loading.tsx`: created.
  - `client/app/app/members/error.tsx`: created.
  - `client/app/app/members/loading.tsx`: created.
  - `client/app/app/dashboards/error.tsx`: created.
  - `client/app/app/dashboards/loading.tsx`: created.
  - `client/app/app/datasets/error.tsx`: created.
  - `client/app/app/datasets/loading.tsx`: created.
  - `client/app/app/reports/error.tsx`: created.
  - `client/app/app/reports/loading.tsx`: created.
  - `client/app/(auth)/error.tsx`: created.
- **Tests**:
  - `client/tests/loading-error-boundaries.spec.ts`: unit tests for error boundary and skeleton rendering.
  - `client/e2e/loading-error-boundaries.spec.ts`: Playwright browser journeys for error reset and loading skeletons.
- **Documentation**:
  - `docs/authenticated-app.md`: updated with Phase 5E evidence.
  - `docs/build-plan.md`: updated with Phase 5E evidence.

## Non-goals

- Modifying backend APIs or database schemas (none needed for client error/loading boundaries).
- Production Caddy deployment and live SSL certificates (reserved for operational launch phase).
- Third-party error tracking service SDKs (e.g. Sentry) — client errors log to browser console and display safe digests.

## Checks to run

1. `npm run lint` — checks all three workspaces.
2. `npm run typecheck` — verifies types across shared, client, and server.
3. `npm run build` — builds shared, client, and server workspaces.
4. `npm run test:client:e2e` (focused on loading-error-boundaries.spec.ts and authenticated journeys).
5. `git diff --check` — ensures no whitespace defects.

Result documentation owner: `docs/authenticated-app.md` and `docs/build-plan.md`.

## SKILLS USED

- `frontend-design`: clean, intentional visual design for error states and loading skeletons matching Acres design tokens.
- `tailwind-design-system`: tokens, `@theme`, and responsive styling.
- `tailwind-4-docs`: Tailwind CSS v4 utility classes and motion modifiers.
- `shadcn`: base-nova primitives in `client/components/ui/` (`Skeleton`, `Button`, `Alert`).
- `vercel-react-best-practices`: App Router `loading.tsx` Suspense streaming and `error.tsx` boundary conventions.
- `accessibility-compliance`: WCAG 2.2 AA compliance, `role="alert"`, `role="status"`, `aria-busy`, 44px touch targets, keyboard focus.
- `web-design-guidelines`: UI audit, clear user feedback on failure, accessible retry affordances.
- `error-handling-patterns`: graceful error degradation, localized boundary isolation, safe non-revealing error digests.
- `javascript-testing-patterns`: TypeScript unit tests for skeleton and error boundary components.
- `e2e-testing-patterns`: Playwright error recovery and loading state verification.
- `playwright`: Real-browser validation across 375, 800, and 1280px viewports.
- `requesting-code-review`: Review request preparation and reviewer subagent dispatch.
- `receiving-code-review`: Evaluating reviewer feedback with technical rigor before commit.
- `caveman-commit`: Conventional commit message formulation for the final commit.
