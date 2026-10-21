# Acres — Landing Page

**Current public landing:** the survey-plate composition in the Prompt 423
record at the end of this file supersedes Prompt 402’s split hero. Prompt 402’s
copy reduction and Prompt 400’s removal of visible photo credits remain in effect.

Built to `prompts/05-landing-page.md`. This file records the `/` implementation
against `client/public/assets/ui/landing-pages/Desktop.png`,
`client/public/assets/ui/landing-pages/Tablet.png`, `client/public/assets/ui/landing-pages/Mobile.png`,
and `client/public/assets/ui/ref/acres-design-system.pdf`.

## What Was Built

`client/app/page.tsx` now renders the full static Acres landing page as a Server
Component. It uses the existing chrome from `client/app/layout.tsx`, the Acres
primitives from `client/components/acres/`, and typed module-level content arrays for
benefits, Big Picture rows, comparison rows, and numbered steps.

No new client boundary was added by the page. The installed `client/components/ui/table.tsx`
was inspected and not used: it is a `"use client"` wrapper with default `text-sm`,
padding, row hover, and muted-state rules that would have to be overridden for
nearly every measured table property. The shipped comparison matrix is still a
real semantic `<table>` with column headers, a caption, and row cells.

## Skills and Docs Loaded

- `frontend-design`
- `tailwind-design-system`
- `tailwind-4-docs`
- `shadcn`
- `vercel-react-best-practices`
- `web-design-guidelines`
- `caveman-commit`
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`

The Tailwind official snapshot was still unavailable. The approved sync command
failed once with `git clone ... returned non-zero exit status 128`, then the
escalated retry stalled during clone and was interrupted. Per the skill fallback,
implementation used `references/engineering-playbook.md` and `references/gotchas.md`;
no official Tailwind docs-snapshot verification is claimed for this step.

The shadcn CLI docs/context calls for `table` also stalled without output and
were interrupted. The local installed table source was used as the verified API.

## Asset Extraction

The PDF image inventory was re-run:

```bash
pdfimages -list client/public/assets/ui/ref/acres-design-system.pdf
```

The relevant source objects matched the prompt:

| PDF image | output asset | intrinsic size |
| --- | --- | ---: |
| 6 + soft mask 7 | `client/public/assets/ui/landing/report-device-desktop.webp` | 1741 × 1216 (superseded — see below) |
| 16 + soft mask 17 | `client/public/assets/ui/landing/report-device-mobile.webp` | 816 × 1704 (superseded — see below) |
| 18 + soft mask 19 | `client/public/assets/ui/landing/mountain.webp` | 4096 × 2304 |
| 20 + soft mask 21 | `client/public/assets/ui/landing/aerial.webp` | 4096 × 2731 |
| 22 + soft mask 23 | `client/public/assets/ui/landing/stones.webp` | 4096 × 2048 |
| 24 + soft mask 25 | `client/public/assets/ui/landing/cylinders.webp` | 3750 × 3000 |

Repeatable extraction:

```bash
pdfimages -j client/public/assets/ui/ref/acres-design-system.pdf /tmp/acres-pdf-image
magick /tmp/acres-pdf-image-006.jpg /tmp/acres-pdf-image-007.ppm -alpha off -compose CopyOpacity -composite -strip client/public/assets/ui/landing/report-device-desktop.webp
magick /tmp/acres-pdf-image-016.jpg /tmp/acres-pdf-image-017.ppm -alpha off -compose CopyOpacity -composite -strip client/public/assets/ui/landing/report-device-mobile.webp
```

**Superseded by `prompts/12-hero-device-bezel.md`.** The two commands above
extracted the device *screen* only, from the embedded JPEG's own soft mask —
they produced 1741 × 1216 and 816 × 1704 assets with no frame. The comps draw
the hero device inside a real black bezel, which is page content in the PDF
(a vector rounded rect), not an embedded raster with its own mask, so it needed
a different technique — a page-region render plus a hand-built alpha mask.
`docs/automation.md` §5 records that recipe and the exact regions used; the
current `report-device-desktop.webp` (1810 × 1288) and
`report-device-mobile.webp` (878 × 1765) come from it, not from the commands
above.

```bash
magick /tmp/acres-pdf-image-018.jpg /tmp/acres-pdf-image-019.ppm -alpha off -compose CopyOpacity -composite -strip -quality 88 client/public/assets/ui/landing/mountain.webp
magick /tmp/acres-pdf-image-020.jpg /tmp/acres-pdf-image-021.ppm -alpha off -compose CopyOpacity -composite -strip -quality 88 client/public/assets/ui/landing/aerial.webp
magick /tmp/acres-pdf-image-022.jpg /tmp/acres-pdf-image-023.ppm -alpha off -compose CopyOpacity -composite -strip -quality 88 client/public/assets/ui/landing/stones.webp
magick /tmp/acres-pdf-image-024.jpg /tmp/acres-pdf-image-025.ppm -alpha off -compose CopyOpacity -composite -strip -quality 88 client/public/assets/ui/landing/cylinders.webp
```

The six trusted marks were isolated from `Desktop.png`, converted to transparent
PNG, and trimmed:

| asset | crop command | final size |
| --- | --- | ---: |
| `trusted-mark-01.png` | `-crop 210x100+90+965 -fuzz 7% -transparent white -trim` | 181 × 44 |
| `trusted-mark-02.png` | `-crop 210x100+275+965 -fuzz 7% -transparent white -trim` | 114 × 22 |
| `trusted-mark-03.png` | `-crop 170x110+485+960 -fuzz 7% -transparent white -trim` | 50 × 44 |
| `trusted-mark-04.png` | `-crop 240x100+660+970 -fuzz 7% -transparent white -trim` | 218 × 24 |
| `trusted-mark-05.png` | `-crop 230x100+840+965 -fuzz 7% -transparent white -trim` | 114 × 20 |
| `trusted-mark-06.png` | `-crop 200x100+1030+965 -fuzz 7% -transparent white -trim` | 106 × 38 |

## Responsive High-Fidelity Image Assets

Per `prompts/08-image-quality-fidelity.md`, all raster images are served at 100% quality with responsive breakpoint assets extracted for 3x Retina display density:

| section | breakpoint | asset | source dimensions | CSS @3x target |
| --- | --- | --- | --- | --- |
| MediaBand (Mountain) | Desktop (≥1024px) | `mountain-desktop.webp` | 3600 × 1860 | 1200 × 620 |
| MediaBand (Mountain) | Tablet (768–1023px) | `mountain-tablet.webp` | 2160 × 1800 | 720 × 600 |
| MediaBand (Mountain) | Mobile (<768px) | `mountain-mobile.webp` | 1029 × 1800 | 343 × 600 |
| Big Picture (Cylinders) | Desktop (≥1024px) | `cylinders-desktop.webp` | 1770 × 2133 | 590 × 711 |
| Big Picture (Cylinders) | Tablet (768–1023px) | `cylinders-tablet.webp` | 2160 × 2232 | 720 × 744 |
| Big Picture (Cylinders) | Mobile (<768px) | `cylinders-mobile.webp` | 933 × 1156 | 311 × 385 |
| Testimonial (Stones) | Desktop (≥1024px) | `stones-desktop.webp` | 1770 × 2009 | 590 × 670 |
| Testimonial (Stones) | Tablet (768–1023px) | `stones-tablet.webp` | 2160 × 2160 | 720 × 720 |
| Testimonial (Stones) | Mobile (<768px) | `stones-mobile.webp` | 1029 × 1029 | 343 × 343 |
| Map Your Success (Aerial) | Desktop (≥1024px) | `aerial-desktop.webp` | 3600 × 1993 | 1200 × 664 |
| Map Your Success (Aerial) | Tablet (768–1023px) | `aerial-tablet.webp` | 2160 × 1993 | 720 × 664 |
| Map Your Success (Aerial) | Mobile (<768px) | `aerial-mobile.webp` | 1029 × 1800 | 343 × 600 |
| Hero Device | Desktop / Mobile | `report-device-*.webp` | 1810 × 1288 / 878 × 1765 (framed — `prompts/12-…`) | 100% quality raw extraction |

Configuration:
- `client/next.config.ts`: Added `images.qualities: [75, 100]` to allow Next.js 16 to output `q=100` images.
- `client/app/page.tsx`: Art-directed `<picture>` tags with `<source media="...">` for Desktop, Tablet, and Mobile, rendering native aspect ratios without upscaling distortion or blur. Trusted marks set to `unoptimized`.

## Copy and Icon Mapping

Every standalone product-name `Area` from the comps ships as `Acres`. The shipped
spelling is `Visualise Growth`.

Feature icons:

- `Amplify Insights`: `cable`, mirrored and rotated `-45deg`; this preserves
  the provisional identification recorded in `docs/components.md`.
- `Control Your Global Presence`: `public`
- `Remove Language Barriers`: `record_voice_over`
- `Visualise Growth`: `show_chart`
- Comparison table: `check` and `close`

The comparison rows transcribed from the native comp are:

| Acres | WebSurge | HyperView |
| --- | --- | --- |
| Ultra-fast browsing | Fast browsing | Moderate speeds |
| Advanced AI insights | Basic AI recommendations | No AI assistance |
| Seamless integration | Restricts customization | Steep learning curve |
| Advanced AI insights | Basic AI insights | No AI assistance |
| Ultra-fast browsing | Fast browsing | Moderate speeds |
| Full UTF-8 support | Potential display errors | Partial UTF-8 support |

OCR could not fully resolve the second numbered-step description. The shipped
line is a judgement that preserves the visible meaning: `Adapt Acres to your
specific requirements and business goals.`

## Breakpoint Measurements

Live production measurements were taken with a temporary CDP script at
`/tmp/acres-verify.mjs` against `http://localhost:3100`. Chrome could not launch
inside the sandbox due `crashpad ... Operation not permitted`; the same script
ran successfully with approved escalation. Screenshots and metrics were saved to
`/tmp/acres-landing-check/`.

