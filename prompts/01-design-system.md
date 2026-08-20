# 01 — The design system

## Scope, and why it is next

Write **`docs/design-system.md`** and the **`@theme` block in `app/globals.css`**
that expresses it: palette, the three type families and their scale, spacing,
radii, the container and its gutters, elevation, and the motion constants.
Replace `app/layout.tsx`'s Geist pair with the three real faces.

**Why it is next.** It is step 1 of AGENTS.md §8.2 and nothing else in the
sequence is unblocked without it. Resolved from the repository, not from the
plan: there is no `docs/` directory, no `prompts/` directory, `app/globals.css`
carries the stock shadcn neutral OKLCH set, `app/page.tsx` and `app/layout.tsx`
are `create-next-app` boilerplate, and `git log` ends at
`cd73693 docs(agents): confirm Roboto Mono as the third face` — three AGENTS.md
commits and no product code. Step 1 is unbuilt.

Step 1 is load-bearing in the strong sense: any component built first encodes a
hex value that then has to be hunted out of every file it reached.

---

## Reference material

Only the four files in AGENTS.md §0. Read this session while writing this
prompt:

| path | what was read |
| --- | --- |
| `public/assets/ui/ref/acres-design-system.pdf` | rendered at `-r 72` to a 1260 × 8083 bitmap; surveyed in six 1348 px tiles |
| `public/assets/ui/landing-pages/Desktop.png` | 1280 × 7389, verified with `magick identify`; surveyed in six 1232 px tiles |
| `public/assets/ui/landing-pages/Tablet.png` | 800 × 8825, dimensions verified only |
| `public/assets/ui/landing-pages/Mobile.png` | 375 × 8833, dimensions verified only |

`pdfinfo` confirms the board is **one page, 1260 × 8082.33 pt**, so `-r 72`
gives 1:1 pixels. It emits `Syntax Warning: Bad bounding box in Type 3 glyph`
eighteen times — expected, the board's text is outlined as Type 3, and it is why
`pdffonts` names nothing.

### The board's map, established this session

Coordinates are in the 1260-wide 72 dpi render. **These are section anchors read
off a half-scale overview, not measurements** — every one is re-cropped at 1:1
during execution before a number is taken from it.

| board region | approx. y |
| --- | --- |
| `Text Styles` label | 40 |
| the seven-step text ladder | 90 – 640 |
| `Color` label, then the seven-swatch row | 880 / 940 – 1090 |
| `Icons` label, then the icon row | 1200 / 1290 – 1330 |
| `Logo` label, then the wordmark mark | 1390 / 1490 |
| `Buttons` label, the four pills, the four icon buttons | 1530 / 1830 – 2030 / 2160 – 2340 |
| the `Area` header/CTA lockups | 2420 – 2700 |
| the `✓ Ultra-fast browsing` list row | 2750 |
| the nav card, closed and open | 2840 – 3250 |
| `Photo Links` label and the photo/device treatments | 3390 onward |

**The text ladder is seven styles, not three**, and this is the single most
important thing the board says about type. Reading down: a very large serif
`Header`; a mid serif line; a smaller serif line; a small bold sans
`Key point here`; a two-line grey sans paragraph; a green monospace `Labels`;
a small black sans `UI Text`. That ladder — not a modular scale invented to fit
it — is the type system.

### `Desktop.png`'s map, established this session

Same caveat: anchors, not measurements. Derived from a 0.4844-scale overview.

| section | approx. y |
| --- | --- |
| nav row (wordmark, four links, primary pill) | 50 |
| hero `Browse everything.` | 217 |
| device band — sage rectangle behind the laptop | 372 – 898 |
| `Trusted by:` + six logo marks | 950 |
| `Benefits` eyebrow | 1214 |
| `We've cracked the code.` + sub-line | 1300 |
| the four-up feature grid, hairline above each cell | 1521 – 1707 |
| full-container photograph, rounded | 1783 – 2419 |
| `See the Big Picture` + numbered rows + `Discover More` | 2623 – 3144 |
| divider, then `Specs` eyebrow, then `Why Choose Acres?` (centred) | 3367 / 3457 / 3533 |
| the three-column comparison table | 3830 – 4415 |
| testimonial — photo left, pull-quote right, `John Smith` / `Head of Data` | 4522 – 5030 |
| `Map Your Success` + `Discover More`, then `01` `02` `03` | 5426 / 5632 |
| photograph, then `Connect with us` (centred) + primary pill | 5940 / 6804 |
| footer links, wordmark, `© Area. 2025`, `All Rights Reserved` | 7180 – 7343 |

