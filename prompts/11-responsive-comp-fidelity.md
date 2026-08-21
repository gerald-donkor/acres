# 11 — Responsive comp fidelity: images and UI geometry at 375 / 800 / 1280

## Scope, and why it is next

The user's request, in their words:

> Make sure the screen sizes with images and UI elements corresponds to these
> responsive designs for the mobile, tablet, & desktop:
> `/home/gdk26/Documents/nextjs/acres/client/public/assets/ui/landing-pages`

This is a **fidelity pass over the shipped `/` route**, not new work. Steps 1–8
of AGENTS.md §8.2 are committed (`git log`: `5d9899a` back to `0723829`), the
landing page renders at all three widths, and `docs/landing.md` already records
that "the overall page is shorter than the comp at all widths" as an accepted
delta. The user is now asking for that delta to be closed. It is next because it
is a direct user request against a built surface, and because every defect below
was measured against the comps in the session that wrote this file — the numbers
are in hand, not deferred.

The measuring session is the evidence base for everything here. Its harness and
the one non-obvious trap it uncovered are recorded in §7 and must be re-created
at execution time.

## Reference material read, by path

| path | what was read from it |
| --- | --- |
| `client/public/assets/ui/landing-pages/Desktop.png` | 1280 × 7389. Hero sage band and device geometry, testimonial column split, benefits intro, numbered-step marker ink, whole-page band profile |
| `client/public/assets/ui/landing-pages/Tablet.png` | 800 × 8825. Hero sage band and device geometry, whole-page band profile |
| `client/public/assets/ui/landing-pages/Mobile.png` | 375 × 8833. Hero sage band and device geometry, Big Picture image inset, whole-page band profile |
| `docs/landing.md` | the `/` build record — extracted assets, art-directed `<picture>` breakpoints, the recorded height delta this prompt closes |
| `docs/automation.md` | comp DPI geometry, ImageMagick recipes, the CDP capture pattern |
| `docs/design-system.md` (rows around `stat`, §3.1, §3.3) | the `stat` role is **DM Sans 400 at 80 px**; container `min(100vw − 2·gutter, 1200)`; the 120 px section rhythm |
| `client/app/page.tsx`, `client/app/globals.css`, `client/components/acres/section.tsx`, `client/components/acres/container.tsx` | current markup and tokens |

## How every number below was produced

Three procedures, all repeatable, all run in the prompt-writing session:

1. **Comp band profile.** `magick <comp>.png -colorspace gray -resize 1x! -depth 8 txt:-`
   collapses each row to its mean, and runs of non-255 rows are the content
   bands. Reliable for image blocks and rules; **unreliable for text**, because
   a short text run averaged across 1280 px does not move the row mean. Every
   text-level claim below was therefore re-checked by direct pixel sampling or
   by an ink bounding box, never by the band profile alone.
2. **Direct pixel sampling** — `magick <comp>.png -format "%[pixel:p{X,Y}]" info:`
   on a grid, matching `#8E9C78` within ±14 per channel. This is what located the
   sage band; a `-fuzz`-based `-opaque` pass produced a false top edge at
   desktop y = 384 and must not be trusted for this measurement.
3. **Live geometry and full-page capture** — headless Chrome over CDP against
   `next start`, per §7.

## The confirmed defects, with their measured targets

### A. The hero sage band and its device are wrong at all three widths

**This is the largest defect and the one the user is most likely looking at.**

The comps draw the hero as: a sage band of **constant height ≈ 348 px at every
width**, spanning the container, with the device image **overhanging the band's
top edge**, inset from the container by a per-width wing, and **clipped at the
band's bottom edge**. The current build draws a sage band with top padding, the
device fully inside it and never clipped, so the band grows with the image.

Measured from the comps (band = `#8E9C78` extent; device = ink extent inside it):

| | container | comp band `y` | comp band **h** | wing (each side) | comp device **w** | comp device visible **h** | overhang above band top |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| Mobile 375 | 343 (x 16–358) | 385–731 | **347** | **37** | **269** (x 53–322) | **417** (y 315–732) | **70** |
| Tablet 800 | 720 (x 40–759) | 526–874 | **349** | **22** | **676** (x 62–737) | **429** (y 445–874) | **81** |
| Desktop 1280 | 1200 (x 40–1239) | 538–886 | **349** | **147** | **907** (x 187–1093) | **514** (y 373–886) | **165** |

