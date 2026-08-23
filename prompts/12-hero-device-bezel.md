# 12 — Hero device bezel: extract the framed device, close the open item

## Scope, and why it is next

`prompts/11-responsive-comp-fidelity.md` closed defects A–F of its own list and
recorded two things as **explicitly open** in `docs/landing.md` §8 ("Deltas
knowingly accepted"):

> **The device asset has no bezel.** The comps draw the hero device inside a
> black frame — measured at 20 px on each side at 1280 … The extracted
> `report-device-desktop.webp` and `report-device-mobile.webp` are the screen
> only … closing it needs a fresh extraction of the framed device, which
> `prompts/11-…` puts out of scope. **Open.**

That is this prompt's scope, and only that: replace the two screen-only hero
device assets with framed ones extracted from the same reference material as
everything else in this repo, and fit them back into the hero geometry
`prompts/11-…` already built.

**It is next, and not something else, because of uncommitted state already on
disk.** The working tree carries a modified
`client/public/assets/ui/landing/report-device-mobile.webp` (896 KB → 1.2 MB,
816 × 1704 → 1116 × 2248) and an untracked
`client/public/assets/ui/ref/screensizes/{desktop,tablet,mobile}/*-flow.webm`
— none of it committed, none of it recorded in any prompt or `docs/` file. The
user confirmed (2026-08-22) that finishing this work, not the other candidates
on the table, is what should happen next.

**That uncommitted webp does not survive scrutiny and this prompt replaces it.**
Direct comparison shows the new file *does* render a real device bezel and
notch — matching `Mobile.png`'s hero device closely in composition — but at
1116 × 2248 it is roughly **3.5× wider than anything obtainable from the
375-wide `Mobile.png` comp** (a native crop of the device there tops out
around 320 px wide), and no artwork matching a portrait notched phone was
initially found in the design-system PDF at low resolution either (it *is*
there — see §"Reference material read" — but that was established fresh in
this session, not evidenced by anything already in the repo). Per **AGENTS.md
§0** — "these four files are the only source of design truth" — and **§10
rule 6** — "never invent a name a third party owns" / never fabricate — an
asset of unverified provenance is not something to build on. **The execution
of this prompt discards both the stray webp and the `screensizes/` captures**
(§"Non-goals") and re-extracts from the canonical PDF, verified against the
canonical comps, from scratch.

## Reference material read, by path

| path | what was read from it |
| --- | --- |
| `client/public/assets/ui/ref/acres-design-system.pdf` | the "Photo Links" section of the design-system board. It contains **three** device-treatment examples, each on its own sage band: a large landscape device (~902 × 640–750 pt, located at page region roughly x 0–1092, y 4150–4900), a smaller landscape device directly below it (not used by any breakpoint in the current build — see Non-goals), and a portrait phone with a notch (~located at page region roughly x 60–430, y 5400–5950). All three carry a real black rounded-corner frame, drawn full — top **and** bottom rounded corners, not pre-clipped — which is not what the previously-extracted screen-only JPEGs (PDF embedded images 6/7 and 16/17, per `docs/landing.md` lines 54–66) captured |
| `client/public/assets/ui/landing-pages/Desktop.png` | re-cropped the hero at `(100,340)-(1180,950)`: confirms the live comp's device bottom edge is **flush-cut at the band bottom, no rounded corner visible** — the board's floating treatment is not what ships; the hero clips it |
| `client/public/assets/ui/landing-pages/Mobile.png` | re-cropped the hero at `(0,300)-(375,760)`: the phone is **not clipped** — its full rounded silhouette, including the bottom, is visible above the band, distinct from the desktop treatment |
| `docs/landing.md` §"Responsive Comp Fidelity Pass" §1, §8 | the current hero band/wing/overhang/device contract and the open bezel item this prompt closes |
| `docs/design-system.md` | `--radius-media` = 24 px, named for "photographs, the sage band, device frames" |
| `docs/automation.md` | the CDP capture harness and its four traps (§3.3), the histogram/ink-box/band-profile recipes — this session found none of `magick`/`convert`/`identify` installed in this environment (§"A tooling gap"), so the recipes below are re-expressed with what **is** installed: `pdftoppm`, `pdftocairo`, `pdfimages`, `ffmpeg`, `python3` + Pillow (12.1.1) |
| `client/app/page.tsx:109–157`, `client/app/globals.css:135,168–195`, `client/lib/utils.ts:60–75` | the current hero markup, its tokens, and the `cn()` safelist those tokens must stay registered in |

## What was measured this session, and what execution must still pin down

**Confirmed by direct pixel scan (Pillow, near-black threshold), this session,
on the two live comps:**

| | Desktop.png dark-pixel bbox | Mobile.png dark-pixel bbox |
| --- | --- | --- |
| region scanned | (100,340)–(1180,920) | (0,280)–(375,760) |
| bbox | x 189–1091, y 385–885 | x 54–321, y 322–731 |
| w × h | 903 × 501 | 268 × 410 |

These are close to — not identical to — `prompts/11-…`'s previously recorded
907 × 514 (desktop) and 269 × 417 (mobile) "device ink extent" figures, which
were measured by a different method (thresholded ink box on the full region,
not a strict-threshold dark-pixel scan restricted to near-black). **Read this
as confirmation that the frame's outer edge and the previously-measured
"device" box already coincide to within a few px** — the box itself likely
does not need to move much — not as a replacement measurement; execution must
re-run `docs/automation.md`'s own ink-box procedure for the final number, per
AGENTS.md §10 rule 4 (a judgement is not a measurement).

**Not yet measured, and required before implementation:**

1. **The exact PDF-page pt bounding box of both device groups**, refined from
   the approximate regions given above (§"Reference material read") the same
   way — render the region at a DPI that gives at least 1741 px of width for
   the desktop device (matching the previous embedded-image resolution, so no
   quality is lost against what shipped before), locate the frame's outer edge
   by the same dark-pixel scan, and convert back to pt for a reproducible crop
   command.
2. **The frame's corner radius**, to build the alpha mask (next point). Read it
   either from `pdftocairo -svg`'s vector path for the frame (an `rx`/`ry` on a
   `rect`, or a Bézier corner in a `path`) or by sampling the rendered corner
   curve directly. `docs/design-system.md`'s 24 px `--radius-media` is the
   *CSS* radius this repo uses elsewhere for photographs and the sage band —
   it is a plausible prior, not a substitute for reading the board's own
   geometry.
