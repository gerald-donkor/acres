# Acres — Motion

The build record for step 5 (`prompts/06-motion.md`). It owns GSAP on this
site: the packages, where they are registered, the shared `DUR`/`EASE` contract,
every reveal group and trigger, hover and press, reduced motion, cleanup, and
the browser evidence for all of it.

**Read this before touching any animation.** `docs/design-system.md` §5 owns the
four motion tokens; this file owns everything built on them, plus the two
distance tokens added here.

---

## 1. Packages and verified import paths

Installed on 2026-08-20 with `npm install gsap @gsap/react`:

```
added 2 packages, and audited 671 packages in 6s

240 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
npm warn install-scripts   unrs-resolver@1.12.2 (postinstall: node postinstall.js)
```

The `unrs-resolver` warning is **pre-existing and unrelated** — it belongs to the
ESLint toolchain, not to GSAP.

| package | version | resolved from |
| --- | --- | --- |
| `gsap` | **3.15.0** | `require('gsap/package.json').version` |
| `@gsap/react` | **2.1.2** | `require('@gsap/react/package.json').version` |

**Import paths, read off the packages rather than recalled** (AGENTS.md §10
rule 2). `gsap`'s `exports` map routes `./*` to `./*.js` with types at
`./types/*.d.ts`, and the two plugins declare their own ambient modules —
`gsap/ScrollTrigger` at `types/scroll-trigger.d.ts:884` and `gsap/CustomEase` at
`types/custom-ease.d.ts:34`:

```ts
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { CustomEase } from "gsap/CustomEase"
import { ScrollTrigger } from "gsap/ScrollTrigger"
```

`@gsap/react` types `useGSAP(func, config)` with
`config = { scope?, dependencies?, revertOnUpdate? }` and a return of
`{ context, contextSafe }` — read from `node_modules/@gsap/react/types/index.d.ts`.

---

## 2. Architecture — one module, one client leaf

**`lib/motion.ts`** is the only place GSAP is configured. Registration is at
module scope and happens exactly once (AGENTS.md §9.3 rule 2):

```ts
gsap.registerPlugin(useGSAP, ScrollTrigger, CustomEase)
```

`useGSAP` is itself a plugin and is registered alongside the two real ones. The
file has **no `"use client"` of its own** — it is a plain module that only the
client leaf imports, which is what keeps the GSAP bundle on `/` and off every
other route.

**`components/acres/landing-motion.tsx`** is the one `"use client"` module on
the landing page. It takes the whole server-rendered subtree as `children` and
renders a wrapper with `className="contents"`, so it has **no box at all** and
cannot move a measured pixel of `docs/landing.md`'s geometry. `app/page.tsx`,
the copy arrays, the comparison table and every section stay Server Components
(AGENTS.md §9.2 rules 1 and 2). Nothing was moved into the client module.

`app/page.tsx` mounts it as the single root element of the page:

```tsx
return (
  <LandingMotion>
    …every existing section, unchanged…
  </LandingMotion>
)
```

### 2.1 The hook vocabulary

Targets are addressed **only** through `data-motion-*` attributes on server
markup. No selector touches a Tailwind class, a typography token or a tag name
used for styling, so a class rename cannot silently kill an animation.

| attribute | meaning |
| --- | --- |
| `data-motion-hero-heading` | the `h1`; beat one of the page-load timeline |
| `data-motion-hero-media` | the sage/device band; beat two |
| `data-motion-group="<name>"` | a scroll-revealed group; its items reveal on one trigger |
| `data-motion-pace="tight"` | that group spreads over `--duration-fast` instead of `--duration-base` |
| `data-motion-item` | one revealing member of the nearest enclosing group |
| `data-motion-media` | a large photograph; its own trigger, and the only reveal carrying scale |
| `data-motion-card` | a benefit article; fine-pointer hover lift only |
| `[data-slot="button"]` | the existing pill — reused, not re-marked |

**Groups may nest, and an item belongs to its nearest group and to no other.**
The Big Picture rows sit inside the Big Picture heading group and the comparison
table sits inside the Specs group; the resolver is
`item.closest("[data-motion-group]") === node`, so nothing reveals twice.

Counted live in the built page: **11 groups, 4 media, 42 items, 4 cards, 4
buttons** inside the motion scope.

---

## 3. Tokens, and every judgement in this step