Cross-checks that make these self-consistent: `container − 2 × wing` reproduces
the device width at all three widths (1200−294 = 906 ≈ 907; 720−44 = 676;
343−74 = 269), and `band h + overhang` reproduces the device's visible height
(348+70 = 418 ≈ 417; 348+81 = 429; 348+165 = 513 ≈ 514). **Treat 348 as the band
height at all three widths** and absorb the ±1 into rounding; the three
independent measurements are 347/349/349.

What the build currently does, measured live at the same widths:

| | live band h | live band padding | live device w | device clipped? |
| --- | ---: | --- | ---: | --- |
| 375 | **690** | `px-4 pt-10` (16 / 40) | 311 | no |
| 800 | **473** | `md:px-14 md:pt-12` (56 / 48) | 608 | no |
| 1280 | **670** | `lg:px-24 lg:pt-14` (96 / 56) | 880 | no |

**The required structure**, replacing `client/app/page.tsx:127–150`:

- An outer wrapper with `padding-top: <overhang>` and `position: relative`.
- The sage band as an absolutely positioned layer — `inset-x-0 bottom-0`,
  `height: 348px`, `rounded-media`, `bg-sage` — sitting **behind** the device.
- The device as a `relative` block, `margin-inline: auto`, `width: container − 2×wing`,
  `height: overhang + 348`, `overflow-hidden`, with the `<Image>` at
  `object-cover object-top`.

`object-cover` + an explicit height is exactly the right primitive here: at
desktop the asset is 1741 × 1216, cover into 907 × 514 scales by
`max(907/1741, 514/1216) = 0.521`, rendering 907 × 634 and cropping 120 px off
the bottom — which is what the comp shows. At mobile the portrait asset
(816 × 1704) covers into 269 × 417 by `max(0.3297, 0.2447) = 0.3297`, rendering
269 × 562 and cropping 145 off the bottom. **Do not** use `overflow-hidden` on
the sage band itself — the device must paint above the band's top edge, and a
clip on the band would eat the overhang.

Keep the existing art direction: the `<source media="(max-width: 767px)">`
pointing at `report-device-mobile.webp`, `quality={100}`, and `fetchPriority="high"`
(**not** `priority` — `docs/polish.md` §4 records why). Update `sizes` to the new
widths: `(max-width: 767px) 269px, (max-width: 1023px) 676px, 907px`.

`data-motion-hero-media` currently sits on the padded band div. Move it to the
new outer wrapper so the hero reveal still animates one element, and re-read
`docs/motion.md` before moving it — §9.3 rule 6 means any resting transform on
that element must live in the tween, not in a class.

### B. The hero sits too low at every width

Comp vs live ink top of the `h1`, with the header identical in both
(comp nav ink 19–68, live 20–67):

| | comp `h1` ink top | live `h1` ink top | delta |
| --- | ---: | ---: | ---: |
| 375 | 125 | 148 | **−23** |
| 800 | 155 | 191 | **−36** |
| 1280 | 156 | 204 | **−48** |

The section carries `pt-16 md:pt-24 lg:pt-28` (64 / 96 / 112). Reduce each step
so the measured ink top lands on the comp's, and re-measure rather than assuming
the delta transfers 1:1 — the `h1` line box overshoots its ink by a different
amount at each of the three `--text-hero*` line heights (0.85 / 0.8 / 0.8).

And the gap from `h1` ink bottom to device ink top:

| | comp | live | delta |
| --- | ---: | ---: | ---: |
| 375 | 59 | 74 | −15 |
| 800 | 57 | 80 | −23 |
| 1280 | 74 | 94 | −20 |

The `mt-10 md:mt-12 lg:mt-14` on the band comes down accordingly. Note that with
defect A fixed the margin applies to the wrapper whose top is the **device** top,
not the band top, so the arithmetic changes — measure it after A lands.

### C. Desktop testimonial: the image column is 89 px too narrow

