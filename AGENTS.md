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
| `docs/design-system.md` | the tokens — palette, type scale and roles, spacing, radii, the container and its gutters, elevation, motion constants — each measured from the references in §0, plus the `@theme` block that expresses them | **written.** Read it before any styling change; it corrects several lines below |
| `docs/components.md` | the primitives in `components/acres/` — the pill and its four states, the icon button, `Icon`, the container, the section shell, the eyebrow, the two rules — plus the four glyph identifications and the `cn()` contract | **written.** Read it before touching a primitive or adding a token; it corrects `prompts/02-primitives.md` in two places. The nav, the footer and the comparison table are still step 3's and step 4's |
| `docs/chrome.md` | the site chrome — horizontal nav, closed mobile card, open mobile menu, footer, logo mark vector extraction, and layout mounting | **written.** Read it before touching header, footer, or mobile disclosure |
| `docs/landing.md` | the `/` build record, section by section, against `Desktop.png` / `Tablet.png` / `Mobile.png` | **written.** Read it before touching the landing page; it records the extracted assets, copy, table decision, breakpoint measurements and deltas |
| `docs/motion.md` | GSAP on the site — the packages and verified imports, one-time registration, the client leaf and its `data-motion-*` hooks, the shared `DUR` / `EASE` reader, the two motion-distance tokens, every trigger, stagger, hover and press, reduced motion, cleanup, and the browser evidence | **written.** Read it before any animation change; it records why a CSS `cubic-bezier()` cannot be handed to GSAP, and one accessibility fix the reveal start state forced |
| `docs/polish.md` | the `web-design-guidelines` pass, the skip link and focus order, the reduced-motion CSS, the touch and colour-scheme base rules, the 404 page, the whole metadata and icon surface, and the pixel diff that proves no comp geometry moved | **written.** Read it before any accessibility, metadata or icon change; it records the accepted hero-flash trade-off and corrects two stale lines elsewhere |
| `docs/automation.md` | **read before measuring anything** — comp geometry, crop fitting, `magick` recipes, screenshotting, build diffing, port and worktree gotchas | **written.** Measurement and headless CDP verification recipes |
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
| `#929292` | the `01`/`02`/`03` step markers, and the one major section rule |
| `#E9E9E9` | hairline rules, the comparison-table card border |
| `#FFFFFF` | the page canvas, and the nav and menu cards |
| `#DFECC6` | the secondary button fill, the active icon-button fill |
| `#8E9C78` | the sage band behind every device shot; the hover fill of both buttons |
| `#485C11` | **the primary** — the primary button, and every eyebrow label |

- **The page background is `#FFFFFF`.** The pale mint the board sits on
  (`#EDF4F1`) is the Figma board, not a product surface — do not ship it as a
  page background.
- **`#485C11` is the only chromatic accent.** Sage and pale green are surfaces,
  never text.
- **Body copy is `#6F6F6F`**, at 5.02:1 on the canvas — it passes AA unchanged.
  `#929292` is 3.11:1 and is **large text and rules only**, never body.
- **The palette is seven values plus one.** The board's inactive icon-button fill
  measures `#E4E4E4`, which is in no swatch. It is a real eighth value and it has
  a token.
- **White on sage `#8E9C78` is 2.93:1 and fails contrast.** That is the hover
  state §1.5 states. `docs/design-system.md` §1.4 records it as an open finding
  and step 2 must resolve it rather than ship it unexamined.

## 1.2 Type — three families, three jobs, and the third one is not decoration

The board and the comps use exactly three faces, and the split is semantic:

1. **A serif, for display and for naming things.** The hero, every section
   heading, the pull-quote — and, importantly, the small feature-card headings
   and the numbered-step headings, both at 18 px. It is not reserved for large
   sizes. **The comparison table's column headers are not serif** — they measure
   DM Sans 500 at 26 px, and only Regular (400) of the serif is used anywhere.
