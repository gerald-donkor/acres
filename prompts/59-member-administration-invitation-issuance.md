# 59 - member administration and invitation issuance

## Scope, and why it is next

The committed repository is on `main` at `eaa4dfe` (`feat(auth): recover
accounts and deliver mail`). Phases 1 through 4 are complete. In Phase 5
(client/backend connection and authenticated shell), Phase 5A
(`prompts/24-authenticated-shell-foundations.md`) established the authenticated
shell and API bridge, Phase 5B (`prompts/57-invitation-acceptance-ui.md`)
delivered the `/accept-invitation` token acceptance journey, and Phase 5C
(`prompts/58-account-recovery-mail-delivery.md`) established the `MailModule`
boundary and account recovery flow.

Per `docs/authenticated-app.md` §9 and `docs/build-plan.md` §6, the remaining open
work in Phase 5 is:
1. Account recovery UI and mail delivery (completed in prompt 58).
2. Invitation issuance/member administration UI and invitation email delivery (this step).
3. Richer authenticated loading boundaries and route-level error files.
4. Production Caddy same-origin routing.

This unit implements **Phase 5D**:
1. **Invitation Email Delivery (`server/src/organizations/`)**:
   - Inject `MailService` into `OrganizationsService` via `OrganizationsModule`.
   - Update `invite()` to dispatch an invitation email asynchronously after database
     creation containing the invitation accept link (`${clientOrigin}/accept-invitation?token=${token}`).
   - Provide plain-text and HTML email templates matching Acres brand tokens (palette,
     typography, hairline rules).
2. **Client API Helpers (`client/lib/api/`)**:
   - `client/lib/api/server.ts`: typed Server Component helpers `listMembers(organizationId)`
     and `listInvitations(organizationId)`.
   - `client/lib/api/browser.ts`: typed browser helpers `listMembers()`, `changeMemberRole()`,
     `revokeMember()`, `listInvitations()`, `inviteMember()`, and `revokeInvitation()`,
     sending `x-csrf-token`, `x-acres-organization-id`, and unique `Idempotency-Key` headers.
3. **App Shell Navigation Activation (`client/components/acres/app/app-shell.tsx`)**:
   - Activate the currently `Unavailable` "Members" nav item:
     - `status: "Active"`, `href: "/app/members"`, restricted to `roles: ["owner", "admin"]`.
4. **Member Administration Route & Accessible UI (`client/app/app/members/`)**:
   - `/app/members`: Server Component layout/page verifying session, active organization,
     and membership role. Viewers and analysts without `members.read` receive a clean,
     polite permission boundary or redirect.
   - `client/components/acres/app/members-workspace.tsx`:
     - **Active Members List**: displays member email, role badge, joined date, and
       action controls (role change, member revocation) enforcing role hierarchies
       (owners cannot be demoted/revoked; actors cannot demote/revoke themselves).
     - **Pending Invitations List**: displays invitee email, assigned role, expiration
       timestamp, and a "Revoke" button sending `DELETE /organizations/:id/invitations/:invId`.
     - **Invite Member Form**: accessible form with email input, role selection
       (`admin`, `analyst`, `viewer`), CSRF/idempotency protection, pending lockout,
       and polite aria-live feedback.
5. **Verification & Tests**:
   - NestJS Supertest e2e suite covering invitation email dispatch and verification of
     in-memory mail adapter records.
   - Client API helper unit tests covering member and invitation requests.
   - Playwright browser suite (`client/e2e/member-administration.spec.ts`) validating:
     - Owner/admin invites a new member; email is delivered to in-memory mailer.
     - Invitee clicks accept link or uses token, joins organization, and appears in member list.
     - Admin revokes pending invitation; invitation disappears.
     - Role change and member removal behaviors.
     - Touch targets (minimum 44px) and zero horizontal scroll at 375, 800, and 1280px.
6. **Documentation Updates**:
   - Update `docs/authenticated-app.md`, `docs/backend.md`, and `docs/build-plan.md`.