| anchor | 375 | 800 | 1280 |
| --- | ---: | ---: | ---: |
| viewport content height | 7964 | 7722 | 6911 |
| container / gutters | 343 / 16 | 720 / 40 | 1200 / 40 |
| `h1` font / line-height | 76 / 64.6 | 140 / 112 | 160 / 128 |
| `h1` box | 343 × 129.19 | 720 × 224 | 1200 × 128 |
| hero band | 343 × 689.44 | 720 × 472.78 | 1200 × 670.36 |
| benefits card widths | 343 × 4 | 350 × 4 | 285 × 4 |
| table scroller width / overflow | 343 / auto | 720 / auto | 1200 / auto |
| steps scroller width / overflow | 343 / auto | 720 / auto | 1200 / auto |
| primary pill | 126.03 × 48 | 126.03 × 48 | 126.03 × 48 |
| secondary pill | 137.16 × 48 | 137.16 × 48 | 137.16 × 48 |

The global ImageMagick overlay comparisons are intentionally recorded as coarse
signals only, not pass/fail criteria:

```bash
magick compare -metric AE -fuzz 4% client/public/assets/ui/landing-pages/Desktop.png /tmp/acres-landing-check/landing-1280.png null:
1.42928e+06 (0.15112)

magick compare -metric AE -fuzz 4% client/public/assets/ui/landing-pages/Tablet.png /tmp/acres-landing-check/landing-800.png null:
1.46396e+06 (0.20736)

magick compare -metric AE -fuzz 4% client/public/assets/ui/landing-pages/Mobile.png /tmp/acres-landing-check/landing-375.png null:
620546 (0.187342)
```

The main recorded visual deltas are:

- ~~The overall page is shorter than the comp at all widths~~ — **superseded.**
  The hero, the testimonial split, the mobile "See the Big Picture" inset and the
  whole "Map Your Success" block were measured against the comps and closed in
  `prompts/11-responsive-comp-fidelity.md`. See §"Responsive Comp Fidelity Pass"
  below for what now matches, what still drifts, and by how much.
- The trusted marks preserve exact extracted mark art but are laid out through
  responsive grid tracks, not absolute comp x positions.
- The tablet and desktop lower images require a scroll pass before full-page
  Chrome capture because Next's below-fold images are lazy-loaded.

## Responsive Comp Fidelity Pass

`prompts/11-responsive-comp-fidelity.md`. A fidelity pass over the shipped `/`
route against `Desktop.png` / `Tablet.png` / `Mobile.png` at their native 1280 /
800 / 375. No copy changed, no asset was re-extracted, no route was added.

Every number below is a measurement. Live geometry came from headless Chrome
over CDP against `next start` on port 3112 with `prefers-reduced-motion: reduce`
emulated; ink boxes came from thresholded bounding boxes on the stitched
full-page captures. The harness and its three traps are in `docs/automation.md`
§3.3.

### 1. The hero — the band, the wing and the overhang

**This was the largest defect.** The comps draw the hero as a sage band of
constant height with the device *overhanging* the band's top edge and *clipped*
at its bottom. The build drew a padded band with the device wholly inside it, so
the band grew with the image: 690 / 473 / 670 tall against a comp that measures
348 at every width.

Measured on the comps — band as the `#8E9C78` extent, device as the ink extent:

| | container | band `y` | band **h** | wing | device **w** | device **h** | overhang |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Mobile 375 | 343 | 385–731 | 347 | 37 | 269 | 417 | 70 |
| Tablet 800 | 720 | 526–874 | 349 | 22 | 676 | 429 | 81 |
| Desktop 1280 | 1200 | 538–886 | 349 | 147 | 907 | 514 | 165 |

Two cross-checks make the table self-consistent: `container − 2·wing` reproduces
the device width at all three widths, and `band + overhang` reproduces the device
height. **348 is used as the band height at every width**; the ±1 across the
three readings is rounding.

The structure that produces it, at `client/app/page.tsx:120`:

- an outer `relative` wrapper whose **height is the device box** — overhang +
  band — and which carries `data-motion-hero-media`;
- the band as an absolutely positioned `inset-x-0 bottom-0 h-hero-band` layer
  **behind** the device;
- the device as a `relative` block inset by `px-hero-wing-*`, with an explicit
  `h-hero-device-*` and `overflow-hidden`, the `<Image>` at
  `object-cover object-top`.

**The wrapper is not padded.** `prompts/11-…` §A described it as
`padding-top: <overhang>` with the device in flow; that double-counts the
overhang and makes the wrapper `overhang + (overhang + band)` tall. The wrapper's
height *is* the device's, and the band hangs off its bottom edge — that is the
one place the implementation departs from the prompt's own wording, and the
measured result is what settled it.

**`sizes` describes the box, not the breakpoint anchor.** The device is
`container − 2·wing`, so its width tracks the viewport continuously; a literal
`269px / 676px / 907px` would be right only at 375 / 800 / 1280 and badly wrong
between them — at a 767 px window the box is **661** wide, and the browser would
have picked the 384w candidate and upscaled it 1.7×. The shipped expression is
`(max-width: 767px) calc(100vw - 106px), (max-width: 1023px) calc(100vw - 124px), min(calc(100vw - 374px), 906px)`
— 106 = the 2×16 gutter plus the 2×37 wing, 124 = 2×40 plus 2×22, 374 = 2×40
plus 2×147 against the 1200 cap. Verified in the browser; the selected candidate
is at or above the box width at every width sampled:

| viewport | 375 | 600 | 767 | 900 | 1024 | 1109 | 1280 | 1600 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| device box | 269 | 494 | 661 | 776 | 650 | 735 | 906 | 906 |
| candidate | *asset* | *asset* | *asset* | 828 | 750 | 750 | 1080 | 1080 |
| candidate ÷ box | — | — | — | 1.07 | 1.15 | 1.02 | 1.19 | 1.19 |

Below 768 the `<source>` serves `report-device-mobile.webp` directly at its
native 816, so `sizes` does not apply and the box never exceeds it.

`object-cover` at an explicit height reproduces the comp's crop without
re-cutting an asset: at 1280 the framed 1810 × 1288 asset (`prompts/12-…`,
superseding the screen-only 1741 × 1216 figure this paragraph originally
recorded) covers 906 × 513 at scale 0.5006, rendering 906 × 645 and dropping
132 px off the bottom, which is what the comp shows (a flush cut below the
frame's rounded bottom corner, not — as with the old screen-only asset — a
crop with no frame to begin with). `sizes` was retuned to the real widths
(`(max-width: 767px) 269px, (max-width: 1023px) 676px, 907px`). The art
direction, `quality={100}` and `fetchPriority="high"` are unchanged — see
`docs/polish.md` §4 for why it is not `priority`.

Result, live against comp:

| | device `y` | band `y` | device `w` | device `h` |
| --- | --- | --- | --- | --- |
| 375 | 315 / **315** | 385 / **385** | 269 / **269** | 418 / **417** |
| 800 | 445 / **445** | 526 / **526** | 676 / **676** | 429 / **429** |
| 1280 | 373 / **373** | 538 / **538** | 906 / **907** | 513 / **514** |

### 2. The hero's vertical position

The section carried `pt-16 md:pt-24 lg:pt-28`; the `h1` ink sat 23 / 36 / 48 px
below the comp. It is now `pt-10 md:pt-15 lg:pt-16`, landing the `h1` ink top at
124 / 155 / 156 against a comp of 125 / 155 / 156.

The heading-to-device gap is a token rather than a step on the spacing scale,
because the comp's 59 / 57 / 74 is measured from the `h1`'s **ink** bottom and
the three `--text-hero*` line heights (0.85 / 0.8 / 0.8) each overshoot the ink
by a different amount. `--spacing-hero-gap-*` holds the box-bottom values —
68 / 73 / 93 — that land the device on the comp exactly.

### 3. Desktop testimonial — the image column was 89 px too narrow

`Desktop.png` splits the 1200 container **592 / 70 / 538**: the stones image
spans x 39–630, the quote starts at x 700 and runs to the container edge. The
build had `lg:grid-cols-[0.88fr_1.12fr]` with `gap-14`, computing to
`503px 640px` with a 56 px gap.