Comp `Desktop.png`: the stones image spans **x 39–630 → 592 wide**, y 4526–5196
→ **671 tall**, and the quote text starts at **x 700** and runs to the container
edge at 1239 → **≈ 540 wide**. Gap between them: **70**.

Live at 1280, read from the running page:
`grid-template-columns: 503.359px 640.641px`, `column-gap: 56px` — the image
renders **503 × 572** and the quote column is 641 wide. The quote's ink box
confirms it: comp 507 × 260, live 580 × 215.

`client/app/page.tsx:301` currently reads `lg:grid-cols-[0.88fr_1.12fr]` with
`gap-14`. The comp's split is **592 / 70 / 538** out of 1200. Express it in
tokens/fractions that reproduce those three numbers at 1280 and state the
choice in `docs/landing.md`. The `lg:aspect-[590/670]` on the picture is already
correct and stays — it is the column width, not the ratio, that is wrong.

Verify the tablet and mobile testimonial before changing anything there: both
already match (comp tablet 5484–6206 h = 723 vs live 720; comp mobile 5781–6126
h = 346 vs live 343, both full-container width).

### D. Mobile "See the Big Picture" image is full-bleed but should be inset

Comp `Mobile.png`: the cylinders image spans **x 31–343 → 313 wide** inside a
343 container (so ≈ 15 px inset on each side), y 4136–4523 → **388 tall**.

Live at 375: **343 × 424** — `w-full` on the picture, with `aspect-[311/385]`
producing the extra height. The recorded `311 × 385` ratio in `docs/landing.md`
is right; the **width** is not being constrained to 311–313.

Constrain the mobile width; leave `md:aspect-[720/744]` and
`lg:aspect-[590/711]` alone — tablet measures 747 comp / 744 live and desktop
713 comp / 719 live, both within tolerance.

### E. The numbered-step marker is set in the wrong family

`client/app/page.tsx:427` renders the `01`/`02`/`03` markers as
`font-serif text-stat`. `docs/design-system.md` identifies the **stat** role as
**DM Sans 400 at 80 px** with `−0.0375em` tracking — the sans, not the serif.

Measured ink of `01` on `Desktop.png` at the step marker: **64 × 57**.
Measured live: **59 × 50**. Advance widths probed in the running page at 80 px
with the shipped tracking: Crimson Text **63.8**, DM Sans **73.7**. DM Sans's
figure height at 80 px lands ink height at ≈ 56–57, matching the comp; Crimson
Text at 80 px gives 50, which is what ships.

**Drop `font-serif` from the marker** so it inherits the body sans, then
re-measure the ink box against 64 × 57 and only then decide whether the 80 px
token itself needs revisiting. Do not change `--text-stat` on the strength of
this prompt alone — §10 rule 4: the family change is the measured fix, the size
is a hypothesis until re-measured.

Leave the step **headings** in `font-serif text-h3`; AGENTS.md §1.2 states the
serif is correct there, and the `h2` ink box matches the comp exactly at
desktop (211 × 54 in both), so the type scale itself is sound.

### F. "Map Your Success" is vertically tighter than the comp at every width

Relative to the section heading's ink top, at 1280:

| landmark | comp offset | live offset | delta |
| --- | ---: | ---: | ---: |
| rule above the steps | +133 | +115 | −18 |
| step markers ink top | +204 | +158 | −46 |
| step titles ink top | +336 | +255 | −81 |
| step body ink top | +377 | +297 | −80 |
| aerial image top | +553 | +431 | −122 |

Part of this is defect E (a larger marker pushes everything below it down), so
**fix E first, re-measure, and only then adjust the `mt-16`, `pt-7`, `mt-7` and
`mt-5` values in the steps block.** The same section is the largest single loss
at 800 and 375 too; re-measure all three after E.

### G. Residual page height

After A–F, re-measure the totals. Current state:

| width | comp | live | delta |
| ---: | ---: | ---: | ---: |
| 375 | 8833 | 8953 | **+120** |
| 800 | 8825 | 8450 | **−375** |
| 1280 | 7389 | 7135 | **−254** |

