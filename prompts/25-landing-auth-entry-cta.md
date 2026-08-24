# 25 - landing auth entry CTA

## Scope, and why it is next

The authenticated shell from prompt 24 is committed and exposes `/login`,
`/register`, and `/app`. The marketing landing page and chrome still have no
button that takes a user directly to account creation: the header/mobile primary
CTA and the final contact-section primary CTA still point to in-page anchors.

Implement the smallest user-visible bridge from the measured marketing page to
the new auth flow:

- Keep `/` as the marketing landing page.
- Keep all section nav links and secondary exploration CTAs as in-page anchors.
- Change the primary site-header CTA on tablet/desktop from `Learn More`
  `#how-to` to `Create Account` `/register`.
- Change the primary open-mobile-menu CTA from `Learn More` `#how-to` to
  `Create Account` `/register`, preserving the close-on-activation behavior.
- Change the final contact-section primary CTA from `Learn More` `#how-to` to
  `Create Account` `/register`.
- Do not add a new login button to the marketing chrome in this slice. `/login`
  remains reachable from `/register`'s auth-frame footer and from protected
  `/app` redirects.
- Do not change the measured visual system, button primitive, motion hooks,
  image geometry, section rhythm, nav link set, or authenticated form behavior.

Use `/register`, not `/register?returnTo=/app`, because
`client/lib/auth/return-to.ts` already defaults missing `returnTo` to `/app` and
keeps return-path sanitization inside the auth route.

## Reference material read while preparing this prompt

- `AGENTS.md` workflow, prompt-file contract, visual invariants, and mandatory
  verification/review/commit flow.
- `docs/chrome.md` current horizontal and mobile CTA contract, including the
  existing `Learn More` `#how-to` record and mobile close behavior.
- `docs/landing.md` landing-page implementation record and accessibility notes.
- `docs/components.md` `Button`/Base UI `render={<Link />}` contract and
  `nativeButton={false}` requirement.
- `docs/authenticated-app.md` authenticated route map for `/login`,
  `/register`, and `/app`.
- `client/components/acres/site-header.tsx` and
  `client/components/acres/mobile-navigation.tsx` current primary CTA call
  sites.
- `client/app/(marketing)/page.tsx` current landing-page CTA call sites.
- `client/app/(auth)/register/page.tsx`,
  `client/app/(auth)/login/page.tsx`, and `client/lib/auth/return-to.ts` for
  existing auth labels and default post-auth return behavior.
- Installed Next 16.3.1 docs:
  `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
  confirms `<Link href="/register">` is the primary internal-navigation API and
  passes anchor attributes through to the rendered anchor.

## Skills used

- `frontend-design` - CTA placement, label choice, and preserving Acres'
  existing marketing hierarchy.
- `vercel-react-best-practices` - Next/React link usage and keeping the change
  server-component friendly with no unnecessary client state or bundle growth.
- `requesting-code-review` - mandatory post-verification reviewer pass.
- `receiving-code-review` - mandatory technical evaluation of review feedback.
- `caveman-commit` - required final local Conventional Commit.

Conditional skills deliberately not used:

- `tailwind-4-docs` and `tailwind-design-system` are not required unless the
  implementation changes classes, tokens, breakpoints, or responsive styling.
- `shadcn` is not required unless the implementation changes
  `client/components/ui/` or Base UI primitive composition beyond the existing
  documented `Button` call sites.
- `accessibility-compliance` is not required unless a new control, state, or
  focus behavior is introduced; this prompt only changes destinations/labels on
  existing accessible anchors.
- `playwright` is optional. Use it if static inspection or tests cannot prove
  the CTA destinations and mobile menu close behavior.

## Implementation plan

1. Re-read this prompt, `AGENTS.md`, and the docs/files listed above.
2. Update `client/components/acres/site-header.tsx` so the desktop/tablet
   primary `Button` renders `<Link href="/register" />` and displays
   `Create Account`.
3. Update `client/components/acres/mobile-navigation.tsx` so the open-menu
   primary `Button` renders `<Link href="/register" />`, displays
   `Create Account`, and still calls `setOpen(false)` on click.
4. Update `client/app/(marketing)/page.tsx` so only the final contact-section
   primary CTA renders `<Link href="/register" />` and displays
   `Create Account`.
5. Leave the secondary `Discover More` buttons pointing to their current
   in-page anchors.
6. Update `docs/chrome.md` to record the intentional auth-entry delta for the
   primary CTA, replacing or amending the stale `#how-to` CTA assertions.
7. Update `docs/landing.md` to record the final contact CTA's new account-entry
   destination and label.
8. Self-review the diff for unrelated changes, especially any accidental
   geometry, class, motion, or route changes.

## Acceptance criteria

- On tablet/desktop chrome, the primary CTA is an anchor whose `href` is
  `/register` and visible label is `Create Account`.
- In the open mobile menu, the primary CTA is an anchor whose `href` is
  `/register`, visible label is `Create Account`, and activating it still
  closes the disclosure before navigation.
- In the final contact section on `/`, the primary CTA is an anchor whose
  `href` is `/register` and visible label is `Create Account`.
- Other in-page nav links and secondary `Discover More` buttons still point to
  their existing section anchors.
- No auth form, API route, server code, database code, Tailwind token, or button
  primitive is changed.
- Documentation records the intentional post-auth CTA delta so future comp
  checks do not treat the new `/register` destinations as accidental drift.

## Verification plan

Run and quote the real output:

1. `git diff --check`
2. `npm run lint`
3. `npm run build`

Also inspect the final diff manually. If the implementation changes more than
the listed CTA call sites and docs, stop and explain why before continuing.

After checks pass, run the mandatory two-stage review loop:

1. Use `requesting-code-review` with the request, changed files, checks run, and
   base/head SHAs.
2. Use `receiving-code-review` to evaluate feedback against the actual code and
   fix only valid issues.
3. Re-run affected checks after any fix.

Finish by staging only the approved files and committing locally to `main` with
`caveman-commit`. Do not push.
