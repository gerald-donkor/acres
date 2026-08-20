# 02 — Primitives

## Scope, and why it is next

**Build the Acres primitive layer**: the four-variant pill `Button`, the
`IconButton`, the `Container`, the `Section` shell, the `Eyebrow`, and the two
`Rule` weights — plus the icon delivery this repository has decided on but not
installed, and the resolution of the three findings `docs/design-system.md`
hands to this step.

It is next because it is **step 2 of AGENTS.md §8.2** and step 1 is committed
(`0723829`, `docs/design-system.md` + the `@theme` block in `app/globals.css`,
verified on disk). Step 3 (chrome) and step 4 (the landing page) both depend on
it: the nav's pill, the footer's rule and every one of the nine page sections
are made of exactly these parts. Building the page first would inline the pill
geometry nine times, which is the failure AGENTS.md §8.2's closing note
describes.

**This step owns `components/ui/`** (AGENTS.md §8.1), which is why the two
pre-existing lint errors are settled here and not carried further.

---

## Reference material read for this prompt, by path

Every number below was measured this session. No value is recalled from another
session, and none is eyeballed.

| reference | what was read |
| --- | --- |
| `public/assets/ui/ref/acres-design-system.pdf` | rendered 1:1 with `pdftoppm -png -r 72` → `ds-1.png`, **1260 × 8083**. The `Buttons` block, board rows **1830–2360** |
| `ds-1.png -crop 360x300+20+1830` | the four pill states, at 300 % for reading |
| `ds-1.png -crop 200x220+20+2130` | the four icon buttons, at 400 % for reading |
| `public/assets/ui/landing-pages/Desktop.png -crop 700x120+30+1180` | the `Benefits` eyebrow above `We've cracked the code` |
| `public/assets/ui/landing-pages/Desktop.png -crop 1240x210+20+3320` | the `#929292` major rule and the **centred** `Specs` eyebrow |
| `docs/design-system.md` | §1.4 (contrast), §2.3 (the scale), §4.1–4.2 (radii, the pill), §6 (icons), §7.1–7.2 (the radius ladder, the hover token), §11 (the two lint errors) |
| `components/ui/button.tsx`, `app/globals.css`, `components.json`, `app/layout.tsx` | read in full |

---

## The measurements the implementation must hit

### The pill — measured on the board, all four states

Fill extents taken by matching each state's exact palette colour with a ±10
tolerance, so the antialiased edge is excluded rather than averaged in.

| state | fill origin | fill w × h | row-0 inset | rows-to-full-width |
| --- | --- | --- | --- | --- |
| secondary `#DFECC6` | x 40, y 1832 | **117 × 48** | 21 | 21 |
| secondary hover `#8E9C78` | x 177, y 1832 | **117 × 48** | 22 | 22 |
| primary `#485C11` | x 40, y 1994 | **126 × 48** | 22 | 22 |
| primary hover `#8E9C78` | x 152, y 1994 | — (crop caught both pills; height **48** confirmed) | — | — |

**Height is 48 px in all four states**, and the two radius probes agree at
21–22 on a 48 px box — that is height ÷ 2, a true pill. `rounded-full`, never a
rung of the ladder (`docs/design-system.md` §4.2).

**Label and arrow geometry**, measured inside the fills:

| run | ink bbox | derived |
| --- | --- | --- |
| secondary label `Learn More` (black) | x 63–133, y 1851–1860 → **71 × 10** | left pad **23**, right pad **23** |
| primary label `Learn More` (white) | x 63–133, y 2013–2022 → **71 × 10** | left pad **23** |
| primary arrow (white) | x 137–142, y 2015–2020 → **6 × 6** | right pad **23**, gap after label **3** |

Three things follow, and the implementation must reproduce all three:

1. **Horizontal padding is 23 px, symmetric, on both variants.** It is measured
   to the *ink*, so the CSS value is 23 px minus the label's own side bearing;
   the implementation sets `px-[23px]` and then **verifies the rendered fill
   width against 117 (secondary) and 126 (primary)** in the browser, adjusting
   the padding token if the sidebearing moves it. Confirmed independently on
   `Desktop.png` by `docs/design-system.md` §4.2, which measured 21–23.
2. **The arrow's ink is 6 × 6 px and it is centred on the label's cap height** —
   label cap spans y 2013–2022 (centre 2017.5), arrow spans 2015–2020 (centre
   2017.5). Exactly centred, not baseline-aligned. It is a small mark, not a
   16 px icon.