Defect A alone removes ≈ 280 at 375, ≈ 124 at 800 and ≈ 167 at 1280, so the
signs will move. **Do not chase the total as a number.** Close it by fixing
named sections against named comp landmarks, then record whatever residual
remains and why. A page that matches every landmark and is 20 px short is
finished; a page padded to 7389 by a one-off spacer is not.

The section rhythm itself is **not** a defect: `--spacing-section: 7.5rem` is
confirmed against the comps, whose image-to-image gaps measure 117–126 at all
three widths.

## What is deliberately out of scope

- **Copy.** No string changes. "Area" → "Acres" is already done and verified.
- **The comparison table, the chrome, the footer, and the 404.** The table's own
  geometry measures 597 tall at all three widths in both comp and build; the
  header ink matches at 19–68 / 20–67; the footer's final band measures 70 tall
  in both. None is touched.
- **New sections, new assets, new extraction.** Every asset this needs is
  already in `client/public/assets/ui/landing/`. No new `pdfimages` run.
- **The motion design.** Reveals, hovers and the `DUR`/`EASE` contract stay as
  `docs/motion.md` records them. The only motion-adjacent change is relocating
  `data-motion-hero-media` in step A, and it must keep the reduced-motion
  behaviour §9.3 rule 4 requires.
- **Anything in `server/` or `packages/shared/`.** This is a client-only change.
- **Tablet/mobile testimonial and tablet/desktop Big Picture ratios**, which
  measure correct and must be left alone.

## Breakpoint behaviour

Stated explicitly, per §5:

- **375** — container 343, gutter 16. Hero band 348 tall, wings 37, device 269
  wide × 417 visible, overhanging 70. Big Picture image 313 wide, not 343.
  Testimonial image full-container square. Benefits 1-up, steps in the
  horizontal scroller (which the comp also shows clipped at step 01).
- **800** — container 720, gutter 40. Hero band 348 tall, wings 22, device 676
  wide × 429 visible, overhanging 81. Benefits 2-up. Testimonial stacked,
  image 720 square.
- **1280** — container 1200, gutter 40. Hero band 348 tall, wings 147, device
  907 wide × 514 visible, overhanging 165. Benefits 4-up. Testimonial split
  592 / 70 / 538. Big Picture split unchanged.

## Reference deltas — knowingly not matching the comp

- **The hero band height is unified at 348** where the three comps measure
  347/349/349. A one-pixel per-breakpoint override would be noise, not fidelity.
- **The device is reproduced by `object-cover object-top` at a fixed height**,
  not by re-cropping the asset. The rendered result is pixel-equivalent and it
  keeps one asset per breakpoint.
- **"Area" stays "Acres"** in the testimonial and everywhere else, against the
  comp's own text (AGENTS.md §1.7).
- **Trusted-mark x positions** remain grid-derived rather than absolute comp
  positions — unchanged from `docs/landing.md`, and out of scope here.
- Any further delta discovered during execution is **recorded in `docs/landing.md`,
  not silently accepted** (§10 rule 9).

## Tokens

§9.1 rule 1 applies: the band height, the three wings and the three overhangs
are measurements, so they are **tokens in `@theme` in `client/app/globals.css`**,
not `h-[348px]` in the page. Add them next to `--radius-media` with a comment
naming this prompt and the comp rows they came from, and add the matching rows
to `docs/design-system.md` in the same change. Suggested names, to be confirmed
against the existing naming when writing them:

```
--spacing-hero-band: 21.75rem;    /* 348px — sage band height, all three widths */
--spacing-hero-wing-sm / -md / -lg
--spacing-hero-overhang-sm / -md / -lg
```

## Verification procedure — required, and it has a trap in it

### The trap

**A full-page screenshot of this site is blank below the fold unless
`prefers-reduced-motion: reduce` is emulated.** GSAP's reveal start states leave
the content at opacity 0, and ScrollTrigger reverses them when the capture
scrolls back to the top — the first capture in the measuring session produced a
375-wide image with a 3458-pixel empty gap in the middle. Emulate reduced motion
with `Emulation.setEmulatedMedia` before navigating. This belongs in
`docs/automation.md` §3 as part of this change.

Two further gotchas from the same session: `Page.captureScreenshot` stalls
silently on a full 8000+ px viewport, so capture in **2000 px strips** with
`clip` + `captureBeyondViewport` and `-append` them; and re-using one page target
across all three widths hung after the second navigation, so **open a fresh
target per width** and close it after.

