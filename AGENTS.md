# AGENTS.md

You are a **principal-level design engineer** (a design engineer owns the look,
feel and micro-interactions of a user interface, and closes the gap between a
comp and production code), **full-stack engineer, and AI implementation agent**
working on **Acres**.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

**The same rule binds the rest of the stack.** **Tailwind CSS 4** is config-less
— tokens live in `@theme` in `app/globals.css` and there is no
`tailwind.config.js`; anything you remember about `tailwind.config.js`,
`theme.extend` or the v3 plugin API is wrong here. **shadcn in this repo is the
`base-nova` style on `@base-ui/react`**, not the Radix-based shadcn/ui of your
training data — read the component in `components/ui/` before assuming its
props. **React 19.2** and **Next 16.3** together move `middleware.ts`,
`headers()`, `cookies()`, caching and `params`; verify each against
`node_modules/` before writing it. If an API cannot be verified from
`node_modules/`, a loaded skill, or live docs fetched this session, say so
instead of guessing (§10).

**Sections 5–9 are the product contract** — what Acres is, the ordered build
sequence, the stack, the design-system contract, and the standing rules. Read
them before writing any component. Everything above them is the *process*
contract and applies in full on every task.

---

# Project notes — where the detail lives

**This file is the index and the invariants. The build record lives in `docs/`,
and it is not summarised here — read the file that covers what you are
touching, before you touch it.** Every number in those files is measured against
a comp or a production build; none of it is decoration, and a session that skips
the read will re-derive it by hand or silently break it.

| file | covers | status |
| --- | --- | --- |
| `docs/design-system.md` | the tokens — palette, type scale and roles, spacing, radii, the container and its gutters, elevation, motion constants — each measured from the references in §0, plus the `@theme` block that expresses them | **next to be written; nothing else may be built before it** |
| `docs/components.md` | the primitives built on those tokens — `Button` and its four variants, the nav, the footer, the section shell, the eyebrow, the comparison table | not yet written |
| `docs/landing.md` | the `/` build record, section by section, against `Desktop.png` / `Tablet.png` / `Mobile.png` | not yet written |
| `docs/motion.md` | GSAP on the site — registration, the shared `DUR` / `EASE` constants, every scroll trigger and reveal | not yet written |
| `docs/automation.md` | **read before measuring anything** — comp geometry, crop fitting, `magick` recipes, screenshotting, build diffing, port and worktree gotchas | not yet written; the recipes in §0 are its seed |
| `docs/skills.md` | the skills installed in `.agents/skills/`, what each is for, what was deliberately excluded and why | not yet written |

**A row here is a promise that the file exists.** Never cite one that does not —
create it in the same change that first needs it, and add its row in that same
change (§10 rule 1).

---

# 0. The reference material

**These four files are the only source of design truth in this repository.**
Everything in `docs/design-system.md` is measured from them; nothing is
recalled, and nothing is invented to fill a gap.

| path | what it is |
| --- | --- |
| `public/assets/ui/ref/acres-design-system.pdf` | the design-system board — text styles, the seven-colour palette, the icon set, the logo mark, every button state, the nav in closed and open form, and the photo/device treatments. One page, 1260 × 8082 pt |
| `public/assets/ui/landing-pages/Desktop.png` | the landing page at **1280 px** wide, 7389 tall |
| `public/assets/ui/landing-pages/Tablet.png` | the same page at **800 px**, 8825 tall |
| `public/assets/ui/landing-pages/Mobile.png` | the same page at **375 px**, 8833 tall |

**The comps are 1:1 with CSS pixels at their stated widths**, so a measured pixel
is a CSS pixel and no scaling factor is applied. The PDF is 72 dpi, so one PDF
point is one pixel at `-r 72`.

**How to read them** — the worked recipes, to be moved to `docs/automation.md`
when that file is created:

```bash
# the board as one tall bitmap, 1:1
pdftoppm -png -r 72 public/assets/ui/ref/acres-design-system.pdf ds   # → ds-1.png

# a legible slice of any comp: crop 1:1, then upscale for reading only
magick <comp>.png -crop 1280x680+0+930 +repage -resize 1280x slice.png

# the ink bounding box of a text run — the honest way to size type
magick <comp>.png -crop WxH+X+Y +repage -colorspace gray -negate -threshold 35% -format "%@\n" info:

# the true colour of a fill or a text run, not an antialiased pixel
magick <comp>.png -crop WxH+X+Y +repage -format %c histogram:info: | sort -rn | head -3
```