### 3.1 The four inherited tokens

`DUR` and `EASE` are read from `:root` at runtime and defined once. **No call
site restates `0.15`, `0.3`, `0.6` or a second easing curve** (AGENTS.md §9.3
rule 1). `readMotionTokens()` in `lib/motion.ts` reads `--duration-fast`,
`--duration-base`, `--duration-slow`, `--ease-acres` and the two distances
below, converts CSS milliseconds to GSAP seconds in one place, and caches.

### 3.2 GSAP does not understand `cubic-bezier()` — verified, not assumed

`--ease-acres` is a CSS `cubic-bezier(0.22, 1, 0.36, 1)`. Handing that string
straight to GSAP **is not rejected — it silently falls back to the default
ease.** Measured against the installed gsap 3.15.0 in this session:

| ease passed | value at progress 0.5 |
| --- | --- |
| `"cubic-bezier(0.22, 1, 0.36, 1)"` | **0.75** — that is `power1.out`, the default |
| `CustomEase.create("acres", "0.22,1,0.36,1")` | **0.961309** — the curve the token names |
| `CustomEase.create(…, "cubic-bezier(0.22, 1, 0.36, 1)")` | throws `malformed path` |

So the token's four control points are parsed out and handed to `CustomEase`.
This is exactly the silent-wrong-answer AGENTS.md §10 rule 2 exists to prevent,
and the reader throws with a named token rather than guessing if the property is
missing or malformed.

### 3.3 The two new distance tokens

Added to `:root` in `app/globals.css`, **not** to `@theme`:

| token | value | role |
| --- | --- | --- |
| `--motion-reveal-distance` | `24px` | every entrance and reveal travels this far, downward → rest |
| `--motion-lift-distance` | `4px` | the fine-pointer hover lift, upward from rest |

**Why `:root` and not `@theme`.** Tailwind 4's rule is that `@theme` is for
tokens that should generate a utility or a variant, and `:root` is for plain
custom properties that should not. A `--spacing-*` entry would emit
`p-reveal` / `m-lift` classes that no component may ever use and would imply
these are layout spacing rather than tween distances. They sit beside the three
`--duration-*` properties, which are on `:root` for the same reason
(`docs/design-system.md` §5).

**Consequently `lib/utils.ts` is unchanged.** The rule recorded in
`docs/components.md` §4.4 — adding a token to `@theme` means teaching
`tailwind-merge` about it — does not fire, because no class is generated and
there is nothing to merge. Only `lib/motion.ts` reads these two, once, and every
tween takes the value from there.

### 3.4 Scale, defined once

| constant | value | where it applies |
| --- | --- | --- |
| `MEDIA_SCALE_FROM` | `1.02` | media and hero-band entrance only |
| `PRESS_SCALE` | `0.98` | pointer-down on a pill |
| `REST_SCALE` | `1` | cards and buttons at rest and on hover — neither ever grows |

Translation plus opacity is the default everywhere; scale is reserved for media
entrance and press feedback.

### 3.5 The trigger start

`REVEAL_START = "top 85%"`, one shared value used by **every** reveal.

### 3.6 Nothing here was measured

**The references in AGENTS.md §0 are static images. They contain no timing,
distance, trigger, stagger or easing evidence of any kind.** Every value in §3
is a judgement derived from `docs/design-system.md` §5 and the register in
AGENTS.md §8 — "measured and concrete… never campaigning" — recorded as a
judgement so a later session inherits a decision rather than an assumption. The
comps were opened for this step (`Desktop.png` 1280 × 7389, `Tablet.png`
800 × 8825, `Mobile.png` 375 × 8833, and the board's pill and icon-button rows
at `ds-1.png` 1650–2550) and they confirmed the end states this motion must land
on, which is all they can confirm.

---

## 4. Choreography

### 4.1 Page load — one timeline

Defaults `{ duration: DUR.slow, ease: EASE }`. Two beats, overlapped with a
**position parameter** (`"<0.3"`, itself `DUR.base`) rather than a `delay`:

1. `h1` — `opacity 0 → 1`, `y 24 → 0`, via `autoAlpha`.
2. the sage/device band — `autoAlpha 0 → 1`, `y 24 → 0`, `scale 1.02 → 1`.

Measured frame by frame at 1280 with a `requestAnimationFrame` recorder injected
before document load:

