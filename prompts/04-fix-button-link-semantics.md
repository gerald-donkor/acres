# 04 — Fix Button Link Semantics

## Scope, and why it is next

Fix the Base UI development-console error emitted by the `Learn More` CTA in
the shared site chrome. Both CTA instances render the Acres `Button` through a
Next.js `Link`, so they produce an `<a>` while Base UI's `nativeButton` prop is
left at its default of `true`.

This is next because it is a user-reported runtime defect in the committed
chrome (`41fdc14`), and it affects every route mounted by `app/layout.tsx`. The
repository search found exactly two affected Acres call sites:

- `components/acres/site-header.tsx`
- `components/acres/mobile-navigation.tsx`

At each call site, keep `render={<Link href="#how-to" />}` and explicitly pass
`nativeButton={false}`, as required by the installed Base UI Button contract for
a non-`<button>` render target. Do not change the `Button` component's default:
ordinary action-button consumers must retain native `<button>` semantics.

## Cause verified from installed source

- `node_modules/@base-ui/react/button/Button.js` defaults `nativeButton` to
  `true`.
- `node_modules/@base-ui/react/internals/types.d.ts` says to set it to `false`
  when `render` replaces the button with a non-button element.
- `node_modules/@base-ui/react/internals/use-button/useButton.js` emits the
  reported development error when the rendered tag and `nativeButton` disagree.
- `.agents/skills/shadcn/rules/base-vs-radix.md` gives the matching Base UI
  pattern: a `Button` rendering an anchor must include
  `nativeButton={false}`.
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
  confirms that Next.js `Link` extends and renders an HTML anchor.

## Reference material read

- `public/assets/ui/landing-pages/Desktop.png`, crop
  `1280x120+0+0`: the horizontal nav and desktop `Learn More` CTA.
- `public/assets/ui/landing-pages/Mobile.png`, crop `375x700+0+0`: the closed
  mobile header; the CTA remains inside the open disclosure rather than the
  closed state.
- `public/assets/ui/ref/acres-design-system.pdf`, 72 dpi crop
  `900x800+30+3000`: the closed and open mobile navigation cards, including the
  open-menu `Learn More` CTA.
- `docs/components.md`: the Acres pill implementation, Base UI composition
  decision, and the earlier unresolved `render`-composition finding.
- `docs/chrome.md`: the committed desktop/tablet and mobile CTA geometry,
  behavior, and browser verification record.
- `docs/automation.md`: production-server and headless CDP verification method.

## Measurements to preserve

This is a semantic/runtime correction with no new visual measurement. Preserve
the committed figures from `docs/components.md` and `docs/chrome.md`:

- CTA height: 48 px at 375, 800, and 1280.
- `Learn More` primary CTA width: approximately 126.03 px.
- Desktop/tablet CTA right edge: x = 1240 at 1280 and x = 760 at 800.
- CTA render target: `<a href="#how-to">` on desktop/tablet and in the open
  mobile menu.
- The arrow, type, fill, hover, focus ring, spacing, and mobile close-on-click
  behavior remain unchanged.

## Expected impact

- Every route using `app/layout.tsx` stops logging the reported Base UI error
  for the desktop/tablet CTA.
- The open mobile menu stops logging the same error for its CTA.
- Both CTAs remain Next.js links to `#how-to` and retain their existing visuals
  and interaction behavior.
- Native Acres action buttons remain native `<button>` elements because the
  primitive default is not changed.

## Breakpoint behaviour

- **375 px:** open the mobile disclosure and verify its `Learn More` CTA is an
  anchor, activates `#how-to`, closes the disclosure, and emits no Base UI
  native-button mismatch error.
- **800 px:** verify the horizontal-nav CTA is an anchor at the measured 48 px
  height and emits no mismatch error.
- **1280 px:** verify the horizontal-nav CTA is an anchor at approximately
  126.03 × 48 px, ends at x = 1240, and emits no mismatch error.

## Reference deltas

None. The change only declares the element type already rendered by the
existing implementation; it must not alter the comp-matched appearance.

## Non-goals

- Do not redesign or restyle the button, header, mobile navigation, or footer.
- Do not change tokens, Tailwind utilities, dependencies, or
  `components/ui/button.tsx`.
- Do not make `nativeButton={false}` the default in
  `components/acres/button.tsx`; that would misconfigure native action buttons.
- Do not replace the links with native buttons: `#how-to` is navigation and
  must remain an anchor/Next.js `Link`.
- Do not broaden this into landing-page work or the next build-sequence step.

## Implementation

1. Add `nativeButton={false}` to the desktop/tablet `Button` rendered through
   `Link` in `components/acres/site-header.tsx`.
2. Add `nativeButton={false}` to the open-mobile-menu `Button` rendered through
   `Link` in `components/acres/mobile-navigation.tsx`.
3. Search the scoped application code for every `Button` using `render` and
   confirm each non-button render target explicitly declares
   `nativeButton={false}`.
4. Update `docs/components.md` to close its earlier untested
   `Button`-plus-`render` finding with the verified Base UI contract.
5. Update `docs/chrome.md` to record the two corrected call sites and the new
   browser-console verification results.

## Checks

Run and quote the real output of:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Then serve the production build and verify in a browser/headless CDP session:

- no console message containing `expected a native <button>` at 1280 px;
- no such message after opening the menu at 375 px;
- both CTA nodes are `A` elements with `href="#how-to"`;
- the desktop CTA remains approximately 126.03 × 48 px and ends at x = 1240;
- the mobile CTA still closes the disclosure when activated.

Record the completed fix and exact verification results in
`docs/components.md` and `docs/chrome.md`.

## SKILLS USED

- `shadcn` — verify the repo's Base UI `render` and `nativeButton` composition
  contract.
- `vercel-react-best-practices` — preserve the existing server/client boundary
  and avoid broadening the client bundle for a prop-only fix.
- `web-design-guidelines` — verify that navigation remains a link, action-button
  defaults remain native, and focus/keyboard behavior is preserved.
- `caveman-commit` — generate the required terse Conventional Commit message
  after implementation and verification.
