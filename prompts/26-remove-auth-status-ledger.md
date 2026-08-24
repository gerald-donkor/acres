# 26 - remove auth status ledger

## Scope, and why it is next

The user identified the technical status ledger on the `/register` page as
"AI slop" and asked for it to be removed. The screenshot shows the desktop auth
context panel's three-row metadata block:

- `Session` / `Cookie-backed`
- `API` / `Same-origin`
- `Tenancy` / `Server verified`

That block lives in `client/components/acres/auth/auth-frame.tsx`, which is
shared by `/register` and `/login`. Remove it from the shared frame rather than
hiding it only on `/register`, because leaving the same filler copy on `/login`
would preserve the same problem one auth-footer click away.

This is a visual/content cleanup only. It must not change account creation,
login, CSRF, return-path sanitization, server routes, form validation,
organization selection, or the marketing page.

## Reference material read while preparing this prompt

- `AGENTS.md` workflow, prompt-file contract, auth docs index, checks, review
  loop, and commit requirements.
- User screenshot:
  `/home/dgk/Pictures/Screenshots/Screenshot_20260824_151955.png`, showing the
  exact status ledger to remove.
- `docs/authenticated-app.md`, especially route behavior, auth behavior, shell
  design, and existing verification record.
- `docs/design-system.md`, for the existing Acres token/type constraints. No
  token changes are needed.
- `client/components/acres/auth/auth-frame.tsx`, where the unwanted `<dl>`
  exists.
- `client/app/(auth)/register/page.tsx`, which renders `AuthFrame` for
  `/register`.
- `client/app/(auth)/login/page.tsx`, which also renders `AuthFrame`.
- `client/components/acres/auth/register-form.tsx`, to confirm the account form
  itself is not part of the requested cleanup.

## SKILLS USED

- `frontend-design` - remove filler technical/status copy and keep the auth
  page focused on the user's task.
- `accessibility-compliance` - ensure removing the decorative `<dl>` does not
  damage landmarks, headings, keyboard order, or form semantics.
- `vercel-react-best-practices` - keep the shared auth frame as a simple Server
  Component with no extra client state or bundle growth.
- `shadcn` - verify that form/button primitives remain untouched and the local
  base-nova composition is preserved.
- `requesting-code-review` - mandatory post-verification reviewer pass.
- `receiving-code-review` - mandatory technical evaluation of review feedback.
- `caveman-commit` - required final local Conventional Commit.

Conditional skills deliberately not used:

- `tailwind-4-docs` and `tailwind-design-system` are not needed unless
  implementation changes tokens, utility behavior, variants, breakpoints, or
  component APIs.
- `auth-implementation-patterns` is not needed because session/auth behavior and
  trust boundaries are not changing.
- `playwright` is optional. Use it if static inspection and unit/build checks
  cannot prove the ledger text is absent from `/register`.

## Measurements and target behavior

No new comp measurement is required. The acceptance criterion is textual and
structural absence of the user-identified filler block.

Target static checks after implementation:

- `rg -n "Session|Cookie-backed|Same-origin|Server verified|Tenancy" client`
  must not find those auth-frame ledger strings.
- The `/register` source must still render one `h1` through `AuthFrame`, the
  existing `RegisterForm`, and the existing footer link to `/login`.
- The `/login` source must still render one `h1` through `AuthFrame`, the
  existing `LoginForm`, and the existing footer link to `/register`.

## Expected impact

- `/register`: the desktop-only status ledger shown in the screenshot is gone.
  The account form, heading, description, footer sign-in link, submit behavior,
  CSRF behavior, and `returnTo` behavior remain unchanged.
- `/login`: the same shared status ledger is gone there too. The sign-in form,
  heading, description, footer account-creation link, submit behavior, CSRF
  behavior, and `returnTo` behavior remain unchanged.
- Mobile: no visible change is expected from this specific removal, because the
  left auth context panel is already hidden on mobile.

## Reference deltas

- The authenticated-app implementation record currently says the auth shell uses
  a Roboto Mono ledger/status strip. This prompt intentionally removes the
  technical status ledger from the auth entry frame because the user rejected it
  as filler. If an app-shell ledger remains under `/app`, that is outside this
  prompt and must not be removed here.

## Breakpoint behavior

- `375px`: no auth status ledger is rendered; the existing single-column mobile
  auth form stays.
- `800px`: the left auth context panel may still show the Acres wordmark and
  concise context copy, but the `Session` / `API` / `Tenancy` metadata rows are
  absent.
- `1280px`: same as 800px, with the existing two-column auth layout preserved.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, `docs/authenticated-app.md`, and all skills
   named in `SKILLS USED`.
2. Edit only `client/components/acres/auth/auth-frame.tsx` to remove the
   unwanted `<dl>` status ledger.
3. Preserve the outer auth layout, wordmark link, context eyebrow/title, form
   column, children rendering, and footer link behavior.
4. Do not add replacement filler copy, badges, cards, metrics, helper text, or
   decorative elements.
5. Update `docs/authenticated-app.md` to record that the auth entry frame no
   longer includes the technical status ledger; keep any `/app` ledger language
   scoped to the authenticated workspace shell if still accurate.
6. Self-review the diff for accidental changes to auth behavior or shared UI
   primitives.

## Acceptance criteria

- The strings `Session`, `Cookie-backed`, `API`, `Same-origin`, `Tenancy`, and
  `Server verified` no longer render from the auth entry frame.
- `/register` keeps the account creation form and footer sign-in link.
- `/login` keeps the sign-in form and footer create-account link.
- No server code, API bridge, CSRF logic, return-path logic, form submit logic,
  route metadata, Tailwind tokens, or shadcn/base UI primitives are changed.
- `docs/authenticated-app.md` records the intentional removal so future sessions
  do not reintroduce the filler status ledger.

## Verification plan

Run and quote the real output:

1. `git diff --check`
2. `rg -n "Session|Cookie-backed|Same-origin|Server verified|Tenancy" client`
3. `npm run lint`
4. `npm run typecheck`
5. `npm run build`

Also inspect the final diff manually. If the implementation changes more than
`client/components/acres/auth/auth-frame.tsx` and `docs/authenticated-app.md`,
stop and explain why before continuing.

After checks pass, run the mandatory two-stage review loop:

1. Use `requesting-code-review` with the request, changed files, checks run, and
   base/head SHAs.
2. Use `receiving-code-review` to evaluate feedback against the actual code and
   fix only valid issues.
3. Re-run affected checks after any fix.

Finish by staging only the approved files and committing locally to `main` with
`caveman-commit`. Do not push.
