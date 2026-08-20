# Step 6 — polish, the accessibility pass, and real metadata

## Scope, and why it is next

`AGENTS.md` §8.2 step 6: *"Polish and the accessibility pass —
`web-design-guidelines` run over the whole page, reduced motion honoured, focus
visible everywhere, real metadata."* It is next because step 5 is committed and
step 7 (the `client/` split) is explicitly gated behind it.

Resolved from the repository, not from `prompts/`:

- `git log --oneline -3` → `f29f674 feat(motion): add GSAP reveal and hover layer`,
  `8fa0743`, `8e9f644 feat(landing): build landing page`. `git status` clean.
- `lib/motion.ts` and `components/acres/landing-motion.tsx` exist; `gsap@^3.15.0`
  and `@gsap/react@^2.1.2` are in `package.json`. Step 5 is built.
- `docs/` holds `design-system.md`, `components.md`, `chrome.md`, `landing.md`,
  `motion.md`, `automation.md`. `docs/polish.md` does not exist and this step
  creates it, adding its row to the `AGENTS.md` index in the same change
  (§10 rule 1).
- `npm run lint` and `npx tsc --noEmit` both run clean today, so the "two known
  lint errors" sentence in `AGENTS.md` §8.1 is stale (§10 rule 8) — see task 9.

This step ships **no new section, no new component variant, and no layout
change**. Everything below is an accessibility fix, a metadata addition, a
typographic correction, or a documented decision on an inherited finding.

## Two decisions already taken by the user (2026-08-20)

1. **The hero entrance flash (`docs/motion.md` §9.1) is ACCEPTED, not fixed.**
   No inline arming script, no CSS start state, no removal of the hero
   timeline. The finding is closed in `docs/` as an accepted trade-off with the
   reasoning recorded. **Do not "improve" it while in the file.**
2. **`metadataBase` reads `NEXT_PUBLIC_SITE_URL` and falls back to
   `http://localhost:3000`.** No domain is invented anywhere in the tree
   (§10 rule 6).

## SKILLS USED

Load every one of these at execution time, before writing code. Listing is not
loading (`AGENTS.md` §5).