| moment | state |
| --- | --- |
| first paint, **t = 320 ms** | hero visible, `opacity 1`, `transform: none` — the server HTML |
| **t = 431 ms** | GSAP applies the start state: `opacity 0`, `matrix(1,0,0,1,0,24)`; band `matrix(1.02,0,0,1.02,0,24)` |
| t = 431–1327 ms | 56 distinct interpolated states; `will-change: transform, opacity` present on 53 of 162 sampled frames |
| **t = 1327 ms** | both at exact rest: `opacity 1`, `matrix(1,0,0,1,0,0)`, `will-change: auto` |

That is the timeline running, reaching its exact static rest values, and
releasing `will-change` — not a screenshot that happens to look right.

### 4.2 Scroll reveals

One query over `[data-motion-group], [data-motion-media]` returns the nodes in
**document order**, so triggers are created top to bottom and refresh in page
order without needing `refreshPriority`. Each is a **top-level tween** — never a
child of a timeline — and each is `once: true`.

| group | items | pace | reveal |
| --- | --- | --- | --- |
| `trusted` | label + 6 marks | tight | opacity + y |
| `benefits-intro` | eyebrow, h2, p | tight | opacity + y |
| `benefits` | 4 articles | base | opacity + y |
| `big-picture` | h2, p, pill | tight | opacity + y |
| `big-picture-rows` | 4 rows | base | opacity + y |
| `specs` | eyebrow, h2, p, pill | tight | opacity + y |
| `comparison` | header row + 6 body rows | base | opacity + y |
| `testimonial` | blockquote, figcaption | tight | opacity + y |
| `how-to` | h2, pill | tight | opacity + y |
| `steps` | 3 `li` | base | opacity + y |
| `contact` | h2, p, pill | tight | opacity + y |
| 4 × `data-motion-media` | the photograph itself | — | `autoAlpha` + y + `1.02 → 1` |

**Stagger is bounded by construction.** `staggerOver(total)` returns
`{ amount, from: "start" }`, so the **total** spread is the token — `DUR.fast`
for a tight group, `DUR.base` otherwise — and a group cannot grow a long tail by
gaining items. No per-item literal exists.

No `scrub`, no `pin`, no `snap`, no smooth scrolling, no markers. Verified:
`document.querySelectorAll('.pin-spacer').length === 0` at every viewport, and
the prohibited-pattern grep in §7 returns nothing. `ScrollTrigger.refresh()` is
never called and no resize or scroll refresh loop was added.

### 4.3 `opacity`, not `autoAlpha`, for group items — and why

**This is the one substantive correction made during execution, and it was
caught by measuring rather than by reading.** The group reveals originally used
`autoAlpha`, which sets `visibility: hidden` at zero. A `visibility: hidden`
element is removed from the tab order entirely, so on the built page a
keyboard-only user tabbing from the top went:

```
header links → Comparison scroller → Steps scroller → footer links
```

— **all four landing pills ("Discover More" ×3, "Learn More") were skipped on
the first pass**, a WCAG 2.1.1 failure introduced by the motion. Measured with
real `Tab` key events over CDP.

Group items now animate plain `opacity`. The control stays tabbable, focusing it
scrolls it into view, and that scroll is what fires its own reveal. Re-measured
after the change, all four appear in the first pass in DOM order:

```
Acres → Benefits → Specifications → How-to → Contact Us → Learn More(header)
→ Discover More → Discover More → Comparison scroller
→ Discover More → Steps scroller → Learn More → footer links
```

`autoAlpha` is kept for the hero and the four photographs, which contain nothing
focusable.

### 4.4 Hover and press

Fine pointer only. **The existing CSS token-driven fill and label-colour hovers
are untouched**; GSAP adds transform feedback and nothing else. All handlers are
`contextSafe`, every tween uses `overwrite: "auto"`, and every listener is
removed in the branch's cleanup.

Measured at 1280 and 375 under an emulated fine pointer, on a revealed pill and
on the first benefit article:

| step | pill | card |
| --- | --- | --- |
| rest | `matrix(1, 0, 0, 1, 0, 0)` | `matrix(1, 0, 0, 1, 0, 0)` |
| `pointerenter` | `matrix(1, 0, 0, 1, 0, -4)` | `matrix(1, 0, 0, 1, 0, -4)` |
| `pointerdown` | `matrix(0.98, 0, 0, 0.98, 0, -4)` | — (cards have no press) |
| `pointerup` | `matrix(1, 0, 0, 1, 0, -4)` | — |
| `pointerleave` | `matrix(1, 0, 0, 1, 0, 0)` | `matrix(1, 0, 0, 1, 0, 0)` |
| `pointercancel` | `matrix(1, 0, 0, 1, 0, 0)` | `matrix(1, 0, 0, 1, 0, 0)` |

Exactly the tokenised 4 px, and an exact return to rest.

**The card gains no affordance.** Measured on the lifting article: `cursor:
auto`, `tabIndex: -1`, `role: null`. No pointer cursor, no link semantics, no
focus state, no shadow, no border, no copy change — the response is visual
depth, not a promise of an action the card does not perform.

**Touch gets no transform.** Under an emulated coarse pointer with `hover: none`
at 375, every one of those steps returns `matrix(1, 0, 0, 1, 0, 0)`: the
`finePointer` branch never installs a listener. CSS hover colours continue to
follow Tailwind 4's own input-capability gating.

---

## 5. Responsive and reduced motion

One `gsap.matchMedia()` inside the scoped `useGSAP`, with **every condition
named** (AGENTS.md §9.3 rule 3):

```ts
compact:      "(max-width: 767px)"
wide:         "(min-width: 768px)"
reduceMotion: "(prefers-reduced-motion: reduce)"
motionOK:     "(prefers-reduced-motion: no-preference)"
finePointer:  "(hover: hover) and (pointer: fine)"
```

The handler branches explicitly: it bails on `reduceMotion || !motionOK`, so a
browser reporting **neither** preference gets the static page rather than an
animation nobody asked for, and the default branch is never left unmatched.

**Reduced motion creates nothing.** No entrance, no scroll reveal, no hover, no
press, no stagger; the only work done is `gsap.set(targets, { clearProps: "all" })`
to strip anything a previous branch left behind. Proven with the same rAF
recorder that captured §4.1: over 3 seconds and 174 sampled frames, the hero
produced **exactly one distinct state** — `opacity 1`, `transform: none`,
`visibility: visible`, `will-change: auto`. Nothing was ever touched.

### 5.1 Breakpoint results — measured, scrollbars hidden

Every figure below is from the production build at that CSS width. The
`(baseline)` column is the same measurement taken on the **pre-motion** build,
so the comparison is against what step 4 shipped rather than against a
recollection.

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| container width | **343** (baseline 343) | **720** (720) | **1200** (1200) |
| hero font-size | **76px** (76px) | **140px** (140px) | **160px** (160px) |
| pill height | 48 | 48 | 48 |
| pill widths | 126 / 137 | 126 / 137 | 126 / 137 |
| `document.scrollWidth` vs viewport | 375 / 375 | 800 / 800 | 1280 / 1280 |
| images loaded | 11 / 11 | 11 / 11 | 11 / 11 |
| targets not at rest after a full scroll pass | **0 of 48** | 0 of 48 | 0 of 48 |
| residual `will-change` | **0** | 0 | 0 |
| `.pin-spacer` elements | 0 | 0 | 0 |

Layout is byte-for-byte what step 4 shipped: the 343 px container and two-line
76 px hero at 375, the 720 px container and two-line 140 px hero at 800, the
1200 px container and one-line 160 px hero at 1280, one-/two-/four-column
benefits, and both pill sizes unchanged.

**Horizontal overflow stays confined to the two intentional scrollers.** At 375
the comparison table and the three-step row measure `scrollWidth 720` inside
`clientWidth 343`, exactly as before; at 800 and 1280 both fit their container
and scroll nowhere. The document itself never exceeds the viewport at any width.

The `1.02` media scale cannot cause a transient horizontal scrollbar: the
overshoot is 6 px per side at 1280 inside a 40 px gutter, 7 px inside 40 at 800,
and 3 px inside 16 at 375.

### 5.2 The settled page is pixel-identical to the untouched page

Full-page renders after every animation settles, compared against the same
viewport rendered with `prefers-reduced-motion: reduce` (which runs no motion at
all), `magick compare -metric AE`:

| width | page height | differing pixels |
| --- | --- | --- |
| 1280 | 6911 | **0** |
| 800 | 7722 | **0** |
| 375 | 7964 | **2.43** (sub-pixel antialiasing) |