## Reference material read while preparing this prompt

Repository and product authorities:
- `AGENTS.md` §§0–10: phase control, prompt contract, design invariants,
  skill-loading rules, checks, review/commit flow, and verified-source discipline.
- `docs/build-plan.md` §§1, 6, and 14: Phase 5 scope, dependencies, security/test gates.
- `docs/product.md` §§1–6: persona security, role definitions, non-enumerating behavior.
- `docs/system-architecture.md` §§3.2, 4.1, 5.1: Mail boundary, modular monolith, tenancy.
- `docs/backend.md` §§2–4, 8: shared contracts, JSON envelopes, session/CSRF/idempotency.
- `docs/security.md` TM-03, TM-05: privilege escalation defense, token hashing, audit logging.
- `docs/authenticated-app.md` §§1–9: auth routes, API bridge, typed clients, shell breakpoints.
- `docs/design-system.md`: Acres palette (`#485C11`, `#DFECC6`, `#8E9C78`, `#000000`, `#6F6F6F`, `#E9E9E9`), typography, spacing, radii, focus, responsive tokens.
- `docs/components.md`: Acres/base-nova primitive contracts, `cn()` usage, button/link semantics.
- `docs/skills.md`: locked skill locations, triggers, and Phase 5 manifest.

Implementation and contract evidence inspected:
- `server/src/organizations/organizations.controller.ts`: existing member & invitation endpoints:
  - `GET /api/v1/organizations/:organizationId/members` (`members.read`)
  - `PATCH /api/v1/organizations/:organizationId/members/:membershipId` (`members.update_role`)
  - `DELETE /api/v1/organizations/:organizationId/members/:membershipId` (`members.revoke`)
  - `GET /api/v1/organizations/:organizationId/invitations` (`invitations.read`)
  - `POST /api/v1/organizations/:organizationId/invitations` (`members.invite`)
  - `DELETE /api/v1/organizations/:organizationId/invitations/:invitationId` (`invitations.revoke`)
- `server/src/organizations/organizations.service.ts`: `invite()`, `changeMemberRole()`, `revokeMember()`, `invitations()`.
- `server/src/mail/mail.service.ts`: `send()`, templating, transport injection.
- `client/components/acres/app/app-shell.tsx`: nav item configuration with disabled "Members" entry.
- `client/app/api/v1/[...path]/route.ts`: API route bridge forwarding verbs and safe headers.

## Measurements the implementation must hit

- **Buttons and interactive controls**: minimum 48px height on primary actions, 44px
  touch target minimum on table action buttons, dropdowns, and inputs.
- **Corner radii**: 14px for container cards, 8px for small icon buttons/controls,
  full pill (radius half height) for primary buttons.
- **Palette**: `#485C11` primary accents/buttons, `#DFECC6` secondary fills, `#8E9C78`
  hover fills, `#000000` headings, `#6F6F6F` body copy, `#E9E9E9` hairline rules.
- **Typography**: Crimson Text for section headings, DM Sans for table headers/body,
  Roboto Mono for status labels, email addresses, and timestamps.
- **Breakpoints**: 375px, 800px, 1280px with zero horizontal scroll (`scrollWidth === clientWidth`).

## Reference deltas

- **Members UI**: The marketing comps (`Desktop.png`, `Tablet.png`, `Mobile.png`)
  specify marketing landing pages only; the authenticated workspace follows the
  design system rules established in `docs/design-system.md` and `docs/authenticated-app.md`
  §6: restrained product canvas, white background, hairline rules, base-nova shadcn
  primitives, without marketing header/footer chrome.

## Breakpoint behaviour

- **375px (Mobile)**:
  - Single-column stacked cards for member list and pending invitations.
  - Action buttons (role change, revoke) wrap or render as accessible compact actions
    with at least 44px touch targets.
  - "Invite Member" form renders full width with stacked input and button.
  - No horizontal table overflow or viewport clipping.