- `web-design-guidelines` — the checklist this step is graded against. Fetch the
  rules fresh from
  `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
  at execution time and review against the fetched copy, not against the
  findings transcribed into this file.
- `frontend-design` — keep every fix subordinate to the measured design; polish
  must not become redesign.
- `tailwind-4-docs` — verify `color-scheme`, `touch-action`, `scroll-behavior`,
  `sr-only`/`not-sr-only`, `focus-visible` and any arbitrary-property syntax in
  v4 before writing it. Its docs snapshot is still uninitialised
  (`docs/motion.md` §9.3) — retry the sync once, and if it is still blocked, say
  so and fall back to `references/gotchas.md` and
  `references/engineering-playbook.md`, recording which was used.
- `tailwind-design-system` — for any token this step needs that does not exist
  yet (§9.1 rule 1: a missing value is a missing token, never an inline one).
- `shadcn` — only if a `components/ui/` primitive is touched. Nothing here plans
  to.
- `vercel-react-best-practices` — the new files (`not-found.tsx`, the metadata
  routes, `lib/site.ts`) must stay Server Components; `lib/site.ts` must never be
  imported by a client module (§9.2 rule 3).
- `gsap-core`, `gsap-react` — required before touching
  `components/acres/landing-motion.tsx` or `lib/motion.ts` for the reduced-motion
  verification in task 7.
- `caveman-commit` — the commit message (§3, §7).

## Reference material read for this prompt

- `AGENTS.md` §§1.3, 1.7, 8.2, 9.1–9.4, 10.
- `docs/motion.md` §6, §6.1, §8, §9.1–9.3 (the two findings handed to this step).
- `docs/landing.md` "Accessibility and Guideline Audit" (the line this step
  corrects) and "Check Results".
- `docs/components.md` §5 (the approved hover-contrast delta — it stands).
- Installed Next 16.3.1 docs, read this session from `node_modules/next/dist/docs/`:
  - `01-app/01-getting-started/14-metadata-and-og-images.md`
  - `01-app/03-api-reference/04-functions/generate-viewport.md`
  - `01-app/03-api-reference/03-file-conventions/01-metadata/{app-icons,opengraph-image,robots,sitemap}.md`
  - `01-app/03-api-reference/02-components/image.md` lines 270–300 and 1321.
- The comps in `AGENTS.md` §0 are read only where a fix could move a pixel
  (task 4's OG crop, and the before/after diff in task 10).

**One Next 16 fact this prompt depends on, quoted from the installed docs**
(`02-components/image.md`):

> Starting with Next.js 16, the `priority` property has been deprecated in favor
> of the `preload` property…

and, on art-directed images:

> You cannot use `preload` or `loading="eager"` because that would cause both
> images to load. Instead, you can use `fetchPriority="high"`.

That is the documented fix for `docs/motion.md` §9.2, and it also clears a
deprecated prop.

---

## The audit — every finding this step fixes

Line numbers are as of `f29f674`; re-locate by content, never by number alone.

### Group A — accessibility

| # | where | finding | fix |
| --- | --- | --- | --- |
| A1 | `app/layout.tsx:43` | No skip link. `web-design-guidelines`: "include skip link for main content". | Add a skip link as the first child of `<body>`, targeting `<main>`. |
| A2 | `app/layout.tsx:45` | `<main>` has no `id` and is not focusable, so a skip link cannot land on it. | `id="main-content"` and `tabIndex={-1}`, with `outline-none` **only** alongside the existing focus-visible pattern. |
| A3 | `app/page.tsx:388–391` and `497–499` | Two horizontal scrollers are `<div tabIndex={0} aria-label=…>` with no role. `aria-label` on a generic element is not reliably exposed; the region is also not announced. | Add `role="region"` to both. Keep `tabIndex={0}`, the labels and `overscroll-x-contain`. |
| A4 | `app/page.tsx:171` | `<span className="sr-only">Trusted partner mark {index + 1}</span>` sits beside an `alt=""` image. It announces meaningless ordinal noise to exactly the users the `alt=""` was protecting. | Delete the span. The marks stay decorative (`alt=""`), and the `<h2 id="trusted-heading">Trusted by:</h2>` already names the region. Drop the now-unused `index` binding. |
| A5 | `app/page.tsx` — `<Section id="benefits">`, `id="specifications"`, `id="how-to"`, `id="contact"` | `scroll-mt-section` is authored on inner wrappers, but the anchor target is the `<section>` carrying the `id`. Fragment navigation therefore lands without the intended margin. `web-design-guidelines`: "`scroll-margin-top` on heading anchors". | Move `scroll-mt-*` onto the four id-bearing `<Section>` elements via `className`, and remove the stranded `scroll-mt-section` from the inner wrappers where it is now redundant. Do **not** change `pt-section`; padding is the rhythm and must not move (`docs/design-system.md` §3.3). Verify at all three widths that no section's vertical geometry changed (task 10). |
| A6 | `components/acres/mobile-navigation.tsx` | Open menu: no `overscroll-behavior` on the disclosure panel, and the underlying page still scrolls behind it. It is a disclosure, not a modal — do **not** add a focus trap or `aria-modal`. | Add `overscroll-contain` to the panel. Do not lock body scroll (the card is anchored, not an overlay covering the page). Confirm Base UI's `CollapsibleTrigger` already emits `aria-expanded` / `aria-controls`; if it does, record that and add nothing. |
| A7 | `app/globals.css` | No `color-scheme`. Acres has no designed dark theme (`docs/design-system.md` §7.7), so a UA in dark mode may paint form controls and scrollbars dark against a white canvas. | `color-scheme: light` on `html` in the `@layer base` block, with a comment pointing at §7.7. |
| A8 | `app/globals.css` | No `touch-action` or `-webkit-tap-highlight-color`. Every CTA is a link; mobile gets the 300 ms double-tap delay and a default blue flash. | `touch-action: manipulation` and an intentional `-webkit-tap-highlight-color` (transparent, since a focus-visible and a colour hover already exist) on interactive elements in `@layer base`. Scope it — do not blanket `*`. |
| A9 | `app` | No `not-found.tsx`; `/_not-found` renders the Next default, outside Acres chrome. | Add `app/not-found.tsx`: a Server Component, one `<h1>`, one line of copy in Acres' register (§8), and one `Button` back to `/`. Uses `Section`/`Container` — no new layout primitives. |

### Group B — motion findings inherited from step 5

| # | where | finding | resolution |
| --- | --- | --- | --- |
| B1 | `docs/motion.md` §9.1 | ~110 ms hero visible-then-hidden flash on cold load. | **Accepted** (user decision above). Close the finding in `docs/polish.md` with the trade-off stated: fixing it requires server markup that is invisible without JavaScript, which breaks the no-JS and reduced-motion cases. Change no code. |
| B2 | `docs/motion.md` §9.2 | Image-preload console warning at 800 and 375, from the hero's `<picture>` + `<source>` wrapping a `priority` `next/image`. Confirmed pre-existing to motion, and `docs/landing.md`'s "no image warnings were observed" is stale. | `app/page.tsx:134` — replace `priority` with `fetchPriority="high"`, per the two quoted Next 16 doc lines. Verify in the browser (task 10) that the warning is gone at 800 and 375 and that the hero is still the LCP element at 1280. Correct the stale line in `docs/landing.md` in this same change (§10 rule 8). |
| B3 | `app/globals.css` | GSAP honours `prefers-reduced-motion`, but the CSS `transition-colors` on pills, nav links, footer links and the mobile card does not. | Add a `@media (prefers-reduced-motion: reduce)` block in `@layer base` reducing `animation-duration`/`transition-duration` to `0.01ms` and `scroll-behavior: auto`, applied to `*, *::before, *::after`. |
| B4 | `app/globals.css` | Anchor navigation (every CTA on the page is a fragment link) jumps instantly. | `scroll-behavior: smooth` on `html`, cancelled by the B3 block. Verify the two do not fight. |

### Group C — typography and copy

| # | where | finding | fix |
| --- | --- | --- | --- |
| C1 | `app/page.tsx:192, 248, 310, 348` | `&apos;` renders a straight `'`. `web-design-guidelines`: curly quotes. The blockquote's double quotes are already curly, so the page is currently inconsistent with itself. | Replace all four with the literal `’`. Copy wording is unchanged — this is a glyph fix, not an edit to the comps' copy. |
| C2 | whole tree | Verify no `...` where `…` belongs and no straight double quotes in shipped copy. | Fix what the sweep finds; report `no matches` when there is nothing. |
| C3 | `app/page.tsx` comparison table | Guidelines ask for `tabular-nums` on number columns. The table holds no numeric columns; the `01`/`02`/`03` markers are single-glyph-width labels. | **No change.** Record as considered-and-declined so a later session does not re-open it. |

