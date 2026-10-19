# Simplify landing content and give the product story room

## Request, scope and approval boundary

Continue from local `main` at **2685bbb** (`feat(landing): illustrate the
regional data journey`, prompt 401). The user finds the landing page too
text-heavy, crowded and compact. Simplify illustrations, remove repetitive
labels/explanations, and give content more whitespace while preserving the
product-led hybrid direction and Acres branding.

This is a directly requested refinement of the implemented marketing surface
(legacy landing steps 4–6), dependency-safe within `docs/build-plan.md`. It does
not advance an operations gate or change product scope. Only `/`, its local
marketing components and their owning documentation change.

Preparation inspected the clean repository, code, original brand reference and
running page. This prompt awaits approval: **do not implement, stage, commit,
push or deploy during preparation**. Upon approval, re-read this complete file
and execute through verification, independent review, documentation and one
local commit to `main`. No push or deployment is included.

## References and baseline evidence

Read during preparation:

- `AGENTS.md`, `client/AGENTS.md`, `docs/skills.md`, `docs/build-plan.md` §1 and
  its phase index, and `docs/product.md` product job/core journey definitions.
- `docs/landing.md`, especially the implemented prompt 401 record;
  `docs/design-system.md` palette/type/container/rhythm and §§12–13;
  `docs/components.md` pill/eyebrow/container/section contracts;
  `docs/automation.md`; relevant hook/choreography sections in `docs/motion.md`.
- `prompts/401-product-led-hybrid-landing-imagery.md` for the previous direction
  and data-honesty contract. It is historical context; this approved prompt
  supersedes its requirements to retain all prose, capability-strip content,
  seven small previews and source-mapping panel.
- `client/app/(marketing)/page.tsx`,
  `client/components/acres/landing-product-visuals.tsx`,
  `client/components/acres/landing-example.ts`,
  `client/components/acres/landing-motion.tsx`,
  `client/components/acres/{section,container,eyebrow}.tsx`,
  `client/app/globals.css`, both workspace/root package scripts, and
  `client/public/assets/ui/landing/editorial/SOURCES.md`.
- Installed Next guidance:
  `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`,
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`,
  and the Image reference at
  `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`.
  Re-read the exact relevant Image sections before adjusting `sizes`.

Visually opened the original desktop comp's benefits region, rectangle
`1280×630+0+1120` in
`client/public/assets/ui/landing-pages/Desktop.png`. Its whitespace, restrained
rules and small serif feature headings inform the retained identity, not a
return to its old composition or stale product claims. Palette/type numbers
come from the owning measured records, not recognition from the screenshot.

Fresh browser inspection used the existing production server at
`http://localhost:3202/`, fresh reduced-motion contexts at 375/800/1280, fonts
ready and the context photo decoded. Full desktop/mobile captures plus native
tablet/mobile hero crops were visually opened. Local, ignored evidence lives
in `output/playwright/402/baseline-{375,800,1280}.png`; crops are temporary.
These artifacts are useful locally, not dependencies for a fresh clone. If
missing on execution, reproduce them from the baseline commit using the
automation recipes. Do not assume an old listener serves a fresh build.

Measured preparation baseline:

| Width | Page height | Hero section height | Benefits height | Detail height | Workflow height |
| ----: | ----------: | ------------------: | --------------: | ------------: | --------------: |
|   375 |      8534px |              1788px |          2181px |        1499px |          2023px |
|   800 |      5972px |              1549px |          1225px |        1307px |           939px |
|  1280 |      4676px |              1149px |           750px |         809px |           950px |

At each width `document.querySelector('main').innerText.trim().split(/\s+/)`
contains **640 words**. There are **10** visible “Illustrative data” paragraphs:
three major plates and seven previews, each with a second explanatory line.
The source fields, values, version and publication narrative recur across the
hero, benefits, report and steps. The tablet hero stacks a full comparison above
a photo-plus-mapping row; mobile adds a long separate mapping card. These are
the specific sources of density this task addresses.

## SKILLS USED