3. **The primary is 9 px wider than the secondary**, and 9 = 3 (gap) + 6
   (arrow). The two share one label and one padding; the arrow is the only
   difference. That is the arithmetic the component must produce, and it is the
   check that the variant is right.

Label style is `--text-ui` — **DM Sans 600 at 14 px, −0.018em**
(`docs/design-system.md` §2.3), which the measured 71 × 10 ink for
`Learn More` is consistent with.

### The icon button — measured on the board

| state | fill | origin | w × h | row-0 inset | rows-to-full-width |
| --- | --- | --- | --- | --- | --- |
| inactive, next | `#E4E4E4` | x 40, y 2156 | **40 × 40** | 7 | 7 |
| active, next | `#DFECC6` | x 100, y 2156 | **40 × 40** | 9 | 9 |
| inactive, prev | `#E4E4E4` | x 40, y 2310 | **40 × 40** | 7 | 7 |
| active, prev | `#DFECC6` | x 100, y 2310 | **40 × 40** | 9 | 9 |

**40 × 40, radius 8** — the inactive pair is the trustworthy read (`#E4E4E4` on
`#EDF4F1` is the higher-contrast pair and gives 7 on both probes); the active
pair's 9 is `#DFECC6` bleeding into a near-identical ground. This reproduces
`docs/design-system.md` §4.1's 7–8 measurement and its judgement #2 to ship
**8 px** — `--radius-control`, which already exists.

Glyph ink, black in every state, in a 24 px icon box centred in the 40 px
button (box x 40–79 centre 59.5, glyph centre 59.5; box y 2156–2195 centre
2175.5, glyph centre 2175.5 — **centred on both axes, exactly**):

| glyph | ink bbox | size |
| --- | --- | --- |
| next | x 58–61, y 2172–2179 | **4 × 8** |
| prev | x 58–62, y 2326–2333 | **5 × 8** |

### The eyebrow

From `Desktop.png -crop 700x120+30+1180` and `-crop 1240x210+20+3320`, read at
200 %:

- **Sentence case.** `Benefits`, `Specs` — a capital and then lower case.
  **Not uppercase and not letter-spaced.** `--text-label` already carries
  `letter-spacing: 0em` and `docs/design-system.md` §2.4 records the monospace
  as the one style on the page set at exactly zero. An uppercase, tracked
  eyebrow is the templated default and it is wrong here.
- **`#485C11`**, Roboto Mono 400, 12 px at 1280 and 11 px at 800/375
  (`--text-label-lg` / `--text-label`).
- **Alignment is inherited, not fixed.** `Benefits` is left-aligned;
  `Specs` is centred, because its section is one of the three centred ones
  (`docs/design-system.md` §8). The component must not hardcode either.

### The rules

- **hairline** — 1 px `#E9E9E9`, `--color-rule`. Spans the container.
- **strong** — 1 px `#929292`, `--color-rule-strong`. The one major section
  division, measured at `Desktop.png` row 3364 running the full container
  x 40–1239 (`docs/design-system.md` §1.2).

### The container and the section shell

Straight from `docs/design-system.md` §3.1 and §3.3, already tokenised:

- container `min(100vw − 2 × gutter, 1200px)` — gutter **16 → 40** at `md`,
  cap `--container-page` (75rem / 1200px). Measured: 375/16/343, 800/40/720,
  1280/40/1200.
- section rhythm **120 px**, and it **does not scale** — measured 119–120 at
  five rectangle-to-rectangle gaps on `Desktop.png` and recurring at 800 and
  375.

---

## Procedure — the four things this step must resolve, not route around

`docs/design-system.md` hands step 2 three open findings and AGENTS.md §1.6
hands it a fourth. **None may be closed by substitution** (AGENTS.md §10
rule 9).

### 1. The hover contrast failure — a decision, and it needs the user's nod

`docs/design-system.md` §1.4 records it and forbids shipping it unexamined:
white on sage `#8E9C78` is **2.93 : 1**, below AA's 4.5 : 1 for body text and
below even the 3 : 1 large-text floor. The board states white-on-sage for both
hover states; AGENTS.md §1.5 records it as the pattern.

**Recommendation, to be implemented unless the user says otherwise at the
approval gate: keep the board's sage fill, and set the hover label to
`#000000`.**