### Group D — real metadata

All of it in `app/`, all Server Components, all verified against the installed
Next 16.3.1 docs before writing.

| # | file | content |
| --- | --- | --- |
| D1 | `lib/site.ts` (new) | `SITE_URL` (from `process.env.NEXT_PUBLIC_SITE_URL`, falling back to `http://localhost:3000`), `SITE_NAME` (`"Acres"`), `SITE_DESCRIPTION` (the existing description string, moved here so metadata, OG and the sitemap cannot drift). Plain module, no `"use client"`, imported only by server files (§9.2 rule 3). |
| D2 | `app/layout.tsx` | Expand `metadata`: `metadataBase: new URL(SITE_URL)`, `title` as `{ default, template: "%s — Acres" }`, `description`, `applicationName`, `keywords`, `authors`/`creator` only if truthful — otherwise omit rather than invent (§10), `alternates: { canonical: "/" }`, `openGraph` (`type: "website"`, `siteName`, `locale: "en"`, `url: "/"`, `title`, `description`), `twitter: { card: "summary_large_image" }`, `robots` (index/follow, with `googleBot` max-image-preview large), `formatDetection` if it stops phone-number auto-linking on the copy. Add a separate `export const viewport: Viewport = { themeColor: "#ffffff", colorScheme: "light" }` — the docs are explicit that `themeColor` moved out of `metadata` into the `viewport` export. |
| D3 | `app/icon.svg` (new) | The Acres mark, from the already-extracted vector in `components/acres/logo-mark.tsx` (`viewBox="0 0 31.75 70"`, one `path`). Do not re-extract or redraw it; copy the path data. Explicit `fill="#000000"` — `currentColor` is meaningless in a standalone favicon. |
| D4 | `app/apple-icon.png` (new) | 180 × 180, the same mark centred on `#FFFFFF` with sensible padding, produced with `magick` from D3. Record the exact command in `docs/polish.md`. |
| D5 | `app/favicon.ico` | Currently the 26 KB create-next-app default (`file` reports 16 × 16 and 32 × 32). Replace with an Acres `.ico` built from D3 (16/32/48). `favicon` is `.ico`-only and top-level-`app/`-only per the docs. |
| D6 | `app/opengraph-image.png` + `app/opengraph-image.alt.txt` (new) | 1200 × 630. Built with `magick` from the real comp — `public/assets/ui/landing-pages/Desktop.png` — so the type is the genuine Crimson Text/DM Sans rendering and nothing is re-typeset from a substituted face (§10 rule 7). Compose the hero wordmark region over the white canvas with the sage band; record the crop offsets and the full command in `docs/polish.md`. The `.alt.txt` carries the alt text. |
| D7 | `app/twitter-image.png` + `.alt.txt` (new) | Same image and alt. Confirm against `01-metadata/opengraph-image.md` whether a separate `twitter-image` file is required or whether the OG file is reused; follow whatever the installed doc says and record the answer. |
| D8 | `app/sitemap.ts` (new) | One entry: `/`, `lastModified`, `changeFrequency`, `priority`, built from `SITE_URL`. |
| D9 | `app/robots.ts` (new) | `allow: "/"`, `sitemap: ${SITE_URL}/sitemap.xml`. |
| D10 | `.env.example` (new) | `NEXT_PUBLIC_SITE_URL=http://localhost:3000` with a one-line comment. Do **not** create `.env` or `.env.local`. |