Two things this map already settles, and the doc must record both:

- **The numbered-step markers are real.** `01 / 02 / 03` set large in grey sans,
  and the `See the Big Picture` rows are numbered `01`–`04`. `frontend-design`
  warns that numbered markers are a generic default — here they are in the comp
  and the content genuinely is a sequence, so they stay. Record it as a
  checked-and-kept decision, not an unexamined one.
- **The comparison table's `Acres` column is a card** — it carries its own
  border and sits proud of the two plain columns. That is a token need
  (a card surface + border), not a table-only flourish.

---

## Measurements the implementation must produce

**Nothing below is a number yet.** Every one is measured during execution and
written into `docs/design-system.md` with the crop that produced it. AGENTS.md
§10 rule 4 governs: where a crop cannot separate 46 from 48, record the observed
range as the measurement and the chosen value as a judgement on it, in those
words.

### Procedure — colour

For each of the seven swatches on the board, and again for each fill in use on
`Desktop.png`:

```bash
magick ds-1.png -crop WxH+X+Y +repage -format %c histogram:info: | sort -rn | head -3
```

Take the dominant non-background entry. **Never `p{x,y}`** — every swatch edge
and every glyph is antialiased and a single pixel returns a blend that is not in
the palette (§0).

Confirm each of the seven against AGENTS.md §1.1 and **say so explicitly**: this
prompt does not assume §1.1 is right, it re-derives it. Sample at minimum: the
seven swatches; the primary pill fill; the secondary pill fill; both hover
fills; the sage band behind the hero device; the hairline above a feature cell;
the inactive and active icon-button fills; the page canvas; and the body-copy
grey.

**Three colour questions to close:**

1. **`#929292` has no resolved shipped role** (§1.1). Resolve it against the
   comps or record it as swatch-only. The `01 / 02 / 03` markers are a live
   candidate — measure them.
2. **Body copy is `#6F6F6F` per §1.1, not `#929292`.** Re-measure on at least
   three separate paragraphs before it is written down as a token.
3. **`#EDF4F1` is the Figma board, not a product surface.** It must not reach
   `@theme` as a background.

Record contrast ratios for every text-on-surface pair that ships. `#6F6F6F` on
`#FFFFFF` is close enough to the 4.5:1 floor that it must be computed, not
assumed — if it fails, that is a finding to report, not to quietly darken.

### Procedure — type

The three families are already identified and are **not re-litigated here**
(AGENTS.md §1.2 records the evidence): **Crimson Text** (display serif),
**DM Sans** (sans), **Roboto Mono** (mono). What step 1 owes is the **scale**.

For each of the board's seven text styles, and for each distinct run on
`Desktop.png`, take the ink bounding box:

```bash
magick <ref>.png -crop WxH+X+Y +repage -colorspace gray -negate -threshold 35% -format "%@\n" info:
```

From cap height and x-height, back out `font-size`; from consecutive baselines
in a wrapped paragraph, back out `line-height` directly. **Letter-spacing is
measured, not guessed** — the wordmark and the eyebrows both look tracked, and a
tracked eyebrow reset at `tracking-normal` is a visible miss.

Repeat the hero and one body paragraph on `Tablet.png` and `Mobile.png`. The
scale is three columns wide, not one.

**Do not lose the monospace.** Every eyebrow (`Benefits`, `Specs`), every
comparison-table cell, `Head of Data`, the `✓ Ultra-fast browsing` row, and the
footer's `© Area. 2025` / `All Rights Reserved` are Roboto Mono. AGENTS.md §1.2
names this the identity's signature and the easiest thing to lose.

**Do not lose the small serif either.** The four feature-card headings
(`Amplify Insights` …), the numbered-row leads, and the comparison table's
column headers (`Acres`, `WebSurge`, `HyperView`) are all Crimson Text at small
sizes. The serif is not a display-only face here.

**The wordmark does not scale** — §1.3 puts its ink height at 21 px on all three
comps. Verify on all three; if it does not hold, §1.3 is stale and gets fixed in
this change (§10 rule 8).

