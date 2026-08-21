# Acres — design system

**This file is the measured record.** Every number below was taken from the four
reference files in AGENTS.md §0 during the execution of
`prompts/01-design-system.md`, and every one names the crop that produced it.
Nothing here is recalled and nothing is invented to fill a gap. Where a crop
could not separate two candidate values, the observed range is recorded as the
measurement and the shipped value is labelled a **judgement** (AGENTS.md §10
rule 4).

The tokens this file describes live in the `@theme` block of `client/app/globals.css`.
**That block and this file are one change**: a value that appears in one and not
the other is a defect.

---

## 0. How the measurements were taken

The board was rendered 1:1 with `pdftoppm -png -r 72` to a **1260 × 8083**
bitmap (`pdfinfo` reports one page at 1260 × 8082.33 pt, so one point is one
pixel). It emitted `Syntax Warning: Bad bounding box in Type 3 glyph` eighteen
times, which is expected — the board's text is outlined as Type 3, which is also
why `pdffonts` names nothing.

The three comps were confirmed with `magick identify`:

```
Desktop.png  PNG 1280x7389
Tablet.png   PNG  800x8825
Mobile.png   PNG  375x8833
```

Three techniques produced everything below.

**Colour** — the dominant non-background entry of a histogram over a patch, never
a single pixel, because every glyph and every rounded edge is antialiased:

```bash
magick <ref>.png -crop WxH+X+Y +repage -format %c histogram:info: | sort -rn | head -3
```

For thin text the histogram's dominant entry is a blend, so the **darkest pixel**
in the run was taken instead — for a run of any length, at least one pixel
reaches full coverage. That is how the eyebrows and the footer's monospace were
resolved.

**Geometry** — a boolean ink mask against the surface colour, reduced to per-row
spans. A shape's corner radius is read two ways that must agree: the horizontal
inset at the shape's first row, and the number of rows it takes to reach full
width. Both equal the radius for a circular corner.

**Type** — the identification method of AGENTS.md §1.2, extended to solve for
size and tracking. For each candidate the string is rendered from the real font
file at **8× supersampling** (`-density 576`), box-downsampled to 1×, aligned
against the comp crop over a sub-pixel shift search, and scored as normalised
absolute difference. The comp crop is divided by the run's measured ink colour
first, so that grey text is compared on shape rather than on intensity — without
that normalisation every grey run scored ≈ 0.5 and weights were indistinguishable.
Tracking is solved analytically from the target ink width, then swept around the
solution.

The method was validated against a value AGENTS.md §1.2 already records
independently: the hero. It returns **Crimson Text Regular, 160 px, −8 px**, at a
diff of **0.061** against 0.137 for the next candidate, and the rendered `B`
measures 82 × 104 against the comp's 82 × 104.

Fonts were fetched from `google/fonts` (`ofl/crimsontext`, `ofl/dmsans`,
`ofl/robotomono`) and the two variable faces instanced with
`fontTools.varLib.instancer` at each candidate weight. **DM Sans instances were
generated at an optical size matching the run's font size**, because CSS
`font-optical-sizing` defaults to `auto` and the browser will set `opsz` from
`font-size`. This mattered: at `opsz` 14 the wordmark scored 0.094 and the weight
was ambiguous; at `opsz` 30 it scored **0.026** and the weight was decided.

---

## 1. Palette

### 1.1 The seven swatches

Measured from the board's swatch row, seven 100 px circles centred at y ≈ 1035,
sampled 40 × 40 at each centre (`ds-1.png -crop 40x40+{51,171,291,411,531,651,771}+1015`).
Every patch returned **1600 identical pixels** — a flat, unambiguous read.

| hex | swatch | confirms AGENTS.md §1.1 |
| --- | --- | --- |
| `#000000` | 1 | yes |
| `#929292` | 2 | yes |
| `#E9E9E9` | 3 | yes |
| `#FFFFFF` | 4 | yes |
| `#DFECC6` | 5 | yes |
| `#8E9C78` | 6 | yes |
| `#485C11` | 7 | yes |

**All seven values in AGENTS.md §1.1 are confirmed exactly.** This step did not
assume them; it re-derived them.

The board's own ground is `#EDF4F1` (`ds-1.png -crop 200x60+900+1000`, 12000
identical pixels). It is the Figma canvas. **It is not a product surface and it
does not appear in `@theme`.**

### 1.2 The palette in use on `Desktop.png`

| element | crop | measured |
| --- | --- | --- |
| page canvas | everywhere | `#FFFFFF` |
| primary pill fill | `120x44+1115+22` | `#485C11` |
| primary pill label | inside the pill | `#FFFFFF` |
| secondary pill fill | `120x40+580+3680` | `#DFECC6` |
| secondary pill label | inside the pill | `#000000` |
| sage band behind the hero device | rows 524–885, cols 40–1239 | `#8E9C78` |
| hairline above a feature cell | row 1483, cols 40–1239 | `#E9E9E9` (exact, whole-pixel) |
| comparison-card border | row 3900 at x 40 and x 439 | `#E9E9E9` |
| headings, wordmark, footer links | darkest pixel | `#000000` |
| body copy, "Trusted by:", competitor table columns | darkest pixel of three separate runs | `#6F6F6F` |
| every eyebrow, every footer monospace line | darkest pixel | `#485C11` |
| `01` / `02` / `03` step markers | darkest pixel | `#929292` |
| strong section rule above `Specs` | row 3364, cols 40–1239 | `#929292` (exact, whole-pixel) |
| inactive icon-button fill (board only) | `12x12+46+2162` | `#E4E4E4` |
| active icon-button fill (board only) | `12x12+106+2162` | `#DFECC6` |

