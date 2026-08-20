# Acres — primitives

**What this file is.** The build record for `components/acres/` — the parts every
section of the site is made of. It is written against the references in
AGENTS.md §0 and it carries the measurement behind every number, the four glyph
identifications step 2 owed, and every judgement taken. It sits on top of
`docs/design-system.md`, which owns the tokens; where a number here is new, the
token for it was added to `@theme` in the same change (AGENTS.md §9.1 rule 1).

Built to `prompts/02-primitives.md`. Corrections to that prompt are marked as
such and carry the measurement that forced them.

---

## 0. How the measurements were taken

Same method as `docs/design-system.md` §0, one addition. **The board's icons and
buttons are vector, not Type 3 outlines** — `pdftoppm -r 1200` on the icon row
renders a crisp glyph, which is what made the identifications below possible at
all. A 72 dpi bitmap of a 6 × 6 mark carries no shape information.

```bash
# the board, 1:1 — 1260 x 8083
pdftoppm -png -r 72 public/assets/ui/ref/acres-design-system.pdf ds

# one glyph at 1200 dpi, cropped in PDF points x 16.667
pdftoppm -png -r 1200 -x 790 -y 36050 -W 420 -H 420 <pdf> nx

# a fill's extent, matched on its palette colour so the antialiased edge is
# excluded rather than averaged in
magick ds-1.png -crop 170x120+0+1800 +repage -fuzz 2% \
  -fill white -opaque '#DFECC6' -fill black +opaque white \
  -colorspace gray -threshold 50% -format "%@\n" info:
```

**Glyph identification** is an overlay score: render the reference to a binary
mask, trim, fit into 120 x 120 centred in a 128 x 128 field, render every
candidate the same way, and take the mean absolute error. The whole
7798-file `outlined/` set of `@material-symbols/svg-400` is the field, so a win
is a win against everything the package holds, not against a shortlist.

---

## 1. What was built

| file | export | server/client |
| --- | --- | --- |
| `components/acres/icon.tsx` | `Icon`, `IconName` | server |
| `components/acres/icon-paths.ts` | `iconPaths`, `ICON_VIEW_BOX`, `IconName` | generated data |
| `components/acres/button.tsx` | `Button`, `buttonVariants` | server |
| `components/acres/icon-button.tsx` | `IconButton`, `iconButtonVariants` | server |
| `components/acres/container.tsx` | `Container` | server |
| `components/acres/section.tsx` | `Section` | server |
| `components/acres/eyebrow.tsx` | `Eyebrow` | server |
| `components/acres/rule.tsx` | `Rule` | server, wraps a client leaf |
| `scripts/generate-icon-paths.mjs` | — | build-time generator |

**No file in this step contains `"use client"`.** `Rule` renders
`components/ui/separator.tsx`, which Base UI marks `"use client"`; that is the
one client boundary the step introduces and §4 records why it was accepted.

`components/ui/` is **not edited**. Neither is `app/page.tsx` — `/` still renders
the `create-next-app` placeholder, which is correct: step 4 replaces it.

---

## 2. The measurements

### 2.1 The pill

Four states, `ds-1.png` rows 1830–2360. Each fill matched on its own palette
colour at 2 % fuzz.

| state | fill | origin | fill w x h |
| --- | --- | --- | --- |
| secondary, rest | `#DFECC6` | x 40, y 1832 | **117 x 48** |
| secondary, hover | `#8E9C78` | x 177, y 1832 | **117 x 48** |
| primary, rest | `#485C11` | x 40, y 1994 | **126 x 48** |
| primary, hover | `#8E9C78` | x 186, y 1994 | **126 x 48** |

**48 px in all four**, and the radius probes agree at 21–22 on a 48 px box —
height / 2, a true pill. `rounded-full`, never a rung of the ladder
(`docs/design-system.md` §4.2).

Ink inside the fills:

| run | ink bbox | derived |
| --- | --- | --- |
| secondary label `Learn More` | x 63–133, y 1851–1860 → **71 x 10** | left pad 23, right pad 23 |
| primary label `Learn More` | x 63–133, y 2013–2022 → **71 x 10** | left pad 23 |
| primary arrow | x 137–142, y 2015–2020 → **6 x 6** | gap after label **3**, right pad **23** |

**The arrow is centred on the label's cap height, not baseline-aligned**: label
spans y 2013–2022 (centre 2017.5), arrow y 2015–2020 (centre 2017.5). Exactly.

**126 − 117 = 9 = 3 (gap) + 6 (arrow ink).** The two variants share one label and
one padding; the arrow is the only difference. That arithmetic is the check that
the variant is right, and the component reproduces it exactly — see §8.

**Padding is 22 px of CSS, not 23.** The 23 is measured to the label's INK, and
DM Sans carries a 1 px left side bearing on `L`. Measured in the browser: the
string `Learn More` at `--text-ui` advances **73.021 px**, with ink from x 1 to
x 72.982. `2 x 22 + 73.021 = 117.02`. At 23 the fill renders 119.02 and misses.
`prompts/02-primitives.md` predicted this adjustment and asked for it.

### 2.2 The icon button

| state | fill | origin | w x h |
| --- | --- | --- | --- |
| inactive | `#E4E4E4` | x 40, y 2156 | **40 x 40** |
| active | `#DFECC6` | x 100, y 2156 | **40 x 40** |

Radius **8** (`--radius-control`), from insets of 7 on both probes on the
higher-contrast inactive pair — reproducing `docs/design-system.md` §4.1.

Glyph ink, in the 40 px box: next **5 x 10 at +17,+15**, prev **5 x 10 at
+18,+15**. Box centre is 20,20; ink centres are 19.5,20 and 20,20 — **centred on
both axes**. `arrow_right` rendered in a 24 px box measures **exactly 5 x 10** of
ink, which independently confirms both the glyph and
`docs/design-system.md` §6's 24 px icon box.

### 2.3 The eyebrow

- **Sentence case.** `Benefits`, `Specs`. Not uppercase, not letter-spaced.
- **`#485C11`**, Roboto Mono 400.
- **11 px at 375 and 800, 12 px at 1280** — `Benefits` ink measures **50 x 9** on
  `Tablet.png` and **55 x 9** on `Desktop.png`; 50/55 = 0.909 against
  11/12 = 0.917.
- **Alignment is inherited**, never fixed: `Benefits` is left-aligned and `Specs`
  is centred, because centring is a per-section decision (AGENTS.md §1.3).

### 2.4 The container

`min(100vw − 2 x gutter, 1200px)` applied to the **content**. Verified in the
browser at four widths:

| viewport | content | gutter |
| --- | --- | --- |
| 375 | 343 | 16 |
| 800 | 720 | 40 |
| 1280 | **1200** | 40 |
| 1600 | 1200 (capped) | 40 |

**It takes two elements, and that is a finding.** With the gutter and the cap on
one border-box element, `max-w-page` caps the padding box and leaves **1120** of
content at 1280 — measured, not predicted. The gutter now sits on the outer
element and `max-w-page` on an inner one.

### 2.5 The rules and the section rhythm

- hairline **1 px `#E9E9E9`**, strong **1 px `#929292`**, both spanning the
  container — verified at 343 / 720 / 1200.
- section rhythm **120 px**, applied as top padding only so that stacked sections
  give gaps of exactly 120 rather than 240. Unchanged at all three widths.

---

## 3. The four glyph questions

### 3.1 Board glyph 1 — `cable`. **Identified, but NOT decisively. Raised.**

The two slanted stacked rounded bars on the "Amplify Insights" card, which
`docs/design-system.md` §6 left open. At 1200 dpi it resolves to a **cable with a
plug at each end and a looping cord**, and the same mark appears on
`Desktop.png` at the feature card, so the board and the comp agree.

Scored against all 7798 files in `outlined/`:

| transform | winner | score | runner-up |
| --- | --- | --- | --- |
| none | — | best in field **0.2298** (`toys_fan`) | — |
| mirrored, rotated −45° | **`cable`** | **0.1769** | `wifi_protected_setup` 0.1895 |