### The steps

1. `npm run build` from the repository root, then `npx next start -p 3111` from
   `client/`. **Port 3100 was already occupied** by a stale server in the
   measuring session — check before binding.
2. Headless Chrome: `google-chrome-stable --headless=new --remote-debugging-port=9231
   --user-data-dir=/tmp/acres-chr2 --no-sandbox --no-first-run --hide-scrollbars
   --force-device-scale-factor=1`. **Do not `pkill -f` on a pattern that also
   matches your own shell command line** — it kills the shell (exit 144).
3. Per width in {375, 800, 1280}: fresh target → `Emulation.setEmulatedMedia`
   reduced-motion → `setDeviceMetricsOverride` → navigate → force every `img` to
   `loading="eager"` and scroll the full height → capture in strips → read the
   geometry via `Runtime.evaluate`.
4. Band-profile each stitched capture with the §"How every number" recipe and
   diff the image bands against the comp bands listed in this file.
5. Produce **side-by-side crops per section per width** (`magick … +append` for
   desktop, `-append` for the narrow widths) and read them. The band profile
   proves image geometry; only the crops prove the text-level layout. The
   benefits intro was flagged as a 148 px defect by the band profile and cleared
   by the crop — do not skip this step.
6. Re-run the ink-box checks that this file cites: the `01` marker (target
   64 × 57 at desktop), the desktop `h2` (211 × 54, must not move), and the
   desktop quote block.

### The checks (§6)

Run from the repository root and **quote the real output** (§10 rule 3):

- `npm run lint`
- `npm run typecheck`
- `npm run build`

There is no test runner for the client. Do not claim one ran.

## Where the result is recorded

- **`docs/landing.md`** — a new section for this pass: the hero band/device
  contract with its measured table, the testimonial split, the mobile Big
  Picture inset, the marker family fix, the before/after landmark table at all
  three widths, and the residual deltas that remain accepted. The existing
  "overall page is shorter than the comp at all widths" delta is **rewritten**,
  not left standing (§10 rule 8).
- **`docs/design-system.md`** — the new hero tokens, in the same change that
  adds them to `@theme`.
- **`docs/automation.md`** — the reduced-motion trap, the strip-capture pattern,
  the fresh-target-per-width rule, the `pkill` footgun, and the note that
  `-fuzz`-based colour isolation gave a false sage edge where direct pixel
  sampling gave the true one.
- **`AGENTS.md`** — at most the one index row §1.8 permits, and only if a new
  `docs/` file is created. None is expected.

## Expected impact

- `/` changes at all three widths. No route is added or removed.
- `client/app/page.tsx` — hero block, testimonial grid, Big Picture picture
  width, step marker class, steps rhythm.
- `client/app/globals.css` — new `@theme` tokens.
- No change to `client/components/acres/section.tsx` or `container.tsx`; the
  120 px rhythm and the container are both confirmed correct.
- No dependency change. No `next.config.ts` change.

## SKILLS USED

- `tailwind-4-docs` — every utility used for the new hero geometry (arbitrary
  values, `object-position`, absolute layering) is verified against v4, not v3
  memory.
- `tailwind-design-system` — the `@theme` token additions in §Tokens.
- `frontend-design` — the hero is the page's first impression; the rebuild is a
  visual decision, not only a numeric one.
- `web-design-guidelines` — the accessibility floor after the hero markup
  changes: the device image's `alt`, focus order, and the touch floor.
- `vercel-react-best-practices` — the hero must stay a Server Component; the
  only client boundary is the existing `LandingMotion` leaf.
- `gsap-react`, `gsap-scrolltrigger` — `data-motion-hero-media` moves to a new
  element; cleanup, the `matchMedia` conditions and the reduced-motion branch
  must survive it (§9.3).
- `shadcn` — only if a `client/components/ui/` primitive is touched. It is not
  expected to be.
- `requesting-code-review` — dispatch the reviewer subagent after self-verification (§2.1).
- `receiving-code-review` — evaluate the review with verification before acting (§2.1).
- `caveman-commit` — the commit message (§3, §7).