**On the hairlines.** Most 1 px rules on the comps do not read as `#E9E9E9`
because they land on a sub-pixel boundary and split across two rows. Rows 5316 and
5317 measure `#F2F2F2` and `#F6F6F6`; their combined ink is `13 + 9 = 22`, which
is exactly the ink of one row of `#E9E9E9` on white. Rows 7118/7119 do the same
(`8 + 14 = 22`). Row 1483 lands on a whole pixel and reads `#E9E9E9` exactly.
**The rule is `#E9E9E9`, 1 px; the pale readings are a rendering artefact of the
comp, not a second colour.**

### 1.3 The three colour questions, closed

**1. `#929292` has a shipped role — two of them.** AGENTS.md §1.1 records its use
as unresolved. It is not:

- the `01` / `02` / `03` step markers of the "Map Your Success" section are
  `#929292` at full strength (darkest pixel of the 80 px numerals, rows
  5600–5658);
- the rule at row 3364, which separates the testimonial-facing half of the page
  from the `Specs` section, is `#929292` at full strength across the whole
  container. It is visibly darker than the `#E9E9E9` hairlines above and below
  it, and it is the only rule on the page that is.

So the page carries **two rule weights**: a hairline `#E9E9E9` for structure
inside a section, and a `#929292` rule for a major division. Both are tokens.

**2. Body copy is `#6F6F6F`, confirmed on more than three runs** — the benefits
sub-line (row 1377), the four feature-card bodies (rows 1610–1691), the centred
"Why Choose Acres?" paragraph (rows 3600–3635), "Trusted by:" (row 941), and the
competitor columns of the comparison table. `#929292` is **not** body copy.

**3. `#EDF4F1` is dropped**, as `prompts/01-design-system.md` planned. It is the
Figma board's ground.

### 1.4 Contrast

Computed against the WCAG 2 relative-luminance formula for every text-on-surface
pair that ships.

| pair | ratio | verdict |
| --- | --- | --- |
| `#000000` on `#FFFFFF` | 21.00 : 1 | pass |
| `#6F6F6F` on `#FFFFFF` | **5.02 : 1** | **pass AA** — body copy clears 4.5 : 1 without adjustment |
| `#485C11` on `#FFFFFF` | 7.46 : 1 | pass AAA |
| `#FFFFFF` on `#485C11` | 7.46 : 1 | pass AAA |
| `#000000` on `#DFECC6` | 16.95 : 1 | pass |
| `#485C11` on `#DFECC6` | 6.02 : 1 | pass AA |
| `#929292` on `#FFFFFF` | 3.11 : 1 | **fails AA for body text; clears 3 : 1 for large text** |
| `#FFFFFF` on `#8E9C78` | **2.93 : 1** | **fails — see below** |

**Two findings, reported rather than silently fixed (AGENTS.md §10 rule 9):**

- **The button hover state fails contrast.** AGENTS.md §1.5 records that both
  pill variants hover to sage `#8E9C78` with a white label. White on sage is
  **2.93 : 1** — below AA's 4.5 : 1 for body text and below even the 3 : 1
  large-text floor. The board states this treatment and this step ships the
  tokens for it unchanged, because changing the brand's stated hover is the
  user's call, not this step's. **Step 2 must not ship the hover as-is without a
  decision.** The cheapest fix that keeps the board's colour is a `#000000`
  label on sage hover (7.16 : 1); the alternative is a darker hover fill.
  **Closed in step 2**, at the approval gate: the fill stays exactly `#8E9C78`
  and the label goes black. `docs/components.md` §5, delta 1.
- **`#929292` is only safe at large sizes.** Its two shipped uses are the 80 px
  step numerals (large text, 3.11 : 1, passes) and a 1 px rule (not text). It
  must not be used for body copy, and the token is named to discourage that.

`#6F6F6F` needed computing rather than assuming, as `prompts/01-design-system.md`
required — it clears the floor, so the "body-copy grey may be darkened" deviation
that prompt listed **did not need to be taken**.

---

## 2. Type

### 2.1 The three families

Identified in AGENTS.md §1.2 and not re-litigated here. All three come through
`next/font/google`; all three were verified in
`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` this
session:

| family | role | next/font facts |
| --- | --- | --- |
| **Crimson Text** | display and naming | weights `400`, `600`, `700`; styles normal + italic; **not variable, so a `weight` array is required** |
| **DM Sans** | body and UI | variable; axes `opsz` 9–40 (default 14) and `wght` 100–1000 |
| **Roboto Mono** | labels and data | variable; axis `wght` 100–700 |

**Only Regular (400) of Crimson Text is used anywhere on the comps.** Every serif
run measured — hero, all five section headings, the pull-quote, the feature-card
headings, the numbered-step headings — fits Crimson Text Regular and is beaten
decisively by SemiBold and Bold. `client/app/layout.tsx` therefore loads `weight: ["400"]`
only. Adding 600 or 700 later is a change to this file first.

**`opsz` is not pinned.** `font-optical-sizing` defaults to `auto`, so the browser
drives `opsz` from `font-size`, which is what the comps show — matching `opsz` to
size is what made the wordmark identification decisive (§0). Pinning `axes: ["opsz"]`
to one value would freeze that and make small text and the wordmark render from
the same optical master. If a future comp disagrees, this line is what changes.

### 2.2 The ladder on the board

The board's `Text Styles` block (rows 90–640 of `ds-1.png`) is **seven styles,
not three**, read top to bottom:

1. a very large serif `Header`
2. a mid serif line
3. a smaller serif line
4. `Key point here` — **serif, small**
5. a two-line grey sans paragraph
6. `Labels` — monospace, green
7. `UI Text` — sans, black

> **Correction to `prompts/01-design-system.md`.** That prompt's map of the board
> calls style 4 "a small bold sans `Key point here`". It is **serif** — Crimson
> Text at a small size, and it is the style the feature-card and numbered-step
> headings use on the page. The prompt's own body text gets this right
> ("Do not lose the small serif either"); its board map does not.

### 2.3 The measured scale

Each row is a fitted overlay against a named crop of `Desktop.png` unless stated.
`diff` is the normalised overlay difference of the winning candidate; `next` is
the runner-up, and the gap between them is what makes the row a measurement
rather than a guess.