`cable` wins the field under the matched transform and beats the entire field's
best score under any un-transformed reading. A fine scan at 1200 dpi puts the
optimum at **−46°** with −44 and −48 inside the noise, so **−45°** is the read.
The reference is also 180°-rotation symmetric, which `cable` is — the scan
returns identical scores at −45 and +135, as it must.

**But 0.177 against 0.190 is a 7 % margin, and `prompts/02-primitives.md` set the
bar at Roboto Mono's 2.6x.** It does not clear that bar, so this is recorded as a
**strong but non-decisive identification and it is raised with the user** rather
than closed. Nothing in step 2 ships it: no feature card is built here.

Two things make it very likely right anyway, and both are stated as judgement,
not measurement: the overlay is visually unambiguous at 256 px, and `cable` is
the only glyph in 7798 that is a cord with two plugs.

**If it is accepted**, it ships as `cable` under `transform: rotate(-45deg)
scaleX(-1)` — a mirrored, rotated placement, which is what the board did. That
transform is step 4's to apply; it is recorded here so step 4 does not re-derive
it.

### 3.2 and 3.3 The icon-button glyphs — `arrow_right` and `arrow_left`. **Decisive.**

Not in `docs/design-system.md` §6's list, which covers the icon *row* only, so
these are an addition rather than a contradiction.

| reference | winner | score | runner-up | margin |
| --- | --- | --- | --- | --- |
| next | **`arrow_right`** | **0.00183** | `arrow_menu_open` 0.1048 | **57x** |
| prev | **`arrow_left`** | **0.00183** | `volume_mute-fill` 0.0866 | **47x** |

Decisive by any standard, and corroborated by size: both render **5 x 10** of ink
in a 24 px box, which is exactly the board's measured ink.

**They are carousel prev/next controls** — that is what the inactive `#E4E4E4` /
active `#DFECC6` pair means. `IconButton` is built; the carousel is step 4's.

### 3.4 The pill's ↗ — `arrow_outward`. **Identified, not decisively. Raised.**

Ink **6 x 6**, white, centred on the label's cap height. At 1200 dpi it is
plainly a **corner-bracket head on a diagonal shaft**, which rules out the
triangular-headed text arrows and settles the text-glyph-versus-icon question
`prompts/02-primitives.md` posed: **it is an icon, not U+2197.**

| winner | score | runner-up |
| --- | --- | --- |
| **`arrow_outward`** | **0.1336** | `call_made` / `north_east` 0.1756 |

A 1.31x margin — a win, not a decisive one. **The residual is stroke weight, and
it is measured**: the reference's ink covers **38.0 %** of its normalised field
against `arrow_outward`'s **29.4 %** at weight 400, a ratio of 1.29. That is
consistent with the board having drawn Material Symbols at a heavier weight
(500–600) than the package installed here.

**Shipped as `arrow_outward` from `@material-symbols/svg-400`, and the weight
difference is raised rather than papered over.** If exact stroke parity matters,
the fix is `@material-symbols/svg-500` or `-600`, which is a dependency change
and the user's call.

**Sizing it needed a second measurement.** The comp sizes this mark by its INK,
not by its Material Symbols box: `arrow_outward` occupies **514 of 960** viewBox
units (0.5354), so 6 px of ink would need an 11.2 px box — and an 11.2 px box
lays out 11.2 px wide, which makes the primary 131.2, not 126. `Icon` therefore
takes a `viewBox` override and `Button` crops the glyph to its ink box,
**`"200 -760 514 514"`** — measured with `getBBox()` in the browser and
cross-checked against the SVG's trim ratio (257 px on a 480 px render). Drawn
mark and laid-out box are then the same 6 px, and 117 + 3 + 6 = 126.

---

## 4. Decisions

### 4.1 `Button` does not wrap `components/ui/button.tsx`