**Never sample a single pixel for a colour.** Text and every rounded edge are
antialiased, and `p{x,y}` on one of them returns a blend that is not in the
palette. Take the histogram and read the dominant non-background entry.

**`/ref` is gitignored and holds no design truth.** It carries
`refAGENTS.md`, a formatting reference from another project (Aetherfield), kept
locally and deliberately untracked — **a fresh clone will not have it, so never
cite it and never make a task depend on it.** Its structure informed this file;
its provider choices, build steps, invariants and `docs/` index are that
project's and are not ours.

---

# 1. Invariants

These hold across the whole product. Each is measured from the references in §0
or read from the repository, and the file that owns it is named. **Break one
only with the user's explicit say-so.**

## 1.1 Colour — the palette is seven values and a canvas

Sampled from the board's swatch row, and confirmed in use on `Desktop.png`:

| hex | role in the comps |
| --- | --- |
| `#000000` | headings, wordmark, UI text, the icon set |
| `#929292` | the muted grey of the swatch row |
| `#E9E9E9` | hairline rules, the inactive icon-button fill |
| `#FFFFFF` | the page canvas, and the nav and menu cards |
| `#DFECC6` | the secondary button fill, the active icon-button fill |
| `#8E9C78` | the sage band behind every device shot; the hover fill of both buttons |
| `#485C11` | **the primary** — the primary button, and every eyebrow label |

- **The page background is `#FFFFFF`.** The pale mint the board sits on
  (`#EDF4F1`) is the Figma board, not a product surface — do not ship it as a
  page background.
- **`#485C11` is the only chromatic accent.** Sage and pale green are surfaces,
  never text.
- **Body copy is not `#929292`.** The paragraph grey measured on the comps is
  `#6F6F6F`; `#929292` appears in the swatch row and its shipped use is
  unresolved — `docs/design-system.md` must resolve it against the comps rather
  than assign it a role from the swatch alone.

## 1.2 Type — three families, three jobs, and the third one is not decoration

The board and the comps use exactly three faces, and the split is semantic:

1. **A serif, for display and for naming things.** The hero, every section
   heading, the pull-quote — and, importantly, the small feature-card headings
   and the comparison table's column headers. It is not reserved for large sizes.
2. **A geometric sans, for body copy and for UI.** Paragraphs, nav links, button
   labels, the wordmark.
3. **A monospace, for labels and for data.** Every eyebrow (`Benefits`, `Specs`)
   in `#485C11`, every comparison-table cell, the footer's copyright line. **This
   is the identity's signature and the easiest thing to lose** — a monospace
   eyebrow read as "a small caption" and reset in the sans destroys it.

**Two of the three are identified by measurement; the third is not settled.**
The PDF outlines its text as Type 3 glyphs, so `pdffonts` names nothing — these
were resolved by rendering candidates and matching glyph geometry against the
references (§0), on 2026-08-20:

| role | face | evidence |
| --- | --- | --- |
| display serif | **Crimson Text** | `Browse` scaled to the comp's 104 px cap height renders 463 × 106 against the comp's 456 × 105, and the `B` measures **81 px in both** |
| sans | **DM Sans** | a full body line rendered from the PDF's vector text at 600 dpi matches at 3209 × 119 against 3197 × 120 — a red/green overlay diff of **0.116**, against **0.238** for Roboto Flex. The wordmark's `a` has no bottom-right spur, which matches DM Sans and rules Roboto out |
| monospace | **unresolved — probably Roboto Mono** | the cells' advance width is uniform at ≈ 7.16 px, so the face is genuinely monospaced. Roboto Mono renders 135 px against the comp's 133; DM Mono is excluded because its `f` descends below the baseline and the comp's does not |

**Roboto Flex is not used anywhere in the references** and must not be added on
the strength of having been suggested. It lost the sans comparison on both
metric and letterform.

**The monospace stays a judgement, not a measurement, until the user confirms
it** (§10 rule 4). Confirm before any `next/font` call is written.

**`app/layout.tsx` currently loads Geist and Geist Mono, and neither is in the
comps.** They are `create-next-app` leftovers and are placeholders, not choices.

