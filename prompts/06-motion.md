# Step 5 — add restrained motion

## Scope and why this is next

Add the motion layer defined by step 5 of `AGENTS.md` §8.2 to the completed,
committed landing page. The design system, primitive layer, chrome, and full `/`
composition are already present in the repository and committed through
`8e9f644`; `gsap` and `@gsap/react` are absent from `package.json`, and
`docs/motion.md` is the next unwritten build record. Install those two runtime
dependencies, register the required GSAP plugins once, define the shared motion
API once, and add a scoped client leaf that animates the server-rendered landing
subtree without converting `app/page.tsx` into a Client Component.

The result must feel measured and declarative: one calm page-load sequence,
discrete scroll reveals, and small hover responses. No bounce, overshoot,
spring, ambient loop, smooth-scroll replacement, pinned section, scrubbed
parallax, cursor follower, character splitting, or ornamental motion.

This prompt is the complete execution brief. After approval, re-read it
verbatim, then re-read `AGENTS.md`, every skill and project record named below,
and the relevant installed Next 16.3 guides before writing code. Verify all GSAP
imports and APIs from the installed packages after installation rather than
assuming package export names from memory.

## SKILLS USED

- `frontend-design` — keep motion subordinate to Acres' restrained regional-data
  identity and concentrate character in one orchestrated hero entrance.
- `tailwind-design-system` — add only the missing reusable motion-distance
  tokens, keeping the existing CSS-first token hierarchy intact.
- `tailwind-4-docs` — verify Tailwind v4 token placement, transform interaction,
  hover behavior, and arbitrary custom-property syntax; load the engineering
  playbook and gotchas for implementation and review.
- `gsap-core` — implement token-driven tweens, named `matchMedia` conditions,
  transform/opacity animation, overwrite behavior, and reduced motion.
- `gsap-timeline` — sequence the hero entrance and grouped reveals with timeline
  defaults and position parameters rather than chained delays.
- `gsap-scrolltrigger` — create discrete, once-only viewport reveals, register
  ScrollTrigger once, and clean every trigger up through the React context.
- `gsap-react` — use `useGSAP` with a scoped ref and context-safe event handlers
  so animations and listeners revert on unmount.
- `gsap-plugins` — verify module-scope registration and use `CustomEase` only if
  required to consume the existing cubic-bezier token exactly.
- `gsap-utils` — turn scoped target collections into arrays and keep selectors
  inside the motion root.
- `gsap-performance` — animate compositor-friendly transform and opacity only,
  avoid permanent `will-change`, and keep simultaneous work bounded.
- `vercel-react-best-practices` — preserve Server Components, make the motion
  wrapper a client leaf that accepts server-rendered `children`, and contain the
  GSAP bundle to `/`.
- `web-design-guidelines` — fetch the current checklist and audit the completed
  motion for reduced-motion behavior, focus stability, interaction semantics,
  visibility, overflow, and input-device assumptions.
- `caveman-commit` — write the required final Conventional Commit message after
  implementation, verification, and documentation are complete.

The official Tailwind snapshot is still unavailable: `docs/landing.md` records
that the approved sync failed and then stalled on 2026-08-20. At execution,
check `references/docs/` and `references/docs-index.tsx`; if they are still
missing, use the skill's permitted fallback files
`references/engineering-playbook.md` and `references/gotchas.md`, record the
limitation in `docs/motion.md`, and do not claim official snapshot verification.
Do not spend the implementation session repeatedly retrying a known-blocked
network sync.

## Project records and installed guides to read

- `docs/design-system.md` — especially §5's motion judgments: one ease,
  `150ms` / `300ms` / `600ms`, no bounce, overshoot, or spring.
- `docs/components.md` — primitive hover/focus decisions, `Button` geometry,
  token merging, and the rule that a new `@theme` token must also be taught to
  `lib/utils.ts`.
- `docs/chrome.md` — existing disclosure motion and the header/footer boundary;
  site chrome is not reimplemented here.
- `docs/landing.md` — current `/` structure, live breakpoint geometry, static
  deltas, accessibility decisions, and browser-check procedure.
- `docs/automation.md` — production server, CDP viewport, computed-style,
  screenshot, and comparison recipes.
- `app/page.tsx`, `app/globals.css`, `app/layout.tsx`, `lib/utils.ts`, and the
  relevant `components/acres/` sources — inspect the actual markup and APIs
  before assigning animation hooks.
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  and `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`
  — verify the client-wrapper/server-children composition pattern in the
  installed Next version.

