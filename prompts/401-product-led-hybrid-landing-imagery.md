# Product-led hybrid imagery for the landing page

## Request, decision and scope

The user rejected the landing page's aerial photographs as generic and asked
for substantial website research, replacement imagery across the page, and an
explicit match between each section's visual, its message and Acres' overall
purpose. Their follow-up selects **a hybrid with more product visuals**.

Acres turns organization-owned regional data into comparisons, traceable
observations, saved views and governed report evidence. The landing visuals
must make that work recognizable. The approved direction is product-led hybrid,
not another collection of attractive places: original analytical illustrations
carry the story; one new, geographically identified real photograph supplies
human/geographic context within that story.

This prompt is prepared from clean local `main` at `9fe074d`. Prompt 400 removed
visible photo credits; retain that choice. This file awaits execution approval.
Only `/` and its marketing assets/documentation change. Do not implement a new
application feature as a side effect of illustrating one.

## Research and references inspected

Read `AGENTS.md`, `client/AGENTS.md`, prompts 399/400, and the relevant records in
`docs/skills.md`, `docs/product.md`, `docs/design-system.md`, `docs/components.md`,
`docs/landing.md`, `docs/automation.md`, `docs/motion.md`,
`docs/authenticated-app.md`, `docs/ingestion.md`, `docs/dashboards.md` and
`docs/reports.md`. Re-read relevant records on execution.

Inspected the current marketing page, `LandingMotion`, dashboard workspace and
chart, API test-harness store, product-journey fixtures and Playwright setup.
Verified local Next page, Server/Client Component and image guidance under
`node_modules/next/dist/docs/`. Re-open the current screenshot supplied by the
user (`/home/dgk/Pictures/screenshot-2026-10-19_17-18-09.png`) and the Prompt 400
full-page screenshots on execution. If local research artifacts are unavailable,
fetch the named public sources again; this prompt does not depend on ignored
files surviving a clone.

### Live website research — 2026-10-19

Firecrawl searched four product/visual-storytelling angles and two photography
angles. Search results included full page text; selected primary-source pages
were read. CARTO and Datawrapper website screenshots were also downloaded and
visually inspected. Research artifacts are ignored in `output/research/401/`.
No claim is made that every research website was opened interactively.