- **800px (Tablet)**:
  - Persistent left sidebar shell navigation with active "Members" item.
  - Member table renders columns: Member (Email/Name), Role, Joined Date, Actions.
  - Pending invitations table renders: Invitee Email, Role, Expires, Revoke Action.
  - "Invite Member" affordance renders at top right of workspace header or inline card.
- **1280px (Desktop)**:
  - Contained within `max-w-page` container.
  - Clear multi-column tables with ample breathing room, distinct role badges, and
    immediate action feedback.

## Expected impact

- **Server**:
  - `server/src/organizations/organizations.module.ts`: imports `MailModule`.
  - `server/src/organizations/organizations.service.ts`: injects `MailService`, calls
    `sendInvitationEmail` upon successful invitation creation.
  - `server/src/mail/mail.service.ts`: adds `sendInvitationEmail(to, inviteUrl, organizationName, role)`.
- **Client**:
  - `client/components/acres/app/app-shell.tsx`: sets "Members" nav item to `status: "Active"`, `href: "/app/members"`.
  - `client/app/app/members/page.tsx`: creates Server Component route for `/app/members`.
  - `client/components/acres/app/members-workspace.tsx`: creates client workspace with
    members list, pending invitations list, and invitation form.
  - `client/lib/api/server.ts`: exports `listMembers` and `listInvitations`.
  - `client/lib/api/browser.ts`: exports member and invitation mutation helpers.
- **Tests**:
  - `server/test/organizations.e2e-spec.ts`: tests invitation email dispatch.
  - `client/tests/api-helpers.spec.ts`: unit tests for member API helpers.
  - `client/e2e/member-administration.spec.ts`: Playwright browser journeys.

## Non-goals

- Self-service organization deletion or billing management (reserved for future operations).
- SSO/SAML configuration (enterprise backlog).
- Batch/bulk CSV member invitations.

## Checks to run

1. `npm run contracts:check` — verifies OpenAPI/SDL contracts.
2. `npm run lint` — checks all three workspaces.
3. `npm run typecheck` — verifies types across shared, client, and server.
4. `npm run build` — builds shared, client, and server workspaces.
5. `npm run test:server` — runs the server test suite including invitation email tests.
6. `npm run test:client:e2e` (focused on member-administration.spec.ts and api-helpers.spec.ts).
7. `git diff --check` — ensures no whitespace defects.

Result documentation owner: `docs/authenticated-app.md` and `docs/backend.md`.

## SKILLS USED

- `auth-implementation-patterns`: organization memberships, roles, permissions, invitations, and privilege hierarchy.
- `frontend-design`: clean, intentional visual design for the members workspace matching Acres design language.
- `tailwind-design-system`: tokens, `@theme`, and responsive styling.
- `tailwind-4-docs`: Tailwind CSS v4 class utilities.
- `shadcn`: base-nova primitives in `client/components/ui/` (`Button`, `Input`, `Field`, `Alert`, `Badge`, `Spinner`).
- `vercel-react-best-practices`: Server Component reads, client leaf mutations, form action handling.
- `accessibility-compliance`: WCAG 2.2 AA standards, 44px touch targets, aria-live status, keyboard focus order.
- `web-design-guidelines`: UI audit, accessible table semantics, clear error handling.
- `api-design-principles`: REST client wrappers, safe envelopes, idempotency key generation.
- `security-best-practices`: CSRF enforcement, role boundary defense, bearer token safety.
- `nestjs-best-practices`: NestJS dependency injection, module boundaries, error handling.
- `javascript-testing-patterns`: TypeScript unit tests for client API helpers.
- `e2e-testing-patterns`: End-to-end integration and Playwright journey architecture.
- `playwright`: Real-browser journey automation, mobile/tablet/desktop verification.
- `requesting-code-review`: Review request preparation and reviewer subagent dispatch.
- `receiving-code-review`: Evaluating reviewer feedback with technical rigor before commit.
- `caveman-commit`: Conventional commit message formulation for the final commit.