## Reference material read for this prompt

- `public/assets/ui/landing-pages/Desktop.png`, opened in full at its native
  **1280 × 7389** size to identify the page hierarchy and repeated groups.
- `public/assets/ui/landing-pages/Tablet.png`, whose native **800 × 8825**
  composition remains the static layout target for the middle breakpoint.
- `public/assets/ui/landing-pages/Mobile.png`, whose native **375 × 8833**
  composition remains the static layout target for the compact breakpoint.
- `public/assets/ui/ref/acres-design-system.pdf`, rendered at 72 dpi and
  inspected at board rows **1650–2550**, covering the four pill states and the
  inactive/active icon-button pairs.

The references are static. They measure end states only and provide **no timing,
distance, trigger, stagger, or easing evidence**. Every motion value below is a
documented judgment derived from `docs/design-system.md` §5 and the product
register, never presented as a comp measurement.

## Dependencies and shared motion API

1. Install `gsap` and `@gsap/react` as runtime dependencies with `npm install
   gsap @gsap/react`. Read the installed `package.json` export maps and type
   declarations before choosing import paths for `gsap`, `ScrollTrigger`,
   `CustomEase`, and `useGSAP`.
2. Create one small motion module under `lib/` or `components/acres/` that owns
   plugin registration and exports the shared `DUR` and `EASE` token references
   plus the verified reader/helper that turns CSS token values into GSAP values.
   Register `useGSAP`, `ScrollTrigger`, and `CustomEase` there, at module scope,
   exactly once. Do not register inside a component.
3. `DUR` must read `--duration-fast`, `--duration-base`, and
   `--duration-slow` from the root computed style and convert milliseconds to
   GSAP seconds in one place. `EASE` must consume `--ease-acres` exactly. If
   installed GSAP accepts the CSS cubic-bezier string directly, use that verified
   behavior. Otherwise create one `CustomEase` from the parsed four control
   points. Do not restate `0.15`, `0.3`, `0.6`, or a second easing curve at call
   sites.
4. Add two reusable motion distances as documented judgments: a reveal offset
   of **24px** and a hover lift of **4px**. Name them for their role, express
   them as CSS custom properties in the correct Tailwind v4 namespace/location,
   and update `docs/design-system.md`, `app/globals.css`, and `lib/utils.ts`
   together if they generate theme utilities. Read their computed values in the
   shared motion helper; no component or tween may inline those pixel values.
5. Keep scale judgments defined once in the shared motion API: image entrance
   starts at **1.02**, card hover remains **1**, button hover remains **1**, and
   button press may use **0.98**. Translation plus opacity is the default; scale
   is reserved for media entrance and press feedback. Record each judgment in
   `docs/motion.md`.

## Client boundary and hook contract

Create one focused `"use client"` motion wrapper that accepts `children`, renders
a single neutral wrapper with a ref, and calls `useGSAP(..., { scope: ref })`.
Mount it in `app/page.tsx` around the existing landing content. The page,
content arrays, comparison table, and all visible markup remain Server
Components/server-rendered children. Do not move copy, images, table rows, or
section implementations into the client module.

Use data attributes on existing server markup as explicit hooks. Do not bind
selectors to typography, layout, or Tailwind class names. Keep hooks few and
semantic:

- one hero-sequence root with separate heading and device-band targets;
- one target for the trusted-by group and its six marks;
- one reveal target for each major section heading/copy/action group;
- one grouped reveal for the four benefits, four Big Picture rows, comparison
  table rows, and three numbered steps;
- one media-reveal target for each large photograph;
- one card-hover target for the four benefit articles only;
- existing `[data-slot="button"]` controls inside the motion scope for button
  micro-interaction.

Do not add a client wrapper per section or per item. Do not target header/footer
or the mobile disclosure from the landing wrapper. Do not animate the semantic
comparison table's cell geometry, the horizontal scrollers, focus outlines, or
anything whose transform is already authored by Tailwind unless its resting
transform is moved into the GSAP tween as required by `AGENTS.md` §9.3 rule 6.

## Choreography

### Page load

- Build one timeline with defaults from shared `DUR.slow` and `EASE`.
- Reveal `Browse everything.` from `autoAlpha: 0` and the tokenized positive
  reveal offset to its exact static rest state.
- Bring in the sage/device band next with `autoAlpha: 0`, the same tokenized
  offset, and scale `1.02 → 1`; overlap it with the heading's settle using a
  timeline position parameter, not `delay`.