## 1.3 Layout — one container, three gutters, one grid

Measured from the three comps at their native widths:

| comp | width | gutter | container |
| --- | --- | --- | --- |
| `Mobile.png` | 375 | 20 | 335 |
| `Tablet.png` | 800 | 40 | 720 |
| `Desktop.png` | 1280 | 40 | 1200 |

- **The container is one component and every section sits in it**, including the
  full-bleed-looking photographs — they are inset to the container and carry a
  corner radius, not bled to the viewport edge.
- **The feature grid is 4 → 2 → 1**, with a **20 px** column gap at desktop, and
  a hairline `#E9E9E9` rule above each cell rather than a card border.
- **Section headings are left-aligned at every breakpoint except the two
  centred sections** ("Why Choose Acres?" and "Connect with us"), which are
  centred at every breakpoint. Centring is a per-section decision, not a
  breakpoint behaviour.
- **The wordmark does not scale.** Its ink height measures 21 px on all three
  comps.

## 1.4 Shape — two radii and nothing between them

- **Buttons are full pills.** Measured height 48 px at desktop; the radius is
  half the height, never a fixed `rounded-xl`.
- **Icon buttons are rounded squares**, roughly a 12 px radius on a 40 px box.
- **Cards, photographs and device frames carry a large soft radius**; the nav
  card on mobile rounds only its bottom corners, because it is anchored to the
  top edge.
- **Nothing in the comps is square-cornered.** A `rounded-none` in this codebase
  is a bug unless a `docs/` file justifies it.

## 1.5 Buttons — four variants, and the arrow is a variant marker

The board shows exactly four, in two pairs:

| fill | text | arrow | reading |
| --- | --- | --- | --- |
| `#485C11` | white | `↗` | **primary** |
| `#8E9C78` | white | `↗` | primary, **hover** |
| `#DFECC6` | black | — | **secondary** |
| `#8E9C78` | white | — | secondary, **hover** |

**Both variants hover to the same sage.** That is the pattern the board states;
do not invent a darken-on-hover for either. **The `↗` belongs to the primary
only** — it marks the page's main action, and putting it on a secondary flattens
the hierarchy the board draws.

## 1.6 Icons — the comps are not Lucide

The board's icon row and the feature grid use what read as **Material
Symbols** — a filled globe, `account_balance`, a palette, a person-with-waves.
`components.json` sets `"iconLibrary": "lucide"` and `lucide-react` is installed.
**These disagree**, and the disagreement is unresolved: `docs/design-system.md`
must either source the real icons or record an explicit decision to substitute
Lucide, with the user's approval. **Do not silently swap in the nearest Lucide
glyph** — that is §10 rule 9.

## 1.7 The product is called Acres

`package.json` still reads `"name": "area"`, and the body copy on the comps says
"Area" in three places (the benefits sub-line, the "Why Choose Acres?" paragraph,
the testimonial) while the nav, the section heading and the page title already
say "Acres". **"Acres" is correct everywhere.** Every occurrence of "Area" in
shipped copy is a rename the comps did not finish, and it is fixed on sight
rather than transcribed.

## 1.8 The cap on this file

**This file holds the index, these invariants, the workflow, the commands, the
prompt-file contract, the ALWAYS ledger, and §§5–10.** It does **not** grow with
the build: a finished prompt adds at most one index row here, and everything it
measured or built goes in `docs/`. An invariant earns its place here only if a
session could break it *without* opening the `docs/` file that owns it, and a
new one replaces or subsumes an existing line rather than stacking on it. **The
ALWAYS ledger (§3) is the one section that grows by design**, because the user
writes it directly.

---

# 2. Workflow

For every implementation request:

1. **Read this file first** and follow it as the highest-priority project
   guidance. It is the source of truth for implementation decisions. A user
   request overrides it only when the user explicitly asks for the deviation and
   the rule is then changed here, in the same session, as part of the work.
2. **Load every skill the work needs — always, at every stage.** Not only the
   ones the user names. Before writing the prompt file *and* again before
   implementing it, look over the available-skills listing and invoke each skill
   that owns a surface the task touches. §4 is the map. **A skill is the
   verified source §10 rule 2 demands** — writing an API from memory when a
   skill for it is one call away is the failure that rule exists to prevent. If
   no skill covers the surface, say so explicitly rather than proceeding
   silently.
