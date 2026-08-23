# 20 — Condensed navbar transparency

## Scope, and why it is next

The user provided a screenshot (`/home/dgk/Pictures/Screenshots/Screenshot_20260823_221650.png`) showing the floating condensed navigation bar over the `#benefits` photo section and requested making it more transparent.

In `prompts/15-scroll-condensed-navigation.md` and `docs/chrome.md` §2.5, `bg-canvas/70` was recorded as a starting engineering judgement because lossy webm compression in `client/public/assets/ui/rec-flows/desktop.webm` made exact alpha values impossible to measure directly. In practice, `bg-canvas/70` (70% opacity white) creates a milky, semi-opaque background over images and coloured sections.

Examining `client/public/assets/ui/rec-flows/desktop.webm` (sampled at t=22s, t=35s) confirms that the prototype navigation pill is significantly more transparent and frosted than 70% opacity, allowing underlying colors and imagery to be subtly visible with frosted backdrop blur (`backdrop-blur-md`).

This prompt adjusts the condensed navigation background fill to a higher transparency (`bg-canvas/25`), preserving the backdrop blur, shape, shadows, and link interactions.

## Reference material read, by path

| path | what was read from it |
| --- | --- |
| `/home/dgk/Pictures/Screenshots/Screenshot_20260823_221650.png` | User screenshot at `localhost:3000/#benefits` with red circle around the condensed nav pill highlighting excessive opacity over the landscape photo |
| `client/public/assets/ui/rec-flows/desktop.webm` | Frame captures at t=22s (`scratch/desktop_t22.png`) and t=35s (`scratch/desktop_t35.png`) showing the condensed pill over text and container cards with high transparency and frosted blur |
| `client/components/acres/condensed-nav.tsx` | Current implementation using `bg-canvas/70 backdrop-blur-md shadow-card px-8 py-4` |
| `docs/chrome.md` §2.5 | Build record noting `bg-canvas/70` as a starting judgement to be refined |
| `client/app/globals.css` | Token contract for `--color-canvas: #ffffff` and `--shadow-card` |

## What this prompt changes

### 1. Update `CondensedNav` styling in `client/components/acres/condensed-nav.tsx`

Update the `<nav>` element's class list:
- Replace `bg-canvas/70` with `bg-canvas/25`.
- Retain `backdrop-blur-md` for the frosted glass effect.
- Retain `shadow-card`, `rounded-full`, `px-8 py-4`, `fixed top-5 left-1/2 -translate-x-1/2 z-50`.
- Retain all GSAP scroll trigger choreography, `autoAlpha`, and link hover transitions (`hover:text-brand`).

### 2. Update Documentation in `docs/chrome.md`

- Update §2.5 to record the adjustment from `bg-canvas/70` to `bg-canvas/25` based on user feedback and reference calibration.

## Reference deltas

- Updates the initial engineering judgement of `bg-canvas/70` to `bg-canvas/25` (25% opacity canvas white) to deliver a true frosted translucent glass pill matching the user request and video prototype reference.

## Breakpoint behaviour

- **375 (Mobile):** `CondensedNav` remains `hidden` on mobile (`hidden md:flex`); mobile continues to use `MobileNavigation` with its sticky header.
- **800 (Tablet) and 1280 (Desktop):** `CondensedNav` renders with `bg-canvas/25 backdrop-blur-md` once scrolled past the top header.

## Non-goals

- No change to the GSAP trigger mechanics, scroll thresholds, or animation ease/durations.
- No change to typography, link URLs, or DOM structure.
- No change to `MobileNavigation` or `SiteHeader`.
- No new tokens added to `globals.css` (Tailwind opacity modifier `bg-canvas/25` leverages the existing `--color-canvas`).

## Checks (§6), and where the result is recorded

Run from repository root:
- `npm run lint`
- `npm run typecheck`
- `npm run build`

Recorded in:
- `docs/chrome.md` §2.5

## Expected impact

- Files modified:
  - `client/components/acres/condensed-nav.tsx`
  - `docs/chrome.md`
- Visual result: The floating condensed nav pill has a much more transparent, refined frosted-glass appearance when scrolling over photos and content sections.

## SKILLS USED

- `frontend-design` — verify visual aesthetics and frosted-glass balance over light and dark background sections.
- `tailwind-design-system` — confirm Tailwind v4 token opacity modifier usage (`bg-canvas/25`) without extra `@theme` overrides.
- `tailwind-4-docs` — verify utility class compatibility.
- `web-design-guidelines` — confirm legibility and accessibility of nav link text over frosted background.
- `accessibility-compliance` — ensure keyboard focus rings and ARIA labels remain intact.
- `requesting-code-review` — dispatch reviewer subagent following implementation and self-verification.
- `receiving-code-review` — evaluate feedback with technical rigor before final commit.
- `caveman-commit` — format the commit message.