It defines its own `cva` on the same `ButtonPrimitive` from `@base-ui/react`.
Read before deciding: the installed `cva` bakes in `rounded-lg`, `text-sm
font-medium`, a size ladder topping out at `h-9` (36 px, with no 48 px rung),
`hover:bg-primary/80` on `default` and a `color-mix` hover on `secondary` —
**neither of which produces `#8E9C78`**. Wrapping means overriding height,
radius, padding, type scale and both hover rules through `className` and trusting
`tailwind-merge` to win every one of those conflicts. Defining `cva` on the same
primitive is less code, has no merge-order dependency, and keeps
`docs/design-system.md` §7's promise that nothing in `components/ui/` is edited.

Kept from the installed component, because it is the repo's convention and the
`shadcn` skill's rule: `data-slot`, the `data-icon` convention, `cn()` for
composition, and a focus ring built from `--ring`.

### 4.2 `Rule` renders `Separator`

The `shadcn` skill's rule is "use `Separator` instead of `<hr>` or `<div
className="border-t">`", and `Separator` takes a colour without a fight —
its own class is `bg-border`, and `cn()` puts ours last, so `bg-rule` /
`bg-rule-strong` win through `tailwind-merge`. Verified in the browser:
`rgb(233,233,233)` and `rgb(146,146,146)`, 1 px, `role="separator"`.

**The cost is named, not hidden.** Base UI marks `Separator` `"use client"` even
though it renders a static `<div role="separator">` with no interactivity, so
every page carrying a rule ships that leaf's client JS. It was accepted because
it is a leaf that takes only a class from us (AGENTS.md §9.2 rule 2), and
because deviating from an explicit skill rule to save a few hundred bytes is the
wrong trade on a page that reaches Base UI through the nav and the carousel
anyway.

### 4.3 Icons are generated into the repo, and the package is a devDependency

`Icon` renders path data from `components/acres/icon-paths.ts`, which
`scripts/generate-icon-paths.mjs` writes by READING
`@material-symbols/svg-400@0.46.0` (AGENTS.md §10 rule 6 — nothing is
transcribed). That buys `currentColor`, a Server Component, no runtime `fs`, and
no `node_modules` path resolved at request time.

**`prompts/02-primitives.md` said "`package.json` gains
`@material-symbols/svg-400`"; it gains it in `devDependencies`.** Nothing imports
it at runtime, and listing a runtime dependency that no runtime code imports
would be false. The generator is the only consumer, and regenerating requires it.

Twelve glyphs are generated: the eight of `docs/design-system.md` §6, the three
identified above, and `menu` for step 3's mobile nav. All are read from the
`-fill` file, because every board glyph is filled; for glyphs with no enclosed
counter the `-fill` and plain files are byte-identical, and for
`record_voice_over`, `account_balance` and `palette` they are not.

### 4.4 `cn()` had to be taught the Acres scales

`lib/utils.ts` now builds `twMerge` with `extendTailwindMerge`. This is not
tidying — **two components were measurably wrong without it, and both failed
silently:**

- `cn("text-ui", "text-canvas")` **dropped `text-ui`**, because `tailwind-merge`
  only knows Tailwind's default theme and both classes parse as `text-<color>`.
  The pill rendered at **15 px / 500** — inherited body copy — instead of the
  measured 14 px / 600.
- `cn("size-icon", "size-arrow")` **kept both**, because neither parses as a
  size, so stylesheet order decided it. The ↗ rendered at **24 px** instead of 6.

Every custom `--color-*`, `--text-*`, `--spacing-*`, `--radius-*`,
`--container-*`, `--ease-*` and `--shadow-*` name is now declared to it. **Adding
a token to `@theme` means adding it here too**, or the next component fails the
same way.

`lib/utils.ts` is shadcn-owned by `components.json`'s `utils` alias, so this edit
is exposed to `npx shadcn@latest init`. It is not exposed to `add`, which does
not rewrite `utils.ts`.

---

## 5. Reference deltas

Every knowing difference from the reference, and why. An unrecorded deviation is
a defect; a recorded one is a decision (AGENTS.md §5).

| # | delta | why |
| --- | --- | --- |
| 1 | **Hover label is `#000000`, not the board's `#FFFFFF`** | white on sage is **2.93 : 1** and fails AA outright; black on sage is **7.16 : 1**. The fill stays exactly `#8E9C78`, so AGENTS.md §1.5's real point — both variants hover to the same sage — is preserved, and the secondary's label does not change at all. Approved at the gate. Verified in the browser: primary hover reads `rgb(142,156,120)` / `rgb(0,0,0)`, secondary hover the same |
| 2 | **A visible focus ring where the board shows none** | the board draws rest and hover only; AGENTS.md §9.4 rule 1 makes focus a condition of done. 2 px solid `#485C11` at 2 px offset on `:focus-visible` |
| 3 | **`IconButton`'s hit area is 44 x 44 while its fill stays 40 x 40** | AGENTS.md §9.4 rule 5. A `::after` at `-inset-0.5` carries the target; the drawn box is the measurement and it ships unchanged. Verified: `44px x 44px`, `content: ""` |
| 4 | **`IconButton` gains a hover state the board does not draw** | `inactive` hovers to `#DFECC6` — the board's own active fill, so no new value enters the palette. A control with two states and no hover feedback is worse than the board's silence deserves |
| 5 | **The eyebrow steps at `lg` (1024), not `md` (768)** | a **correction to `prompts/02-primitives.md`**, which named `md` while its own breakpoint table asked for 11 px at 800. Both cannot hold. The ink measures 50 x 9 at 800 and 55 x 9 at 1280, so the step is somewhere in 801–1280 and `lg` is the default breakpoint inside that window — the same reasoning `docs/design-system.md` §7.3 used for the gutter, whose window is 376–800 and whose answer is therefore `md`. **No custom breakpoint is added.** The gutter still steps at `md` |
| 6 | **The global focus-ring colour goes from 50 % to full opacity** | `app/globals.css`'s inherited `* { outline-ring/50 }` beat every `focus-visible:outline-*` a component set, measured in the browser. `#485C11` at 50 % over white is about **2.2 : 1**, under the 3 : 1 floor for a focus indicator; at full opacity it is 7.46 : 1 |
| 7 | **`Area` never ships** | AGENTS.md §1.7. No string in this step says it |