2. **A geometric sans, for body copy and for UI.** Paragraphs, nav links, button
   labels, the wordmark.
3. **A monospace, for labels and for data.** Every eyebrow (`Benefits`, `Specs`)
   in `#485C11`, every comparison-table cell, the footer's copyright line. **This
   is the identity's signature and the easiest thing to lose** — a monospace
   eyebrow read as "a small caption" and reset in the sans destroys it.

**All three are identified by measurement.** The PDF outlines its text as Type 3
glyphs, so `pdffonts` names nothing — these were resolved on 2026-08-20 by
rendering candidates and matching glyph geometry against the references (§0),
not by recognising them:

| role | face | evidence |
| --- | --- | --- |
| display serif | **Crimson Text** | `Browse` scaled to the comp's 104 px cap height renders 463 × 106 against the comp's 456 × 105, and the `B` measures **81 px in both** |
| sans | **DM Sans** | a body line rendered from the PDF's *vector* text at 600 dpi matches at 3209 × 119 against 3197 × 120 — overlay diff **0.116**, against **0.238** for Roboto Flex. The wordmark's `a` has no bottom-right spur, which matches DM Sans and rules Roboto out |
| monospace | **Roboto Mono** | uniform advance of ≈ 7.16 px proves the face is genuinely monospaced. Against a 900 dpi vector specimen, Roboto Mono scores an overlay diff of **0.026** — **2.6× better than the next of seventeen candidates** (Martian Mono, 0.069). Its `l` carries both a top flag and a full base serif, which the reference has and IBM Plex Mono and JetBrains Mono do not |

**Roboto Mono's identification is corroborated by its own documentation**, which
states that "narrow glyphs like 'I', 'l' and 'i' have added serifs for more even
texture" — the exact trait that separates it from every other candidate tested.
Family facts, from `google/fonts` `ofl/robotomono/METADATA.pb`: designer
Christian Robertson, **OFL**, variable `wght` **100–700**, italics included.
It lives at **`ofl/robotomono`**, not `apache/robotomono`.

**The one residual uncertainty is commercial**: GT America Mono and DIN Mono are
named as Roboto Mono lookalikes and could not be tested, being licensed. A 0.026
diff across nineteen glyphs makes another foundry's face very unlikely, but if
the original Figma file names something else, **the file is the fact and this
row is stale** (§10 rule 8).

**Roboto Flex is not used anywhere in the references** and must not be added on
the strength of having once been suggested. It lost the sans comparison on both
metric and letterform.

**All three are on Google Fonts**, so all three come through `next/font/google`
with no self-hosting, as `--font-crimson-text`, `--font-dm-sans` and
`--font-roboto-mono`. Crimson Text is **not variable** — a `weight` array is
required, and only `400` is used. `opsz` on DM Sans is deliberately not pinned;
`font-optical-sizing: auto` drives it from `font-size`, which is what the comps
measure.

## 1.3 Layout — one container, three gutters, one grid

Measured from the three comps at their native widths:

| comp | width | gutter | container |
| --- | --- | --- | --- |
| `Mobile.png` | 375 | **16** | **343** |
| `Tablet.png` | 800 | 40 | 720 |
| `Desktop.png` | 1280 | 40 | 1200 |

The container is **`min(100vw − 2 × gutter, 1200px)`**, not three fixed widths.

- **The container is one component and every section sits in it**, including the
  full-bleed-looking photographs — they are inset to the container and carry a
  corner radius, not bled to the viewport edge.
- **The feature grid is 4 → 2 → 1**, with a **20 px** column gap at desktop, and
  a hairline `#E9E9E9` rule above each cell rather than a card border.
- **Section headings are left-aligned at every breakpoint except the three
  centred ones** — the **hero**, "Why Choose Acres?" and "Connect with us" —
  which are centred at every breakpoint. Centring is a per-section decision, not
  a breakpoint behaviour.