Motion returns the page to its exact static composition.

---

## 6. Performance, cleanup, and accessibility

- **Only `x`/`y`, `scale`, `opacity`/`autoAlpha` are animated.** No width,
  height, margin, padding, top, left, radius, shadow or layout position.
- **`will-change` is on only while a tween runs.** `withWillChange()` sets it at
  `onStart` and clears it with `clearProps: "willChange"` at `onComplete`.
  Verified: 53 of 162 sampled frames during the hero entrance carry it, and
  every motion target computes to `will-change: auto` at rest, at all three
  widths, in both motion modes.
- **Every selector is scoped** to the wrapper ref via `el.querySelectorAll` and
  `gsap.utils.toArray`. There is no document-wide query.
- **Cleanup is complete and local.** `useGSAP` reverts its context on unmount,
  the hook returns `() => mm.revert()`, and the `matchMedia` branch returns a
  cleanup that removes every pointer listener it bound. There is **no**
  `ScrollTrigger.getAll().forEach(kill)` — nothing here can destroy another
  route's triggers.
- **Tab order, semantics, accessible names, focus geometry, `alt` text, scroll
  target ids and horizontal keyboard access are unchanged** — see §4.3 for the
  one place that was not true until it was fixed.
- No hydration error, no uncaught exception, no Base UI warning and no
  stuck `visibility: hidden` was observed in any of the seven CDP runs.

### 6.1 `web-design-guidelines` findings

Reviewed against the checklist fetched this session from
`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.

```
## components/acres/landing-motion.tsx

✓ pass

## lib/motion.ts

✓ pass

## app/globals.css

✓ pass

## app/page.tsx

✓ pass  (data-motion-* hooks only; no semantic, focus or content change)
```

Rule-by-rule on the Animation section: `prefers-reduced-motion` honoured and the
content stays visible under it; `transform`/`opacity` only; no `transition: all`
introduced; `transform-origin` left at the correct centred default for the media
scale; hover and press are interruptible via `overwrite: "auto"`; the longest
sequence is ~1.0 s, far under the 5 s that would need pause controls; there is
no loop, decorative or otherwise.

One finding was raised and fixed during the review rather than shipped — the
tab-order regression in §4.3.

---

## 7. Command output

### `npm install gsap @gsap/react`

Quoted in full in §1.

### `npx tsc --noEmit`

```
npm notice run acres@0.1.0 npx
npm notice run 'tsc' --noEmit
```

Clean, exit 0.

### `npm run lint`

```
npm notice run acres@0.1.0 lint
npm notice run eslint
```

Clean, exit 0.

### `npm run build`

```
▲ Next.js 16.3.1 (Turbopack)
✓ Running next.config.ts took 55ms

  Creating an optimized production build ...
✓ Compiled successfully in 1650ms
  Running TypeScript ...
  Finished TypeScript in 3.7s ...
  Collecting page data using 5 workers ...
  Generating static pages using 5 workers (0/4) ...