### Procedure — spacing, container, radii

- **Container and gutters** are already stated in §1.3 (375/20/335,
  800/40/720, 1280/40/1200). **Verify all three** by measuring the left edge of
  a heading and the left edge of a full-container photograph on each comp.
- **Section rhythm**: measure the gap from the last baseline of one section to
  the first ink of the next, at all three widths, across at least six section
  boundaries. Report the set of values; derive the spacing step from what
  actually recurs. If the values do not quantise onto one step, **say so** and
  record the two or three real values rather than forcing a scale.
- **Feature grid**: §1.3 states 20 px column gap at desktop and 4 → 2 → 1.
  Verify the gap and the counts at 800 and 375.
- **Radii**: the pill height (§1.4 says 48 px at desktop — verify, and verify
  Tablet and Mobile separately), the icon-button box and radius (§1.4 says
  ~12 px on 40 px), the photograph radius, the device-frame radius, the nav-card
  radius, and the comparison-table card radius. §1.4's claim that there is
  **nothing between the two radii** is a hypothesis this step tests; if a third
  distinct radius is measured, it becomes a third token.

To measure a radius, crop a corner at 1:1 and step in from the edge until the
first non-background pixel appears; the inset at the corner is the radius.

- **Elevation**: the nav card and the open menu card carry a shadow on the
  board. Measure its extent and opacity, or record that it cannot be separated
  from the board background and is therefore a judgement.

### Procedure — motion

There is **nothing to measure** — the references are static. `--duration-*` and
`--ease-*` are therefore **stated as judgements**, in those words, with the
reasoning: a calm, declarative register (§8) wants short durations and a gentle
ease-out, not a bounce. Define exactly one fast, one base, one slow, and one
ease. Step 5's GSAP `DUR` / `EASE` constants will read these; §9.3 rule 1
requires they be defined once.

---

## What gets written

### 1. `docs/design-system.md`

New file, and **`docs/` itself is new**. Sections: palette (with roles and
contrast ratios), type (the three families, the seven-style ladder, the scale
across three breakpoints, tracking and leading), spacing and the container,
radii, elevation, motion, and a closing section recording the three resolved
open questions and every judgement made under §10 rule 4.

Every number cites the crop that produced it.

### 2. The `@theme` block in `app/globals.css`

v4 namespaces, verified against `https://tailwindcss.com/docs/theme` fetched
this session:

- `--color-*`, `--font-*`, `--text-*` (with the `--text-<n>--line-height`,
  `--text-<n>--letter-spacing`, `--text-<n>--font-weight` companions),
  `--font-weight-*`, `--tracking-*`, `--leading-*`, `--spacing-*`, `--radius-*`,
  `--shadow-*`, `--breakpoint-*`, `--container-*`, `--ease-*`.
- **`@theme` variables must be top-level** — never nested in a selector or
  media query.
- `@theme inline` uses the referenced variable's value at the use site; that is
  exactly what the `next/font` CSS-variable pattern needs and why the existing
  block uses it.

**Rebind, do not override** (§9.1 rule 3). The base-nova components read
`--primary`, `--secondary`, `--muted`, `--border`, `--radius-md` and friends —
give those names Acres values rather than fighting the components. Verified by
reading `components/ui/button.tsx`: its `default` variant is
`bg-primary text-primary-foreground hover:bg-primary/80` and its `secondary` is
`bg-secondary text-secondary-foreground hover:bg-[color-mix(in oklch,var(--secondary),var(--foreground) 5%)]`.

**This matters for the hover.** AGENTS.md §1.5 says **both** pill variants hover
to the same sage. Neither `primary/80` nor that `color-mix` produces sage from
its base. So step 1 must **ship an explicit hover token** — a named sage — and
record that step 2's `Button` overrides both hover rules rather than inheriting
them. Naming the token now is what stops step 2 inlining a hex.

Also decide, and record, whether to keep base-nova's
`--radius-sm/md/lg/xl/2xl/3xl/4xl` ladder derived by `calc()` from `--radius`.
The comps have two radii and a pill; the ladder exists so `components/ui/`
keeps working. Recommended: keep the ladder, rebind `--radius`, and add named
Acres radii alongside.

### 3. Fonts, in `app/layout.tsx`

Replace `Geist` / `Geist_Mono` with the three real faces via
`next/font/google`. Verified against
`node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`:

- **`Crimson_Text` is NOT variable.** Weights `400`, `600`, `700` only, styles
  normal + italic, subsets latin / latin-ext / vietnamese. **A `weight` array is
  required** — omitting it fails the build. Load only the weights the measured
  scale actually uses.
- **`DM_Sans` is variable**, `wght` 100–1000, and also carries an **`opsz` axis
  (9–40, default 14)**. `next/font` handles `wght` by default; `opsz` needs an
  explicit `axes: ["opsz"]` if the design wants it. Default is fine unless the
  measurement says otherwise — record which was chosen and why.
- **`Roboto_Mono` is variable**, `wght` 100–700 (AGENTS.md §1.2, from
  `google/fonts` `ofl/robotomono/METADATA.pb`).

### 4. The live defect, fixed

`app/globals.css` line 10 reads `--font-sans: var(--font-sans)` — self-referential
— and line 11 reads `--font-mono: var(--font-geist-mono)`. `app/layout.tsx`
defines `--font-geist-sans` and `--font-geist-mono`. So `font-sans` currently
falls through to the browser default (AGENTS.md §8.1). Both go away when the
three faces land; the fix must be **verified in a running build**, not assumed.

### 5. Icons — the §1.6 question, answered

**Decision taken with the user this session: Material Symbols, via
`@material-symbols/svg-400` (v0.46.0, confirmed on the registry).** Individual
SVGs, tree-shaken, no icon webfont and therefore no icon FOUT. `lucide-react`
stays installed for anything the board does not specify; `components.json`'s
`"iconLibrary": "lucide"` stays as-is, because it governs what the shadcn CLI
generates, not what we author.

The eight glyphs read off the board's icon row, to be confirmed against the
package's names during execution: a two-shape mark (unidentified — **identify it
or report it unidentified, do not guess**), `check`, `close`, `show_chart`,
`record_voice_over`, `public`, `account_balance`, `palette`. All read as
**filled**, which is why the Lucide substitution was rejected.

**Non-goal in this step:** do not add the dependency and do not build an `Icon`
component. Step 1 records the decision and the glyph list in
`docs/design-system.md`; step 2 installs and builds.

---

## Expected impact

- **Files changed:** `app/globals.css` (the `@theme` block, `:root`, `.dark`),
  `app/layout.tsx` (fonts + `metadata`), and new `docs/design-system.md`.
- **Routes:** `/` is the only route. It still renders `create-next-app`
  boilerplate, but **its colours and fonts will change** — the boilerplate will
  look wrong afterwards. That is expected and is not a regression; step 4
  replaces it.
- **`components/ui/`:** all 61 primitives repaint, because they read the
  rebound token names. **Not one of their files is edited.** If a primitive
  looks broken after the rebind, that is a finding for the doc, not a licence to
  patch the component.
- `package.json`'s `"name": "area"` → `"acres"` (§1.7). Metadata title/description
  replace `"Create Next App"` / `"Generated by create next app"`.

## Non-goals

- **No component of our own.** No `Button`, no container, no section shell, no
  eyebrow — that is step 2, and building it here would encode tokens before they
  are measured.
- **No landing-page markup.** `app/page.tsx` is not touched.
- **No GSAP.** Not installed, and §4 forbids importing it before a prompt adds
  it. Motion constants are tokens only.
- **No icon dependency installed** (see above).
- **No dark mode design.** `.dark` exists in `app/globals.css` and the comps say
  nothing about it. Leave the block in place so `components/ui/` does not break,
  and record in the doc that Acres has **no designed dark theme** and that
  `.dark` is inherited, unaudited scaffolding.
- **No `tailwind.config.js`.** Creating one is a defect (§9.1 rule 2).
- **No new `docs/` file besides `design-system.md`**, and its row goes into
  AGENTS.md's index in this same change (§10 rule 1).

## Reference deltas

Deviations from the comps, decided in advance:

1. **`#EDF4F1` is dropped.** It is the Figma board's ground, not a surface. The
   page canvas is `#FFFFFF` (§1.1, §9.1 rule 4).
2. **"Area" → "Acres" everywhere.** The comps say "Area" in the benefits
   sub-line, the "Why Choose Acres?" paragraph, the testimonial and the footer
   copyright. §1.7: the rename is unfinished in the comp, and "Acres" is
   correct. No copy ships in this step, but the doc records the rule so step 4
   cannot transcribe it back in.
