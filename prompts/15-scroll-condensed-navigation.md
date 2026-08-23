# 15 — Scroll-condensed navigation

## Scope, and why it is next

The user pointed directly at `client/public/assets/ui/rec-flows/{desktop,
tablet,mobile}.webm` and asked for the navbar's UI/UX, animation and flow to be
mimicked exactly, at all three breakpoints. Reviewing the three recordings
frame by frame (procedure and evidence below) surfaces one real, un-built
behaviour: **at 800 and 1280 the horizontal nav bar built in step 3
(`docs/chrome.md`) is not currently sticky, and the comps' capture shows a
second, condensed form of it that the current build has no equivalent of.**
Everything else the recordings show — the landing page's sections, copy, hero
device, hover colour changes on links, scroll reveals — already matches what
step 4 (`docs/landing.md`) and step 5 (`docs/motion.md`) built; re-confirmed by
direct comparison during this session, not assumed.

This prompt's scope is exactly the gap: give the nav a scroll-linked condensed
state at 800/1280, and make the existing mobile closed card persist through
scroll at 375. Nothing else in `SiteHeader`, `MobileNavigation`, the footer, or
any landing section changes.

**It is next, and only this, because it is the one concrete, evidenced delta
between the shipped chrome and the reference the user just handed over** — not
a guess at what else "flow" might mean. Everything not evidenced by the
recordings is out of scope (§"Non-goals").

## Reference material read, by path

| path | what was read from it |
| --- | --- |
| `client/public/assets/ui/rec-flows/desktop.webm` | 66.19 s, 1281×575 @ 60 fps. Sampled at 1 fps for a full-video contact sheet, then at 2–20 fps around the scroll-start transition (t≈14–16 s) and at rest (t=22, 25, 30, 40 s). See §"What the recordings show" |
| `client/public/assets/ui/rec-flows/tablet.webm` | 62.26 s, 800×576 @ 60 fps. Same contact-sheet pass; nav-area crops at t=20 s and t=35 s |
| `client/public/assets/ui/rec-flows/mobile.webm` | 87.78 s, 1366×646 @ 60 fps (a Figma prototype player frame — device viewport is the centred 375×575 region, "W 375 H 575 % 100" bar visible in raw frames). Full-video 1 fps contact sheet, a nav-area-only crop contact sheet at 2 fps, and two full frames at t=25 s and t=40 s |
| `docs/chrome.md` §1, §2.1, §2.2 | the current, non-sticky horizontal nav and closed mobile card this prompt adds condensation/persistence to — read to confirm neither is already sticky |
| `docs/motion.md` §1–6 | the whole GSAP contract this prompt must extend rather than duplicate: `client/lib/motion.ts`'s exports, the `data-motion-*` hook vocabulary, `DUR`/`EASE`/`revealY` token sourcing, the `opacity`-not-`autoAlpha` lesson for **tabbable, one-time** reveals (§4.3) — and why it does **not** apply here (§"Reduced motion and focus" below) |
| `client/components/acres/site-header.tsx`, `client/components/acres/mobile-navigation.tsx` | current markup, breakpoint split (`hidden md:block` / `block md:hidden`), and confirmed absence of any `sticky`/`fixed` class (`grep -n "sticky\|fixed"` on both files returns nothing but the unrelated skip-link in `layout.tsx`) |
| `client/app/globals.css` `@theme` block | confirmed no backdrop-blur or second shadow token exists yet, and that `--shadow-card` is described as "One elevation. Nothing on the board or the comps carries a second" |
| `client/lib/utils.ts` | confirmed the `cn()` / `tailwind-merge` safelist this prompt must NOT need to touch, because no new `@theme` token is added (§"Tokens: none added, and why") |
| AGENTS.md §0 (as amended this session) | records `rec-flows/` as an authorized, but *motion/interaction only*, reference — read before treating anything below as a measurement |

## What the recordings show