| pair | ratio | verdict |
| --- | --- | --- |
| `#FFFFFF` on `#8E9C78` (the board) | 2.93 : 1 | fails |
| `#000000` on `#8E9C78` (proposed) | **7.16 : 1** | passes AAA |

Why this and not a darker fill: the board's specification is *the colour* —
`#8E9C78` is a named palette value used for the device band as well, and
darkening it would either fork the token or move a brand colour. The label
colour is the smaller, fully reversible deviation. It also makes the two
variants more consistent than the board does, not less: the secondary already
carries a black label at rest, so under this rule only its **fill** changes on
hover, and AGENTS.md §1.5's real point — *both variants hover to the same
sage* — is preserved exactly.

This is a **Reference delta** and it is recorded as one, below.

### 2. Glyph 1 — identify it, or raise it

`docs/design-system.md` §6 leaves one of the eight board glyphs unidentified:
the two slanted stacked rounded bars on the **Amplify Insights** card. Procedure,
after `@material-symbols/svg-400` is installed:

1. Crop the board glyph 1:1 from `ds-1.png` (the icon row is at
   `-crop 700x110+0+1270`).
2. Render every candidate SVG from the installed package at the glyph's
   measured box, and score by normalised absolute overlay difference — the same
   method `docs/design-system.md` §0 used for the typefaces.
3. **Accept only a decisive win.** If nothing separates from the field the way
   Roboto Mono's 0.026-against-0.069 did, the glyph stays unidentified and is
   **raised with the user**. Do not ship the nearest-looking substitute.

### 3. Two glyphs `docs/design-system.md` §6 does not list

The board's icon buttons carry a **filled right-pointing triangle** and a
**filled left-pointing triangle** (ink 4 × 8 and 5 × 8 in a 24 px box). §6's
list is the eight glyphs of the icon *row* and does not include them, so this
is a genuine addition, not a contradiction.

They read as Material Symbols `arrow_right` / `arrow_left`, whose filled
triangle at 24 px is the right shape and the right size — **but that reading is
not yet a measurement.** Identify them by the same overlay procedure as glyph 1
before shipping either, and record the result. If they do not resolve, raise
them.

**These are carousel prev/next controls**, which is what the two-state
(inactive `#E4E4E4` / active `#DFECC6`) treatment means. Nothing in step 2
builds a carousel; the button is built, its use is step 4's.

### 4. The `↗` on the primary

Ink **6 × 6**, white, centred on the label's cap height. It is small enough that
a text glyph (U+2197) and a 12 px `arrow_outward` are both plausible, and they
are not the same shape. **Identify it by overlay before choosing**, and record
which it is. If it resolves to a Material Symbol, it goes through the same
`Icon` component as everything else; if it resolves to a text glyph, say so and
set it as text.

### 5. The two lint errors

`docs/design-system.md` §11 records them as this step's:

```
components/ui/carousel.tsx  98:5  react-hooks/set-state-in-effect
hooks/use-mobile.ts         14:5  react-hooks/set-state-in-effect
```

Both are in **generated** shadcn scaffolding that `npx shadcn@latest add` will
overwrite. **Do not patch the files** — a local edit is silently reverted the
next time the CLI touches them, which turns a visible lint error into an
invisible one. Add a narrow ESLint override scoped to exactly
`components/ui/**` and `hooks/use-mobile.ts`, with a comment naming why, and
record it. `npm run lint` must end clean, with the reason on the record rather
than the rule globally weakened.

---

## What gets built

New directory `components/acres/` — our primitives, kept separate from
generated `components/ui/` so that the shadcn CLI can never overwrite them.

| file | export | notes |
| --- | --- | --- |
| `components/acres/button.tsx` | `Button`, `buttonVariants` | variants `primary` \| `secondary`; the 48 px pill; `↗` on the primary only |
| `components/acres/icon-button.tsx` | `IconButton` | 40 × 40, `--radius-control`, states `inactive` \| `active` |
| `components/acres/icon.tsx` | `Icon` | wraps a Material Symbols SVG at 24 px |
| `components/acres/container.tsx` | `Container` | `min(100vw − 2 × gutter, 1200px)` |
| `components/acres/section.tsx` | `Section` | `<section>`, 120 px rhythm, `align="start" \| "center"` |
| `components/acres/eyebrow.tsx` | `Eyebrow` | monospace, `#485C11`, sentence case, inherits alignment |
| `components/acres/rule.tsx` | `Rule` | `weight="hairline" \| "strong"` |