It is now `lg:grid-cols-[592fr_538fr]` with `lg:gap-x-quote-gap` (70 px), which
resolves to exactly `592px 538px` at 1280. The quote's ink box went from
580 × 215 to **510 × 286** against a comp of 507 × 289, and the quote now breaks
on the same words as the comp. `lg:aspect-[590/670]` was already right and did
not change; the image renders 592 × 672 against a comp of 592 × 671.

Tablet and mobile were verified and left alone: both are full-container and
already matched.

### 4. Mobile "See the Big Picture" — full-bleed, but the comp insets it

`Mobile.png` draws the cylinders photograph at x 31–343 — **313 wide inside the
343 container**, 15 px in on each side — not bled to the gutters. The build had
`w-full`, rendering 343 × 424.

The `<picture>` is now wrapped in `<div className="px-media-inset-sm md:px-0">`,
carrying `data-motion-media`. Live renders **313 × 387** against a comp of
313 × 388. The tablet and desktop ratios (`md:aspect-[720/744]`,
`lg:aspect-[590/711]`) are untouched — both measured correct.

### 5. The numbered-step marker was set in the wrong family, and does scale

`docs/design-system.md` §2.3 identifies the **stat** role as **DM Sans 400**
(overlay diff 0.026 against 0.046 for the runner-up). The page rendered it
`font-serif`. Dropping `font-serif` is the fix; the ink box then measures
66 × 58 against the comp's 64 × 57.

Re-measuring at all three widths — which `prompts/11-…` §E explicitly required
before touching the size — turned up a second, un-forecast finding. §2.3 records
the stat size as `n/m` at 800 and 375; those gaps are now filled, and **they are
not "same as desktop"**:

| comp | ink of `01` | live at | live ink |
| --- | --- | --- | --- |
| `Desktop.png` | 64 × 57 | 80 px | 66 × 58 |
| `Tablet.png` | 64 × 57 | 80 px | 66 × 58 |
| `Mobile.png` | **51 × 46** | **64 px** | 53 × 46 |

Live runs ~2 px wide of the comp at every size, consistently, so the mobile
reading resolves to 64 px and not to a smaller value that would fit the width
alone. `--text-stat` is therefore **64 px at 375** with `--text-stat-md` at
**80 px from 800 up**, following the `--text-hero` / `-md` / `-lg` convention
where the bare name is the mobile value. The marker reads
`text-stat md:text-stat-md`.

This makes the stat the one non-serif role that scales, against AGENTS.md §1.3's
"only the two serif display roles scale". The measurement is the fact; §1.3 is
stale on this point.

The step **headings** stay `font-serif text-h3` — AGENTS.md §1.2 is right there,
and the desktop `h2` ink measures 395 × 53 live against 393 × 53 in the comp, so
the serif scale itself did not move.

### 6. "Map Your Success" vertical rhythm

With the marker at its measured size, the four spacings in the steps block were
fitted against the comp's landmarks. All offsets below are from the section
heading's **ink** top, comp first:

| landmark | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| rule above the steps | 209 / **210** | 124 / **124** | 128 / **127** |
| step marker ink top | 278 / **279** | 194 / **195** | 198 / **198** |
| step title ink top | 395 / **399** | 325 / **328** | 330 / **331** |
| step body ink top | 437 / **440** | 367 / **370** | 372 / **374** |
| aerial image top | 614 / **619** | 564 / **565** | 548 / **548** |

The values that produce it: the scroller `mt-22 md:mt-20 lg:mt-19`, the step
`li` `pt-15`, the step `h3` `mt-15`, the body `mt-5` unchanged, and the aerial
`mt-26 md:mt-30`. Everything lands within 1–5 px at every width.

**One trap worth recording.** `border-t border-rule pt-7` appears **twice** in
`client/app/page.tsx` — on the benefits grid cells and on the step items. A
first pass changed the benefits cells by mistake, and the symptom was that the
marker did not move at all while the title moved exactly as predicted. Anchor on
the line, not on the class string.

### 7. Residual drift — measured, and still open

The whole-page band profile after the pass
(`magick <img> -colorspace gray -resize 1x!`, runs of rows whose mean is under
250, ≥ 40 px tall). `Δtop` is live minus comp, so a negative number means the
live band sits that far above the comp's:

| width | comp height | live height | Δ |
| --- | ---: | ---: | ---: |
| 375 | 8833 | 8760 | **−73** |
| 800 | 8825 | 8515 | **−310** |
| 1280 | 7389 | 7183 | **−206** |

Where the drift enters, band by band:

| | 375 | 800 | 1280 |
| --- | ---: | ---: | ---: |
| through the hero | −2 | −1 | **0 … −2** |
| first media band below the hero | −68 | −82 | −132 |
| "See the Big Picture" media | −184 | −158 | −132 |
| testimonial media | −73 | −124 | −96 |
| `01` marker / aerial | **−2 … +2** | −274 | −172 |
| closing CTA band | −41 | −318 | −214 |

Read it as accumulation, not as per-section error: the sections this pass names
match, and each remaining step in the Δ column is whitespace inside a section it
did **not** name. At 1280 the benefits section between the hero and the first
media band is ~132 short, the comparison-table section is ~36 **taller** than the
comp (the Δ shrinks across it), the block between the testimonial image and the
"Map Your Success" heading is ~76 short, and the closing CTA is ~42 short. At
375 the accumulated drift self-corrects to ±2 by the steps section, leaving only
the closing CTA at −41. **800 is the worst width** and is short in every one of
those places.

Per `prompts/11-…` §G the total is deliberately **not** chased with a one-off
spacer. Closing it means measuring the benefits section, the comparison-table
section, the testimonial's text column and the closing CTA against named comp
landmarks, the same way §§1–6 above were closed. That is not in this pass.

### 8. Deltas knowingly accepted

- **The band height is unified at 348** where the three comps measure
  347 / 349 / 349. A per-breakpoint override would be noise.