- `frontend-design` — restrained composition, editing and visual critique.
- `data-storytelling` — curate the example into a comparison and its report.
- `kpi-dashboard-design` — preserve units, periods and honest bar comparisons.
- `vercel-react-best-practices` — static Server Components and bundle restraint.
- `tailwind-design-system` — reuse governed tokens and scoped spacing roles.
- `tailwind-4-docs` — verify utility/theme behavior against available evidence.
- `web-design-guidelines` — fresh guidelines and final changed-surface audit.
- `playwright` — real-browser inspection, screenshots and interaction checks.
- `gsap-core` — preserve the existing reveal and reduced-motion behavior.
- `gsap-timeline` — preserve the existing two-beat hero, without extra beats.
- `gsap-scrolltrigger` — verify triggers against the new natural content heights.
- `gsap-react` — retain scoped lifecycle and cleanup in the existing client leaf.
- `gsap-plugins` — preserve existing one-time registration; add no plugin.
- `gsap-utils` — preserve scoped selection and nearest-group ownership.
- `gsap-performance` — no additional per-row motion or layout animation.
- `requesting-code-review` — dispatch independent implementation review.
- `receiving-code-review` — verify findings and resolve valid defects.
- `caveman-commit` — final required local commit message.

Preparation loaded the design, data, React, Tailwind, browser, motion and review
workflow skills. Execution must load every listed skill again. The Tailwind
snapshot is uninitialized in the read-only skill location; preparation used the
skill's limited `references/gotchas.md` and `references/engineering-playbook.md`
fallback. Verify needed default spacing/theme behavior in installed
`node_modules/tailwindcss/theme.css` and generated CSS. Do not claim a refreshed
snapshot or accept a third-party documentation licence implicitly.

No image generation, photography acquisition, new component library, map engine,
API or backend skill is needed for the proposed work. Native HTML/CSS and the
existing locally licensed photo cover the complete visual scope. If final
guideline retrieval needs a web tool, load its owning skill at that point.

## Design decision and content hierarchy

Keep one dominant comparison, one smaller geographic photograph, one concise
report illustration, and quiet typography between them. The signature remains
Acres' regional data story, olive/pale-green surfaces, serif display and
monospace data. Remove complete redundant objects before increasing padding.

Do not recreate the page as a grid of miniature dashboards. Do not add icons,
badges, mock controls, decorative charts, browser frames or replacement labels
to occupy the space freed by deletion. Two meaningful data figures are enough
to preserve the product-led direction; the real photo preserves the hybrid.

### 1. Hero: promise, comparison, geographic context

Retain the centered title **“See the bigger picture.”**, eyebrow **“Regional
intelligence”**, primary **“Create Account”** → `/register` and secondary
**“See how it works”** → `#how-to`.

Shorten the supporting sentence to:
**“Compare regional data. Share findings you can trace.”**

Simplify `RegionalComparisonPlate`:

- One concise visible disclosure: **“Illustrative data · invented values”**.
  Use that wording once per numeric figure, allowing natural mobile wrapping.
  Remove the second explanatory paragraph.
- Replace the slogan “Every region, in perspective.” and separate metric line
  with the single serif metric title **“Canopy cover (%)”**.
- Keep the three named regions and their two periods. Show the period legend
  once: outlined **2024**, filled **2025**. Give each row the region and compact
  numeric pair, e.g. **“18% → 24%”**, rather than repeating years per row.
  Associate the pair with both periods in accessible text/structure, without
  duplicating the visible legend for every row.
- Preserve all six values and bar lengths on a common zero-based 0–100% scale.
  Keep a quiet scale with 0% and 100% endpoints; the 50% label is unnecessary.
  Bars stay decorative to assistive technology; exact values remain native text.
- One quiet source reference **“Example dataset · v1”** at the bottom. Associate
  the exact filename with this figure through a concise accessible description;
  display the full filename once in the report below. Keep source identity
  consistent with `landing-example.ts`; do not invent a second dataset.

Make `SourceContextPlate` a photograph-only context component (rename it to a
clearer server component if useful). Retain the existing Prampram asset, native
16:9 reserved box, meaningful existing location alt text and 24px media radius.
Remove the complete mapping card, preview row, repeated file/version, and visible
photo explanation. The invented-data disclosure belongs inside the separate
chart figure. Do not present the photograph as the source of the numbers or
overlay it with quantitative marks. It must have no visible credit/caption.

Remove the complete three-item capability strip below the hero. Format support,
regional comparison and traceability already appear in the story below. Keep
the hero's content-to-benefits boundary quiet rather than replacing the strip.

### 2. Benefits: four small, open articles

Keep `#benefits` and the four-column/two-column/one-column progression. Eyebrow:
**“Benefits”**. Heading: **“Regional data, made clear.”** Remove the introductory
paragraph beside it. Use precisely these four heading/body pairs:

| Heading                  | Body                                                        |
| ------------------------ | ----------------------------------------------------------- |
| Bring your data together | Import CSV, XLSX and GeoJSON into a consistent dataset.     |
| Compare regions          | See how places and periods compare, with units in view.     |
| Keep the source in sight | Trace a finding to its observations and dataset version.    |
| Share a clearer story    | Publish reviewed reports and export findings as CSV or PDF. |

Remove all four preview figures and their minimum-height overrides. Keep the
light top rule for each article, serif 18px headings and readable 15px body.
Use natural-height text; no surrounding card borders or empty image holders.

### 3. Evidence: one report, one adjacent explanation

Keep `#specifications`. Eyebrow: **“Reports”**. Heading:
**“Evidence you can return to.”** Replace the three ruled explanation rows with
one short paragraph:
**“Published revisions preserve the evidence behind your findings.”**

Simplify `ReportEvidencePlate` into one white report sheet in the existing sage
frame. Keep its own **“Illustrative data · invented values”** disclosure, title
**“Regional canopy comparison”**, and **“Published example · revision 1”**.
Show one supporting example, derived from the existing Greater Accra row:

- **Greater Accra · Canopy cover (%)**
- **2024: 18% → 2025: 24%**
- **+6 percentage points**
- **regional-canopy-example.csv · v1**

Use native text and an appropriate list/definition list for the evidence. This
is a concise excerpt of the same example report, not an aggregate of all regions.
Remove the all-region claim paragraph, repeated supporting-evidence title, the
other two duplicated regional comparisons, row-by-row dividing rules and final
“Source → comparison → published revision” explanation. A single internal rule
may separate identity from evidence. Preserve honest revision/source semantics;
do not add a fake export button or a real report download.

### 4. Workflow: three steps, no second set of illustrations

Keep `#how-to`, **“How it works”**, semantic ordered list and actual sequence
markers `01`/`02`/`03` using the established stat typography. Shorten the heading
to **“From file to finding.”** Use:

| Step | Heading               | Body                                               |
| ---- | --------------------- | -------------------------------------------------- |
| 01   | Import your data      | Upload a file and map its fields and regions.      |
| 02   | Explore your regions  | Compare metrics and save a view for your team.     |
| 03   | Publish your findings | Review the evidence and publish a report revision. |

Remove all three workflow preview figures, their imports/arrays, tall minimum
heights and intermediate wrappers used only for those previews. Keep a quiet
top rule per step and generous marker/title/body spacing. Do not replace the
deleted previews with a second chart, diagram or repeated format badges.

### 5. Closing action

Keep `#contact`, centered **“Put your regions in perspective.”** and the existing
account action. Remove **“See what’s possible”** and the repeated supporting
paragraph. Retain the current section/top-rule treatment; do not increase its
already large compound top spacing. Preserve shared header/footer and all links.

## Spacing contract and breakpoint behaviour

The following are **proposed design judgments**, not measurements from the
original comps. Implement with existing `@theme`/default spacing tokens. Major
section padding stays the existing **120px** at every width, and container
content stays **343/720/1200px** with **16/40/40px** gutters at 375/800/1280.
Do not change the shared `Section` or `Container` API to tune this page.

| Relationship                                           | 375px                | 800px                | 1280px                 |
| ------------------------------------------------------ | -------------------- | -------------------- | ---------------------- |
| Hero top inset below shared chrome                     | 64px                 | 80px                 | 96px                   |
| Hero action row → visual row                           | 64px                 | 80px                 | 96px                   |
| Hero comparison + photo                                | Stack, 48px gap      | 2:1 tracks, 48px gap | 2:1 tracks, 64px gap   |
| Comparison inset                                       | 32px                 | 40px                 | 48px                   |
| Space between comparison region groups                 | 32px                 | 32px                 | 32px                   |
| Benefits heading → articles                            | 64px                 | 80px                 | 80px                   |
| Benefits layout                                        | 1 column             | 2 columns            | 4 columns              |
| Benefits columns / row gap                             | no columns / 48px    | 20px / 48px          | 20px / natural         |
| Article rule → heading / heading → body                | 32px / 16px          | 32px / 16px          | 32px / 16px            |
| Report + adjacent copy                                 | Stack, 48px gap      | Stack, 64px gap      | Equal tracks, 80px gap |
| Sage frame / white sheet inset                         | 24px / 32px          | 32px / 40px          | 32px / 40px            |
| Workflow heading → list                                | 64px                 | 80px                 | 80px                   |
| Workflow layout / gap                                  | 1 column / 64px rows | 3 columns / 20px     | 3 columns / 20px       |
| Step rule → marker / marker → heading / heading → body | 32px / 32px / 16px   | 32px / 32px / 16px   | 32px / 32px / 16px     |