All three are a single continuous scroll through the already-built landing
page (opening ~6 s is the capture tool's own "recording started" flash and,
for mobile, the Figma player chrome — not product UI). No recording ever shows
the mobile hamburger being opened, and no recording shows scrolling back
toward the top after the nav has condensed — both are genuine gaps in the
source material, handled under §"Non-goals" and §"Judgement calls" rather than
invented.

**Desktop (1280) and tablet (800), identical behaviour at both widths:**

1. At the very top of the page the nav is exactly what `docs/chrome.md` §2.1
   already built: wordmark left, the four links centred, `Learn More` right,
   in normal document flow, no background treatment beyond the page canvas.
2. The instant scrolling starts, that full bar is gone from view (it is
   scrolling out of the viewport with the rest of the page — nothing in the
   capture suggests it is being hidden by anything other than normal scroll)
   and a **second, smaller floating element appears in its place**: a
   horizontally centred, pill-shaped surface containing **only the four nav
   links** — no wordmark, no `Learn More`. It has a soft, translucent
   white/frosted fill with feathered rather than hard edges and a diffuse
   shadow (confirmed at t=22 s over a plain white section: only a faint grey
   halo is visible around the black link text, no hard-edged card boundary).
3. That pill then **stays fixed at a constant position near the top of the
   viewport for the rest of the scroll** — confirmed static across t=25, 30,
   40 s at desktop and t=20, 35 s at tablet, each showing different page
   content scrolling underneath the same pill in the same place.
4. Cursor hover over an individual link in the pill was captured (t≈18.4–19.2 s
   desktop) and shows the same colour-only feedback already built
   (`hover:text-brand`, `docs/chrome.md`/`site-header.tsx`) — no additional
   hover chrome was confidently observed; a faint highlight glimpsed in one
   frame is not reproducible across neighbouring frames and is not built
   (§"Non-goals").