✓ Generating static pages using 5 workers (4/4) in 1003ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content
```

Clean, exit 0 — `/` is still statically generated with the client leaf mounted.

### Prohibited committed motion patterns

```bash
rg -n "markers:\s*true|ScrollSmoother|SplitText|scrub:\s*|pin:\s*true|delay:\s*" app components lib
```

No matches, exit 1.

### Stale product name

```bash
rg -n "(^|[^A-Za-z])Area([^A-Za-z]|$)" app components
```

No matches, exit 1.

### Browser verification

Production build served with `next start -p 3411`, driven over CDP with
`google-chrome-stable --headless=new` (`docs/automation.md` §3). Seven runs:
1280 / 800 / 375 with normal motion, the same three with
`prefers-reduced-motion: reduce`, and a coarse-pointer run at 375. Plus three
dedicated harnesses: a fine/coarse pointer hover probe, a `requestAnimationFrame`
entrance recorder, and a real-`Tab`-key focus-order walk.

Artifacts, all under `/tmp` and none in the repository —
`/tmp/claude-1000/-home-gdk26-Documents-nextjs-acres/a0921af3-af74-4677-93b7-77663bfec794/scratchpad/`:
`cdp-results.json`, `entrance-1280-samples.json`,
`entrance-1280-reduce-samples.json`, `full-{375,800,1280}[-reduce].png`,
`w{375,800,1280}-{motion,reduce}.png`, `w375-coarse.png`.

**Two harness facts worth keeping**, because both cost a wrong reading first:

1. **Hide the scrollbar or every width is 15 px short.** Without
   `Emulation.setScrollbarsHidden({hidden: true})` the container measured
   1185 / 705 / 328 instead of 1200 / 720 / 343.
2. **`Emulation.setEmulatedMedia` cannot emulate `hover` or `pointer` in
   headless Chrome** — it silently leaves `(hover: hover) and (pointer: fine)`
   false, so a hover test run under it proves nothing. The launch flag does
   work: `--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2`
   for a fine pointer, `…=2,…=2,primaryHoverType=1,availableHoverTypes=1` for
   coarse.

---

## 8. Reference deltas

1. **Every value in §3 is new.** The references measure end states only and
   contain no entrance, trigger, stagger, hover-transform or press evidence.
   Each is itemised above as a judgement, never as a measurement.
2. **The board's hover fills are untouched.** The already-approved black hover
   label recorded in `docs/components.md` §5 stands; motion does not revise that
   accessibility delta, and adds only transform on top of the existing colours.
3. **Benefit articles gain a 4 px fine-pointer lift** although the comps show no
   hover frame for them. They gain no interactive semantics, verified in §4.4.
4. **Reduced-motion users see the exact static reference end state
   immediately**, which intentionally omits every behaviour this step adds.

There are **no** static layout, typography, palette, radius, media-crop, copy or
content-order deltas in this step — §5.2 proves that at the pixel.

---

## 9. Open findings

### 9.1 A ~110 ms visible-then-hidden flash on the hero, at first load only

**Measured, not suspected.** At 1280 the server HTML paints the hero visible at
**t = 320 ms**, and GSAP applies the entrance start state at **t = 431 ms** —
about **111 ms** during which the hero is drawn at rest and then disappears to
begin its entrance. An earlier run of the same harness measured the window at
72 → 147 ms, so the gap tracks hydration timing.

**It is inherent to the constraint, not to this implementation.** `useGSAP` runs
in a layout effect, which is the earliest a client component can act — but the
static HTML has already painted by then. Removing the flash would require
putting the start state in CSS, and that means shipping server markup that is
invisible without JavaScript, which `prompts/06-motion.md` explicitly forbids
and which would break the no-JS and reduced-motion cases outright. A fade-only
entrance does not help: the flash comes from applying *any* start state after
first paint.

**It affects the hero only**, because everything else starts below the fold and
its start state lands long before it is scrolled to. Reduced motion never sets a
start state at all and is unaffected.

Not resolved here, and not routed around with a narrower deliverable
(AGENTS.md §10 rule 9). It is the right thing for step 6 to weigh: either accept
it, or take the trade-off to the user explicitly.

### 9.2 A pre-existing image preload warning, confirmed not ours

At 800 and 375 the console carries:

```
The resource …/_next/image?url=…report-device-desktop.webp&w=750&q=75 was preloaded
using link preload but not used within a few seconds from the window's load event.
```

It comes from the hero's `<picture>` + `<source media="(max-width: 767px)">`
wrapping a `priority` `next/image`. **The same warning was measured on the
pre-motion build**, at the same two widths and with the same URLs, by rebuilding
from a stash of this step's files — so it belongs to step 4's markup, not to
motion. It is recorded here because `docs/landing.md` states that no image
warnings were observed, which is not accurate at 800 and 375; that line is stale
and step 6 owns the fix.

At 1280 there is no console output of any kind.

### 9.3 The Tailwind docs snapshot is still unavailable

`.claude/skills/tailwind-4-docs/references/docs-source.txt` still reads
`Status: Not initialized`, and `references/docs/` and `references/docs-index.tsx`
do not exist — the same blocked sync `docs/landing.md` records for 2026-08-20.
The skill's permitted fallbacks `references/gotchas.md` and
`references/engineering-playbook.md` were used instead, and the `@theme`-versus-
`:root` decision in §3.3 rests on the gotchas file's line that "`@theme` is for
design tokens that should create utilities or variants; use `:root` only for
plain CSS variables that should not generate Tailwind APIs". **No claim in this
file is backed by the official snapshot**, and the sync was not retried during
implementation.