| role | family / weight | 1280 | 800 | 375 | tracking | line-height | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **display** (hero) | Crimson Text 400 | **160** | **140** | **76** | **−0.05em** (−8 / −7 / −3.5 px) | 0.80 at 800, 0.85 at 375 | diff 0.061 / 0.019 / 0.053, each ≥ 2× the next |
| **h2** (section heading) | Crimson Text 400 | **60** | **52** | **50** | **−0.029em** (−1.75 px at 60) | **0.95** | joint fit over five desktop headings: mean 0.136 against 0.227 for the next |
| **quote** (pull-quote) | Crimson Text 400 | **38** | n/m | n/m | −0.02em (−0.75 px) | **1.105** (42 px, measured from band pitch) | diff 0.337 |
| **h3** (card / step heading) | Crimson Text 400 | **18** | 18 | **18** | −0.028em (−0.5 px) | n/m | 0.209 / 0.219 against 0.416 |
| **stat** (`01` `02` `03`) | DM Sans 400 | **80** | **80** | **64** | −0.0375em (−3 px) | 1 | **diff 0.026** against 0.046; the 800 and 375 cells were `n/m` and were closed in `docs/landing.md` §5 from the ink of `01` — 64 × 57 at 1280 and 800, **51 × 46** at 375 |
| **wordmark** | DM Sans 500 | **30** | **30** | **30** | −0.05em (−1.5 px) | n/m | **diff 0.026** against 0.129 |
| **title** (table column head) | DM Sans 500 | **26** (24–26) | n/m | n/m | −2 px | n/m | diff 0.119 against 0.193 |
| **ui** (nav link, button label) | DM Sans 600 | **14** | **14** | n/m | −0.018em (−0.25 px) | n/m | 0.170 / 0.264 against 0.178 / 0.422 |
| **body** | DM Sans 500 | **15** | **15** | **15** | −0.017em (−0.25 px) | **1.4** (21 px, measured from band pitch) | 0.244 / 0.257 / 0.228 against 0.718 / 0.596 / 0.602 |
| **label** (monospace) | Roboto Mono 400 | **12** | **11** | **11** | **0** | n/m | see §2.5 |

`n/m` = not measured at that width; the comp either does not carry the style
there or does not carry it in a form that isolates. **Those cells are gaps, not
"same as desktop"** — step 4 measures them if it needs them.

### 2.4 What the scale says

- **Body copy does not scale.** 15 px at 1280, 800 and 375, at the same weight and
  the same tracking. So does the wordmark: 71 × 22 ink at 1280 and at 800,
  68 × 22 at 375. AGENTS.md §1.3 puts the wordmark's ink height at 21 px; the
  measurement is **22 px** at all three widths, and the claim that it does not
  scale is confirmed.
- **Only the two serif display roles scale**, and the hero scales much harder than
  the section headings: 160 → 140 → 76 against 60 → 52 → 50.
- **Negative tracking is the identity, and it is proportional.** The hero holds
  −0.05em at all three widths. The wordmark holds −0.05em. Every other role sits
  between −0.017em and −0.077em. **Nothing on the page is set at
  `tracking-normal` except the monospace**, which is set at exactly zero.
- **The serif is not a display face here.** It sets the 18 px feature-card
  headings and the 18 px numbered-step headings, at the same weight as the 160 px
  hero.

### 2.5 The monospace is one style at one size

Every monospace run on `Desktop.png` measures the same. Because Roboto Mono's
advance is exactly **0.600 em** (read from `hmtx`/`head` of the font file), the
size follows directly from the glyph pitch, which is a far stronger measurement
than an overlay fit at 12 px:

| run | crop | measured pitch | implied size |
| --- | --- | --- | --- |
| eyebrow `Benefits` | `55x11+41+1204` | 7.00 px | 11.67 |
| table cell `Ultra-fast browsing` | `140x13+92+3956` | 7.10 px | 11.83 |
| `Head of Data` | `90x10+700+5043` | 7.00 px | 11.67 |
| `All Rights Reserved` | `140x13+1105+7335` | 7.08 px | 11.81 |