From `md`, vertically center the smaller photo beside the dominant comparison;
do not stretch the photograph to the chart's height or add content below it to
fill the column. At 800 the hero track widths are 448px and 224px; at 1280 they
are approximately 757.33px and 378.67px. These are target layout calculations,
to be checked in the browser, not already measured output. The photo remains
subordinate but identifiable. Update `sizes` to match this layout, including
the container cap. At 375 it remains 343px wide and about 193px tall.

All plates have natural height; remove inherited photo-height/preview minimums.
No fixed-height text clipping, image-scaling of native text, hidden mobile data,
tiny fonts or reduced line height may satisfy the density target. For the report
at 320, the above nested insets leave about 176px for text: allow filenames and
period/value groups to wrap naturally and verify them explicitly.

Use existing max-width tokens for a concise hero sentence and the report's
adjacent explanation. Keep current brand/type roles, button dimensions and the
responsive 64/96/128px landing hero. The design improvement comes from deletion
and larger gaps, not a smaller type scale. The normal `md`/`lg` breakpoints are
768/1024px; at 1024 inspect the newly side-by-side report for cramped wrapping.
Adjust a page-local layout breakpoint only if evidence shows it is needed,
recording the reason without changing shared breakpoints.

## Reference deltas

This explicitly supersedes prompt 401's requirement for seven small previews,
the mapping/source panel, the full capability strip and unchanged marketing
prose. Ten numeric panels become **two**; two-line disclosures become one short
local disclosure in each. Full source identity remains available, and every
visible number retains its metric, unit, period and regional context.

The composition departs from prompt 401's tablet hero stacking, 20px hero gap,
40/48/64px hero media offsets, small plate insets and dense explanation rows.
Retain the original brand invariants and 120px inter-section rhythm. Resulting
page heights can fall substantially because whole repeated panels disappear;
do not pad sections to recover the old page length. More breathing room is
judged within the remaining compositions, not by maximizing scroll distance.

At execution, add one bounded sentence to the existing landing exception in
`AGENTS.md` §0 acknowledging approved prompt 402's content/illustration/spacing
refinement of 401. Do not append implementation history to the guidance file.

## Implementation sequence and intended file changes

1. Re-read this approved prompt, scoped guidance, references and every skill.
   Confirm baseline/current branch and preserve unrelated changes. Use installed
   Node 24.21.0 per command, without changing global tools or installing packages.
2. Capture/confirm baseline before modifying runtime files. Record the exact
   visible-text count and plate count with the same DOM method used above.
3. Update `client/app/(marketing)/page.tsx`: apply the specified copy and layout,
   remove strip/detail rows/preview arrays/imports/wrappers, retain anchors,
   headings and existing motion hooks on meaningful remaining elements.
4. Simplify `client/components/acres/landing-product-visuals.tsx` to the comparison,
   context photo and report plus only the small helpers still needed. Remove
   `Preview`, `FieldMapping`, all six preview exports and unused `ReactNode`
   import. Search actual usages before deleting any export. Retain useful
   `data-landing-plate` hooks for the two data figures and photo context.
5. Keep `client/components/acres/landing-example.ts` as the source of every value,
   label/version and derived change. Do not change the invented observations or
   formula. Remove the now-unused field-mapping metadata only if a usage search
   confirms it is dead. No API/test-fixture imports or marketing data fetches.
6. Keep `LandingMotion` and `client/lib/motion.ts` unchanged if possible. Removing
   groups/descendants needs no new tween. Remaining nodes have one reveal owner;
   keep CTA controls outside visibility-hiding hero/media targets. No new motion,
   plugins, per-bar animations or client boundaries. Verify normal traversal,
   static/reduced-motion visibility and trigger positions after layout changes.
7. Reuse existing tokens and default spacing. Only if a missing token is proven,
   add it to `client/app/globals.css` and `docs/design-system.md` together; inspect
   `client/lib/utils.ts` and register it if merge classification requires that.
   No new palette/font/spacing scale or Tailwind configuration file.
8. Retain the licensed photo bytes and provenance. Update only the current
   composition description in `SOURCES.md` if its mapping/layout account becomes
   stale. No new download, asset processing or visible photographer credits.