| Source                                                                                  | Evidence / lesson for Acres                                                                     | Boundary                                                                                       |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [Datawrapper homepage](https://www.datawrapper.de/)                                     | Product outputs and the upload workflow make the software's job visible beside its promise.     | Learn the relationship between copy and outputs; do not copy their illustrations or interface. |
| [Datawrapper maps](https://www.datawrapper.de/maps)                                     | Regional visualizations communicate places together with data.                                  | Acres' current dashboard is a chart/table; do not imply a shipping interactive GIS interface.  |
| [Datawrapper annotation guidance](https://www.datawrapper.de/academy/annotate-tab)      | Titles, descriptions, units, sources and alternative descriptions give a visualization meaning. | Every Acres example needs a defined metric, period, region and source.                         |
| [Felt homepage](https://felt.com/)                                                      | Geographic scenes are paired with particular analytical questions and records.                  | Do not borrow AI, live collaboration, asset management or site-selection claims.               |
| [Felt web GIS](https://felt.com/platform/web-gis)                                       | Product imagery ties data input to analysis and a decision.                                     | Acres is not being marketed as a general GIS editor.                                           |
| [CARTO homepage](https://carto.com/)                                                    | A geographic analysis workspace makes its category explicit.                                    | No copied screens, agent interface, spatial toolbars or unsupported map controls.              |
| [Metabase dashboards/reporting](https://www.metabase.com/features/analytics-dashboards) | Dashboard and document visuals demonstrate the section-specific output.                         | No invented sharing, chat, subscriptions or AI capabilities.                                   |

**Design judgment from this research:** Acres needs its own regional example
carried from source to comparison to report. Pure photography cannot explain
validation or lineage. Copying another product's dashboard would misrepresent
Acres. Original, clearly illustrative data plates can explain implemented
concepts while preserving the existing identity.

### Selected contextual photography

Preferred source:
[Prampram inner township, Ghana](https://unsplash.com/photos/an-aerial-view-of-a-city-with-lots-of-houses-VouIExnbUzc),
credited by publisher metadata to **The Artboard**. The source page explicitly
names Prampram, Ghana and the free Unsplash License. The actual publisher image
was downloaded and visually inspected: settlement, roads, buildings and green
land are legible together. This is a particular regional context alongside the
example, not an anonymous landscape filling a large frame.

Publisher rendition inspected:
`https://images.unsplash.com/photo-1636783187647-cc97111bffdc?fm=jpg&q=85&w=1400&fit=max`

Measured downloaded rendition: **1400×786, 352299 bytes**. These are rendition
measurements, not a claim about original camera resolution. Local preparation
copy: `output/research/401/prampram-candidate.jpg`.

The [current publisher licence](https://unsplash.com/license) was fetched and
read; it permits commercial use, local hosting/modification and does not require
visible attribution. Preserve author/source/licence in `SOURCES.md` without
restoring visible credit lines. Confirm the source metadata again when acquiring
the tracked asset. Do not use the watermarked Open Graph image, related-image
thumbnail or an Unsplash+ substitute.

An alternative urban-greenery candidate by Elham Abdi,
[photo i7eAK1AOp68](https://unsplash.com/photos/an-aerial-view-of-a-city-with-lots-of-trees-i7eAK1AOp68),
was also downloaded and visually inspected (1400×1050). Reject it: excess sky,
a less specific geographic connection, and a weaker crop for this story.
Broad Accra/park search galleries, Adobe previews and travel videos were
research leads, not approved assets. Do not ship them.

## SKILLS USED

- `frontend-design` — art direction, restraint and section-to-visual correspondence.
- `data-storytelling` — consistent source → regional comparison → evidence narrative.
- `kpi-dashboard-design` — meaningful units, time/region context and honest comparisons.
- `vercel-react-best-practices` — static server visuals and existing client boundaries.
- `tailwind-design-system` — existing tokens and any narrowly needed visual tokens.
- `tailwind-4-docs` — verify utilities/theme registration before styling.
- `web-design-guidelines` — semantic, visual, keyboard and responsive review.
- `firecrawl` — primary website/photo research and source verification.
- `firecrawl-search` — discover relevant website and photograph evidence.
- `firecrawl-scrape` — inspect selected sources and current photography licence.
- `playwright` — browser acceptance, readable crops and static/motion checks.
- `gsap-core` — maintain the existing reveal end states and reduced-motion behavior.
- `gsap-timeline` — retain the two-beat hero choreography.
- `gsap-scrolltrigger` — preserve trigger ownership as visual content changes height.
- `gsap-react` — preserve the scoped motion leaf and cleanup.
- `gsap-plugins` — retain one-time registration; add no plugin.
- `gsap-utils` — keep scoped selection and existing nearest-group rules.
- `gsap-performance` — avoid per-bar tweens and layout animation.
- `requesting-code-review` — independent review after successful self-verification.
- `receiving-code-review` — verify and resolve review findings before commit.
- `caveman-commit` — required final local commit message.

Preparation loaded the owning skills. Tailwind's full docs snapshot is still
uninitialized; the available gotchas/engineering playbook provide limited
fallback only. Its skill root is outside the writable workspace. Execution must
verify any unfamiliar utility/theme behavior from installed sources or fresh
official docs, and report that limited fallback rather than claim the snapshot
was initialized. Follow a skill's explicit permission requirement if initialization
is actually needed; this prompt does not grant acceptance of an upstream licence.

No image-generation skill is needed: the photograph is real, and precise data
illustrations should be semantic HTML/CSS or small inline vectors with real
text. No screenshot-generation model should invent product controls or numbers.
No new UI library, map engine, chart package, public demo route or backend data
integration is needed.

## Visual narrative and section assignment

Keep the current major headings, prose, anchors, account actions and chrome.
Short labels inside the new visuals may clarify what they show. Do not rewrite
the product promise or turn the landing page into an environmental-data product;
land cover is one explicitly illustrative example of arbitrary regional data.

| Section                            | Message                                                                    | Required visual                                                                                                                                                                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero                               | Turn regional data into clear comparisons and traceable decisions.         | A dominant regional-comparison plate, next to a smaller source/context plate containing the new Prampram photograph and a compact field-mapping example. Replace both current aerial photographs.                                                           |
| Capability strip                   | Supported formats, regional comparison, traceable reports.                 | Keep the truthful typographic strip. Its adjacent hero already demonstrates these three facts; add no decorative logos or stock icons.                                                                                                                      |
| Benefits                           | Bring data together; compare regions; keep sources; share a clearer story. | Four compact, distinct native illustrations above their corresponding headings: field mapping, paired regional values, a source/version evidence chain, and a report revision/export sheet. Each must depict its own capability.                            |
| Product detail / `#specifications` | The detail behind every decision.                                          | Replace the Espoo road photograph with a substantial report/evidence plate: a claim, its comparison values, unit and period, and the exact example source/version behind it. Adjacent rows retain validation, comparison and durable evidence explanations. |
| Workflow / `#how-to`               | Import → explore → publish.                                                | Add three small previews within the existing ordered steps: source rows/mapping; regional comparison; published revision with evidence. Reuse the same example and visual vocabulary, at intentionally simplified detail.                                   |
| Closing CTA / `#contact`           | A shared place to turn regional data into findings.                        | Keep the concise text/action composition; do not add a fresh stock photo or another mini-dashboard. It closes the product story immediately above it.                                                                                                       |
| Header/footer                      | Navigation and identity.                                                   | Keep the established Acres brand assets. They are not generic content images to replace.                                                                                                                                                                    |

Every new image/illustration must pass this sentence test in the build record:
“This visual shows ___, which supports this section's message ___.” If a visual
only fills space, remove or redesign it. Do not repeat the same full screenshot
in several sections. Smaller workflow previews are deliberate summaries of the
same journey, not duplicate hero panels.

### The shared illustrative dataset

Use one immutable, marketing-only example module. Do not import test fixtures
into production or write these figures to a database. Label every independently
viewed data plate **“Illustrative data”** within its header/content, with a
nearby explanation that the figures are examples. A single disclaimer at the
bottom of the whole page is insufficient.

Metric: **Canopy cover (%)**. Periods: **2024** and **2025**. Unit: percent.
Example source: `regional-canopy-example.csv`, version `v1`, six source rows.
These are invented explanatory values, not measured Ghana statistics, customer
results, satellite-derived estimates or evidence extracted from the photograph.
The regional names give context; they do not limit Acres' global scope.

| Region        | 2024 | 2025 |               Change |
| ------------- | ---: | ---: | -------------------: |
| Greater Accra |   18 |   24 | +6 percentage points |
| Ashanti       |   35 |   41 | +6 percentage points |
| Northern      |   54 |   58 | +4 percentage points |

Derive previews, bar proportions, labels and any differences from this single
module; do not repeat independent numeric literals throughout the page. Show
percentages and percentage-point changes correctly. Do not compute a national
average from equally weighted region percentages. No forecast, growth KPI,
revenue, customer proof or claim that Acres analyzes aerial pixels is introduced.

Comparison plate: show three named regions, both labeled periods, exact values
and a zero-based **0–100%** scale. Direct labels and distinct outlines/series
labels carry the meaning as well as colour. A compact native table or list
must expose the values in text; no hover is required. Bar lengths are computed
data percentages, not arbitrary CSS geometry chosen to look impressive.

Source plate: make `region`, `year`, `canopy_pct` map visibly to Region, Period,
and Metric. Show sample rows consistent with the shared module; if only three
of six rows are shown, label that preview honestly. A small “v1 · 6 rows” record
may connect the source to the comparison. Do not render fake working inputs,
upload buttons or filters.

Evidence plate: example report title “Regional canopy comparison”, state
“Published example · revision 1”, the conservative claim “The example shows
higher canopy cover in 2025 across all three regions”, exact supporting values,
and source/version reference. The report illustration may explain source →
comparison → revision with typography and rules. It is a conceptual product
illustration, not claimed as an exact screenshot of an authenticated screen.
Do not fabricate browser chrome, signing/certification badges or sharing controls.

The Prampram photograph is contextual geography, **not** the measurement source.
Keep its association with the regional example honest in text/alt. Do not place
a numeric measurement pin over a building or trace a made-up administrative
boundary across the image. Proposed alt: “Homes, roads and green land in
Prampram, Ghana, seen from above.” No location/photographer caption below it.

## Composition and breakpoint behaviour

Retain the white canvas, seven-colour system plus existing tokens, Crimson
Text / DM Sans / Roboto Mono, 48px pills, 24px major-media corners, 14px small
card corners, shared container and 120px section rhythm. Sage/pale green are
surfaces, with dark readable text. No gradients, glow, dark SaaS dashboard,
new font, ornamental map, random icon collection or card around every paragraph.

The signature is an editorial **source → comparison → evidence** composition.
Use fine rules, labels and substantial whitespace to connect real work. Keep
product visuals dominant; photography should occupy approximately one quarter
or less of the main visual area as a design judgment, not a numerical acceptance
metric. Removing all photography would conflict with the user's hybrid choice.

The old photo heights/ratios were chosen for photographs; they are not a reason
to shrink data text or clip a report. New values below are design judgments,
not measurements from the original comps. Choose matching existing tokens first.
If a required value has no token, add/document/register it in the same change.

| Width | Hero visual layout                                                                                                                                                                            | Benefits                                                                           | Detail plate                                                                                                     | Workflow                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 375   | 343px container. Comparison first at full width, then context/source plate. Photo retains a reserved wide ratio; mapping text follows rather than overlapping the photo. Native text reflows. | One column; each compact preview fits its article.                                 | Full-width plate before the existing text; content height is natural.                                            | Three stacked steps with their previews; full sequence stays visible.                                                                                                  |
| 800   | 720px container. Comparison spans full width; the supporting source/context plate below splits photo and mapping into two equal columns with 20px gap.                                        | Two columns; readable previews at roughly 350px article width.                     | Full-width plate followed by copy; no tiny side-by-side report text.                                             | Preserve three columns if all preview text fits at roughly 226.67px; simplify previews, not font size. Stack if browser evidence demands it and document the judgment. |
| 1280  | 1200px container. Two tracks in a 2:1 ratio, 20px gap: comparison dominant, smaller context/source plate. Target at least the former 440px visual mass, with natural height when needed.      | Four columns with 20px gap; illustrations remain small enough to support headings. | Existing two-column section; report plate replaces the portrait photo without cropping text to a portrait ratio. | Three columns; each step shows its specific stage of the same example.                                                                                                 |

Use existing body/UI/label roles for readable text. Do not rasterize a desktop
screenshot and scale its labels down for mobile. Do not use `object-cover` on
charts, tables or report text. Native DOM makes the illustrations reflow and
keeps their content available to assistive technology. Any decorative vector
must be hidden from assistive technology when equivalent native text exists.

At 320, 390, 1024 and 1440, inspect interpolation as well. At 200% zoom all
values, source labels and actions must remain accessible without page-level
horizontal overflow. Avoid long hashes/UUIDs as decoration; use the short example
version and readable references.

## Implementation plan and intended files

1. Re-read the approved prompt, owning docs, current code and skills. Confirm
   status/HEAD/main and preserve unrelated changes. Use installed Node 24.21.0
   per command, without changing global tools.
2. Add the bounded Prompt 401 visual-direction exception to the existing
   landing-redesign paragraph in `AGENTS.md` §0: this product-led hybrid
   supersedes Prompt 399's photography-dominant direction for `/`, retaining
   brand primitives and Prompt 400's caption removal. Do not expand the file
   with implementation history.
3. Acquire the selected publisher rendition, verify decode/dimensions/bytes,
   and encode a new local WebP without enlargement or generative edits at
   `client/public/assets/ui/landing/editorial/prampram-context.webp`. Aim at
   roughly 250KB or less as an engineering budget; preserve legibility rather
   than blur it to meet an arbitrary number. Record actual output dimensions,
   bytes, processing command and source/licence in `SOURCES.md`. Retain the three
   retired assets/provenance for history; mark them unused by the current page.
4. Add a small typed immutable example module, proposed
   `client/components/acres/landing-example.ts`, containing the six observations,
   metric/source/version labels and derived comparisons. Keep it marketing-only;
   no shared DTO/schema/backend changes or runtime data fetches.
5. Add server-rendered visual components, proposed
   `client/components/acres/landing-product-visuals.tsx`, for regional comparison,
   source mapping, evidence/report and simplified benefit/workflow variants.
   Prefer a few explicit components with shared small internals over a generic
   visualization framework. Re-read existing Acres primitives before reuse.
   Do not add `use client`, Recharts, another animation layer or shadcn components
   just to draw static plates. Existing native HTML and styling suffice.
6. Replace the three old photographs in `client/app/(marketing)/page.tsx` with
   the new hero/context/evidence composition and add the section-specific
   benefit/workflow previews. Remove the now-unused generic photo helper/imports
   only if the new contextual photo no longer needs them. Keep every anchor,
   primary/secondary action, section heading and shared chrome.
7. Keep actual content in native text/table/list markup. Data-driven percentage
   widths are quantitative values, not raw styling tokens. All design geometry,
   colour, radius and typography comes from verified tokens. Add only necessary
   tokens in `client/app/globals.css`, record them in `docs/design-system.md` and
   register their names in `client/lib/utils.ts` where merge logic needs it.
   Do not add a Tailwind config or alter global type roles.
8. Retain `LandingMotion` unchanged where possible. The hero visuals keep the
   existing hero-media beat; detail uses the generic media hook; benefit/workflow
   previews remain descendants of their existing revealed article/list items.
   No node is targeted twice and no independent bar animation is needed. Keep
   actions outside visibility-hiding targets. Preserve no-JS and reduced-motion
   visibility; natural-height changes must not create stale triggers.
9. Verify local `next/image` props against installed full Image reference:
   reserve the context photo's ratio, use accurate responsive `sizes`, local
   paths and permitted quality, and avoid unconditional high priority if the
   text/data plate is the likely LCP. Do not change the optimizer/deployment.
10. Self-verify and review, correct valid findings, then append a factual Prompt
    401 record to `docs/landing.md`: research, exact visual-to-message map,
    illustrative data contract, real-photo provenance, design judgments, measured
    responsive geometry, browser evidence, actual checks and limitations.
    Update the source manifest and token record in their owning files.
11. Stage only this approved scope, inspect the staged diff, and commit locally
    to `main` using `caveman-commit`. No push or deployment.

## Reference deltas and non-goals

This deliberately changes all three content-image placements from Prompt 399:
Melbourne and Ladenburg hero photos become product/source/context plates;
Espoo becomes report evidence. It adds compact supporting product illustrations
where benefits/workflow previously relied on text alone. Overall section heights
change naturally to keep data readable. The original full-page pixel diff and
Prompt 400 image counts are not acceptance criteria for the new composition.

Retain the brand, typography, container, buttons, chrome, product copy and anchor
journeys. No visible photo credits return. Illustrative-data labels are integral
meaning, not photographer captions. No customer data/screenshots, production
account, secret, live API request, external image runtime, generated photograph,
third-party screenshot, new feature, auth bypass or public test route is added.
Do not redesign the authenticated app to make a marketing image look better.

## Verification, review and completion

- Run installed Prettier (`--no-semi` for existing TSX convention) on changed
  implementation/new files; check only newly appended Markdown sections where
  whole historical files have existing format differences. `git diff --check`.
- Run root `npm run typecheck`, `npm run build`, then `npm run lint` sequentially
  after build to avoid Prisma-generation overlap. Quote actual output/status.
  If the documented sandbox empty-TypeScript-child-stdout failure reproduces,
  use the established escalated build and record both attempts honestly.
- Verify all six example observations and derived +6/+6/+4 percentage-point
  differences. Check bar lengths on a 0–100 scale, period labels, units and
  source/version consistency throughout. No new generic test suite is required;
  if a nontrivial calculation helper is introduced, add only an appropriate
  focused test with its owning testing skill loaded first.
- Production-browser screenshots at 375/800/1280 after fonts/photo decode,
  fresh contexts and reduced motion for full-page capture. Visually open all
  screenshots, not just the DOM metrics. Record actual visual boxes, text
  legibility, page height, absence of horizontal overflow and console errors.
- Check 320/390/1024/1440 and reflow at 200%. All labels remain native text,
  no clipped report/source content, no fake controls, every plate identifies
  illustrative data, and the new photograph remains a subordinate context.
- Confirm none of the three retired photo paths remain in the landing DOM;
  the new local photo loads directly and via the optimizer, decodes and has
  accurate alt text. Compare narrow/desktop crops and meaningful focal detail.
- Normal-motion browser check: hero and every downstream reveal settles visibly;
  reduced motion and JavaScript disabled expose the full story. No animated
  hidden controls or duplicate targets. Existing anchors, mobile menu, keyboard
  focus, `/register` actions and `#how-to` secondary action still work.
- Fetch fresh Web Interface Guidelines and audit only the changed surface:
  semantics, chart/text alternatives, series identification beyond colour,
  contrast, data descriptions, touch/focus order and reserved photo dimensions.
- Use `requesting-code-review` to dispatch an independent read-only reviewer
  with this prompt, baseline/current SHAs, actual diff, source manifest,
  screenshots and check evidence. Evaluate with `receiving-code-review`, fix
  verified issues and re-review significant changes before documentation/commit.
- Preview: `npm run dev:client`, open `http://localhost:3000/` or Next's printed
  port. Rollback is reverting the scoped commit; retired assets remain available.

Completion means the visuals tell the same regional-data story as the copy at
every section, the hybrid retains purposeful real photography, the sample is
honest and consistent, checks/review are complete, documentation records facts,
and the approved files are committed locally. Preparation alone builds none of
this and must not be reported as replacement imagery already shipped.