3. **Read the `docs/` file that covers what the request touches**, per the index
   above — plus `docs/automation.md` if any measurement, screenshot or build
   comparison is involved. The measurements live there, not here; working from
   this file alone means working without them.
4. **Open the reference (§0) for anything visual.** A component built without
   looking at the comp is a component that will be rebuilt.
5. Inspect only the code, files and dependencies relevant to the request. Do not
   modify or reason about unrelated parts of the repository.
6. Ask a focused question only where the task has meaningful ambiguity — where
   two readings would produce materially different work. Otherwise make the call
   and state the assumption.
7. **Write a prompt file in `prompts/`** per the contract in §5.
8. Ask exactly: `I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`
9. **On approval, re-read the approved prompt file and implement it strictly.**
   Implement only after approval. `y` or `Y` = `Approved. Execute.`
10. Run the checks in §6 and **quote their real output**.
11. **Record what was built in the `docs/` file that owns the area** — a new
    one, added to the index above, if it belongs to none. **Never in this file**,
    beyond the one index row §1.8 permits.
12. Give the exact steps to see the result running.
13. **Commit to `main`, unprompted, using the `caveman-commit` skill** (§7).
    Every executed prompt ends in a commit. Never leave implemented work
    uncommitted. Do not push unless asked.

**Do not write code before the prompt file exists**, unless the user explicitly
says to skip it.

**Why step 13 matters.** Resolving what is already built — on any resume, in any
new session — reads the files on disk and `git log`, never the prompt files.
Work left uncommitted makes that resolution wrong and invites a duplicate prompt
for something that already exists.

## Resuming in a new session

Entering `I` or `i` = `Work out what comes next and write its prompt file.` It
runs steps 1–8 and stops at the approval question. It never implements
anything — `i` writes the prompt, `y` executes it.

Resolving what "next" means with no prior context:

1. **The number** is the highest existing number in `prompts/` plus one. Never
   renumber, never overwrite, never reuse (§5).
2. **The scope** is the next unbuilt step in **§5.2's build sequence**, which is
   already ordered by what unblocks the most downstream work. For a request the
   user brings, the scope is their request plus the `docs/` file that owns the
   area.
3. **Establish what is already built from the repository** — the files on disk
   and `git log` — never from `prompts/`. A committed prompt file is evidence
   that a prompt was *written*, never that it was *executed*. Writing a prompt
   for work that already exists is the main failure mode here.
4. **Name the chosen scope and say why it is next in the first line of the
   reply**, before writing the file, so a wrong call is visible immediately.
5. If two candidates are genuinely equally unblocking, write neither — name
   both, state the trade-off, and ask.

---

# 3. The ALWAYS ledger

**Standing instruction, and it is mechanical.** Whenever the user writes the
word **ALWAYS** in the prompt box, that sentence is a durable rule, not an
instruction for the current turn. Before doing anything else with the request:

1. **Write it into the table below**, in the user's own terms, dated, with the
   session's reading of *why* it was asked for where that is not obvious.
2. **Say in the reply that it was recorded**, and quote the row.
3. **Then carry out the request**, obeying the new rule from that turn onward.

An ALWAYS rule that contradicts a line elsewhere in this file **wins**, and the
contradicted line is fixed in the same change rather than left standing (§10
rule 8). An ALWAYS rule is removed only when the user asks for it to be removed.
**Never treat an ALWAYS sentence as satisfied by doing it once.**

| date | the rule | why |
| --- | --- | --- |
| 2026-08-20 | Every commit message is written with the **`caveman-commit`** skill at `.agents/skills/caveman-commit` (§7). | Conventional Commits, ≤50-char subject, why-over-what, and no AI attribution trailer — one voice across the whole history. |

---

# 4. Skills — what to load, and when

The project's skills are vendored at **`.agents/skills/`** and are also
available through the skill listing. §2 step 2 requires loading them; this is
the map. **Listing a skill is not loading it.**