3. **How much of the frame the mobile phone needs above/below the screen**
   (status-bar bezel, notch, home-indicator bar) once cropped to the same
   aspect the hero box needs — this falls out of step 1's bbox once it exists.

## The extraction procedure

**Why a plain `pdftoppm` crop is not enough.** `pdftoppm` flattens the page —
whatever is behind the device in the PDF (the board's own sage band, then the
board's mint page background) fills the crop below, right of, and around the
frame's rounded corners; there is no alpha. The original screen-only assets got
their clean rounded-corner alpha from the embedded image's own **soft mask**
(`docs/landing.md` line 65: `-alpha off -compose CopyOpacity -composite`) — a
resource this device's *frame* does not have, because the frame is page
content, not an embedded raster with its own mask.

The reproducible replacement, per device (desktop, mobile):

1. Render the located page region at a DPI chosen per point 1 above:
   `pdftoppm -png -r <dpi> -x <x0px> -y <y0px> -W <w px> -H <h px> client/public/assets/ui/ref/acres-design-system.pdf out`
   (`-x/-y/-W/-H` are in **output pixels at the given DPI**, i.e.
   `px = pt * dpi / 72` — the recipe this session used for reconnaissance, at
   `r=150`, is the pattern to scale up from).
2. Determine the frame's rounded-rect geometry (point 2 above) and draw a
   matching mask at the same resolution with `PIL.ImageDraw.rounded_rectangle`
   — full frame, both top and bottom corners, not pre-clipped to the hero box.
3. Composite the mask as the alpha channel of the step-1 render
   (`Image.putalpha`), crop tight to the frame's own bounding box (plus 1–2 px
   antialiasing headroom, matching the ±1 rounding `prompts/11-…` already
   accepted for the band height), and export as WebP, lossless, matching the
   existing assets' encoding (`RIFF … Web/P image, lossless, with alpha`,
   confirmed by `file` on the current `report-device-mobile.webp`).
4. Verify each export against its comp: crop the same hero region out of
   `Desktop.png` / `Mobile.png` at 1:1, and confirm the frame's silhouette,
   corner radius and proportions match by eye and by the dark-pixel bbox
   recipe above. This is a shape/position check, not a pixel-diff — the
   comp's device is JPEG-compressed at 1280/375 width and the new asset is
   sourced at higher resolution, so they will not diff to zero.