- **The device asset has no bezel. Closed by `prompts/12-hero-device-bezel.md`.**
  The comps draw the hero device inside a black frame; the previous
  `report-device-desktop.webp` / `report-device-mobile.webp` were screen-only
  crops (the embedded JPEG's own soft mask, per §"Extracted assets" below). Both
  are now re-extracted from the design-system board's "Photo Links" section —
  page content, not an embedded raster, so the frame's own vector rounded-rect
  supplies the alpha mask instead of a soft mask. Recipe and measurements in
  `docs/automation.md` §5. New dimensions: desktop **1810 × 1288** (was
  1741 × 1216, screen-only), mobile **878 × 1765** (was 816 × 1704,
  screen-only). Verified against `Desktop.png`/`Mobile.png` by 1:1 crop
  comparison and by a full CDP capture at 375/800/1280 — the frame renders,
  sits on the band correctly, clips flush at desktop/tablet and shows whole at
  mobile, with **no drift** in the hero tokens (`--spacing-hero-band` /
  `-wing-*` / `-overhang-*` / `-device-*` are unchanged).
- **The device's framing degrades between the three comp widths.** The band is
  348 tall at 375, 800 *and* 1280 — three readings, constant — so the band height
  is the strong invariant and the device's height is pinned per breakpoint to
  match it. The device's *width* still tracks the viewport, so how much of the
  mockup shows changes across each range. **Recomputed for the framed assets**
  (was measured against the screen-only 1741 × 1216 / 816 × 1704 assets; the
  framed assets' aspect ratio differs, so the crossover and crop figures below
  are new numbers, not the old ones carried forward):

  | viewport | 375 | 600 | 767 | 1024 | ~1095 | 1280 |
  | --- | --- | --- | --- | --- | --- | --- |
  | device box | 269 × 418 | 494 × 418 | 661 × 418 | 650 × 513 | 721 × 513 | 906 × 513 |
  | of the asset shown | 77 % of its height | 42 % | **31 %** | 90 %, **cropped 35.5 px each side** | 100 %, edges just reached | 80 %, **cropped 132 px off the bottom** |

  At 767 the portrait phone mockup is reduced to its status bar and header. In
  the lg range (1024–1280) the desktop asset is width-cropped below the
  crossover and height-cropped above it — the crossover, where the box width
  equals the asset scaled to cover the 513 px band height
  (`1810 × (513 / 1288) = 720.9`), is a container of 1014.9 and a **viewport of
  ~1095** (device box width + 294 px of wing + 80 px of gutter). **This is
  accepted, not solved** — same as before the bezel closed. The alternative —
  an `aspect-ratio` device with the band sized to `deviceHeight − overhang` —
  interpolates smoothly but gives up the constant 348 the comps measure three
  times, and that is a design decision, not a measurement. **Open.**
- **The desktop "See the Big Picture" media** renders 719 tall against a comp of
  711, and the mobile hero device 418 against 417. Both are within the rounding
  the aspect-ratio tokens carry, and neither was changed.
- **Trusted-mark x positions** stay grid-derived, unchanged from this file's
  earlier record.
- **"Acres", not "Area"**, in the testimonial and everywhere else (AGENTS.md
  §1.7), against the comp's own text.

### 9. Checks

All three run from the repository root over the three workspaces. Exit codes and
output, verbatim — everything filtered out below is `npm notice run …` lines and
Prisma's own generate banner:

```
$ npm run lint       → exit 0, no output
$ npm run typecheck  → exit 0, no output beyond
                       ✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 85ms
$ npm run build      → exit 0
                       ✓ Compiled successfully in 1325ms
                       Route (app): / , /_not-found, /apple-icon.png, /icon.svg,
                       /opengraph-image.png, /robots.txt, /sitemap.xml,
                       /twitter-image.png — all ○ (Static)
```

There is no test runner for the client.

**One verification target from the prompt could not be reproduced, and is
reported rather than quietly dropped.** `prompts/11-…` §Verification step 6 names
"the desktop `h2` (211 × 54, must not move)". **No heading on the desktop page
measures 211 × 54, in the comp or in the build.** Scanning `Desktop.png` for
every ink run 40–60 px tall returns four section headings, and the live page
matches all four within 1 px:

| heading | comp ink | live ink |
| --- | --- | --- |
| "We've cracked the code." | 516 × 43 | 517 × 44 |
| "Why Choose Acres?" | 441 × 50 | 442 × 54, centred at the same x |
| "Map Your Success" | 393 × 53 | 394 × 53 |
| "Connect with us" | 357 × 41 | 358 × 41, centred at the same x |

The invariant that check exists to protect — that the serif `h2` scale did not
move — holds. The 211 × 54 figure itself is unresolved and is left as a stale
number in the prompt (AGENTS.md §10 rule 8).

Motion was re-verified after `data-motion-hero-media` moved to the new wrapper,
at 1280, in both branches:

```
reduce=false | @600ms {"op":"0.8813","tr":"matrix(1.0024, 0, 0, 1.0024, 0, 2.8488)"}
             | settled {"op":"1","tr":"matrix(1, 0, 0, 1, 0, 0)","band":[1200,348],"dev":[906,513]}
reduce=true  | @600ms {"op":"1","tr":"none"}
             | settled {"op":"1","tr":"none","band":[1200,348],"dev":[906,513]}
```

The wrapper carries no resting transform in a class, so AGENTS.md §9.3 rule 6
holds; the reduced-motion branch leaves the content visible and untransformed,
which is §9.3 rule 4.

## Auth Entry CTA

Built to `prompts/25-landing-auth-entry-cta.md`.

The final "Connect with us" primary CTA is intentionally no longer the comp's
`Learn More` link to `#how-to`. It now renders the existing primary Acres pill
as `Create Account` with `render={<Link href="/register" />}` and
`nativeButton={false}`. This creates the smallest visible bridge from the
marketing page into the authenticated app without changing the button primitive,
motion hooks, section rhythm, image geometry, or secondary in-page exploration
links.

The missing `returnTo` query is deliberate: `client/lib/auth/return-to.ts`
defaults missing return paths to `/app`, keeping return-path sanitization inside
the auth route.

## Accessibility and Guideline Audit

Source fetched: `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.

Findings checked against `client/app/page.tsx`:

- One `h1`; heading hierarchy is coherent.
- All navigation controls are `<a>`/`Link`; no clickable `<div>`/`span`.
- All target anchors exist: `#benefits`, `#specifications`, `#how-to`, `#contact`.
- Every image has `alt`, with decorative trusted marks using `alt=""`.
- Decorative SVG icons inherit `aria-hidden` from `Icon`.
- Focus-visible replacement exists on links, buttons, and both horizontal
  scrollers.
- Horizontal table and numbered-step regions are keyboard focusable and use
  native `overflow-x-auto`.
- Visible brand/product names introduced in `client/app/page.tsx` use `translate="no"`.
- No console, hydration, Base UI, or image-alt warnings were observed in the
  CDP output — **except** an image-preload warning at 800 and 375, raised by the
  hero's `<picture>`/`<source>` wrapping a `priority` `next/image`
  (`The resource http://localhost:3100/_next/image?url=%2Fassets%2Fui%2Flanding%2Freport-device-desktop.webp&w=750&q=75 was preloaded using link preload but not used within a few seconds…`;
  the 375 instance reads `w=640`). It is fixed at `client/app/page.tsx:134` by replacing
  `priority` with `fetchPriority="high"`, which is what Next 16.3.1 prescribes
  for an art-directed image; the console is clean afterwards at 1280, 800 and
  375, in both normal and reduced motion. Measured in `docs/polish.md` §4.

## Check Results

### `npx tsc --noEmit`

```bash
npm notice run acres@0.1.0 npx
npm notice run 'tsc' --noEmit
```

Clean exit 0.

### `npm run lint`

```bash
npm notice run acres@0.1.0 lint
npm notice run eslint
```

Clean exit 0.

### `npm run build`

```bash
npm notice run acres@0.1.0 build
npm notice run next build
▲ Next.js 16.3.1 (Turbopack)
✓ Running next.config.ts took 18ms

  Creating an optimized production build ...
✓ Compiled successfully in 573ms
  Running TypeScript ...
  Finished TypeScript in 8.3s ...
  Collecting page data using 5 workers ...
  Generating static pages using 5 workers (0/4) ...
  Generating static pages using 5 workers (1/4)
  Generating static pages using 5 workers (2/4)
  Generating static pages using 5 workers (3/4)
✓ Generating static pages using 5 workers (4/4) in 451ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
└ ○ /_not-found


○  (Static)  prerendered as static content
```

Clean exit 0.

### Product Rename Search

```bash
rg -n "(^|[^A-Za-z])Area([^A-Za-z]|$)" app components
```

No matches. Exit 1 from `rg`, as expected when no matches are found.

## Preview image delivery — Prompt 398 (2026-10-19)

The Vercel Services preview previously returned HTML 404 for Next optimizer
URLs while direct images loaded. Root deployment image metadata and a rewrite
to Vercel's native optimizer repair delivery; marketing components, crops,
sizes, responsive sources and styling are unchanged. Hosted checks cover all
20 source assets and fully decode direct/optimized variants, including WebP
with preserved hero alpha. Browser visual acceptance remains blocked by
unavailable supported browsers. See [the hosted record](vercel-deployment.md#hosted-acceptance--prompt-398).

## Photographic redesign — Prompt 399 (2026-10-19)

The current `/` page is `client/app/(marketing)/page.tsx`. This approved redesign
supersedes the original composition and its historical fidelity findings above;
those sections remain a record of the original build. The original references
continue to define the retained brand primitives, as the bounded exception in
AGENTS.md §0 records. Baseline: `3c4f99a`.

### What changed and why

“See the bigger picture.” and paired real aerial photographs replace the device
over sage. The dominant residential street grid and smaller agricultural view
connect regional analysis to places; a third photograph shows a highway within
its wider waterfront landscape. Typography, natural photography and space carry
the design. No additional palette, font, runtime dependency or client boundary
was introduced. The scoped token decisions are in `docs/design-system.md` §12.

A capability strip replaces the unverified trusted marks. Product-specific
benefits replace office-management/localization promises. The decorative
mountain, cylinders and stones, competitor rankings, AI claims and attributed
customer testimonial are removed from this page. Their old reference assets are
retained. Three evidence-focused detail rows explain validation, comparison and
published report evidence. The actual ordered workflow is import → explore →
publish, with all steps visible vertically on mobile. The closing CTA describes
creating an account, with no unimplemented scheduling action.

Copy was checked against `docs/ingestion.md`, `docs/analytics.md`,
`docs/dashboards.md`, `docs/reports.md` and their current product journey record.
All account CTAs lead to `/register`; the secondary hero action reaches `#how-to`.
The established `#benefits`, `#specifications`, `#how-to`, `#contact` anchors and
header/footer are preserved. The page contains no live dataset or customer
claims. All three photos have meaningful alt text and visible credits.

### Photo provenance and rendering

[The asset manifest](../client/public/assets/ui/landing/editorial/SOURCES.md)
records the individual publisher pages, photographers, direct download URLs,
current licence, access date, measured source/local dimensions, conversions and
actual bytes. The three original photo pages and Unsplash’s licence were fetched
and inspected this session; each selected photo explicitly uses the free
Unsplash License, permitting this commercial locally hosted use. Selected files
were inspected before layout work; no generated imagery or search thumbnail
was used. Local assets total 1,027,144 bytes (458390 / 301724 / 267030).

All photo boxes use reserved ratios/heights, `object-cover` and centered focal
positions. The street junction, agricultural road intersection and central
highway remain meaningful at each crop. Captions stay on white and outside
visibility-hiding media wrappers. Only the likely hero LCP photo is eager with
high fetch priority. Supporting photos are lazy. The existing permitted quality
100 is retained; deployment/optimizer settings are untouched.

Browser inspection caught underresolution in tall cropped hero boxes when
`sizes` only described the CSS width. Final hints account for `object-cover`’s
source aspect: city needs at least 640px source width at md and 787px at lg;
fields need 531px / 648px. On mobile the city requests box width × 10/9, while
the field’s landscape box is width-limited. This avoids magnifying undersized
candidates. Final DPR 1 browser selections at 800: city 640 / field 640; at 1280:
city 828 / field 750. These are source-pixel requests, not altered layout widths.

Direct assets and `/_next/image?...&w=828&q=100` returned HTTP 200 and decoded
for all three images. Direct dimensions matched the manifest; optimized responses
were 828×466, 828×562 and 828×1105. The explicit request had no WebP Accept
header and returned JPEG, so this is a decoding check, not a WebP-format claim.
Browser-selected images all completed and decoded without errors.

### Browser measurements and acceptance

Production `next start` final preview: `http://localhost:3200/`. Chrome via the
Playwright CLI, after font load and image decoding, with fresh contexts per
width. Hero and full-page captures are local ignored artifacts in
`output/playwright/399/`; final `metrics.json` is beside them. All three full
pages and their hero crops were visually inspected.

| Width | Container / gutter | Hero type       | Hero photo boxes       | Detail photo | Benefit columns | Workflow columns | Page height |
| ----: | ------------------ | --------------- | ---------------------- | ------------ | --------------- | ---------------- | ----------: |
|   375 | 343 / 16           | 64px / 60.8px   | 343×214.38, 343×192.94 | 343×214.38   | 1               | 1                |        5285 |
|   800 | 720 / 40           | 96px / 91.2px   | 466.66×360, 233.33×360 | 720×450      | 2               | 3                |        4301 |
|  1280 | 1200 / 40          | 128px / 121.6px | 786.66×440, 393.34×440 | 568×710      | 4               | 3                |        3957 |

The inter-column photo/benefit gap is 20px. Photo radius remains 24px; action
height remains 48px. The 800px workflow has ~226.67px columns and remains readable,
so the approved three-column option is retained. 320, 390, 1024, 1440 also have no
horizontal overflow, no clipped heading, complete photos and no hidden text.
At320 the hero wraps naturally to three lines; at 375/800 it uses two, and at 1280
one. Overall page length intentionally changes; the old full-page pixel diff is
not this redesign’s acceptance test.

Normal-motion checks confirmed settled hero visibility and every revealed item,
with no errors, warnings, hydration failures or unused-preload warning. Existing
`LandingMotion` choreography/cleanup code is unchanged: heading beat one, the two
photo wrappers together on beat two, seven later reveal groups and one generic
media reveal. Actions stay outside autoAlpha targets. Static benefit articles
have no hover-lift hook. No node is both hero and generic media.

Keyboard-only verification: skip link is first, Enter focuses `main-content`,
then Tab reaches hero account action, workflow action, closing account action
and footer links. Each shows a 2px solid focus indicator. Desktop anchors reach
all four sections; condensed navigation appears after scrolling the full header
away and hides at the top. Mobile links reach all four targets and close the
menu; Escape closes it; the closed 78px header stays at top 0 when scrolled.
The account action navigates to `/register`; no account was created.

Reduced motion exposes all content without reveal transforms. With JavaScript
disabled at 375 there are zero hidden headings/paragraphs/actions, no overflow,
and all three page links remain available; the secondary link reaches `#how-to`.
Computed faces remain Crimson Text / DM Sans / Roboto Mono. A 640×450 CSS viewport
at DPR 2 verifies the reflow equivalent of a 1280px window at 200% zoom, including
all actions and an unclipped title; browser-toolbar zoom itself was not driven.

Fresh [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
were fetched and applied to the changed page. No unresolved finding in scope:
semantic sections and ordered list, heading hierarchy, alt/captions, readable
contrast, fragment margins, visible focus, reduced motion, dimensions, reserved
media boxes and static fallback. Approved sentence-case product copy takes
precedence over the generic guideline’s title-case suggestion.

### Checks — actual output and limits

Node 24.21.0 was selected per-command without changing global tools. Firecrawl
was invoked through its installed executable with Node 24; photo/source research
required network escalation. The Tailwind snapshot remains unavailable/read-only;
limited skill references, installed sources and the fresh official theme page
were used, as the token appendix records.

`npm run lint` — initial run and final sequential run exited 0:

```text
> acres@0.1.0 lint
> npm run lint --workspace=@acres/client && npm run lint --workspace=@acres/shared && npm run lint --workspace=@acres/server
> @acres/client@0.1.0 lint
> eslint
> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"
```

An intermediate concurrent run overlapped `prisma generate` and reported
`✖ 1916 problems (1794 errors, 122 warnings)` for unresolved backend types.
Rerunning sequentially after build/generation completed exited 0. No server code
was changed. A direct root ESLint call also correctly rejected the absent root
config; the workspace/owning-directory commands above are the checks of record.

`npm run typecheck` — exit 0:

```text
> @acres/shared@0.1.0 build
> tsc -p tsconfig.json
> @acres/shared@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
> @acres/client@0.1.0 typecheck
> tsc --noEmit
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 829ms
```

`npm run build` — final run exit 0:

```text
> @acres/shared@0.1.0 build
> tsc -p tsconfig.json
> @acres/client@0.1.0 build
> next build --webpack
▲ Next.js 16.3.8 (webpack)
✓ Running next.config.ts took 29ms
✓ Compiled successfully in 5.5s
```

The client generated all 23 pages, including static `/`, and the server completed
`prisma generate && nest build`. The first sandboxed attempt reported
`Error: Could not parse output from TypeScript's --showConfig.` A direct probe
confirmed its child stdout was empty despite exit 0; the complete build outside
the sandbox passed. This was a tooling boundary, not a TypeScript code failure.

Changed TSX/CSS/TS formatting used the already installed Prettier with
`--no-semi`, matching these files’ convention:

```text
Checking formatting...
All matched files use Prettier code style!
```

New Markdown files and the two appended documentation sections were formatted
and pass Prettier. Full-file checks also flag existing formatting in AGENTS.md,
this historical record and the design-system record; the same warnings reproduce
on their untouched HEAD versions, so unrelated formatting was retained.

Targeted client ESLint exited 0 with no output. `git diff --check` exited 0 with
no output. No new test suite was added for this static marketing replacement;
real-browser acceptance covers the meaningful integrations. Backend E2E was not
run because no backend behavior changed.

To preview locally: run `npm run dev:client`, then open
`http://localhost:3000/` (or the port Next prints).

Independent review used `requesting-code-review`, followed by the
`receiving-code-review` evaluation. The reviewer inspected the uncommitted diff,
asset manifest, screenshots, browser evidence and successful checks against
prompt 399, with baseline/current HEAD both `3c4f99a`. Verdict: **Approved. No
Critical, Important, or Minor findings.** No corrective code change was needed.

## Remove visible photo captions — Prompt 400 (2026-10-19)

The user requested removal of the photo caption shown in their screenshot.
All three matching location/photographer lines are removed from
`client/app/(marketing)/page.tsx`, along with the unused shared caption class
and obsolete caption comment. This supersedes Prompt 399's visible-caption
decision above. The historical record remains unchanged.

The figures, media wrappers, image sources, meaningful alt text, reserved boxes,
responsive `sizes`, loading/priority, quality, centered crops and motion hooks
are unchanged. Removing caption children also removes their 12px top margins;
no replacement spacer or hidden caption was added. Source/photographer/licence
provenance remains in the photography `SOURCES.md` manifest, whose prose now
reflects the caption-free UI. No assets, tokens, shared styles or dependencies
changed. Baseline/current review HEAD: `96dce6f`.

### Browser acceptance

Chrome through the Playwright CLI inspected production `http://localhost:3201/`
after fonts loaded and all three photos decoded, with a fresh reduced-motion
context at each width. Full-page screenshots were visually inspected; local
ignored evidence is in `output/playwright/400/` (`browser-results.txt`,
`full-{375,800,1280}.png`, `detail-motion-1280.png`).

| Width | Hero photo boxes              | Detail photo | Page height |
| ----: | ----------------------------- | ------------ | ----------: |
|   375 | 343×214.375, 343×192.9375     | 343×214.375  |        5160 |
|   800 | 466.65625×360, 233.328125×360 | 720×450      |        4223 |
|  1280 | 786.65625×440, 393.34375×440  | 568×710      |        3875 |

Image boxes match the recorded Prompt 399 geometry; each remains `cover` with
`50% 50%` position. Every width has zero `main figcaption` elements, no visible
“Photo by” or “Unsplash” text, three decoded meaningful-alt photos, no horizontal
overflow and no page errors. A normal-motion check at 1280 confirmed both hero
media entrances and the detail entrance settle visible; the secondary hero
action reaches `#how-to`, and the account action navigates to `/register`.
No account was created.

Fresh [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
were fetched through Firecrawl and applied to the changed page: no findings.
Meaningful image descriptions remain available through alt text; section
semantics, headings, focus behavior and action markup are unchanged.

### Checks and review

Node 24.21.0 was selected per command. Root `npm run typecheck` exited 0:

```text
> @acres/shared@0.1.0 build
> tsc -p tsconfig.json
> @acres/shared@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
> @acres/client@0.1.0 typecheck
> tsc --noEmit
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 365ms
```

Root `npm run build` initially reproduced the documented sandbox failure:
`Error: Could not parse output from TypeScript's --showConfig.` Rerunning the
complete command outside that boundary exited 0:

```text
▲ Next.js 16.3.8 (webpack)
✓ Compiled successfully in 3.8s
  Finished TypeScript in 2.6s ...
✓ Generating static pages using 7 workers (23/23) in 1038ms
> @acres/server@0.1.0 build
> prisma generate && nest build
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 364ms
```

Root `npm run lint`, run after build, exited 0:

```text
> @acres/client@0.1.0 lint
> eslint
> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"
```

Prettier (`--no-semi` for TSX) checked the changed page, prompt and source
manifest; the appended record was checked separately to preserve historical
formatting. Output:

```text
Checking formatting...
All matched files use Prettier code style!
```

`git diff --check` exited 0 with no output. Diff review confirmed the code change
only deletes caption-related markup. No new test suite was added for this
reversible static deletion; backend E2E was not run because backend behavior
is unchanged.

Independent `requesting-code-review` review inspected the uncommitted diff,
approved prompt and browser evidence against baseline/current HEAD `96dce6f`.
The `receiving-code-review` evaluation found no corrective changes necessary:
**Ready; no Critical, Important or Minor findings.**

Preview: run `npm run dev:client`, then open `http://localhost:3000/` (or the
actual port Next prints). The verified production preview is running at
`http://localhost:3201/`. Reverting this scoped commit restores the captions.

## Product-led hybrid landing visuals — Prompt 401 (2026-10-19)

Implemented from `prompts/401-product-led-hybrid-landing-imagery.md` against
baseline `9fe074d`. The landing page now demonstrates a single regional-data
journey through original, native HTML product illustrations. A smaller real
Prampram photograph supplies geographic context. The bounded exception in
AGENTS.md §0 supersedes Prompt 399's photography-dominant composition and retains
Prompt 400's removal of visible photographer/location captions. Product copy,
section anchors, account actions, shared chrome and `LandingMotion` are retained.

### Research and visual-to-message map

Preparation researched [Datawrapper](https://www.datawrapper.de/),
[Felt](https://felt.com/), [CARTO](https://carto.com/) and
[Metabase reporting](https://www.metabase.com/features/analytics-dashboards).
The prompt records the source-specific lessons and boundaries. Execution
re-inspected the retained research, current screenshots, original brand comp,
product/ingestion/dashboard/report records and installed Next Image/Server
Component/page guidance. Publisher metadata, photo licence and Web Interface
Guidelines were freshly fetched through Firecrawl. These sources inform the
relationship between a promise and its output; no third-party interface or
unsupported GIS/AI/collaboration capability is depicted.

| Visual              | Message supported                                                                                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero comparison     | This visual shows three regions with two labeled periods on one 0–100% scale, which supports the promise of clear regional comparisons.                                                                       |
| Hero source/context | This visual shows real regional context alongside field mapping and one labeled source row, which supports turning source data into consistent meaning. The photograph is explicitly not the figures' source. |
| Benefit mapping     | This visual shows `region`, `year` and `canopy_pct` mapped to Region, Period and Metric, which supports bringing data together.                                                                               |
| Benefit comparison  | This visual shows Greater Accra's two period values with outlined/filled bars, which supports comparing places and periods with context.                                                                      |
| Benefit lineage     | This visual shows source file → version → observation, which supports following a result back to its source.                                                                                                  |
| Benefit publication | This visual shows a published example revision, evidence value and CSV/PDF output, which supports sharing a clearer story.                                                                                    |
| Detail evidence     | This visual shows a conservative claim, all six supporting percentages, percentage-point differences and source/version, which supports the detail behind a decision.                                         |
| Workflow import     | This visual shows one of six source rows and its field roles, which supports the import/mapping step.                                                                                                         |
| Workflow explore    | This visual shows the same region's two period values and derived change, which supports the exploration step.                                                                                                |
| Workflow publish    | This visual shows the same report/revision and preserved observation, which supports publishing findings from evidence.                                                                                       |

The capability strip and closing action remain concise typography. All plates
are conceptual illustrations rather than exact authenticated-screen captures.
There are no fake controls, browser frames, certification badges or geographic
measurement pins.

### Illustrative data and provenance

`client/components/acres/landing-example.ts` is a typed, read-only marketing
example. All illustrations derive their values, periods, mapping roles,
source/version and report identity from this module. The six invented
observations are Greater Accra 18%/24%, Ashanti 35%/41%, Northern 54%/58% for
2024/2025; changes are **+6/+6/+4 percentage points**. No national average or
forecast is calculated. These are not Ghana statistics, customer outcomes,
satellite estimates or measurements from the photo. Each independently viewed
plate/preview says “Illustrative data” and “Invented figures for this example.”

The main comparison exposes all exact values in a native list; the report uses
a definition list. Decorative bars are hidden from assistive technology and
computed from the same values. Period labels plus outlines/filled bars identify
series beyond colour. The module is not a backend fixture or API data source.

The sole current photo is `prampram-context.webp`: 1400×786, **223752 bytes**,
encoded without enlargement from the 352299-byte publisher rendition. The
Artboard's publisher page identifies Prampram, Ghana and the free Unsplash
License; source/author/licence and the exact ImageMagick command are recorded
in `client/public/assets/ui/landing/editorial/SOURCES.md`. The old three assets
remain there for history and are absent from the landing DOM. Direct photo
response: `200 image/webp 223752`; optimizer probe at 640px/quality100:
`200 image/jpeg 230217` (probe's default Accept header). Browser images decode.

### Composition and measured browser geometry

White canvas, palette, three font families, 48px actions, 24px major-media
corners, 14px small cards, shared gutters/container and 120px section rhythm are
retained. The native plates reflow; report/source text is never rasterized,
cropped or covered with `object-fit`. Only the context photograph uses cover.
The photo's 16:9 box and responsive `sizes` reserve the correct space. It has
no forced preload/high priority.

These layout choices are **design judgments**, not original-comp measurements:
comparison first at 375 and 800; context photo/mapping stacked at 375 and split
into equal tracks with 20px gap at 800; hero 2:1 tracks at 1280. The detail plate
uses natural height and becomes two-column with copy from `lg`. Benefit previews
have a 256px minimum (264px at `lg`); workflow previews have a 336px minimum from
`md` so three-column headings align. Existing spacing/type/shape tokens suffice;
no new global tokens, dependency, client module or animation was added.

Fresh Chrome contexts through the installed Playwright CLI inspected the final
production build at `http://localhost:3202/`, after fonts and photo decode.
Reduced-motion full-page captures at 375/800/1280 and their chart/report/workflow
crops were visually opened. Additional interpolation captures supplement the
DOM geometry checks. Local evidence is ignored in `output/playwright/401/`.

| Width | Container / gutter | Comparison    | Context photo | Detail plate | Benefits / workflow columns | Page height |
| ----: | ------------------ | ------------- | ------------- | ------------ | --------------------------- | ----------: |
|   375 | 343 / 16           | 343×628.91    | 343×192.94    | 343×767.23   | 1 / 1                       |        8534 |
|   800 | 720 / 40           | 720×588.53    | 350×196.88    | 720×662.69   | 2 / 3                       |        5972 |
|  1280 | 1200 / 40          | 786.66×606.94 | 393.34×221.25 | 568×688.50   | 4 / 3                       |        4676 |

320/390/1024/1440 checks report no horizontal overflow or clipped plate content.
Their measured page heights are 8986/8486/4882/4676. At 800 the ~226.67px workflow
columns remain readable, so three columns are retained. A 640×450 CSS viewport
at DPR2 checks the reflow equivalent of a 1280px window at 200% zoom; no overflow
or inaccessible content was found. Browser-toolbar zoom itself was not driven.

All six rendered bar widths match the source percentages within raster rounding
(<0.1 percentage point). All ten plates/previews have local example disclosures;
there is one decoded meaningful-alt photo and no retired paths. Browser console
warnings/errors and page errors: zero. Normal-motion traversal confirms all
hero/media/group targets settle visible, with zero duplicate target hooks.
Reduced motion and JavaScript-disabled 375px expose the complete three-plate
story and actions without overflow or hidden text. `LandingMotion` is unchanged;
reserved photo dimensions and static native content keep trigger geometry stable.

Keyboard checks confirm skip link → `main-content` → account action with a
2px solid focus indicator. All four section anchors, secondary `#how-to` action,
`/register` navigation, mobile-menu links/close behavior and Escape pass. No
account was created. An initial browser harness used the wrong menu label
“Open menu”; correcting it to the existing “Open navigation menu” produced the
successful final run. No application fix was required for that harness error.

Fresh [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
were applied to the changed surface: no unresolved findings. Native semantics,
text alternatives, non-colour series identification, contrast, focus, reflow,
reserved photo dimensions and motion/static fallbacks were checked. Dark text
on pale green avoids the muted-grey contrast issue. Approved sentence-case
headings take precedence over the generic title-case suggestion.

### Actual checks, review and preview

Node 24.21.0 was selected per command. Final root `npm run typecheck` exited 0:

```text
> @acres/shared@0.1.0 build
> tsc -p tsconfig.json
> @acres/shared@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
> @acres/client@0.1.0 typecheck
> tsc --noEmit
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 313ms
```

Root `npm run build` first reproduced the documented sandbox failure:
`Error: Could not parse output from TypeScript's --showConfig.` The final full
build outside that boundary exited 0:

```text
▲ Next.js 16.3.8 (webpack)
✓ Compiled successfully in 4.4s
  Finished TypeScript in 2.8s ...
✓ Generating static pages using 7 workers (23/23) in 966ms
> @acres/server@0.1.0 build
> prisma generate && nest build
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 432ms
```

Root `npm run lint`, sequentially after build, exited 0:

```text
> @acres/client@0.1.0 lint
> eslint
> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"
```

Changed TSX/TS (`--no-semi`), prompt and source manifest formatting passed:

```text
Checking formatting...
All matched files use Prettier code style!
```

The new Markdown records are checked separately to preserve historical
formatting. `git diff --check` exits 0 without output. A direct Node assertion
of the example module prints:
`6 observations; 3 comparisons; changes +6/+6/+4 percentage points: pass`.
Node emitted a module-type auto-detection warning for this one-off import; no
package-type change is warranted. No generic test suite was added for static
illustrations, and backend E2E was not run because backend behavior is unchanged.
The Tailwind snapshot remains unavailable in its read-only skill location;
limited skill references plus installed sources were used, not an initialized
snapshot. The npx Playwright wrapper failed package resolution with `EAI_AGAIN`;
verification used the already installed CLI executable instead.

Independent `requesting-code-review` dispatched a read-only reviewer against
baseline/current HEAD `9fe074d`, the approved prompt, uncommitted tracked/new
files, source manifest, screenshots and actual check/browser evidence. Verdict:
**Ready; no Critical, Important or Minor findings.** `receiving-code-review`
verified the sole documentation recommendation: the opening current-state
pointer now names Prompt 401. Generated CLI artifacts remain outside the commit.
No corrective implementation change or architectural re-review was needed.

Preview: open `http://localhost:3202/` while the verified production server is
running. For development run `npm run dev:client`, then open
`http://localhost:3000/` or the port Next prints. Rollback is reverting the scoped
commit; the retired photo assets remain available. No push or deployment was run.

## Simplified content and spacing — Prompt 402 (2026-10-19)

Approved `prompts/402-simplify-landing-content-and-spacing.md` refines the
product-led hybrid direction to reduce repetition. Only the public landing,
its local static illustration/example modules and owning documentation change.
The hero retains one comparison and a smaller context photo; four open benefit
articles and three workflow steps replace the miniature previews. One report
excerpt sits beside one short explanation. Repeated introductions, mapping
card, capability strip and closing prose are removed. Shared chrome, anchors,
actions, motion, palette, typography and licensing remain unchanged.

### Content, integrity and references

The native comparison retains Greater Accra 18%/24%, Ashanti 35%/41% and Northern
54%/58% for 2024/2025. Bar lengths share a zero-based 0–100% scale; the rendered
widths differ from their source percentages by less than 0.01 percentage point.
Outline/fill plus the period legend distinguish series beyond colour. Exact
values remain native text; screen-reader-only year labels associate each compact
pair with its periods, and the figure's `aria-describedby` names
`regional-canopy-example.csv · v1`.

The report is explicitly a published example, revision 1, with the Greater Accra
excerpt, 2024: 18% → 2025: 24%, **+6 percentage points**, and the same source v1.
The full filename is visible here once. Both numeric figures have the local
“Illustrative data · invented values” disclosure;
the photo carries no numbers or caption. The unused field-mapping metadata was
removed after checking usages; observations and the derivation are unchanged.

Execution re-opened the original desktop benefits crop `1280×630+0+1120` and the
Prompt 402 baseline captures, and read the owning landing, design-system,
component, motion, automation, product, build-plan and skill records. Installed
Next server-component, page and Image guidance verified the retained server
boundary and updated `sizes`. The current source manifest remains accurate,
so its existing licence/provenance record did not need editing.

### Measured composition and browser evidence

Fresh production contexts on `http://localhost:3203/`, with fonts ready and
photo decoded, measured **213 visible words** in `main` at every checked width,
using `innerText.trim().split(/\s+/)`: down from 640, **66.7% fewer**. There are
exactly **two numeric figures, two concise disclosures, one photo, zero preview
figures and no capability strip**. Content is identical across breakpoints.

| Width | Container / gutter | Comparison      | Context photo   | Report frame | Page height, before → after |
| ----: | ------------------ | --------------- | --------------- | ------------ | --------------------------: |
|   375 | 343 / 16px         | 343×570.34px    | 343×192.94px    | 343×510.69px |               8534 → 4982px |
|   800 | 720 / 40px         | 448×586.34px    | 224×126px       | 720×445.53px |               5972 → 3797px |
|  1280 | 1200 / 40px        | 757.33×603.55px | 378.66×212.98px | 560×447.94px |               4676 → 3490px |

| Width | Hero height | Benefits height | Report section height | Workflow height |
| ----: | ----------: | --------------: | --------------------: | --------------: |
|   375 |   1248.06px |        910.56px |              880.88px |       1006.97px |
|   800 |   1094.91px |        559.77px |              765.11px |        511.17px |
|  1280 |   1084.53px |        407.98px |              567.94px |        498.98px |

All spacing relationships in the approved table were checked against live boxes
and computed styles; `docs/design-system.md` §14 records the values. Hero tracks
are 448/224px at 800 and 757.33/378.66px at 1280. Benefits remain 1/2/4 columns;
workflow remains 1/3/3, with approximately 226.67px columns at 800. Report columns
are 560/560px at 1280 and 432/432px at 1024. No custom breakpoint was needed.

320/390/640/1024/1440 checks show no page overflow or clipped visible text;
page heights are 5286/4935/4657/3696/3490px. The report's 176px text width at
320 allows filename, metric and revision text to wrap naturally. A separate
640×450 CSS viewport at DPR2 verifies the reflow equivalent of a 1280px window
at 200%; browser-toolbar zoom itself was not driven.

Reduced-motion full-page captures at 375/800/1280 and native hero, benefit,
report and workflow crops were visually opened. 320 and 1024 report captures
were also opened. Final crops come from full-page images to avoid a sticky
header overlay introduced by element-screenshot scrolling. Ignored evidence is
in `output/playwright/402/`, including `metrics.json` and the browser outputs.

Normal-motion traversal at 375/800/1280 settles every reveal target visible,
with zero duplicate hooks or browser console/page errors. JavaScript-disabled
375px retains both figures and all three main actions, with no hidden content
or overflow. `LandingMotion` and the shared motion module remain unchanged.

Skip link → `main-content` → account action passes; focus indicators measure
3px on the skip link and 2px on the action. The hero `#how-to`, all four nav
anchors at 375/800/1280, mobile menu open/close/Escape, and both main `/register`
actions pass. No account was created. Initial harness errors were corrected:
the existing Base UI CTA uses an anchor with button role, so the check targets
its `href`; anchor results await the URL update rather than sampling too early.
Neither correction required application changes.

The local photo returns `200 image/webp 223752`; the selected optimized
1920px/quality100 response in the DPR2 reflow context returns
`200 image/jpeg 846021` with the probe's default Accept header. Browser images
decode. The reserved ratio, meaningful alt, one-photo count and absence of
retired paths/visible credits are retained. `sizes` now follows the 2:1 tracks,
48/64px gaps, gutters and 1200px container cap.

Fresh [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
were fetched and applied to the changed UI. No unresolved findings: native
figures/lists/headings, quantitative alternatives, contrast, focus, touch
geometry, reflow and static/reduced-motion visibility were checked. Approved
sentence-case copy takes precedence over generic title-case guidance. The
Firecrawl shim had no selected Node version, so the fresh source was retrieved
with the available web tool. No product dependency or global tooling changed.

### Checks, review and preview

Node 24.21.0 was selected per command. Root `npm run typecheck` exited 0:

```text
> @acres/shared@0.1.0 build
> tsc -p tsconfig.json
> @acres/shared@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
> @acres/client@0.1.0 typecheck
> tsc --noEmit
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 454ms
```

The first sandbox build exited 1 with the documented tooling failure:

```text
Error: Could not parse output from TypeScript's --showConfig.
```

The final root `npm run build`, outside that boundary, exited 0 after the
workflow marker spacing correction:

```text
▲ Next.js 16.3.8 (webpack)
✓ Compiled successfully in 4.1s
  Finished TypeScript in 3.8s ...
✓ Generating static pages using 7 workers (23/23) in 1575ms
> @acres/server@0.1.0 build
> prisma generate && nest build
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 1.11s
```

Root `npm run lint`, sequentially after the final build, exited 0:

```text
> @acres/client@0.1.0 lint
> eslint
> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"
```

Installed Prettier checked changed TS/TSX with `--no-semi`, the prompt and the
new Markdown records separately from historical formatting, exit 0:

```text
Checking formatting...
All matched files use Prettier code style!
```

`git diff --check` exits 0 with no output. The direct example assertion prints:

```text
6 observations; 3 comparisons; changes +6/+6/+4 percentage points: pass
```

The one-off Node import emits the existing module-type auto-detection warning;
no package-type change is needed. No new static-layout test suite or backend
E2E run was warranted by this scope. The unavailable Tailwind snapshot used the
approved limited skill fallback and installed/generated CSS evidence.

Independent `requesting-code-review` inspected the complete approved prompt,
uncommitted diff against baseline/current HEAD `2685bbb`, source, motion
ownership, screenshots and actual browser/check evidence. Verdict: **Ready to
proceed with documentation and local commit; no Critical, Important or Minor
findings.** `receiving-code-review` verified the documentation recommendation;
the current-state pointer and the spacing record are updated here. No code fix
or architectural re-review was required.

Preview: open `http://localhost:3203/` while this task's production server is
running. For development, run `npm run dev:client` and open
`http://localhost:3000/` or the printed port. Rollback is a scoped revert of the
implementation commit. No push or deployment is included.

## Premium survey-plate composition — Prompt 423 (2026-10-21)

Approved `prompts/423-premium-survey-plate-landing.md` makes the comparison
plate the public landing’s full-width evidence object. The centred thesis,
existing sentences, five section anchors and three main actions are unchanged.
The photo follows the plate as context rather than sharing a 2:1 row. Prompt
402’s content reduction and Prompt 400’s credit removal remain in force.
No chrome, authenticated route, API, example observation or motion implementation
changed. The desktop benefits reference crop `1280×630+0+1120` was reopened:
hairlines and serif feature titles remain, with no card borders or new icons.

### Reference deltas and tokens

These are approved design judgments, not original-comp measurements:

- Hero top inset is 80/96/128px instead of 64/80/96px at 375/800/1280.
- Comparison and photo both occupy the container, separated by 24/32/40px.
  The plate inset is 32/40/56px and region-row gaps are 40/40/48px.
- Benefits gain 80px before articles below `md`, 96px from `md`. Workflow
  gains the same 80/96px heading-to-list relationship. The report remains
  stacked at 800 with an 80px gap, and equal-column at `lg` with an 80px gap.
- The 120px section rhythm, existing palette, three faces, type roles,
  radii, button states and elevation are unchanged. No sentence was added.

No new token or merge registration is needed. The installed Tailwind 4.3.3
compiler generates `md:aspect-21/9`; checking only the theme’s named aspect
variables had initially missed this built-in fraction utility. Review caught
that distinction, and the implementation uses the existing utility as the
prompt specifies. `docs/design-system.md` §15 records the ratio judgment. The
photo retains 16:9 below `md`, quality 100, its existing meaningful alt and
asset. `sizes` now follows full container width: viewport minus 32px below
768, viewport minus 80px up to the cap, then 1200px. Default `lg` is 1024;
no custom breakpoint was added.

### Production-browser evidence

Node 24.21.0, Next production server `http://127.0.0.1:3423/`, Playwright CLI,
reduced-motion contexts, loaded fonts and decoded photo:

| Width | Container / gutter | Comparison | Photo | Page height |
| ---: | --- | --- | --- | ---: |
| 375 | 343 / 16px | 343×586.34px | 343×192.94px | 5022px |
| 800 | 720 / 40px | 720×602.34px | 720×308.56px | 4218px |
| 1280 | 1200 / 40px | 1200×651.55px | 1200×514.28px | 4165px |

| Width | Hero height | Benefits height | Report section height | Workflow height |
| ---: | ---: | ---: | ---: | ---: |
| 375 | 1256.06px | 926.56px | 880.88px | 1022.97px |
| 800 | 1467.47px | 575.77px | 781.11px | 527.17px |
| 1280 | 1726.81px | 423.98px | 567.94px | 514.98px |

All specified spacing relationships were checked against computed styles and
live boxes. Benefits retain a 1px top hairline and serif titles. Report columns
are 560/560px at 1280 and remain a single 720px column at 800. There is one
`h1`, two numeric figures and two illustrative-data disclosures. Native values,
outline/fill distinction and the programmatic source description are unchanged.
Bar widths on the plate’s content box round to 18/24/35/41/54/58% at 800 and
1280. At 375, the 41% bar rounds to 40.99%; at 320, 41% and 58% round to
40.99% and 57.99%. The difference is no greater than 0.01 percentage point.

320/390/1024/1440 checks have no page-level horizontal overflow or source-text
overflow. Page heights are 5326/4975/4260/4165px, respectively. The 320 content
container is 288px, following the existing 16px gutters rather than a fixed
mobile width. Full-page captures and hero/benefit/report/workflow crops were
saved under ignored `output/playwright/423/` and visually inspected.

The initial resize-only measurement harness sampled stale breakpoint styles;
those results were discarded. Reloading after each resize produces matching
`innerWidth`, `matchMedia` and computed styles. In the reused wide-to-phone
context Chromium retained a cached 1200-wide image candidate. A separate cold
375px/DPR1 context selected **384w**, not the desktop candidate, for its 343px
slot (`encodedBodySize: 67114`). No application workaround was needed.

Normal-motion traversal at 375/800/1280 settles every reveal target visible:
`hidden: []`, one hero-heading hook, two hero-media hooks, and `errors: []`.
`LandingMotion` is unchanged. A JavaScript-disabled 375px full-page screenshot
shows both figures and all three main actions, with the same 5022px page height.
A scripted DOM-evaluation attempt in that disabled context timed out after
60 seconds; the successful static full-page capture and opened report/close
crops supplied the visual proof instead.

Fresh Web Interface Guidelines were fetched and applied to the changed UI.
No new unresolved finding: meaningful alt, reserved image geometry, native
figure/list semantics, heading order, tabular data, source wrapping and static/
reduced-motion visibility are retained. Existing approved copy takes precedence
over generic title-case guidance. Both button variants retain their existing
black label on sage hover; `docs/design-system.md` §1.4 records the original
white-label contrast finding as closed in step 2. No button change was needed.
The Tailwind snapshot remains uninitialized; installed theme source and the
skill’s limited gotchas fallback were used, not an invented v3 utility.

### Checks and preview

Root checks ran under Node **v24.21.0**, all exit 0:

```text
npm run lint
> @acres/client@0.1.0 lint
> eslint
> @acres/shared@0.1.0 lint
> eslint "src/**/*.ts"
> @acres/server@0.1.0 lint
> eslint "{src,test}/**/*.ts"

npm run typecheck
> @acres/shared@0.1.0 build
> tsc -p tsconfig.json
> @acres/shared@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
> @acres/client@0.1.0 typecheck
> tsc --noEmit
> @acres/server@0.1.0 typecheck
> prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 726ms

npm run build
▲ Next.js 16.3.8 (webpack)
✓ Compiled successfully in 18.3s
✓ Finished TypeScript in 3.8s
✓ Generating static pages using 7 workers (23/23) in 1426ms
> @acres/server@0.1.0 build
> prisma generate && nest build
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 500ms
```

The build printed two retries before compiling successfully. Its Prisma update
notice did not change dependencies. `git diff --check` exits 0 with no output.
No server suite, operations drill, deployment or push was run.

To inspect locally, run `npm run dev:client` at the repository root and open
`http://localhost:3000/` or the port Next prints. For the built client, run
`npm run start -- --port 3423` and open `http://localhost:3423/`.
Rollback is a scoped revert of the implementation commit; no data migration or
asset replacement is involved.

### Review closure and final verification

Independent review against baseline `6ffcb813fe252e3bb57e5cbb9ac687f85fe69914`
found no Critical or Important issue. Two minor findings were verified with
`receiving-code-review`: use the installed fraction utility instead of adding
an unnecessary token, and correct the stale hover-contrast statement. Both
are resolved above; follow-up review reports no substantive findings. The
custom-token and merge-map edits were removed, leaving both shared files at
baseline. No motion or layout-structure rewrite was required.

Final verification after the utility correction, again on Node 24.21.0:

```text
Checking formatting...
All matched files use Prettier code style!

npm run build
✓ Compiled successfully in 17.1s
✓ Finished TypeScript in 5.7s
✓ Generating static pages using 7 workers (23/23) in 1736ms
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 438ms

npm run lint
> eslint
> eslint "src/**/*.ts"
> eslint "{src,test}/**/*.ts"

npm run typecheck
> tsc -p tsconfig.json
> tsc -p tsconfig.json --noEmit
> tsc --noEmit
> prisma generate && tsc -p tsconfig.json --noEmit
✔ Generated Prisma Client (7.9.1) to ./src/generated/prisma in 655ms
```

All commands exited 0. The first changed-TSX format check reported one wrapping
warning; the hero wrapper was formatted and the repeated check passed. The final
production-browser pass on port 3424 confirms the built-in utility preserves
343×192.9375 / 720×308.5625 / 1200×514.28125px photo boxes, page heights
5022/4218/4165px and zero horizontal overflow at 375/800/1280. The same
16:9/21:9 breakpoint geometry means the earlier opened captures remain accurate.
Only the source utility changed, not the rendered composition.