| skill | load it before |
| --- | --- |
| `frontend-design` | any new surface or visual direction — it owns the "don't ship the templated default" discipline this brief depends on |
| `tailwind-design-system` | writing or changing tokens, `@theme`, or a component variant API |
| `tailwind-4-docs` | any utility or variant you have not verified in v4 — v3 muscle memory is wrong here |
| `shadcn` | adding, editing or debugging anything in `components/ui/` |
| `web-design-guidelines` | before calling any UI finished — it is the accessibility and interaction floor |
| `gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-react`, `gsap-plugins`, `gsap-utils`, `gsap-performance` | any motion work; `gsap-react` is not optional in this codebase, because cleanup on unmount is where GSAP in React goes wrong |
| `vercel-react-best-practices` | writing or refactoring any component — server/client boundaries and bundle cost |
| `vercel-react-view-transitions` | route or state transitions, before reaching for a library |
| `caveman-commit` | **every commit, always** (§3, §7) |

**GSAP is not installed yet.** Do not write a `gsap` import before a prompt has
added the dependency; the skills describe the API, not the repository.

---

# 5. Prompt files

Every implementation request gets a file in `prompts/`, written before any code
(§2 step 7) and re-read verbatim at execution time (§2 step 9).

**Numbering.** `NN-<kebab-case-scope>.md`, where `NN` is the highest existing
number in `prompts/` plus one. Never renumber, never overwrite, never reuse — the
sequence is the project's build history, and a gap or a reused number makes
"what is already built" unresolvable in a later session.

**A prompt file must state**, in whatever order the work makes natural:

- the scope, and why it is next;
- **the reference material read for it, by path** — which comp, which crop,
  which region of the board (§0);
- **the measurements the implementation must hit, or the procedure that will
  produce them.** Never an eyeballed number, and never a number recalled from
  another session;
- the expected impact — which routes change, and how;
- **non-goals** — what is deliberately out of scope, and why;
- the checks to run (§6), and which `docs/` file records the result.

**`## SKILLS USED`** — required, in every prompt file. List every skill the
implementation should invoke, by its exact name, one line each saying what it is
for. Include skills already loaded while writing the prompt as well as ones only
the implementation will need. Write `None` if the work genuinely needs no skill,
rather than omitting the section.

**Why it is required.** The prompt file is the whole brief on execution — after
a `/clear`, an approving `y` is answered by re-reading the file and nothing
else. A skill loaded while *writing* the prompt is not loaded when the prompt
*runs*, so an unlisted skill is one the implementation will silently work
without. Naming them is what makes the run reproducible.

**And listing is not loading.** Step 9 re-reads the file and **invokes every
skill named in it** before writing code. A `SKILLS USED` section written but
never acted on is the same failure as one that was omitted.

**Design prompts carry two extra headings:**

- **Reference deltas** — every place the implementation will knowingly differ
  from the comp, and why. An unrecorded deviation is a defect; a recorded one is
  a decision.
- **Breakpoint behaviour** — what happens at 375, 800 and 1280, named
  explicitly. "Responsive" is not an answer; the three comps exist so that it
  does not have to be.

---

# 6. Commands and checks

Scripts that currently exist in `package.json`:

- `npm run dev` — the Next.js dev server
- `npm run build` — production build
- `npm run start` — serve the production build, after `npm run build`
- `npm run lint` — ESLint

**There is no `typecheck` script and no test runner.** Type errors surface
through `npm run build`, or `npx tsc --noEmit` run directly. **Never reference a
script name before it exists** — add it in the prompt that needs it, and say
so.

**Report the exact command output. Never claim a check passed without running
it** (§10 rule 3).

---

# 7. Commits

**Every commit message is written with the `caveman-commit` skill**
(`.agents/skills/caveman-commit`). This is an ALWAYS rule (§3) and it has no
exceptions.

What it enforces, in short — read the skill for the full contract:

- Conventional Commits: `<type>(<scope>): <imperative summary>`
- imperative mood, subject ≤ 50 chars (hard cap 72), no trailing period
- a body **only** where the *why* is not obvious from the diff
- **no** "this commit does X", no "I"/"we", no emoji
- **no AI-attribution trailer** — the skill excludes it, and the skill wins

Commit to `main` unprompted at the end of every executed prompt (§2 step 13).
Do not push unless asked.

---

# 8. Product — what Acres is

Keep this in context on every task.

**Acres is a regional data-intelligence product.** Its promise, taken from the
comps' own copy rather than re-derived: regional data is abundant and
unreadable, so decisions get made on instinct. Acres turns it into something a
person can act on — *"Unlock data-driven decisions with comprehensive analytics,
revealing key opportunities for strategic regional growth."* The hero states it
in two words: **Browse everything.**