### Group E — stale lines to correct in the same change (§10 rule 8)

| # | file | correction |
| --- | --- | --- |
| E1 | `AGENTS.md` §8.1 | "Two known lint errors (`components/ui/carousel.tsx`, `hooks/use-mobile.ts`)…" — `npm run lint` is clean at `f29f674` (quoted in task 9). Fix the sentence. Keep the edit to that paragraph; §8.1 is a snapshot by design. |
| E2 | `docs/landing.md` | "No console, hydration, Base UI, or image-alt warnings were observed" — the preload warning at 800 and 375 was measured in step 5. Correct the line and point at B2's fix. |
| E3 | `AGENTS.md` index table | Add the `docs/polish.md` row. One row only (§1.8). |

---

## Non-goals

- **No hero-flash fix.** Decided above.
- **No dark theme.** `docs/design-system.md` §7.7 stands: nothing in the
  references specifies one. `color-scheme: light` is the opposite of adding one.
- **No new section, image, copy block or component variant.** No comp geometry
  moves. Task 10 proves it.
- **No comp-copy rewrite.** `web-design-guidelines`' Title Case and
  active-voice rules do **not** override the comps' measured copy; the register
  is already `AGENTS.md` §8's. Only glyphs change (C1).
- **No focus trap, `aria-modal` or body-scroll lock on the mobile menu** — it is
  a disclosure card anchored to the top edge (`docs/chrome.md`), not an overlay.
- **No changes inside `components/ui/`.** Nothing here needs one.
- **No `client/` split, no `server/`, no workspaces** — steps 7 and 8.
- **No analytics, no consent banner, no CMS, no forms** (§8.2 "Do not overbuild").
- **No `manifest.ts`.** A web-app manifest implies an installable PWA the
  references do not specify; if it comes up, record it, do not build it.

## Breakpoint behaviour — 375 / 800 / 1280

- **375** — skip link visible on focus at the top of the card; menu panel gains
  `overscroll-contain`; `touch-action: manipulation` removes the tap delay;
  hero image warning gone; every touch target still ≥ 44 × 44 (§9.4 rule 5).
- **800** — identical fixes; the desktop nav bar is the focus path; hero image
  warning gone.
- **1280** — hero stays the LCP element with `fetchPriority="high"`; skip link
  is the first tab stop, then wordmark → four nav links → CTA.
- **All three** — no layout, type-scale, colour, radius or spacing change. The
  only geometry this step can move is A5's `scroll-margin`, which is inert until
  a fragment link is followed.