3. **Body-copy grey may be darkened** if the measured value fails 4.5:1. If so
   the doc records both the measured value and the shipped one, and says which
   is which.
4. **Touch targets**: §9.4 rule 5 puts the floor at 44 × 44, whatever the comp's
   ink measures. If the mobile icon button measures under 44, the token records
   the ink size and the doc records that the hit area is padded out in step 2.
5. **Motion tokens are invented**, not measured — the references are static.
   Flagged here so it is a decision on the record rather than a silent one.

Any further deviation found while measuring is added to this list in
`docs/design-system.md`, not left unrecorded.

## Breakpoint behaviour

375, 800 and 1280 are the three comps, so they are the three measured widths.

- **Container**: 335 / 720 / 1200 with 20 / 40 / 40 gutters — verify, then
  express as a single container primitive's token set (step 2 builds it).
- **`--breakpoint-*`**: decide whether 800 maps to Tailwind's default `md`
  (48rem = 768) or needs a custom breakpoint at 800. **Measure before choosing**
  — if the tablet comp's layout changes happen at 768 the default is fine, and
  if they need exactly 800 a custom breakpoint is added and named. Record which,
  and why.
- **Type scale**: the hero is measured at all three widths; the doc gives three
  values per style that changes, and says explicitly which styles do **not**
  change (the wordmark, per §1.3).
- **Grid**: 4 → 2 → 1 for the feature grid; verify the counts at 800 and 375
  rather than assuming the split point.
- **Centring is per-section, not per-breakpoint** (§1.3). "Why Choose Acres?"
  and "Connect with us" are centred at all three widths; everything else is
  left-aligned at all three. The doc states this as a rule so step 4 does not
  re-derive it.

## Checks

Run all four and **quote the real output** (§6, §10 rule 3):

```bash
npx tsc --noEmit
npm run lint
npm run build
npm run dev        # then load / and confirm the three faces render
```

`npm run build` is the type check of record — there is no `typecheck` script,
and none is added here.

**Font verification is not optional and not visual-only.** In the dev server,
confirm `getComputedStyle(document.body).fontFamily` resolves to the DM Sans
variable and not a fallback — that is the specific failure §8.1's defect
describes, and it is invisible to `npm run build`.

Results are recorded in **`docs/design-system.md`**.

## Commit

One commit to `main` at the end, message written with `caveman-commit` (§3, §7).
Do not push.

---

## SKILLS USED

- **`tailwind-design-system`** — the v4 CSS-first token architecture: brand →
  semantic → component layering, and the `@theme` patterns the palette and scale
  are written in.
- **`tailwind-4-docs`** — v4 utility and directive verification. **Its local
  docs snapshot is NOT initialized** (`references/docs-source.txt` reads
  `Status: Not initialized`) and the user declined running its sync script, so
  only `references/gotchas.md` and `references/engineering-playbook.md` are
  available from the skill. The `@theme` namespace and `--text-*` companion
  syntax in this prompt were verified instead against
  `https://tailwindcss.com/docs/theme` and
  `https://tailwindcss.com/docs/font-size`, fetched this session at the user's
  direction. **Re-fetch rather than recall** any further v4 syntax.
- **`frontend-design`** — the "don't ship the templated default" discipline, and
  the type-and-palette judgement the doc's prose needs. Note its calibration
  warning: a cream ground with a high-contrast serif is one of the three AI
  default looks. Acres is not that — it is white, and the direction comes from
  the comps, which win outright.
- **`shadcn`** — before touching any token name a `components/ui/` primitive
  reads. This repo is **`base-nova` on `@base-ui/react`**, not Radix shadcn/ui;
  read the component before assuming its props. Its styling rules also forbid
  `space-x/y-*`, manual `dark:` colour overrides, and raw colour values.
- **`web-design-guidelines`** — the accessibility floor (§9.4). Needed here for
  the contrast ratios, which are a token-level decision, not a step-6 cleanup.
- **`caveman-commit`** — the closing commit. Mandatory, no exceptions (§3, §7).

Not loaded, deliberately: the seven `gsap-*` skills (no motion code in this
step, and GSAP is not installed) and `vercel-react-best-practices` (no component
is written).