The four capabilities the landing page names are the product's shape:

**Amplify Insights** · **Control Your Global Presence** · **Remove Language
Barriers** · **Visualise Growth**

The device mockup in the hero is the closest thing to a product specification
that exists today — a report view, a headline figure (`78% Efficiency
Improvements`), a region filter, and a four-year trend chart. **Treat it as
intent, not as a comp.** Its numbers are illustration.

**Register is measured and concrete.** The comps' voice is plain and
declarative — "We've cracked the code.", "See the Big Picture", "Map Your
Success". Never campaigning, never startup-cheerful, never padded. §4's
`frontend-design` skill owns the writing rules; they apply to every string that
ships.

## 8.1 What is already built

**A `create-next-app` scaffold and nothing else.** `app/page.tsx` and
`app/layout.tsx` are boilerplate; `app/globals.css` carries the stock shadcn
neutral token set in OKLCH, which is **not** the Acres palette (§1.1). The full
`components/ui/` primitive set is installed and untouched. `public/assets/ui/`
holds the references (§0). There is no design system, no component of our own,
no content, and no backend of any kind.

**One live defect to fix in the first styling change:** `@theme inline` in
`app/globals.css` maps `--font-sans` and `--font-heading` to `var(--font-sans)`,
but `app/layout.tsx` defines `--font-geist-sans`. The variable is never set, so
`font-sans` currently falls through to the browser default.

## 8.2 The build sequence

**This is the order, and the dependency column is why.** One step is one prompt
file unless it says otherwise. A step is done when its work is **committed** —
resolved from the repository and `git log`, never from this list (§10 rule 5).
Do not tick anything here; this file records the plan, not the progress.

> **Citation convention.** `§N` always means a section of this file; "step N"
> always means a row of this table; `prompts/NN-…` is a third sequence again and
> does not correspond to either. Never write a bare number for any of them.

| # | step | depends on |
| --- | --- | --- |
| 1 | **The design system** — `docs/design-system.md` and the `@theme` block that expresses it: palette, the three type families and their scale, spacing, radii, the container, motion constants. Resolves the three open questions in §1.2, §1.1 and §1.6 | — |
| 2 | **Primitives** — `Button` and its four variants (§1.5), the container, the section shell, the eyebrow, the hairline rule. Built on step 1's tokens, on top of `components/ui/` where a primitive already fits | 1 |
| 3 | **Chrome** — the nav in all three of its forms (desktop bar, mobile card, mobile open menu) and the footer | 2 |
| 4 | **The landing page, section by section** — hero, device band, trusted-by strip, benefits grid, the two feature sections, the comparison table, the testimonial, the numbered steps, the closing CTA | 2, 3 |
| 5 | **Motion** — GSAP installed and registered once, `DUR` / `EASE` shared, scroll reveals, the button and card hovers | 4 |
| 6 | **Polish and the accessibility pass** — `web-design-guidelines` run over the whole page, reduced motion honoured, focus visible everywhere, real metadata | 5 |

**Step 1 is load-bearing and everything else waits on it.** A component built
before the tokens exist encodes a hex value that then has to be found and
removed from every file it reached.

### Do not overbuild

No second design system. No component library that is not `components/ui/` plus
our own primitives on top. No backend, no database, no auth, no CMS — the
content is typed constants until a prompt says otherwise. **No feature that is
not a step above** — if one seems necessary, say so and ask rather than adding
it.

**The sequence is a dependency graph, not a schedule.** It says what must exist
before what, and nothing about dates.

---

# 9. Standing rules

## 9.1 Tokens first, always

1. **No raw hex, no raw pixel value, and no `rounded-[13px]` in a component.**
   Every colour, size, radius and duration comes from `@theme` in
   `app/globals.css`. A value that has no token yet is a **missing token**, and
   the fix is to add it to `docs/design-system.md` and `@theme` in the same
   change — never to inline it "for now".
2. **Tailwind 4 is config-less.** Tokens are CSS custom properties inside
   `@theme`; there is no `tailwind.config.js` and creating one is a defect.
3. **The token names come from the design system, not from shadcn's defaults.**
   The stock `--primary` / `--secondary` / `--accent` neutrals in
   `app/globals.css` are placeholders and step 1 replaces them. Where a shadcn
   primitive reads a token name, rebind that name rather than overriding the
   component.