---

## 6. The two lint errors, closed

```
components/ui/carousel.tsx  98:5  react-hooks/set-state-in-effect
hooks/use-mobile.ts         14:5  react-hooks/set-state-in-effect
```

Both are in **generated** shadcn scaffolding that `npx shadcn@latest add`
overwrites. **The files are not patched** — a local fix is silently reverted the
next time the CLI touches them, which turns a visible lint error into an
invisible one. `eslint.config.mjs` gains an override scoped to exactly
`components/ui/**` and `hooks/use-mobile.ts`, with the reason in a comment.
Our own code in `components/acres/` is still held to the rule.

`npm run lint` now exits 0 with no output.

---

## 7. Findings for later steps

1. **`--text-brand` is unreachable.** `app/globals.css` defines both
   `--text-brand: 1.875rem` (the 30 px wordmark) and `--color-brand: #485C11`.
   Tailwind resolves the class `text-brand` to the **colour** — confirmed in the
   compiled CSS: `.text-brand{color:var(--color-brand)}`. **Step 3 builds the
   wordmark and will hit this.** The fix is a rename in `docs/design-system.md`
   and `@theme` together; it was not taken here because renaming a design-system
   token is not step 2's to decide.
2. **Board glyph 1 (`cable`) and the pill's ↗ (`arrow_outward`) are identified
   but not decisively** — §3.1 and §3.4. Both are raised with the user.
3. **The ↗'s stroke is ~1.29x heavier on the board than at weight 400.** If that
   matters, it is a `@material-symbols/svg-500`/`-600` dependency change.
4. **`Button` appends the ↗ as a second child.** Combined with Base UI's `render`
   prop, which expects a single element, that is untested. Step 3 renders the
   nav's pill as a link and is the first place it will come up.

---

## 8. Check results