- Reveal the trusted label and six marks only when their group enters the
  viewport; use the base duration and a small stagger derived once from
  `DUR.fast`, not a new literal duration.

### Scroll reveals

- Use top-level tweens/timelines with ScrollTrigger; never attach ScrollTrigger
  to a child tween inside a timeline.
- Trigger discrete, once-only entrances near the lower viewport. Choose and
  record one shared `start` judgment, use it everywhere, and use `once: true`.
  No scrub, pin, snap, smooth scrolling, or markers in committed code.
- Heading/copy/action groups reveal as one short sequence. Repeated benefits,
  Big Picture rows, table rows, and numbered steps use bounded staggers in DOM
  order. Large photographs use only `autoAlpha`, tokenized y translation, and
  `1.02 → 1` scale.
- Create triggers in document order. Use `ScrollTrigger.refresh()` only after a
  real layout-affecting event if testing proves it necessary; do not add a
  permanent resize or scroll refresh loop.

### Hover and press

- Preserve the existing CSS token-driven button fill and label-color hover
  states exactly. GSAP adds transform feedback only: tokenized hover lift on
  fine-pointer hover, rest on leave, and the shared press scale on pointer down,
  restoring on pointer up/cancel/leave. Use `overwrite: "auto"` and context-safe
  handlers; remove every listener in cleanup.
- On fine-pointer hover, a benefit article may lift by the tokenized hover
  distance while its icon settles with it. It remains non-interactive and gains
  no pointer cursor, fake link semantics, focus state, shadow, border, or copy
  change. The response is visual depth, not an affordance for a nonexistent
  action.
- Do not animate touch hover. CSS hover colors continue to follow Tailwind v4's
  input-capability behavior.

## Responsive and reduced-motion behavior

Use one `gsap.matchMedia()` inside the scoped `useGSAP` context with all
conditions named. At minimum name:

- compact: `(max-width: 767px)`;
- wide: `(min-width: 768px)`;
- reduceMotion: `(prefers-reduced-motion: reduce)`;
- motionOK: `(prefers-reduced-motion: no-preference)`;
- finePointer: `(hover: hover) and (pointer: fine)`.

Do not create a lone reduced-motion query that leaves the default branch
unmatched. The handler must explicitly branch on the named conditions.

- **375px:** preserve the 343px container, two-line 76px hero, one-column
  benefits, horizontal table/step scrollers, and every current section height.
  Use the same tokenized reveal distance; no hover transform on touch.
- **800px:** preserve the 720px container, two-line 140px hero, two-column
  benefits, and current media/table geometry. The choreography may group the
  two-column benefit cards in DOM order but may not alter layout.
- **1280px:** preserve the 1200px container, one-line 160px hero, four-column
  benefits, and current two-column sections. Fine-pointer hover is enabled only
  when that media condition actually matches.
- **Reduced motion at every width:** create no entrance, scroll, hover, press, or
  stagger animation. Immediately set all motion targets to their visible static
  rest state with no residual transform, opacity, visibility, or `will-change`.
  Navigation, anchor scrolling, horizontal scrollers, and focus behavior remain
  fully functional.

Server HTML must contain visible content. Do not hide motion targets in static
CSS or require JavaScript to reveal them. Use `useGSAP` start states and verify
that hydration produces no visible flash in the production build. If that
cannot be achieved without making no-JS or reduced-motion content invisible,
prefer a fade-only entrance and record the limitation rather than hiding the
server markup.

## Performance and accessibility contract

- Animate only `x`/`y`, `scale`, and `autoAlpha`; never width, height, margin,
  padding, top, left, border radius, box shadow, or layout position.
- Use `will-change` only while a target is actively animating, then clear it.
  Do not apply it permanently to every reveal target.
- Scope all selectors to the wrapper ref. Use `gsap.utils.toArray` or the scoped
  selector supplied by the context; no document-wide query selectors.
- Revert all tweens, timelines, match-media contexts, inline styles, triggers,
  and event handlers on unmount. No `ScrollTrigger.getAll().forEach(kill)` global
  cleanup that could destroy another route's triggers.
- Motion must never change tab order, semantics, accessible names, focus-ring
  geometry, alt text, scroll target ids, or horizontal keyboard access.
- No console warnings, hydration errors, stuck `visibility: hidden`, or hidden
  below-fold content after back/forward navigation.

## Reference deltas

1. The references show end states only; all entrance, trigger, stagger, hover
   transform, and press behavior is new. The chosen values are judgments and
   must be itemized in `docs/motion.md`.