- **The wordmark does not scale.** Its ink height measures 22 px on all three
  comps. Neither do body copy (15 px), the pill (48 px), the media radius
  (24 px), the icon (24 px) or the section gap (120 px). **Only the two serif
  display roles scale.**

## 1.4 Shape — three radii and a pill

- **Buttons are full pills.** Measured height 48 px at **every** breakpoint; the
  radius is half the height, never a fixed `rounded-xl`.
- **Icon buttons are rounded squares** at **8 px** on a 40 px box.
- **Cards are 14 px; photographs, the sage band and device frames are 24 px.**
  The nav card on mobile rounds only its bottom corners, because it is anchored
  to the top edge.
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

## 1.6 Icons — Material Symbols, filled, 24 px

**Resolved.** The set is **Material Symbols**, delivered as individual SVGs
through `@material-symbols/svg-400`; `lucide-react` stays installed for anything
the board does not specify, and `components.json`'s `"iconLibrary": "lucide"`
stays, because it governs what the shadcn CLI generates, not what we author. All
eight board glyphs are filled, which is why substituting Lucide's stroked set was
rejected. Step 2 installs it; the glyph list is in `docs/design-system.md` §6.

**Three glyph questions were opened and all three are answered in
`docs/components.md` §3, two of them only provisionally.** The carousel arrows
are **`arrow_right` / `arrow_left`**, decisive at a 57x and a 47x margin. The
"Amplify Insights" mark is **`cable`, mirrored and rotated −45°**, and the pill's
↗ is **`arrow_outward`** — both win the whole 7798-glyph field but at margins of
7 % and 31 %, which do not clear the bar §1.2 set, so **both are raised with the
user and neither is closed.** Nothing ships either one yet. **Do not swap in the
nearest-looking substitute** — that is §10 rule 9.

## 1.7 The product is called Acres

`package.json` reads `"name": "acres"` — the line that said otherwise was stale
and is fixed here. What remains is the copy: the comps say "Area" in **five**
places, listed in `docs/design-system.md` §8, while the nav, the section heading
and the page title already say "Acres". **"Acres" is correct everywhere.** Every occurrence of "Area" in
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
7. **Write a prompt file in `prompts/`** per the contract in §5. Plan and detail every step, measurement, dependency, and file change thoroughly so implementation and execution are straightforward and unambiguous.
8. Ask exactly: `I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`
9. **On approval, re-read the approved prompt file and implement it strictly.**
   Implement only after approval. `y` or `Y` = `Approved. Execute.` Have
   `requesting-code-review` available before finishing implementation so the
   workflow for preparing a clean review request is ready.
10. Run the checks in §6 and **quote their real output** (self-verification:
    format, lint, typecheck, build, and diff review). Fix any discovered
    issues before requesting review.
11. **Run the two-stage code review loop — always, before recording or committing (§2.1, §3):**
    - **Stage 1 (`requesting-code-review`)**: Dispatch a reviewer subagent with
      precisely crafted context (requirements, git SHAs, what was built, checks run)
      to inspect the implementation and diff.
    - **Stage 2 (`receiving-code-review`)**: Evaluate feedback with technical
      rigor against codebase reality. Verify before implementing; push back with
      technical reasoning if wrong; never performative agreement or blind
      implementation. Fix valid issues and re-verify.
    - **Re-review**: Request follow-up review with `requesting-code-review` if
      feedback led to significant or architectural changes.
12. **Record what was built in the `docs/` file that owns the area** — a new
    one, added to the index above, if it belongs to none. **Never in this file**,
    beyond the one index row §1.8 permits.
13. Give the exact steps to see the result running.
14. **Commit to `main`, unprompted, using the `caveman-commit` skill** (§7).
    Every executed prompt ends in a commit. Never leave implemented work
    uncommitted. Do not push unless asked.

**Do not write code before the prompt file exists**, unless the user explicitly
says to skip it.