**No dependency is added.** `pdftoppm`, `pdftocairo` and `pdfimages` (poppler
tools) and `python3` + Pillow are already present and already load-bearing —
`docs/automation.md` §2.1 already documents `pdftoppm`/`pdftocairo` for the
same PDF. Pillow is not currently a repository dependency (this session used
the system `python3` directly, no venv, no `requirements.txt`); if execution
needs it and it is not importable, install it as a one-off extraction tool the
same way, and say so in `docs/automation.md` rather than silently assuming it.

### A tooling gap, recorded rather than routed around (§10 rule 3, rule 8)

**`magick`/`convert`/`identify` are not installed in this environment.**
`apt-get install --dry-run imagemagick` resolves cleanly (Ubuntu 26.04, ESM
apps pocket), so it can be installed with the user's confirmation if a task
ever needs ImageMagick specifically — but this prompt does not; every recipe
above is re-expressed with poppler + Pillow, verified working in this session
(the desktop/mobile region renders and the dark-pixel bbox scan above both ran
successfully against the real files). **Record this gap in
`docs/automation.md`** in the same change: the documented `magick` recipes are
correct against the tool, but the tool itself is not guaranteed present, and
this is the first prompt to hit that.

## Fitting the new assets back into the hero

The current structure (`client/app/page.tsx:125–154`) does not change shape —
outer `relative` wrapper sized to `h-hero-device-*` (= overhang + band), the
sage band an absolute layer behind, the device inset by `px-hero-wing-*`,
`overflow-hidden` clipping the bottom. What changes:

- **`report-device-desktop.webp`** and **`report-device-mobile.webp`** are
  replaced in place (same paths, same two-asset structure — the `<picture>`
  still serves the mobile asset under `(max-width: 767px)` and the desktop
  asset above it, covering both the tablet and desktop breakpoints via
  `object-cover`, exactly as `docs/landing.md`'s own note records: "Below 768
  the `<source>` serves `report-device-mobile.webp` directly … there is no
  separate tablet asset"). **Do not introduce a third asset** — nothing in the
  current markup or the comps calls for one.
- The `<Image>`/`<source>` `width`/`height` (currently `1741` × `1216` for the
  desktop asset) update to the new export's true pixel dimensions.
- `object-top` stays: the frame's top corner is the anchor, the bottom is what
  `overflow-hidden` truncates, matching the flush-cut bottom this session
  confirmed on `Desktop.png`.
- The `--spacing-hero-band` / `-wing-*` / `-overhang-*` / `-device-*` tokens in
  `client/app/globals.css:168–195` are **not expected to change** — §"What was
  measured" above shows the frame's outer edge already sits close to the
  previously-measured box — but re-verify each against the live render before
  assuming zero drift, the same way `prompts/11-…` §9 re-verified its own
  numbers rather than trusting the prediction.
- If the new asset's aspect ratio no longer matches what `object-cover` was
  compensating for (`docs/landing.md`'s note that the 1741×1216 asset covers
  906×513 at `max()` scale 0.521, dropping 120 px off the bottom), recompute
  that arithmetic for the new dimensions and record the new numbers — do not
  carry the old ones forward uninspected.
- `client/lib/utils.ts:60–75`'s `cn()` safelist already carries the
  `hero-overhang-*` class names; confirm no new token name is introduced that
  needs adding there (AGENTS.md §1.3's own warning: "a name tailwind-merge has
  not been told about fails silently").

## Non-goals

- **The smaller landscape device on the PDF board is not extracted.** The
  current markup uses exactly two device assets (mobile-framed,
  desktop-framed, the desktop one reused for tablet); nothing in the comps or
  the code calls for a third. If a future prompt finds tablet needs its own
  asset, that is a new, separately-scoped decision.
- **The residual whole-page height drift** (`docs/landing.md` §7, −73/−310/−206
  at 375/800/1280) stays open. It is unrelated to the device asset and
  `prompts/11-…` already declined to chase it with a one-off spacer.
- **No copy change, no new route, no token renames** outside what
  §"Fitting the new assets back into the hero" requires.
- **`client/public/assets/ui/ref/screensizes/` is deleted, not repurposed.**
  Its three `.webm` captures are of unknown/unverified origin relative to this
  prompt's scope (they predate this session and are undocumented in any
  `prompts/` or `docs/` file) and are not one of the four reference files
  AGENTS.md §0 recognises as design truth. If they turn out to be useful for
  something else, that is a conversation with the user, not a silent keep.
- **The uncommitted `report-device-mobile.webp` is overwritten**, not
  inspected further for salvage — §"Scope" already establishes why it cannot
  be trusted as-is, and re-extracting from the canonical PDF is no more
  expensive than reverse-engineering an asset of unknown provenance.

## Breakpoint behaviour

- **375 (mobile)**: the `<source>` continues to serve the mobile asset at its
  native resolution (no `sizes`-driven up/downscale, per the existing
  `<picture>` art direction) — only the asset itself changes, from screen-only
  to framed. The device stays unclipped top-to-bottom per the Mobile.png
  finding above; only the hero box height (`h-hero-device-sm`) governs how
  much of it shows, and that box is not expected to change.
- **800 (tablet)** and **1280 (desktop)**: both continue to read the desktop
  asset through `object-cover object-top`, cropped by `overflow-hidden` to
  `h-hero-device-md` / `-lg`. The flush-cut bottom this session confirmed on
  `Desktop.png` is what that clipping already produces and must keep
  producing with the new, taller (frame-inclusive) source.
- No breakpoint changes which asset serves it; `docs/landing.md`'s existing
  "no separate tablet asset" note stays true.

## Reference deltas — knowingly not matching the comp

- **No retina headroom is guaranteed.** The previous screen-only desktop asset
  (1741 × 1216) was sourced from the PDF's embedded JPEG at native resolution,
  well above the ~906 px CSS box — real headroom for `srcset`. The new
  extraction's ceiling is whatever DPI the *page* (not just the embedded
  image) can usefully be rendered at before the vector frame's crispness stops
  mattering and the embedded photo's own native resolution becomes the limit.
  Execution should render at least at the photo's native scale (matching the
  previous 1741 px width) and record the actual ceiling reached in
  `docs/landing.md` rather than assuming parity with the old asset.