5. No recording scrolls back toward the top after this point, so **whether the
   full bar reappears on scrolling back up is not evidenced** (§"Judgement
   calls").

**Mobile (375):** the closed nav card (`docs/chrome.md` §2.2 — wordmark left,
`menu` trigger right, 78 px, rounded-b-media, `shadow-card`) is visible at the
top of the frame in every single sampled frame across the full 87.78 s
recording, including deep into the "Connect with us" / footer region at the
very end. It never condenses further — there is nothing left to condense; it
is already wordmark + one icon. No frame anywhere in the recording shows the
disclosure open, so the open-menu geometry and behaviour `docs/chrome.md` §2.3
already built and reference-deltas #4/#6 already settled are **not
re-evidenced and not touched**.

## What this prompt builds

### 1. Desktop/tablet — `CondensedNav`, a new client leaf

New file **`client/components/acres/condensed-nav.tsx`**, `"use client"`,
self-contained in the same way `mobile-navigation.tsx` already is (it owns its
own `NAV_LINKS` copy and its own markup — it is not a bare "contents" wrapper
around server children, because the pill is new UI the server tree does not
already render elsewhere; `mobile-navigation.tsx` is the existing precedent for
a self-contained client component in this codebase, `landing-motion.tsx` is
the precedent for the wrapper-only kind, and this is the former).

- Rendered from `site-header.tsx`, inside the same `hidden md:block` scope the
  full nav already uses (a sibling `<CondensedNav />` after the existing
  `<div className="hidden md:block py-5">…</div>`), so it only ever mounts at
  ≥768 px and never competes with the mobile card.
- Markup: `<nav aria-label="Condensed Navigation" className="fixed top-5 left-1/2 -translate-x-1/2 z-50 hidden md:flex items-center gap-8 rounded-full bg-canvas/70 backdrop-blur-md shadow-card px-8 py-4 invisible opacity-0">`, four `<Link>`s reusing the exact class string `site-header.tsx` already uses for its links (`text-ui text-ink hover:text-brand transition-colors duration-(--duration-fast) ease-acres outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm`), so the two navs are visually identical text and the only new surface is the pill chrome around them.
- `invisible opacity-0` is the static, no-JS-safe rest state — before GSAP
  runs (or if it never runs), the pill renders but is inert and invisible,
  matching the "static HTML paints, GSAP takes over" pattern `docs/motion.md`
  §4.1 already establishes for the hero.
- `data-motion-header` is added to the **existing** `<div className="hidden
  md:block py-5">` wrapper in `site-header.tsx` — the one new hook this prompt
  adds to server markup, following the existing rule that GSAP addresses
  targets only through `data-motion-*` attributes (`docs/motion.md` §2.1),
  never a Tailwind class or tag name.

### 2. The scroll trigger

Inside `CondensedNav`'s own `useGSAP`, scoped to its own `nav` ref:

```ts
const header = document.querySelector<HTMLElement>("[data-motion-header]")
if (!header) return

const { base, ease } = readMotionTokens()

gsap.matchMedia().add(MOTION_CONDITIONS.motionOK, () => {
  gsap.to(navRef.current, withWillChange({
    autoAlpha: 1,
    y: 0,
    duration: base,
    ease,
    scrollTrigger: {
      trigger: header,
      start: "bottom top",
      toggleActions: "play reverse play reverse",
    },
  }))
})
```

- **`autoAlpha`, deliberately, not `opacity`** — the opposite call from
  `docs/motion.md` §4.3's group items, and for a reasoned, opposite reason.
  §4.3 moved *away* from `autoAlpha` because a **one-time, `once: true`** reveal
  that starts hidden made real page content untabbable on first pass. This
  trigger is **not** `once` and **not** a one-time reveal — it is a persistent
  toggle between "hidden" and "shown" that fires every time the header crosses
  the viewport edge, in both directions, and the pill's four links are a
  **duplicate** of the main nav's four links. When the pill is hidden it must
  be genuinely unreachable by Tab, or a keyboard user gets four extra,
  invisible stops repeated throughout the page. `visibility: hidden`
  (`autoAlpha`'s mechanism) is exactly the property that removes an element
  from the tab order, which is the defect *for* a one-time reveal and the
  fix *for* a duplicate persistent toggle. State this reasoning in
  `docs/motion.md` rather than silently diverging from the established
  `opacity`-only pattern.
- **`start: "bottom top"`** — fires the instant the full header's bottom edge
  passes the top of the viewport, i.e. the moment it is no longer visible.
  This is what the recordings show (the pill appears essentially as soon as
  scrolling starts, because the header is short) and it is derived from the
  header's real, live height rather than a guessed pixel threshold that would
  drift if the header's height ever changes.
- **`toggleActions: "play reverse play reverse"`** is the judgement call for
  the un-evidenced scroll-back-up case (§"Judgement calls" below): symmetric,
  so the pill reverses out exactly when the full header scrolls back into
  view, and reappears if the header scrolls out again. GSAP's own documented
  idiom for a two-state, direction-agnostic toggle; nothing scrubbed, no pin.
- **Reduced motion runs no branch at all** — `gsap.matchMedia().add` is only
  ever called for `MOTION_CONDITIONS.motionOK`, mirroring the existing
  reduced-motion contract in `docs/motion.md` §5 ("Reduced motion creates
  nothing"). Under `prefers-reduced-motion: reduce` the pill never appears and
  the page behaves exactly as it does today — the pre-existing, already-
  accessible baseline — rather than inventing an instant-cut variant with no
  reference evidence either way. Record this as the explicit judgement it is.
- Every duration/easing value comes from `readMotionTokens()`; nothing is
  restated (AGENTS.md §9.3 rule 1). `withWillChange()` is reused unchanged
  from `client/lib/motion.ts` for the same `will-change` hygiene every other
  tween on the site already has.
- Cleanup: `useGSAP`'s automatic revert on unmount, matching every other GSAP
  usage in the codebase (no manual `ScrollTrigger.getAll().kill()`).

### 3. Mobile — persistence only, no new component

`client/components/acres/mobile-navigation.tsx`: the outer wrapper's
`className={cn("block md:hidden relative z-50", className)}` becomes
`className={cn("block md:hidden sticky top-0 z-50", className)}` — `relative`
→ `sticky top-0`. This is a one-line, non-GSAP, pure-CSS change: the card (and,
if open, the disclosure panel beneath it) now stays pinned to the viewport top
through scroll instead of moving with the page, matching the recording, and
`--shadow-card` already gives it real elevation once it has other content
scrolling beneath it. No other line in this file changes; the open-menu
geometry and interactions stay exactly as `docs/chrome.md` §2.3 built them.

## Tokens: none added, and why

No new `@theme` entry, no `cn()`/`tailwind-merge` safelist update.

- **Background** — `bg-canvas/70`: the existing `--color-canvas` token with
  Tailwind's built-in opacity modifier. `--color-canvas` is already in the
  `cn()` colour safelist; the `/70` suffix does not introduce a new class name
  for `tailwind-merge` to fail to recognise.
- **Blur** — `backdrop-blur-md`: Tailwind 4's inherited default blur scale
  (the same "sm→4xl ladder" `client/app/globals.css` already keeps for
  `client/components/ui/`), not a project token, so nothing to register.
- **Elevation** — reuses `--shadow-card` rather than adding a second shadow.
  `client/app/globals.css` states "One elevation. Nothing on the board or the
  comps carries a second" as a design-system invariant; the recordings are
  motion/interaction evidence only (AGENTS.md §0, as amended) and are not
  grounds to add a second, precisely-measured elevation value the lossy webm
  cannot actually support measuring.
- **Position/spacing** (`top-5`, `px-8`, `py-4`, `gap-8`, `z-50`) — all
  standard Tailwind spacing-scale utilities already used verbatim elsewhere in
  `site-header.tsx` / `mobile-navigation.tsx` (`py-5`, `gap-8`, `z-50`), not
  new tokens.

If implementation finds any of these reads wrong by eye against the
recordings, adjust the utility, not the architecture, and record the actual
values used in `docs/chrome.md` — per AGENTS.md §10 rule 4, state them as the
engineering judgement they are, not as a measurement.

## Judgement calls (evidence gaps the recordings leave open)

1. **Scroll-back-up behaviour.** No recording reverses scroll after the pill
   appears. `toggleActions: "play reverse play reverse"` (§"The scroll
   trigger") is the chosen behaviour — symmetric with scroll position, not
   scroll velocity or direction-only. Documented as a judgement in
   `docs/motion.md`.
2. **The hover highlight glimpsed in one frame (desktop t≈18.8 s).** Not
   reproducible in adjacent frames; not built. See §"Non-goals".
3. **Exact pill background alpha / blur radius / vertical offset.** The
   recordings prove the *shape* of the behaviour (translucent, blurred,
   floating, fixed) but the webm's lossy compression means no exact value can
   be read off a pixel the way `docs/design-system.md` reads the PNG comps.
   `bg-canvas/70`, `backdrop-blur-md`, `top-5` are starting judgements to
   verify by eye against the recordings during implementation, and record
   as-built.

## Non-goals

- **No sliding/animated hover indicator inside the pill.** Glimpsed once,
  unreproducible; building it would be inventing UI the reference does not
  confidently show (AGENTS.md §10 rule 4/9).
- **The mobile open-menu geometry, interactions, and reference deltas are
  untouched.** Never evidenced open in any recording; nothing here revises
  `docs/chrome.md` §2.3 or its reference deltas #4/#6.
- **No change to the footer, any landing section, or the hero.** Re-confirmed
  during this session's review to already match the recordings.
- **No new `@theme` token** — see §"Tokens: none added, and why".
- **`client/public/assets/ui/ref/screensizes/`** (a different, still-
  undocumented set of `.webm` files predating this session, already deleted by
  `prompts/12-hero-device-bezel.md`) is not resurrected and not related to
  this prompt's `rec-flows/` reference.

## Breakpoint behaviour

- **375**: no `CondensedNav` (it is `hidden` below `md`). The existing closed
  card gains `sticky top-0`, so it now persists through scroll; the open
  disclosure's own geometry is unchanged.
- **800 and 1280**: identical treatment (the recordings show no difference
  between them beyond container width). The existing horizontal nav is
  unchanged in its own at-top appearance; `CondensedNav` mounts alongside it,
  invisible at rest, and crosses over the instant the full header scrolls out
  of view.

## Checks (§6), and where the result is recorded

Run from the repository root, quote the real output (§10 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Browser verification over CDP (`docs/automation.md` §3) at 375/800/1280:
  confirm `CondensedNav` is `visibility: hidden` at `scrollY = 0`, becomes
  `visibility: visible` once scrolled past the header, that its four links are
  **not** in the Tab order while hidden and **are** while visible (the exact
  check `docs/motion.md` §4.3 already ran for a different reason — reuse the
  harness), that the mobile card computes `position: sticky` and stays at
  `top: 0` of the viewport through a full scroll pass, and a
  `prefers-reduced-motion: reduce` run at all three widths showing the pill
  never becomes visible.

Recorded in:

- **`docs/chrome.md`** — a new subsection for `CondensedNav` and the mobile
  `sticky` change, alongside the existing §2.1/§2.2 it extends.
- **`docs/motion.md`** — a new choreography entry (the trigger, the
  `autoAlpha`-not-`opacity` reasoning, the reduced-motion judgement) alongside
  §4 and §5, and the CDP verification table alongside §6.1's existing browser
  evidence.
- **`AGENTS.md`** — already amended this session (§0); no further row expected
  per §1.8's cap.

## Expected impact

- Every route (`SiteHeader`/`MobileNavigation` are in `client/app/layout.tsx`,
  not just `/`) gains the condensed pill at ≥768 px and the sticky mobile card
  at <768 px.
- New file: `client/components/acres/condensed-nav.tsx`.
- Changed: `client/components/acres/site-header.tsx` (one `data-motion-header`
  attribute, one new `<CondensedNav />` render), `client/components/acres/
  mobile-navigation.tsx` (one class change).
- No `@theme` change, no `cn()` safelist change, no dependency change, no
  route added or removed, no landing-page section touched.

## SKILLS USED

- `gsap-scrolltrigger` — the `start: "bottom top"` trigger and
  `toggleActions: "play reverse play reverse"` idiom for a two-state,
  direction-agnostic toggle; confirms a top-level tween (not nested in a
  timeline) is the correct shape, matching `docs/motion.md`'s existing rule.
- `gsap-react` — `useGSAP` with a `scope` ref, `gsap.matchMedia()` inside it,
  and automatic revert-on-unmount cleanup for the new client leaf.
- `frontend-design` — the pill is a first-impression chrome change; verify the
  frosted/floating treatment by eye against the recordings, not only by class
  name.
- `tailwind-design-system` — confirms `bg-canvas/70` (opacity modifier on an
  existing token) and `backdrop-blur-md` (inherited default scale) are both
  v4-correct ways to add this surface without a new `@theme` entry.
- `web-design-guidelines` — the tab-order-while-hidden check in §"Checks" is
  an accessibility floor requirement (AGENTS.md §9.4), not optional polish.
- `vercel-react-best-practices` — `CondensedNav` stays a small client leaf;
  `site-header.tsx` and `mobile-navigation.tsx`'s existing server/client split
  is preserved, not widened.
- `requesting-code-review` — dispatch the reviewer subagent after
  self-verification (§2.1), with the `autoAlpha`-vs-`opacity` reasoning
  called out explicitly since it deliberately contradicts the pattern
  `docs/motion.md` §4.3 set elsewhere in the same file.
- `receiving-code-review` — evaluate feedback with technical rigor before
  acting (§2.1).
- `caveman-commit` — the commit message (§3, §7).