2. The board's hover fill states remain exact, except for the already-approved
   black hover label recorded in `docs/components.md` §5. Motion does not revise
   that accessibility delta.
3. Benefit articles gain a 4px fine-pointer lift although the comps show no
   hover frame. They gain no interactive semantics because they perform no
   action.
4. Reduced-motion users see the exact static reference end state immediately;
   this intentionally omits every new motion behavior.

There are no permitted static layout, typography, palette, radius, media-crop,
copy, or content-order deltas in this step.

## Non-goals

- No redesign, copy change, new route, backend, auth, analytics, carousel,
  horizontal-scroll animation, or navigation transition.
- No animation of the header, footer, mobile disclosure, logo, comparison
  statuses, or report/chart internals.
- No SplitText, ScrollSmoother, ScrollToPlugin, Flip, Draggable, Observer,
  MotionPath, DrawSVG, MorphSVG, physics plugin, GSDevTools, third-party smooth
  scroll, or React View Transition API.
- No edit to `components/ui/` and no conversion of `app/page.tsx` or shared Acres
  primitives into Client Components.
- No new easing, duration, colour, radius, shadow, breakpoint, or permanent
  animation class beyond the two documented motion-distance tokens.
- Step 6's full metadata/focus/accessibility polish remains out of scope, but
  this step still meets the standing accessibility floor and audits the motion
  it introduces.

## Verification and required real output

Run every command and quote its real output in `docs/motion.md` and the final
reply. Do not paraphrase a check that was not run.

1. `npm install gsap @gsap/react` — record the installed versions and audit
   summary.
2. `npx tsc --noEmit` — clean exit; if npm emits notices, quote them too.
3. `npm run lint` — clean exit.
4. `npm run build` — successful Next 16.3 production build with `/` still
   statically generated.
5. `rg -n "markers:\s*true|ScrollSmoother|SplitText|scrub:\s*|pin:\s*true|delay:\s*" app components lib`
   — no prohibited committed motion patterns.
6. `rg -n "(^|[^A-Za-z])Area([^A-Za-z]|$)" app components` — no shipped stale
   product name; exit 1 is expected when there are no matches.

Start the production server on a free port and run a repeatable CDP check at
**375**, **800**, and **1280** CSS px, once with normal motion and once with
`prefers-reduced-motion: reduce`. Save temporary screenshots/metrics under
`/tmp`, not the repository. At minimum prove:

- no console, hydration, uncaught-exception, Base UI, or image warnings;
- the initial hero timeline changes transform/opacity and reaches exact visible
  rest values;
- scrolling creates the expected bounded ScrollTrigger count and reveals the
  final section without leaving any target hidden;
- a sampled button and benefit article lift by the tokenized distance only under
  a fine pointer, then return exactly to rest after leave/cancel;
- reduced motion creates no active tween/trigger and every target computes to
  visible, opacity 1, and no transform;
- container widths remain **343 / 720 / 1200**, hero type remains **76 / 140 /
  160**, both pill sizes remain unchanged, horizontal overflow remains confined
  to the two intentional scrollers, and document width never exceeds viewport;
- screenshots after all animations settle retain the current static composition
  and all below-fold images load.

Use canvas/screenshot pixel checks or computed-style sampling to prove that the
page is nonblank at each viewport and reduced-motion mode. A screenshot alone is
not evidence that cleanup, visibility, or hover branches work.

## Documentation and completion

Create `docs/motion.md` in the same change. Record:

- installed GSAP package versions and verified import paths;
- registration location and client-boundary architecture;
- the CSS-token reader and shared `DUR` / `EASE` contract;
- every motion token and every judgment, explicitly noting that the static
  references measured none of them;
- every reveal group, trigger start, stagger, hover/press behavior, and named
  media condition;
- reduced-motion behavior, cleanup, and performance decisions;
- breakpoint results, browser metrics, screenshot paths, guideline findings,
  Tailwind-doc limitation if still present, and exact command output;
- all reference deltas and any unresolved issue without substituting a narrower
  implementation.

Update the existing `docs/motion.md` index row in `AGENTS.md` from `not yet
written` to `written` with a concise ownership description; add no build detail
to `AGENTS.md` beyond that status line. Run the `web-design-guidelines` review
against every changed UI file before calling the step complete and record its
terse findings or clean result.

After all files and records are complete, inspect the final diff, invoke
`caveman-commit`, stage only this prompt's files, and commit to `main` without
prompting. Do not push. End with the commit hash and exact commands to run the
production result locally.