9. Run checks and browser acceptance below; inspect the complete diff and all new
   screenshot sizes. Correct real defects before independent review.
10. Dispatch review, evaluate findings, fix verified issues, and re-review
    significant changes. Append measured/factual prompt 402 evidence to
    `docs/landing.md`; document changed spacing judgments in
    `docs/design-system.md`. Update the landing current-state pointer as needed;
    preserve historical 401 measurements as historical facts.
11. Add the bounded approved-direction sentence in `AGENTS.md` §0, format the
    prompt/changed files and new documentation records, review the staged scope,
    and commit locally to `main` with `caveman-commit`. Do not push/deploy.

## Verification and acceptance

- **Content:** target at most **350 visible words** in `main` by the same
  whitespace-splitting method, down from 640 (at least about 45% fewer). This is
  an editorial budget, not permission to remove units or honest disclosures.
  Exactly two numeric figures, two short local invented-data disclosures, one
  photo, no preview figures and no capability strip. Compare all three widths;
  do not hide content responsively to meet the count.
- **Integrity:** unchanged six observations (18/24, 35/41, 54/58), years
  2024/2025, common 0–100% bar scale, source v1 and report revision 1. Visible
  report excerpt is Greater Accra with +6 **percentage points**, not percent.
  Legend/outline/fill and text identify series without relying on colour alone.
  Screen-reader structure associates compact pairs with their years and source.
- **Spacing:** measure the relationships in the table after fonts settle.
  Report actual gaps/padding, container and figure dimensions, page height and
  word/panel counts against baseline. Explain any justified local adjustment.
  Open full-page screenshots and native-scale hero/report/benefit/workflow crops
  at **375/800/1280**. Confirm the page looks calmer at normal viewing scale.
- **Reflow:** inspect **320/390/1024/1440**, plus a 640 CSS-pixel reflow viewport
  for the 1280-window 200% equivalent. No horizontal overflow, clipped filenames,
  cropped native data, unreadable labels or stretched photo. At 800 the short
  workflow paragraphs remain comfortable in their three 226.67px columns.
- **Browser:** fresh contexts on the production build, after font/photo decode.
  Reduced motion for full-page capture; separately traverse normal-motion reveals
  to settled visibility. Check JavaScript-disabled mobile and reduced motion:
  complete content/actions remain visible. No console errors or hydration errors.
- **Journeys:** preserve all four nav anchors, both `/register` actions, the
  hero `#how-to` action, skip link, keyboard focus order/indicator, mobile menu,
  close and Escape behavior. No account creation is needed for this check.
- **Image:** local photo and optimized response decode, correct `sizes` for
  changed tracks, reserved ratio, appropriate alt, no retired image paths or
  visible credits. Do not change the optimizer or hosting configuration.
- **Guidelines:** load `web-design-guidelines`, retrieve its current source
  at execution and audit only changed UI: semantic headings/figures/lists,
  quantitative alternatives, contrast, focus, touch targets and reflow.
- **Checks:** run installed Prettier on changed TS/TSX with the existing
  `--no-semi` convention and on this prompt; check newly appended Markdown
  sections separately where historical formatting differs. Run
  `git diff --check`. Run root **`npm run typecheck`**, **`npm run build`**, then
  **`npm run lint`** sequentially (avoid Prisma-generation overlap). Quote real
  command output and exit status. If the documented sandbox TypeScript-child
  stdout issue reproduces, record the error and use the established authorized
  build escalation path. Do not claim checks from 401 apply to this change.
- No new test suite for static copy/layout is needed. Do not modify backend
  tests or add assertions that simply repeat the JSX; browser evidence and
  existing compile/lint/build checks cover this scope. If implementation
  unexpectedly adds nontrivial behavior, load the relevant testing skill and
  test that behavior specifically.
- **Review:** use `requesting-code-review` with a read-only reviewer subagent;
  provide this approved prompt, baseline/current SHAs, tracked/new diff,
  screenshots, content/spacing measurements and check evidence. Evaluate with
  `receiving-code-review`, fix valid findings and repeat relevant verification;
  re-review significant changes before final documentation and commit.

Completion means the remaining examples communicate comparison and traceable
reports clearly, repeated explanatory material is gone, spacing is visibly more
relaxed, brand/chrome/journeys are preserved, checks/review have completed, and
the approved scope is committed locally. Preview with `npm run dev:client` and
open `http://localhost:3000/` or the port Next prints. Rollback is a scoped revert
of this implementation commit; photo and example data remain in the repository.