**Why step 14 matters.** Resolving what is already built — on any resume, in any
new session — reads the files on disk and `git log`, never the prompt files.
Work left uncommitted makes that resolution wrong and invites a duplicate prompt
for something that already exists.

## 2.1 Code review workflow

Every implementation undergoes a two-stage code review loop (`ref/ref-review.md`) using the Superpowers code-review skills vendored at `.agents/skills/` (and installable via `npx skills add https://github.com/obra/superpowers --skill requesting-code-review`):

```
Implement → Self-verify / run checks → Request review (requesting-code-review) → Receive/evaluate review (receiving-code-review) → Fix valid issues & re-test → Re-review if significant → Final completion & commit
```

1. **`requesting-code-review` (`.agents/skills/requesting-code-review`) — used first.**
   - Generally have this skill available before finishing implementation so the agent is prepared with the workflow for a good review request.
   - **Self-verify first**: Complete implementation, inspect all changed files, run checks in §6 (`npm run build`, `npm run lint`), and review the final diff. Do not request review for code known to be incomplete or failing.
   - **Dispatch a reviewer subagent**: Provide structured context — what was requested, what was implemented, files changed, architectural/design decisions, constraints, checks performed, and git SHAs (`BASE_SHA` / `HEAD_SHA`).
   - Reviewing via a subagent preserves the coordinator context window and ensures the reviewer evaluates actual code and diff against requirements.

2. **`receiving-code-review` (`.agents/skills/receiving-code-review`) — used on feedback.**
   - **Verify before implementing**: Check reviewer claims against the actual codebase and requirements. Check if suggestions break existing functionality or violate YAGNI (e.g. unused features).
   - **Forbidden responses**: Never give performative agreement ("You're absolutely right!", "Great point!"), gratitude expressions ("Thanks for catching that!"), or blind implementation. State the technical requirement, ask clarifying questions, or push back with reasoned technical evidence.
   - **Handling unclear feedback**: If any item is unclear, **stop and ask** before implementing anything.
   - **Implementation order**: Fix blocking issues first, then simple fixes, then complex refactors. Test each fix individually and verify no regressions.

3. **Re-review**: If changes affect architecture, public APIs, shared components, data flow, security, or complex UI/interaction behavior, invoke `requesting-code-review` for a follow-up review.

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
| 2026-08-20 · reaffirmed 2026-08-20 | Every commit message is written with the **`caveman-commit`** skill at `.agents/skills/caveman-commit` (§7). | Conventional Commits, ≤50-char subject, why-over-what, and no AI attribution trailer — one voice across the whole history. |
| 2026-08-20 | Always plan and write prompts that are very detailed so implementation and execution is easier. | Thorough planning and granular specifications eliminate ambiguity, provide complete context and measurements upfront, and ensure execution is straightforward and reliable. |
| 2026-08-20 | Always use **`requesting-code-review`** and **`receiving-code-review`** (`.agents/skills/requesting-code-review`, `.agents/skills/receiving-code-review`) to review every implementation: Implement → request review → receive/evaluate review → fix issues → re-review (§2, §2.1). | Enforces a two-stage code review loop: dispatching a reviewer subagent with clean context and evaluating feedback with technical rigor and codebase verification before making fixes or committing. |

**On the skill's path.** `.agents/skills/caveman-commit/` and
`.claude/skills/caveman-commit/` are two byte-identical copies (`diff -rq`
reports no difference); the Skill tool resolves the `.claude/` one. Either
satisfies this rule while they match. **If they ever diverge,
`.agents/skills/caveman-commit` is the one this ledger names and the one that
wins** — and the divergence is a defect to fix, not to work around.