- **The device's framing-degrades-across-breakpoints finding from
  `docs/landing.md` §8 is unaffected and stays open.** Adding a bezel does not
  change that the mobile asset shows 30–81% of itself depending on viewport
  width between 375 and 1280; that finding was about the band/device box
  contract, not the asset's presence of a frame.

## Checks (§6), and where the result is recorded

Run from the repository root, quote the real output (§10 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- The `docs/automation.md` §3.3 CDP harness, at 375/800/1280, with
  `prefers-reduced-motion: reduce` emulated, to re-capture the hero and
  confirm the frame renders, sits on the band correctly, and the bottom clips
  flush at desktop/tablet and shows whole at mobile.

Recorded in:

- **`docs/landing.md`** — closes the "device asset has no bezel" bullet in §8
  (rewritten, not left standing, per §10 rule 8), with the final extraction
  recipe (exact `pdftoppm` region and DPI used), the final asset dimensions,
  and the re-verified hero token table if anything moved.
- **`docs/automation.md`** — the tooling gap (`magick` absent, poppler +
  Pillow substituted) and the new page-region-plus-alpha-mask extraction
  recipe, since it's a new technique this repo hasn't needed before (every
  prior asset extraction used an embedded image's own soft mask).
- **`AGENTS.md`** — no new index row expected; both files already exist.

## Expected impact

- `/` hero only, at all three widths. No route added or removed.
- `client/public/assets/ui/landing/report-device-desktop.webp` and
  `report-device-mobile.webp` replaced.
- `client/app/page.tsx` — the hero `<picture>`/`<Image>` `width`/`height` and,
  only if re-measurement finds drift, the hero tokens' consumers.
- `client/app/globals.css` — token values touched only if re-measurement finds
  drift; no new token names expected.
- `client/public/assets/ui/ref/screensizes/` deleted.
- `docs/landing.md`, `docs/automation.md` updated per above.
- No dependency change, no `next.config.ts` change, no other route touched.

## SKILLS USED

- `web-design-guidelines` — the device image's `alt` text must still describe
  the report UI, not the phone hardware; touch/focus floor unaffected but
  re-check after the markup edit (§9.4).
- `vercel-react-best-practices` — the hero stays a Server Component; only
  `width`/`height`/`sizes` on an existing `<Image>` change.
- `frontend-design` — a device bezel is a visible, first-impression change;
  treat the fit (corner radius, crop line) as a design decision to verify by
  eye against the comp, not only by number.
- `gsap-react`, `gsap-scrolltrigger` — `data-motion-hero-media` still wraps
  this element; if its box dimensions move even slightly, re-verify the
  reveal/settled states the way `prompts/11-…` §9 did (§9.3).
- `tailwind-4-docs` — if any token or utility changes, verify against v4, not
  v3 memory.
- `requesting-code-review` — dispatch the reviewer subagent after
  self-verification (§2.1).
- `receiving-code-review` — evaluate the review with verification before
  acting (§2.1).
- `caveman-commit` — the commit message (§3, §7).