**Every one is a Server Component.** None of them needs the browser: the four
button states are `:hover` and `:focus-visible`, which are CSS, not React
(AGENTS.md §9.2 rule 1). **No `"use client"` appears anywhere in this step.**
If the implementation reaches for one, that is a signal the design is wrong —
stop and say so.

### On `Button` and `components/ui/button.tsx`

**Decision: `components/acres/button.tsx` defines its own `cva` and renders
Base UI's `ButtonPrimitive` directly. `components/ui/button.tsx` is not edited
and not wrapped.**

Read before deciding, and this is why. The installed cva bakes in `rounded-lg`,
`text-sm font-medium`, and a size ladder whose largest rung is `h-9` (36 px) —
there is no 48 px size — plus `hover:bg-primary/80` on `default` and a
`color-mix` hover on `secondary`, **neither of which produces `#8E9C78`**
(`docs/design-system.md` §7.2 says exactly this). Wrapping it means overriding
height, radius, padding, type scale and both hover rules through `className`
and trusting `tailwind-merge` to win every one of those conflicts. Defining
`cva` on the same `ButtonPrimitive` the shadcn component itself uses is less
code, has no merge-order dependency, and keeps
`docs/design-system.md` §7's promise that no file in `components/ui/` is
edited.

What **is** kept from the installed component, because it is the repo's
convention and the `shadcn` skill's rule: `data-slot`, the `data-icon` icon
convention with no sizing classes on the icon, `cn()` for composition, and the
`focus-visible` ring built from `--ring` (already rebound to `#485C11`).

### On `Rule` and `Separator`

The `shadcn` skill's rule is "use `Separator` instead of `<hr>` or
`<div className="border-t">`". `components/ui/separator.tsx` is installed.
**Read it first**, then either give `Rule` a `weight` prop that renders
`Separator` with the right colour token, or — if `Separator` cannot take a
colour without fighting it — render the semantic element directly and record
why in `docs/components.md`. Do not decide this from memory.

---

## Reference deltas

Every knowing difference from the reference, and why. An unrecorded deviation
is a defect (AGENTS.md §5).

| # | delta | why |
| --- | --- | --- |
| 1 | **Hover label is `#000000`, not the board's `#FFFFFF`** | white on sage is 2.93 : 1 and fails AA; black is 7.16 : 1. The fill stays exactly as the board states it. See Procedure 1 — and if the user prefers the board's white, this delta is dropped and the failure is recorded instead |
| 2 | **`Area` never ships** | AGENTS.md §1.7. No string in this step says it; `docs/design-system.md` §8 lists the five places step 4 must fix |
| 3 | **A visible focus ring exists where the board shows none** | the board draws rest and hover only. AGENTS.md §9.4 rule 1 makes focus a condition of done, so the ring is added rather than inherited from the comp's silence |
| 4 | **Touch targets** — the 40 px `IconButton` is below the 44 × 44 floor of AGENTS.md §9.4 rule 5 | the *fill* stays 40 px, as measured. The hit area is expanded to 44 px with padding or a pseudo-element, so the measurement ships and the floor holds. Both, not one |

---

## Breakpoint behaviour — 375, 800, 1280 named

| primitive | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| `Container` | 343 wide, 16 gutter | 720 wide, 40 gutter | 1200 wide, 40 gutter |
| `Button` | **48 px, unchanged** | 48 px | 48 px |
| `IconButton` | **40 px, unchanged** | 40 px | 40 px |
| `Eyebrow` | 11 px | 11 px | **12 px** |
| `Section` rhythm | **120 px, unchanged** | 120 px | 120 px |
| `Rule` | 1 px, container width | 1 px | 1 px |

**Only the eyebrow steps**, and it steps once, at `md`. Everything else in this
step is one value at every width — which is the measured finding of
`docs/design-system.md` §2.4 and §3.3, not a simplification.

The breakpoint is Tailwind's default `md` (768 px), per
`docs/design-system.md` §7.3's judgement #5. **No custom breakpoint is added.**

---

## Expected impact — which routes change, and how

- **No route changes.** `app/page.tsx` is untouched and still renders the
  8-line `Home` placeholder; `/` will look exactly as wrong after this step as
  before it. That is correct — step 4 replaces it.