All four checks from `prompts/02-primitives.md`, real output only (AGENTS.md §6,
§10 rule 3).

### `npx tsc --noEmit`

Clean — no output, exit 0.

### `npm run build`

```
▲ Next.js 16.3.1 (Turbopack)
✓ Running next.config.ts took 74ms
  Creating an optimized production build ...
✓ Compiled successfully in 986ms
  Running TypeScript ...
  Finished TypeScript in 3.6s ...
✓ Generating static pages using 5 workers (4/4) in 368ms
Route (app)
┌ ○ /
└ ○ /_not-found
```

### `npm run lint`

No output, exit 0. The two pre-existing errors are closed by §6.

### Browser verification

Run on a scratch route at `app/scratch-primitives/`, which rendered every
primitive; **the route was deleted before the commit**, and the final `tsc`,
`build` and `lint` above were re-run after deleting it. Container and breakpoint
figures were read inside same-origin iframes sized to 375 / 800 / 1280 / 1600, so
each media query resolved against a real viewport of that width.

| check | target | measured | |
| --- | --- | --- | --- |
| pill height, both variants | 48 | **48** | pass |
| pill radius | height / 2 = 24 | `rounded-full` → effective **24** | pass¹ |
| secondary width, `Learn More` | 117 | **117.02** | pass |
| primary width, `Learn More` | 126 | **126.02** | pass |
| primary − secondary | 9 | **9.00** | pass |
| the ↗ | 6 x 6 | **6 x 6** | pass |
| label type | DM Sans 600 / 14 px | **`"DM Sans"` 600 14px** | pass |
| `IconButton` box | 40 x 40, radius 8 | **40 x 40, `8px`** | pass |
| `IconButton` hit area | ≥ 44 x 44 | **44px x 44px**, `content: ""` | pass |
| eyebrow family / colour | Roboto Mono, `#485C11` | **`"Roboto Mono"`, `rgb(72, 92, 17)`** | pass |
| eyebrow size | 11 / 11 / 12 at 375 / 800 / 1280 | **11 / 11 / 12** | pass |
| eyebrow tracking | 0 | **`normal`** | pass² |
| container content | 343 / 720 / 1200 | **342.67 / 720 / 1200** | pass³ |
| container cap | 1200 beyond 1280 | **1200 at 1600** | pass |
| rule colours | `#E9E9E9` / `#929292`, 1 px | **`rgb(233,233,233)` / `rgb(146,146,146)`, `1px`** | pass |
| section rhythm | 120 px, unscaled | **`120px` at all four widths** | pass |
| **primary hover** | sage fill, **black** label | **`rgb(142,156,120)` / `rgb(0,0,0)`** | pass |
| **secondary hover** | sage fill, black label | **`rgb(142,156,120)` / `rgb(0,0,0)`** | pass |
| focus ring | visible on `:focus-visible` | **`2px solid #485C11`, offset `2px`** | pass⁴ |

¹ `rounded-full` computes to a clamped-infinity length, so the reported
`border-radius` is not a readable number; the effective radius is height / 2 = 24,
which is the measurement.

² Chrome serialises `letter-spacing: 0` as `normal`. The two are the same value.

³ 342.67 against 343: the verifying browser was at `devicePixelRatio` 0.75, which
puts the iframe's own viewport at 374.67 rather than 375. The 0.33 is the test
rig, not the component.

⁴ Read from the compiled rules — `.focus-visible\:outline-2:focus-visible {
outline-style: var(--tw-outline-style); outline-width: 2px }`,
`outline-offset: 2px`, `outline-color: var(--ring)` — because at
`devicePixelRatio` 0.75 `getComputedStyle` reports outline width and offset
scaled. The applied style, colour and offset were confirmed live on a focused
`IconButton`: `solid`, `rgb(72, 92, 17)`.

**Two defects were found by this check and fixed before the commit**, which is
the whole reason it exists: the `tailwind-merge` failures of §4.4, and the
container's border-box cap of §2.4. Neither is visible to `tsc`, `build` or
`lint`.
