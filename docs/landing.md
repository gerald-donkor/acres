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

- The overall page is shorter than the comp at all widths, because vertical
  section whitespace was tuned to the existing token rhythm rather than adding
  one-off page spacers.
- The trusted marks preserve exact extracted mark art but are laid out through
  responsive grid tracks, not absolute comp x positions.
- The tablet and desktop lower images require a scroll pass before full-page
  Chrome capture because Next's below-fold images are lazy-loaded.

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