- `app/globals.css` gains at most the tokens Procedure 4 and the touch-target
  delta require, if any. **A value that needs a token gets one, in
  `docs/design-system.md` and `@theme` in the same change** (AGENTS.md §9.1
  rule 1). No component in this step contains a raw hex or a raw pixel colour.
- `package.json` gains `@material-symbols/svg-400` (**0.46.0**, confirmed on the
  registry this session).
- `eslint.config.mjs` gains the narrow override of Procedure 5.

---

## Non-goals — deliberately out of scope

| not built | why |
| --- | --- |
| the nav, the mobile menu card, the footer | **step 3.** They consume these primitives; building them here would mean designing the chrome without the parts finished |
| any landing-page section, any real copy | **step 4** |
| a carousel | the `IconButton` is built; the thing it drives is step 4's, and AGENTS.md §8.2 "Do not overbuild" forbids inventing it now |
| GSAP, any motion beyond a CSS `:hover` transition | **step 5.** GSAP is still not installed (AGENTS.md §4) and no `gsap` import may appear |
| dark mode | Acres has no designed dark theme (`docs/design-system.md` §7.4). Do not extend the `.dark` block |
| the display / h2 / quote / stat type roles | tokenised in step 1, first *used* in step 4. This step uses only `--text-ui` and `--text-label*` |
| a second design system, a `components/ui/` rewrite | AGENTS.md §8.2 |

---

## Checks to run, and where the result is recorded

Run all four and **quote the real output** (AGENTS.md §6, §10 rule 3):

1. `npx tsc --noEmit`
2. `npm run build`
3. `npm run lint` — **must end clean**, per Procedure 5
4. **A browser verification, which the build cannot do.** Render every primitive
   on a scratch route, then read back from the DOM and check against the
   measurements above:
   - pill height is **48** and border-radius is **24** in both variants;
   - the secondary's rendered width is **117** and the primary's **126** for the
     label `Learn More`, and the difference is **9**;
   - `IconButton` is **40 × 40** with an **8 px** radius, and its hit area is
     **≥ 44 × 44**;
   - the eyebrow computes to Roboto Mono, `12px` at ≥ 768 and `11px` below,
     `letter-spacing: 0px`, colour `rgb(72, 92, 17)`;
   - the container computes to **343 / 720 / 1200** at viewport 375 / 800 / 1280;
   - **the hover label's computed colour**, confirming Procedure 1 shipped.

   Delete the scratch route before committing, or state plainly that it was
   kept and why.

**The record goes in `docs/components.md`** — a new file, which does not yet
exist. AGENTS.md's index already promises it ("not yet written"), so this step
**creates it and its index row stays as-is**; no other AGENTS.md change is
needed unless a measurement here contradicts a line in it, in which case that
line is fixed in the same change (AGENTS.md §10 rule 8).

`docs/components.md` must carry: the measured table above, the identification
results for all four glyph questions, the `Button`-not-wrapping-shadcn
decision, the `Rule`/`Separator` decision, the ESLint override and its reason,
and every judgement made — each naming what was measured.

---

## SKILLS USED

Invoke every one of these at execution time, before writing code. Listing is
not loading (AGENTS.md §5).

- **`frontend-design`** — owns the discipline that keeps the eyebrow sentence
  case and stops the pill becoming a generic rounded button. Loaded while
  writing this prompt; load it again.
- **`shadcn`** — `components/ui/` is `base-nova` on `@base-ui/react`, so it is
  `render`, not `asChild`; icons use `data-icon` with no sizing classes; the
  `Separator` rule governs `Rule`. Loaded while writing this prompt; the
  implementation needs it for `Separator`'s and `ButtonPrimitive`'s real API.
- **`tailwind-design-system`** — the variant API and token discipline for
  `cva` + `@theme`; needed before any new token is added.
- **`tailwind-4-docs`** — v4 has no `tailwind.config.js` and v3 muscle memory
  is wrong. Needed for arbitrary values, `min()` in a utility, and the `md`
  variant.
- **`vercel-react-best-practices`** — server/client boundaries. This step ships
  zero client components and that claim needs checking, not asserting.
- **`web-design-guidelines`** — the accessibility floor: focus visibility, the
  44 px target, and the contrast decision of Procedure 1. It fetches its rules
  live, so run it against the finished primitives rather than from memory.
- **`caveman-commit`** — the commit message. Always (AGENTS.md §3, §7).