**Measurement: 11.67–11.83 px at zero tracking. Shipped value: 12 px — a
judgement** on that range, because 11.8 is not a design number and 12 is the
value a 0.600 em advance of 7.2 px would produce (measured 7.00–7.10; the
shortfall is one tenth of a pixel per cell, within the comp's rasterisation).

At 800 and 375 the same runs measure **11 px** (`Benefits` fits Roboto Mono at 11
with diffs 0.277 and 0.303). The eyebrow is the one label that steps down.

**The monospace carries the identity and it is used everywhere AGENTS.md §1.2
says it is**: both eyebrows (`Benefits`, `Specs`), every comparison-table cell,
`Head of Data`, and both footer lines (`© Area. 2025`, `All Rights Reserved`).
All of them are `#485C11`.

### 2.6 A correction to AGENTS.md §1.2

> **The comparison table's column headers are not serif.** AGENTS.md §1.2 lists
> "the comparison table's column headers (`Acres`, `WebSurge`, `HyperView`)"
> among the small serif's uses. A 250 % crop of `Desktop.png -crop 540x40+200+3862`
> shows unambiguously geometric sans letterforms, and the overlay fit agrees:
> `Acres` fits **DM Sans 500 at 26 px** with a diff of **0.119**, against 0.694
> for the best Crimson Text candidate. The AGENTS.md line is stale and is fixed
> in this change (§10 rule 8).
>
> Everything else that line claims is confirmed: the feature-card headings and the
> numbered-step headings **are** small Crimson Text.

---

## 3. Space, the container and the grid

### 3.1 The container

Measured from the full-container 1 px rules, which are crisp rectangles and carry
no side bearing — unlike text, whose ink edge is inset by the glyph's own
sidebearing.

| comp | width | gutter | container | evidence |
| --- | --- | --- | --- | --- |
| `Mobile.png` | 375 | **16** | **343** | rule at row 1168 runs `#F4F4F4` from x 16 to x 358 with pure white at 15 and 359 |
| `Tablet.png` | 800 | 40 | 720 | rule at row 1208 runs x 40 to x 759 |
| `Desktop.png` | 1280 | 40 | 1200 | rule at row 1121 runs x 40 to x 1239 |

> **Correction to AGENTS.md §1.3.** That table gives Mobile as **375 / 20 / 335**.
> The measurement is **375 / 16 / 343**, confirmed independently by the mobile
> photographs and the device band, which all span x 16–358. The AGENTS.md row is
> stale and is fixed in this change.

The container is therefore **`min(100vw − 2 × gutter, 1200px)`** — 1280 − 80 = 1200,
800 − 80 = 720, 375 − 32 = 343 — with the gutter stepping 16 → 40. It is not a
set of fixed widths.

**Full-bleed-looking photographs are inset to the container**, exactly as
AGENTS.md §1.3 says: every one measured spans the container's columns and carries
a corner radius. None reaches the viewport edge.

### 3.2 The grid

| comp | columns | column width | gap | evidence |
| --- | --- | --- | --- | --- |
| 1280 | **4** | 285 | **20** | the four hairlines at row 1483 run 40–324, 345–629, 650–934, 955–1239 |
| 800 | **2** | 350 | **20** | the two hairlines at row 1563 run 40–389, 410–759 |
| 375 | **1** | 343 | — | one hairline per cell, each spanning 16–358 |

**4 → 2 → 1 confirmed, with a 20 px gap at both multi-column widths.** The other
grids on the page use the same 20 px gap: the "See the Big Picture" section is
2 × 590, and the numbered-steps section is 3 × 387 (hairlines at rows 5530–5531).

### 3.3 Vertical rhythm

Measured rectangle-edge to rectangle-edge, which is a real CSS distance. Ink-to-ink
gaps between *text* bands are **not** reported as spacing, because ascender and
descender whitespace inflates them by an amount that depends on which letters the
line happens to contain.

| gap | value |
| --- | --- |
| photograph bottom 2412 → next section's hairline 2533 | **120** |
| photograph bottom 3243 → section rule 3364 | **120** |
| comparison card bottom 4406 → hairline 4527 | **120** |
| testimonial bottom 5196 → hairline 5316 | **119** |
| CTA pill bottom 6998 → footer rule 7118 | **119** |

**The gap between major sections is 120 px**, and the same 119–121 recurs at 800
and 375 — like body copy and the pill, **section rhythm does not scale**.

Below that, the recurring value is **40**, which appears seven times in the
Tablet band profile and twice each in Desktop and Mobile. Together with the 20 px
grid gap and the 24 px radius, **every structural value on the page is a multiple
of 4**, which is Tailwind 4's default `--spacing`. **No custom spacing scale is
defined**, because `spacing-5` (20), `spacing-10` (40) and `spacing-30` (120)
already produce them and inventing a parallel scale would give every value two
names.

**Honest limit.** The full set of inter-band gaps does **not** quantise onto one
step — the Desktop profile alone contains 39, 40, 41, 45, 51, 52, 53, 55, 56, 63,
68, 70, 73, 75, 78, 82, 83, 87, 91, 100, 101, 119, 120, 124 and 141. Most of that
spread is the ascender/descender inflation above. The two values that survive as
real, rectangle-measured rhythm are **120** and **40**, and this file claims only
those.

---

## 4. Shape

### 4.1 The radii

To measure a radius, the shape's ink mask is scanned from its first row: the
horizontal inset at row 0 and the number of rows taken to reach full width both
equal the radius for a circular corner. Both are reported; where they agree, the
radius is a measurement.

| shape | inset at first row | rows to full width | radius | evidence |
| --- | --- | --- | --- | --- |
| photograph (1280) | 23 | 23 | **24** | rows 1793–1816 and 5950–5973 |
| photograph (800) | 22 | 24 | **24** | rows 2101–2125 |
| photograph (375) | 25–26 | 24 | **24** | rows 2581–2605 |
| sage device band (1280) | 23 | 23 | **24** | rows 524–547, top and bottom corners, left and right |
| comparison-table card | 14 | 14 | **14** | rows 3825–3839 |
| icon button (board) | 7 | 7 | **8** (7–8) | `ds-1.png` rows 2156–2163, on a 40 × 40 box |
| pill | — | — | **height ÷ 2** | see §4.2 |

**The media radius is 24 px at all three breakpoints.** It does not scale — the
same fact as the wordmark, the pill and the section rhythm.

> **Correction to AGENTS.md §1.4.** That section states "two radii and nothing
> between them", and puts the icon button at "roughly a 12 px radius on a 40 px
> box". `prompts/01-design-system.md` made testing that claim an explicit goal.
> **It does not hold.** Three distinct non-pill radii are measured — **8** (icon
> button), **14** (card) and **24** (media) — and the icon button's is 7–8, not
> 12. The AGENTS.md lines are stale and are fixed in this change.
>
> What survives of §1.4 is its real point, and it is confirmed: **nothing in the
> comps is square-cornered.**

### 4.2 The pill

| comp | measured fill height | crop |
| --- | --- | --- |
| 1280 | 48 | primary pill rows 20–67 |
| 800 | 47–48 | rows 20–67, 3358–3404, 4644–4690, 6822–6868, 8387–8433 |
| 375 | 47 | rows 4010–4056, 4945–4991, 6859–6905, 8321–8367 |

**48 px at every breakpoint** (the 47s are the flat-fill extent, one row short at
each end because the top and bottom rows are antialiased). Confirms AGENTS.md
§1.4, and adds that it does not scale.

The radius is **half the height** — a true pill. Never a fixed `rounded-xl`.
Desktop label padding measures 21–23 px on each side (primary label ink
1136–1216 inside a pill spanning 1115–1242; secondary label 594–686 inside
571–708).

### 4.3 Elevation

The comps hide almost all of it, because both elevated surfaces are white on a
white page. Two measurements exist:

- **The mobile nav card.** Rows 60–83 of `Mobile.png`, the only place a shadow is
  separable. Peak darkening is `#F5F5F5` at row 78 — **10/255, about 4 %** — with
  the falloff reaching white by row 83 and the card's own bottom edge at row 77.
  The card's bottom corners round; the shadow wraps them.
- **The comparison-table card.** Row 4100 to the right of the border at x 439
  reads `F7 F8 FA FC FD FE` over six pixels — peak **8/255, about 3 %**.

**Measurement: a shadow whose peak alpha is 3–4 % black, with a blur of roughly
6 px laterally and up to 16 px below. Shipped value: `0 4px 16px rgb(0 0 0 /
0.05)` — a judgement** fitted to those two profiles. The comps cannot separate
offset from blur, and no third elevated surface exists to check it against.

**There is exactly one elevation.** No second, heavier shadow appears anywhere on
the board or on the three comps.

---

## 5. Motion

**Nothing here is measured. The references are static images and contain no
timing information at all.** Every value in this section is a **judgement**,
recorded as one so that step 5 inherits a decision rather than an assumption
(`prompts/01-design-system.md`, "Procedure — motion").

The reasoning: AGENTS.md §8 fixes the register as "measured and concrete… plain
and declarative. Never campaigning, never startup-cheerful." That argues for
short durations and a gentle deceleration — motion that settles rather than
motion that performs. No bounce, no overshoot, no spring.

| token | value | what it is for |
| --- | --- | --- |
| `--duration-fast` | `150ms` | hover and focus state changes |
| `--duration-base` | `300ms` | the default — reveals, fades, most transitions |
| `--duration-slow` | `600ms` | the hero's entrance and any orchestrated sequence |
| `--ease-acres` | `cubic-bezier(0.22, 1, 0.36, 1)` | every tween; a strong ease-out that decelerates into rest |

**One easing, three durations, and no more.** Step 5's GSAP `DUR` and `EASE`
constants read these tokens and are defined once (AGENTS.md §9.3 rule 1). A call
site that restates a duration is a defect.

**Where they live differs, and that is deliberate.** `--ease-acres` is in `@theme`
because `--ease-*` is a real Tailwind 4 namespace and it generates an
`ease-acres` utility. **Tailwind 4 has no `--duration-*` namespace** — verified
against `https://tailwindcss.com/docs/theme` fetched this session — so the three
durations are plain custom properties on `:root`. Read them with
`duration-[var(--duration-base)]`, from CSS, or directly from GSAP. Putting them
in `@theme` would emit them but generate nothing, and would imply a utility that
does not exist.

---

## 6. Icons

**Decision, taken with the user before this step:** the icon set is **Material
Symbols**, delivered as individual SVGs through `@material-symbols/svg-400`, and
`lucide-react` stays installed for anything the board does not specify.
`client/components.json`'s `"iconLibrary": "lucide"` stays as it is, because it governs
what the shadcn CLI generates, not what we author. This closes the disagreement
AGENTS.md §1.6 records as open.

**Nothing is installed in this step and no `Icon` component is built** — that is
step 2. What step 1 owes is the glyph list and the size.

The board's icon row (`ds-1.png -crop 700x110+0+1270`) carries **eight glyphs**,
all **filled** — which is why substituting Lucide's stroked set was rejected:

| # | reading | Material Symbols name |
| --- | --- | --- |
| 1 | two slanted, stacked rounded bars | **unidentified** — see below |
| 2 | check | `check` |
| 3 | cross | `close` |
| 4 | zigzag trend line | `show_chart` |
| 5 | person with sound waves | `record_voice_over` |
| 6 | filled globe | `public` |
| 7 | classical building | `account_balance` |
| 8 | artist's palette | `palette` |

**Glyph 1 is not identified, and it is not guessed** (AGENTS.md §10 rule 7 and
§10 rule 9). It is the icon the "Amplify Insights" feature card uses on all three
comps. Step 2 must either identify it against the installed package's own glyph
set or raise it with the user; **it must not ship the nearest-looking substitute
silently.**

**Icon size is 24 px and it does not scale.** Measured ink is 20–22 px at all
three widths (`Desktop.png` feature-card icons at rows 1525–1544, `Tablet.png` at
1606, `Mobile.png` at 1592), which is exactly what a Material Symbol drawn on a
24 px grid produces. The mobile nav's `menu` glyph measures 18 × 13 ink in the
same 24 px box.

---

## 7. The tokens

Written into the `@theme` block of `client/app/globals.css`. Two rules govern the shape
of that block:

**Colours are written as hex, not OKLCH.** Every value in §1 was *measured as an
sRGB pixel*. Converting to OKLCH would put a lossy transform between the
measurement and the token for no gain — Tailwind 4 accepts any CSS colour, and
`#485C11` is checkable against this file at a glance in a way `oklch(0.42 0.09 122)`
is not. The stock shadcn OKLCH values that this step replaces were never
measurements.

**Names come from the design system, and shadcn's names are rebound rather than
overridden** (AGENTS.md §9.1 rule 3). All 61 primitives in `client/components/ui/` read
`--primary`, `--secondary`, `--muted`, `--border` and the `--radius-*` ladder.
Every one of those names is given an Acres value. **No file in `client/components/ui/`
is edited.**

### 7.1 The radius ladder

`client/components/ui/button.tsx` reads `--radius-md` and `--radius-lg` directly
(`rounded-lg`, `rounded-[min(var(--radius-md),12px)]`), and `client/app/globals.css`
derives the whole `sm → 4xl` ladder from `--radius` by `calc()`. **The ladder is
kept and `--radius` is rebound to `0.875rem` (14 px)** — the measured card
radius. That choice is not arbitrary: it lands the derived ladder on the measured
values almost exactly.

| rung | multiplier | derived | measured shape |
| --- | --- | --- | --- |
| `--radius-sm` | × 0.6 | 8.4 px | icon button, **8** |
| `--radius-md` | × 0.8 | 11.2 px | — |
| `--radius-lg` | × 1.0 | **14 px** | comparison card, **14** |
| `--radius-xl` | × 1.4 | 19.6 px | — |
| `--radius-2xl` | × 1.8 | 25.2 px | photograph / sage band, **24** |

Named Acres radii are added **alongside** the ladder so our own components never
have to know which rung means what:

- `--radius-control: 8px` — icon buttons
- `--radius-card: 14px` — the comparison card and any bordered surface
- `--radius-media: 24px` — photographs, the sage band, device frames

Pills use `rounded-full`, never a rung.

### 7.2 The hover token

AGENTS.md §1.5 records that **both** pill variants hover to the same sage. The
installed `Button` does not do that: its `default` variant hovers to
`bg-primary/80` and its `secondary` to
`bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]`. Neither
produces `#8E9C78` from its base.

So this step ships a named token, **`--color-hover: #8E9C78`**, and records here
that **step 2's `Button` overrides both hover rules rather than inheriting them**.
Naming it now is what stops step 2 inlining a hex (§9.1 rule 1). See §1.4 for the
contrast finding that step 2 must resolve at the same time.

### 7.3 Breakpoints

**The comps cannot resolve where the layout switches, and this file does not
pretend otherwise.** Three renderings at 375, 800 and 1280 say what the layout is
*at* those widths and nothing about the widths between them.

What is measured is that **two things change together** between 375 and 800: the
gutter steps 16 → 40, and the nav changes from a shadowed card with a `menu`
button to the full horizontal bar (`Tablet.png` rows 0–100 carry the same
wordmark, four links and primary pill as `Desktop.png`). One breakpoint, not two.

**Judgement: use Tailwind's default `md` (48rem / 768px). No custom breakpoint is
added.** A custom breakpoint at exactly 800 would be reading a design decision out
of a rendering width — 800 is where the comp was exported, not a stated
threshold — and 768 sits inside the measured 376–800 window. If a later comp
names a real value, this is the line that changes.

The container needs no breakpoint of its own: `min(100vw − 2 × gutter, 1200px)`
caps itself.

### 7.4 Primitive geometry — added by step 2

Six `--spacing-*` tokens were added when the primitives needed values that had no
token. Each is measured; the measurement and the crop are in
`docs/components.md` §2, and the rule that put them here rather than inline is
AGENTS.md §9.1 rule 1.

| token | value | what it is |
| --- | --- | --- |
| `--spacing-pill-x` | `1.375rem` (22 px) | pill side padding, both variants. The board measures **23** to the label's *ink*; DM Sans carries a 1 px left side bearing on `L`, so 22 of CSS padding lands the ink at 23 and the fill at the measured 117 / 126 |
| `--spacing-pill-gap` | `0.1875rem` (3 px) | label → arrow gap on the primary |
| `--spacing-arrow` | `0.375rem` (6 px) | the ↗, sized by its **ink**. `<Icon>` crops the glyph's viewBox to its ink box so the drawn mark and the laid-out box are the same 6 px |
| `--spacing-icon` | `1.5rem` (24 px) | every Material Symbol, at every breakpoint (§6) |
| `--spacing-target` | `2.75rem` (44 px) | the touch floor of AGENTS.md §9.4 rule 5 |
| `--spacing-section` | `7.5rem` (120 px) | the section rhythm of §3.3, applied as top padding only |

**Adding a token to `@theme` now means adding its name to `client/lib/utils.ts` too.**
`cn()` is built with `extendTailwindMerge`, and a token `tailwind-merge` has not
been told about fails **silently** — `docs/components.md` §4.4 records the two
components that were measurably wrong before it was configured.

### 7.4b Landing geometry — added by the responsive fidelity pass

Fifteen `--spacing-*` tokens and one `--text-*` role, added by
`prompts/11-responsive-comp-fidelity.md`. Each is measured on the comps; the
measurement, the crop and the live result are in `docs/landing.md`
§"Responsive Comp Fidelity Pass". They are tokens rather than inline values for
the reason AGENTS.md §9.1 rule 1 gives — and, as §7.4 above warns, each one is
also registered in `client/lib/utils.ts`, because a token `tailwind-merge` has
not been told about fails silently.

**The hero band.** The comps draw one constant band height at every width, with
the device overhanging its top edge and clipped at its bottom. Only the wing —
the container-to-device inset — and the overhang change.

| token | value | what it is |
| --- | --- | --- |
| `--spacing-hero-band` | `21.75rem` (348 px) | the sage band's height, **all three widths**. The comps measure 347 / 349 / 349; the ±1 is rounding |
| `--spacing-hero-wing-sm` | `2.3125rem` (37 px) | container → device inset at 375. `343 − 2·37 = 269`, the measured device width |
| `--spacing-hero-wing-md` | `1.375rem` (22 px) | at 800. `720 − 44 = 676` |
| `--spacing-hero-wing-lg` | `9.1875rem` (147 px) | at 1280. `1200 − 294 = 906`, against a measured 907 |
| `--spacing-hero-overhang-sm` | `4.375rem` (70 px) | how far the device paints above the band's top edge at 375 |
| `--spacing-hero-overhang-md` | `5.0625rem` (81 px) | at 800 |
| `--spacing-hero-overhang-lg` | `10.3125rem` (165 px) | at 1280 |
| `--spacing-hero-device-sm/-md/-lg` | `calc(overhang + band)` | the device's own box — 418 / 429 / 513, against a measured 417 / 429 / 514. **Derived, not restated**, so the two measurements above stay the single source |
| `--spacing-hero-gap-sm` | `4.25rem` (68 px) | `h1` box bottom → device top at 375 |
| `--spacing-hero-gap-md` | `4.5625rem` (73 px) | at 800 |
| `--spacing-hero-gap-lg` | `5.8125rem` (93 px) | at 1280 |

**Why the gap is a token and not a step on the scale.** The comp measures the
gap from the `h1`'s *ink* bottom — 59 / 57 / 74 — but CSS lays out from the box
bottom, and the three `--text-hero*` line heights (0.85 / 0.8 / 0.8) each
overshoot the ink by a different amount. The three values above are the
box-bottom equivalents, and they land the device on the comp's 315 / 445 / 373
exactly.

**Two landing-section measurements.**

| token | value | what it is |
| --- | --- | --- |
| `--spacing-quote-gap` | `4.375rem` (70 px) | the desktop testimonial's column gap. `Desktop.png` splits the 1200 container **592 / 70 / 538** — the image ends at x 630, the quote starts at x 700 |
| `--spacing-media-inset-sm` | `0.9375rem` (15 px) | `Mobile.png` insets the "See the Big Picture" photograph inside the 343 container, x 31–343 → **313 wide**, rather than bleeding it to the gutters |

**The stat role gains a breakpoint.** §2.3's stat row read `n/m` at 800 and 375.
Measured, the ink of `01` is 64 × 57 at both 1280 and 800 but **51 × 46** at 375,
so:

| token | value | what it is |
| --- | --- | --- |
| `--text-stat` | `4rem` (64 px) | the `01`/`02`/`03` markers at **375** |
| `--text-stat-md` | `5rem` (80 px) | the same markers from **800** up |

The bare name is the mobile value, matching the `--text-hero` / `-md` / `-lg`
convention. `--text-stat` previously held 80 px unconditionally; that was the
desktop measurement applied at every width, and the page also rendered it
`font-serif` against this file's own DM Sans identification. Both are fixed —
`docs/landing.md` §5.

**This makes the stat the one non-serif role that scales**, against AGENTS.md
§1.3's "only the two serif display roles scale". The measurement is the fact and
§1.3 is stale on that clause (AGENTS.md §10 rule 8).

### 7.5 The global focus ring

`client/app/globals.css`'s `@layer base` rule changed from `outline-ring/50` to
`outline-ring`. The 50 % mix is inherited `create-next-app`/shadcn scaffolding,
and measured in the browser it beat every `focus-visible:outline-*` a component
could set. `#485C11` at 50 % over white is about **2.2 : 1**, under the 3 : 1
floor a focus indicator has to clear; at full opacity it is **7.46 : 1** (§1.4).

### 7.6 `--text-wordmark` (renamed from `--text-brand`) — closed in step 3

`--text-brand: 1.875rem` (the 30 px wordmark, §2.3) and `--color-brand: #485C11`
(§1.1) collided on the class name `text-brand`, which Tailwind resolved to the
color token. In step 3, the type token was renamed to `--text-wordmark` in
`client/app/globals.css`, `docs/design-system.md` and `client/lib/utils.ts` together, making
`text-wordmark` unambiguous and fully reachable.

### 7.7 Dark mode

**Acres has no designed dark theme.** Neither the board nor any of the three
comps says anything about one. The `.dark` block in `client/app/globals.css` is
inherited `create-next-app` / shadcn scaffolding and is **unaudited**. It is left
in place so that `client/components/ui/` does not break if something toggles the class,
and it is **not** a supported surface. Do not extend it, and do not treat its
values as Acres colours.

`--destructive` is in the same position: it is not in the palette, no comp uses
it, and it is left at its inherited value so the primitives that reference it
keep compiling.

---

## 8. Copy rules the tokens imply

Recorded here because step 4 will transcribe copy off the comps and must not
carry these through (AGENTS.md §1.7):

- **"Area" is wrong everywhere.** The comps say "Area" in the benefits sub-line
  ("Area provides real insights…"), the "Why Choose Acres?" paragraph
  ("…that's why we developed Area…"), the "See the Big Picture" sub-line ("Area
  turns your data into…"), the testimonial ("…but Area has completely
  transformed…") and the footer (`© Area. 2025`). All five are the unfinished
  rename. **"Acres" is correct in all five.**
- **The numbered markers stay.** `frontend-design` warns that `01 / 02 / 03` is a
  generic default. Here they are in the comp, they are set at 80 px in a distinct
  colour that exists for no other purpose, and the content genuinely is an ordered
  sequence ("Get Started" → "Customize and Configure" → "Grow Your Business").
  **Checked and kept**, not carried over unexamined.
- **Centring is per-section, not per-breakpoint.** "Why Choose Acres?" and
  "Connect with us" are centred at all three widths; everything else is
  left-aligned at all three.

> **Correction to AGENTS.md §1.3.** That section lists exactly two centred
> sections. **The hero is a third.** Its ink spans x 106–1174 on `Desktop.png`,
> whose midpoint is 640 — the page centre, not the container's left edge; on
> `Mobile.png` both hero lines centre on x 187 against a page centre of 187. The
> AGENTS.md line is stale and is fixed in this change.

---

## 9. Every judgement made in this step, in one place

Required by `prompts/01-design-system.md`. A judgement is a value the references
could not resolve; each names what *was* measured.

| # | judgement | measured range | why |
| --- | --- | --- | --- |
| 1 | monospace ships at **12 px** | 11.67–11.83 px from glyph advance | 11.8 is not a design number; 12 px × 0.600 em = 7.2 px advance against 7.00–7.10 measured |
| 2 | icon-button radius **8 px** | 7–8 px | the two independent reads (row-0 inset, rows-to-full-width) both give 7; 8 is the round value and the derived `--radius-sm` rung |
| 3 | elevation `0 4px 16px rgb(0 0 0 / 0.05)` | peak 3–4 % black, 6 px lateral / 16 px below | the comps cannot separate offset from blur |
| 4 | all four motion tokens | **nothing** — the references are static | derived from the register in AGENTS.md §8 |
| 5 | breakpoint **768** | switch occurs somewhere in 376–800 | 800 is an export width, not a stated threshold; 768 is the framework default, so no token is invented |
| 6 | table column head **26 px** | 24–26 px | `Acres` fits 26 at diff 0.119; the grey competitor heads fit 24 less cleanly and are the same style |
| 7 | display line-height **0.85** | 0.852 at 375, 0.800 at 800 | the two do not agree; 0.85 is taken as the token and the 800 value is recorded as a per-breakpoint override for step 4 |
| 8 | `--radius: 0.875rem` | card measured at 14 px | rebinding the base makes the inherited `calc()` ladder land on the measured 8 / 14 / 24 |

## 10. Everything this step corrected in AGENTS.md

Each was found by measurement, and each is fixed in AGENTS.md in the same change
(AGENTS.md §10 rule 8).

| AGENTS.md line | it said | measured |
| --- | --- | --- |
| §1.1 | `#E9E9E9` is "the inactive icon-button fill" | the fill is **`#E4E4E4`**; `#E9E9E9` is the hairline and the card border |
| §1.1 | `#929292`'s "shipped use is unresolved" | it is the **step markers** and the **major section rule** |
| §1.2 | the comparison table's column headers are Crimson Text | they are **DM Sans 500** |
| §1.3 | Mobile is 375 / 20 / 335 | **375 / 16 / 343** |
| §1.3 | the wordmark's ink height is 21 px | **22 px** (at all three widths, as claimed) |
| §1.3 | two centred sections | **three** — the hero is centred too |
| §1.4 | "two radii and nothing between them" | **three** — 8, 14, 24 |
| §1.4 | icon button "roughly a 12 px radius" | **7–8 px** |

## 11. Check results

All four checks from `prompts/01-design-system.md` were run. Real output only
(AGENTS.md §6, §10 rule 3).

### `npx tsc --noEmit`

Clean — no output, exit 0.

### `npm run build`

```
▲ Next.js 16.3.1 (Turbopack)
✓ Running next.config.ts took 85ms
  Creating an optimized production build ...
✓ Compiled successfully in 5.4s
  Running TypeScript ...
  Finished TypeScript in 4.6s ...
✓ Generating static pages using 5 workers (4/4) in 484ms
Route (app)
┌ ○ /
└ ○ /_not-found
```

Passes. `npm run build` is the type check of record; no `typecheck` script was
added.

### `npm run lint`

```
/home/gdk26/Documents/nextjs/acres/components/ui/carousel.tsx
  98:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders

/home/gdk26/Documents/nextjs/acres/hooks/use-mobile.ts
  14:5  error  Error: Calling setState synchronously within an effect can trigger cascading renders

✖ 2 problems (2 errors, 0 warnings)
```

**Two errors, both pre-existing and both outside this change.** `components/ui/carousel.tsx`
and `hooks/use-mobile.ts` are shadcn-installed scaffolding; neither appears in
this change's diff, which touches only `app/globals.css`, `app/layout.tsx`,
`package.json`, `AGENTS.md` and this new `docs/` directory. Both are the same
`react-hooks/set-state-in-effect` rule firing on generated code.

**They are recorded here rather than patched**, per `prompts/01-design-system.md`:
"If a primitive looks broken after the rebind, that is a finding for the doc, not
a licence to patch the component." They are a finding for step 2, which is the
step that owns `components/ui/`.

> **2026-08-20, step 6.** The output above is what step 1 measured and it stays
> as the record of that run. It no longer reproduces: `npm run lint` and
> `npx tsc --noEmit` both exit 0 with no output, on the tree at `f29f674` and on
> the tree step 6 shipped. Neither file was patched by any step, so the rule
> stopped firing on its own — most likely a `react-hooks` version change.
> The finding is closed. `docs/polish.md` §7 carries the current output.
>
> **Step 7 path note.** After the workspace split, those files live at
> `client/components/ui/carousel.tsx` and `client/hooks/use-mobile.ts`.

### `npm run dev` — the font verification

This is the check `npm run build` cannot do, and the one AGENTS.md §8.1's defect
requires. Measured in the browser on `http://localhost:3000` after
`await document.fonts.ready`:

```json
{
 "bodyFontFamily":  "\"DM Sans\", \"DM Sans Fallback\"",
 "bodyFontSize":    "15px",
 "bodyLineHeight":  "21px",
 "bodyLetterSpacing": "-0.255px",
 "bodyFontWeight":  "500",
 "bodyBg":          "rgb(255, 255, 255)",
 "bodyColor":       "rgb(0, 0, 0)",
 "tokenPrimary":    "#485c11",
 "tokenRadius":     ".875rem",
 "tokenDurBase":    ".3s",
 "tokenEase":       "cubic-bezier(.22, 1, .36, 1)"
}
```

**The §8.1 defect is fixed and verified, not assumed.** `font-sans` resolves to
`"DM Sans"`, not to a browser default. `document.fonts.check` returns `true` for
all three faces once used, and the loaded faces are `Crimson Text 400`,
`DM Sans 100 1000` (variable) and `Roboto Mono 100 700` (variable) — exactly the
three of AGENTS.md §1.2, at exactly the axes `next/font`'s data describes.

Body type also renders at exactly the measured style: **15 px / 21 px /
−0.255 px / weight 500**, which is §2.3's body row reproduced by the browser.

**Two measurements were reproduced end to end against the comps**, which is
stronger than a computed-style read:

| probe | rendered in browser | measured on the comp |
| --- | --- | --- |
| `Browse everything.` at `--text-hero-lg` | **1074.3 px advance** | **1069 px ink** |
| `AAAAAAAAAA` in Roboto Mono at 12 px | **7.20 px per cell** | **7.00–7.10 px pitch** |
| `Acres` at `--text-brand` | **73.3 px advance** | **71 px ink** |

The 3–5 px excess in the two proportional rows is the trailing glyph's
right sidebearing, which an advance width includes and an ink bounding box does
not. The monospace row confirms judgement #1 of §9 directly.