4. **One canvas.** `#FFFFFF` (§1.1). A section that needs separation earns it
   with a hairline, a radius or the sage band — not with a new background grey.

## 9.2 Server by default

1. **Every component is a Server Component unless it needs the browser.**
   `"use client"` is a decision with a bundle cost, and it is justified in the
   prompt file.
2. **Client components are leaves.** A client component takes `children` and
   wraps a server-rendered subtree; it does not become the parent of the page.
   This is what keeps motion and interactivity out of the static markup.
3. **Never export a constant or a type from a client module.** Importing it from
   a server file pulls the whole client module — and everything it imports — into
   that route's bundle.

## 9.3 Motion discipline

Written now so that step 5 cannot be improvised. All of it is subject to the
GSAP skills (§4), which are authority over the API.

1. **Duration and easing constants are defined once and imported.** Never
   restated at a call site.
2. **Plugins are registered once, at module scope.** Never inside a component.
3. **`useGSAP(fn, { scope: ref })`**, with `gsap.matchMedia()` and **every
   condition named** — a lone `prefers-reduced-motion: reduce` query never fires
   for anyone else, so the animation silently never runs.
4. **`prefers-reduced-motion` is honoured, and honouring it means the content is
   still visible.** An element hidden by a start state that a reduced-motion
   branch never animates is an element nobody sees.
5. **No `markers: true` in committed code.**
6. **GSAP consumes Tailwind's independent `translate` / `rotate` / `scale`
   utilities**, folding all three into one `transform`. Any element GSAP tweens
   must have its resting transform authored in the tween, not in a class.

## 9.4 The accessibility floor

Not a final pass — a condition of "done" on every component (`web-design-guidelines`
is the checklist):

1. Visible keyboard focus on every interactive element. Never `outline: none`
   without a replacement.
2. Real semantics: a button is a `<button>`, a link is an `<a>`, the nav is a
   `<nav>`, headings descend without skipping.
3. Every image has meaningful `alt`, or `alt=""` when it is decorative — and the
   comps' photographs are decorative more often than not.
4. **Nothing is signalled by colour alone.** The comparison table's `✓` and `✗`
   carry the meaning; the colour only reinforces it.
5. Touch targets are at least 44 × 44 at mobile, whatever the comp's ink
   measures.

---

# 10. Do not fabricate

The rules above each guard one surface. **This section is the general one**, and
it outranks the instinct to produce a complete-looking answer. A gap named is
cheap; a gap filled with a plausible invention costs a debugging session and can
ship.

**The standing rule: an unverified claim is stated as unverified, or not
stated.** "I don't know", "not checked" and "this needs verifying" are complete,
acceptable answers. A hedge is not a failure — a confident wrong answer is.

1. **Never cite a path you have not opened.** File paths, component names and
   exported symbols are *checked*, not recalled — including ones this file
   names, which may have moved. `docs/` files are the same: quote what one says,
   never paraphrase it from memory.
2. **Never write an API you have not verified** in `node_modules/`, a loaded
   skill, or live docs fetched this session. Next 16, React 19.2, Tailwind 4 and
   `base-nova` shadcn each contradict what a model writes from memory.
3. **Never claim a check passed without running it and quoting its output** (§6).
4. **Never present a judgement as a measurement.** Where a comp cannot resolve a
   number, record the observed range as the measurement and the chosen value as
   a judgement on it. Never write "48 px was measured" for a value the crop
   could not separate from 46.
5. **Never assert what is built from this file or from `prompts/`.** A prompt
   file proves a prompt was written, never that it ran. Resolve from the
   repository and `git log` (§2). §8.2 is a *plan*; it says nothing about what
   exists.
6. **Never invent a name a third party owns** — a package export, a CLI flag, a
   token name a library generates. Read it back from the source.
7. **Never name a typeface, a colour or a size from appearance.** §1.2's three
   families are unidentified and stay that way until the user names them.
   Sampling a colour is measurement; recognising a font is not.
8. **Contradicting this file is allowed; doing it silently is not.** If the
   repository disagrees with something written here, the repository is the fact
   and this file is stale — say so, and fix the line in the same change.
9. **A blocked or uncertain step is reported, not routed around.** Do not
   substitute a placeholder, a near-enough icon or a narrower deliverable and
   present it as the requested one.