## Reference deltas

1. **The skip link is not in any comp.** It is a `web-design-guidelines`
   requirement and it is visually absent until focused, so it changes no
   measured pixel at rest.
2. **The `01`/`02`/`03` markers do not get `tabular-nums`** (C3) — declined, not
   overlooked.
3. **The OG and icon artwork are new** — the references contain no social card
   and no favicon. They are composed from the comp and from the already-extracted
   logo vector, never re-typeset in a substituted face.
4. **`app/not-found.tsx` has no comp.** It is built from existing primitives and
   existing type roles only; no new token, no new variant.
5. **Smooth scrolling is a judgement, not a measurement** — the references are
   static. It is cancelled under reduced motion.

## Execution order

1. Load every skill in `## SKILLS USED`. Retry the `tailwind-4-docs` sync once
   and record the outcome.
2. Fetch `web-design-guidelines` fresh and re-run the audit against the current
   tree — this file's table is the expected result, not a substitute for the run.
   Anything new that the fresh run turns up is added to `docs/polish.md` and
   fixed if it is in scope, or recorded as out of scope with a reason.
3. Group A fixes.
4. Group B fixes (B2, B3, B4 are code; B1 is documentation only).
5. Group C fixes.
6. Group D — `lib/site.ts` first, then `app/layout.tsx`, then the asset and route
   files. Verify each file convention against the installed doc **before**
   creating the file.
7. Group E corrections.
8. Write `docs/polish.md`.
9. Run the checks (below) and quote real output.
10. Browser verification (below).
11. Commit to `main` with `caveman-commit` (§2 step 13, §7).

## Checks — quote the real output of each (§6, §10 rule 3)

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Sweeps, each with its exit status:

```bash
rg -n "&apos;|&quot;|\.\.\." app components          # C1/C2 — expect no matches after
rg -n "(^|[^A-Za-z])Area([^A-Za-z]|$)" app components  # §1.7 — expect no matches
rg -n "markers:\s*true|ScrollSmoother|scrub:|pin:\s*true" app components lib  # §9.3 rule 5
rg -n "priority" app components                      # expect no matches (B2)
rg -n "outline-none" app components/acres            # every hit must have a focus-visible replacement
```

## Browser verification (`docs/automation.md` §3)

Production build, `next start` on a free port, driven over CDP headless. The two
harness facts recorded in `docs/motion.md` §7 apply and must be honoured:
**hide the scrollbar** (`Emulation.setScrollbarsHidden`) or every width reads
15 px short, and **`setEmulatedMedia` cannot emulate pointer type** — use the
`--blink-settings` flags for any hover check.

Runs required:

1. 1280 / 800 / 375, normal motion — console clean; specifically, the preload
   warning of B2 absent at 800 and 375.
2. The same three under `prefers-reduced-motion: reduce` — every element still
   visible, no transition longer than a frame.
3. A real `Tab`-key focus-order walk at 1280 and at 375 — skip link first, then
   chrome, then the page; the skip link moves focus to `<main>`; every stop has
   a visible ring.
4. `#benefits`, `#specifications`, `#how-to`, `#contact` followed from the nav —
   each lands with A5's scroll margin applied.
5. Full-page screenshots at all three widths, diffed against the pre-change
   build with `magick compare -metric AE -fuzz 4%`. **The expected result is
   zero, or a sub-pixel antialiasing count of the same order `docs/motion.md`
   §5 recorded.** A real difference means polish became redesign — stop and
   report rather than accepting it.
6. `<head>` dumped and quoted: title, description, canonical, OG, twitter,
   theme-color, and the three icon links.

Artifacts go under the session scratchpad, never in the repository.

## Where the result is recorded

**`docs/polish.md`** (new), covering: the fresh `web-design-guidelines` run and
its findings in the skill's `file:line` format; every Group A–E change with its
reasoning; the accepted hero-flash decision and its trade-off; the metadata
surface and the exact `magick` commands that produced the icon and OG artwork;
the `<head>` dump; the check output; the pixel diff; and any finding raised and
deliberately not fixed. Add its row to the `AGENTS.md` index (E3), and correct
E1 and E2 in the same commit.