**The skill owns the message; §2 step 14 owns the act.** The skill's own
Boundaries section says it "does not run `git commit`, does not stage files".
That is not an exemption from committing — it means the skill writes the message
and this file requires the commit.

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
| `requesting-code-review` | completing tasks, implementing features, or preparing review requests to dispatch reviewer subagent (§2, §2.1) |
| `receiving-code-review` | receiving code review feedback, to evaluate and act on suggestions with technical rigor before implementing changes (§2, §2.1) |
| `caveman-commit` | **every commit, always** (§3, §7) |

**GSAP is not installed yet.** Do not write a `gsap` import before a prompt has
added the dependency; the skills describe the API, not the repository.

---

# 5. Prompt files

Every implementation request gets a file in `prompts/`, written before any code
(§2 step 7) and re-read verbatim at execution time (§2 step 9).

**Always plan thoroughly and write prompts with deep, granular detail so implementation and execution are easier, unambiguous, and straightforward.** Detail all target paths, references, exact measurements, component structures, API contracts, edge cases, and verification commands in advance.

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

Commit to `main` unprompted at the end of every executed prompt (§2 step 14).
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

**Resolve this from the repository and `git log`, never from here** (§10 rule 5).
This paragraph is a snapshot and goes stale by design.

At the time step 1 landed: `app/globals.css` carries the Acres `@theme` block and
the rebound shadcn token names; `app/layout.tsx` loads the three faces of §1.2;
`docs/design-system.md` holds the measured record. `app/page.tsx` is still
`create-next-app` boilerplate and **will look wrong** — step 4 replaces it. The
full `components/ui/` primitive set is installed and **untouched**; it repaints
from the rebound tokens. `public/assets/ui/` holds the references (§0). There is
no component of our own, no content, and no backend of any kind.

**`npm run lint` and `npx tsc --noEmit` both run clean** — no output, exit 0, on
the tree at `f29f674` and on the current tree. The two lint errors this
paragraph used to name in `components/ui/carousel.tsx` and `hooks/use-mobile.ts`
are gone; `docs/design-system.md` §11 is stale on that point.

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
| 7 | **The `client/` split** — `git mv` the app into `client/`, npm workspaces at the root, and rewrite every path this file's §0 pins plus the pinned paths in each written `docs/` file. **`server/` is not created here** | 6 |
| 8 | **The NestJS server** — `server/` scaffolded, `packages/shared` for the DTOs both sides read, then the data layer, auth and accounts, jobs and scheduling, and forms | 7 |

**Step 1 is load-bearing and everything else waits on it.** A component built
before the tokens exist encodes a hex value that then has to be found and
removed from every file it reached.

**Steps 7 and 8 are the backend, and the split is deliberate.** The user's
sequencing, set on 2026-08-20: **build the UI first, hook it to the server
after.** So the restructure runs at the seam — after step 6, not before — and it
moves the client only. NestJS earns a second runtime because the backend's
confirmed scope is a real data layer over regional data, auth with sessions,
scheduled jobs, and forms; that is not a Next route handler's job. `server/`
stays uncreated until step 8 so that no scaffold sits dead through the UI work,
and the workspace wiring and the Nest setup stay two reviewable changes.

**Four things step 7 must settle**, none of them decided yet: npm workspaces
rather than Turborepo to start; the `public/assets/ui/` → `client/public/assets/ui/`
rewrite, using `git mv` so history follows the files; whether `packages/shared`
lands at step 7 or step 8; and where Nest deploys — Next on Vercel is settled,
but jobs and scheduling may want a long-lived host, and that shapes how the Nest
app is structured, so it is decided before step 8's jobs work, not during it.

### Do not overbuild

No second design system. No component library that is not `components/ui/` plus
our own primitives on top. **Through step 6 there is no backend, no database, no
auth and no CMS** — the content is typed constants, and steps 7 and 8 are the
"until a prompt says otherwise". Nothing in the backend is started early: a step
7 or step 8 concern raised during steps 1–6 is recorded, not built. **No feature
that is not a step above** — if one seems necessary, say so and ask rather than
adding it.

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
