# Acres — Landing Page

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
| 6 + soft mask 7 | `client/public/assets/ui/landing/report-device-desktop.webp` | 1741 × 1216 |
| 16 + soft mask 17 | `client/public/assets/ui/landing/report-device-mobile.webp` | 816 × 1704 |
| 18 + soft mask 19 | `client/public/assets/ui/landing/mountain.webp` | 4096 × 2304 |
| 20 + soft mask 21 | `client/public/assets/ui/landing/aerial.webp` | 4096 × 2731 |
| 22 + soft mask 23 | `client/public/assets/ui/landing/stones.webp` | 4096 × 2048 |
| 24 + soft mask 25 | `client/public/assets/ui/landing/cylinders.webp` | 3750 × 3000 |

Repeatable extraction:

```bash
pdfimages -j client/public/assets/ui/ref/acres-design-system.pdf /tmp/acres-pdf-image
magick /tmp/acres-pdf-image-006.jpg /tmp/acres-pdf-image-007.ppm -alpha off -compose CopyOpacity -composite -strip client/public/assets/ui/landing/report-device-desktop.webp
magick /tmp/acres-pdf-image-016.jpg /tmp/acres-pdf-image-017.ppm -alpha off -compose CopyOpacity -composite -strip client/public/assets/ui/landing/report-device-mobile.webp
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
| Hero Device | Desktop / Mobile | `report-device-*.webp` | 1741 × 1216 / 816 × 1704 | 100% quality raw extraction |

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
re-cutting an asset: at 1280 the 1741 × 1216 asset covers 906 × 513 at scale
0.5204, rendering 906 × 633 and dropping 120 px off the bottom, which is what
the comp shows. `sizes` was retuned to the real widths
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
- **The device asset has no bezel.** The comps draw the hero device inside a
  black frame — measured at **20 px on each side at 1280** (the bezel spans
  x 187–206, so the comp's *screen* is 867 wide inside a 907 device). The
  extracted `report-device-desktop.webp` and `report-device-mobile.webp` are the
  **screen only**, so the live screen renders at the full 906 / 269 and reads
  slightly larger and frameless. This predates the pass — the old padded band had
  the same asset — and closing it needs a fresh extraction of the framed device,
  which `prompts/11-…` puts out of scope. **Open.**
- **The device's framing degrades between the three comp widths.** The band is
  348 tall at 375, 800 *and* 1280 — three readings, constant — so the band height
  is the strong invariant and the device's height is pinned per breakpoint to
  match it. The device's *width* still tracks the viewport, so how much of the
  mockup shows changes across each range:

  | viewport | 375 | 600 | 767 | 1024 | 1109 | 1280 |
  | --- | --- | --- | --- | --- | --- | --- |
  | device box | 269 × 418 | 494 × 418 | 661 × 418 | 650 × 513 | 735 × 513 | 906 × 513 |
  | of the asset shown | 74 % of its height | 45 % | **30 %** | 81 %, **cropped 42 px each side** | 81 %, edges just reached | 81 %, full width |

  At 767 the portrait phone mockup is reduced to its status bar and header, and
  between 1024 and ~1109 the desktop asset is cropped left and right — the
  crossover from vertical to horizontal cropping is at a device width of
  `1741 × (513 / 1216) = 734.6`, i.e. a viewport of ~1109. **This is accepted,
  not solved.** The alternative — an `aspect-ratio` device with the band sized to
  `deviceHeight − overhang` — interpolates smoothly but gives up the constant
  348 the comps measure three times, and that is a design decision, not a
  measurement. **Open.**
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
