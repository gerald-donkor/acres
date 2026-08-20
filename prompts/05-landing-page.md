# Step 4 — build the landing page

## Scope and why this is next

Replace the placeholder at `/` with the complete Acres landing page shown in the
three landing comps. This is the next unbuilt row of AGENTS.md §8.2: the design
system, primitive layer, chrome, and CTA-link semantics are already committed,
so every dependency of step 4 now exists. Build the hero, device band, trusted-by
strip, benefits grid, both feature sections, comparison table, testimonial,
numbered steps, closing CTA, and their responsive media treatments. Keep the
existing header and footer mounted by `app/layout.tsx`.

This prompt is the complete execution brief. Re-read it verbatim after approval,
then re-read `AGENTS.md`, every skill and project record named below, and the
relevant local Next 16.3 guides in `node_modules/next/dist/docs/` before writing
code. In particular, verify the current `next/image`, App Router page, Server
Component, and static-asset APIs from the installed package rather than memory.

## SKILLS USED

- `frontend-design` — preserve the reference's restrained regional-data identity,
  typography, content register, and one clear visual thesis instead of introducing
  a generic landing-page treatment.
- `tailwind-design-system` — compose the page from the existing Acres tokens and
  primitives, and govern any genuinely missing token through `@theme` plus the
  documented token contract.
- `tailwind-4-docs` — verify responsive variants, overflow, sizing, object-fit,
  table, and accessibility utilities against the local Tailwind v4 docs snapshot;
  also load `references/engineering-playbook.md` for implementation and review.
- `shadcn` — inspect the installed Base Nova `Table` before implementing the
  comparison matrix and follow the repo's Base UI-era composition rules.
- `vercel-react-best-practices` — keep the route server-rendered by default,
  minimize client boundaries, and use statically analyzable image imports and
  component imports.
- `web-design-guidelines` — fetch the current guideline source and audit the
  finished route for semantics, focus, keyboard access, responsive overflow,
  media alternatives, and interaction quality before calling it complete.
- `caveman-commit` — write the required final commit message after all work and
  records are complete.

The official Tailwind snapshot was not initialized while this prompt was written.
The approved sync command stalled during `git clone` and was interrupted without
creating snapshot files. At execution, retry:

```bash
python .agents/skills/tailwind-4-docs/scripts/sync_tailwind_docs.py --accept-docs-license
```

If it is still blocked, follow that skill's limited fallback exactly: use
`references/engineering-playbook.md` and `references/gotchas.md`, identify every
unverified Tailwind point in `docs/landing.md`, and do not claim official-docs
verification that did not happen.

## Project records to read

- `docs/design-system.md` — all palette, type, container, grid, rhythm, radius,
  elevation, and breakpoint measurements; especially §§2–4, §7, and §8.
- `docs/components.md` — the existing Acres primitives, `cn()` token-merge
  contract, icon decisions, hover/focus deltas, and `Button` link semantics.
- `docs/chrome.md` — the already-built header/footer geometry and target anchor
  names the landing page must satisfy.
- `docs/automation.md` — reference extraction, accurate measurement, production
  screenshot, computed-style, and diff procedures.
- `components/acres/*` used by the page, `components/ui/table.tsx`,
  `lib/utils.ts`, `app/globals.css`, `app/layout.tsx`, and `app/page.tsx` — read
  the actual APIs before composing them.

## Reference material read for this prompt

- `public/assets/ui/landing-pages/Desktop.png`, inspected in full at its native
  **1280 × 7389** reference size.
- `public/assets/ui/landing-pages/Tablet.png`, inspected in full at its native
  **800 × 8825** reference size.
- `public/assets/ui/landing-pages/Mobile.png`, inspected in full at its native
  **375 × 8833** reference size.
- `public/assets/ui/ref/acres-design-system.pdf`, inspected as the full one-page
  **1260 × 8082.33 pt** board at 72 dpi, including Text Styles, Icons, Buttons,
  Photo Links, the three device treatments, and the four source photographs.
- The PDF image-object inventory from `pdfimages -list`. It confirms that the
  board embeds the original device composites and four photographs rather than
  requiring replacements or page-comp crops.

The three landing comps remain the only truth for page composition and responsive
behaviour. The board supplies source-quality media and primitive treatments; it
does not override a landing comp's layout.

## Asset extraction — no substitutes

Extract the media from the PDF itself and commit production-ready assets under a
clear `public/assets/ui/landing/` path. Do not use stock imagery, redraw the
report/device UI, hotlink remote files, or crop a whole section out of a landing
comp.

`pdfimages -j public/assets/ui/ref/acres-design-system.pdf <prefix>` currently
produces these source objects:

| PDF image | source dimensions | use |
| --- | ---: | --- |
| image 6 + soft mask 7 | 1741 × 1216 | desktop/tablet report-device composite |
| image 16 + soft mask 17 | 816 × 1704 | mobile report-device composite |
| image 18 | 4096 × 2304 | multicoloured mountain photograph |
| image 20 | 4096 × 2731 | green aerial landscape |
| image 22 | 4096 × 2048 | balancing-stones testimonial photograph |
| image 24 | 3750 × 3000 | neutral cylinders photograph |

The extraction sequence also contains an alternate report composite at image 10
and the unannotated hill photograph at image 14. Compare images 6 and 10 against
the 1280/800 comps before choosing; record the evidence and chosen object in
`docs/landing.md`. Apply each paired soft mask as alpha rather than shipping its
black surround, retain enough intrinsic resolution for the largest rendered
size, remove only redundant metadata, and visually verify the result. Use
`next/image` with meaningful `alt` for content-bearing photographs and an empty
alt only where an adjacent description makes the image purely decorative.

The six grey trusted-by marks are only present in the landing comps. Isolate each
mark from a native-size comp by threshold/mask against white, preserve its exact
grey appearance and intrinsic proportions, and save it as an individual
transparent local asset. Do not replace the marks with text, invented brand
names, or unrelated logos. Record every crop/mask command and final intrinsic
size in `docs/landing.md`.

## Content and section order

Use semantic document structure and the exact visible content below, correcting
the unfinished product rename everywhere (`Area` → `Acres`) and keeping the
project's product spelling **Visualise Growth**.

1. Hero: `Browse everything.` with the report-device treatment over the sage
   band.
2. Trusted-by strip: label `Trusted by:` and all six reference marks.
3. `id="benefits"`: eyebrow `Benefits`; heading `We've cracked the code.`;
   copy `Acres provides real insights, without the data overload.`; four
   capabilities in this order:
   - `Amplify Insights` — `Unlock data-driven decisions with comprehensive
     analytics, revealing key opportunities for strategic regional growth.`
   - `Control Your Global Presence` — `Manage and track satellite offices,
     ensuring consistent performance and streamlined operations everywhere.`
   - `Remove Language Barriers` — `Adapt to diverse markets with built-in
     localization for clear communication and enhanced user experience.`
   - `Visualise Growth` — `Generate precise, visually compelling reports that
     illustrate your growth trajectories across all regions.`
4. Multicoloured mountain photograph.
5. `See the Big Picture`; copy `Acres turns your data into clear, vibrant visuals
   that show you exactly what's happening in each region.`; the four `01`–`04`
   rows exactly as shown in the comp; secondary `Discover More`; neutral-cylinder
   photograph.
6. `id="specifications"`: the one strong rule; eyebrow `Specs`; heading
   `Why Choose Acres?`; copy `You need a solution that keeps up. That's why we
   developed Acres. A developer-friendly approach to streamline your business.`;
   secondary `Discover More`; comparison columns `Acres`, `WebSurge`, and
   `HyperView`, with all six visible rows transcribed exactly from the comp.
7. Balancing-stones photograph; testimonial with every `Area` corrected to
   `Acres`; attribution `John Smith`; monospace role `Head of Data`.
8. `id="how-to"`: `Map Your Success`; secondary `Discover More`; the ordered
   sequence `01 Get Started`, `02 Customize and Configure`, `03 Grow Your
   Business`, with the three comp descriptions and the green aerial photograph.
9. `id="contact"`: centred `Connect with us`; copy `Schedule a quick call to
   learn how Acres can turn your regional data into a powerful advantage.`; a
   primary `Learn More` link rendered through the established Base UI pattern
   with `nativeButton={false}`.

Transcribe the four Big Picture row sentences, all eighteen comparison cells,
the full testimonial, and all three numbered-step descriptions directly from the
native comp during execution. Run a repository search before finishing and prove
that no shipped landing-page string contains `Area` as a standalone product name.

Use these established icon readings: `cable` mirrored and rotated −45° for
Amplify Insights, `public`, `record_voice_over`, and `show_chart` for the other
three capability cards, and `check`/`close` in the comparison matrix. The first
reading is provisional in `docs/components.md` §3.1, so preserve that recorded
uncertainty in `docs/landing.md`; do not silently substitute another glyph.

## Measurements and implementation contract

Reuse the existing tokens and primitives; do not restate their values locally.
The minimum measured anchors are:

| property | 375 | 800 | 1280 |
| --- | ---: | ---: | ---: |
| container / gutters | 343 / 16 | 720 / 40 | 1200 / 40 |
| hero type | 76 px, two lines, 0.85 line-height | 140 px, two lines, 0.80 | 160 px, one line, 0.80 |
| section heading | 50 px | 52 px | 60 px |
| body type | 15 px / 21 px | 15 px / 21 px | 15 px / 21 px |
| eyebrow | 11 px | 11 px | 12 px |
| benefit grid | 1 column | 2 columns, 20 px gap | 4 columns, 20 px gap |
| media radius | 24 px | 24 px | 24 px |
| button | 48 px pill | 48 px pill | 48 px pill |
| major section rhythm | 120 px | 120 px | 120 px |

Additional native-comp anchors already measured in `docs/design-system.md`:

- At 1280, the sage band spans x 40–1239 and rows 524–885; the feature-grid
  rules start at row 1483; the first large photograph ends at row 2412; the next
  section rule is row 2533; its photograph ends at row 3243; the strong rule is
  row 3364; the comparison-card top is row 3900 and bottom row 4406; later
  hairlines occur at rows 4527, 5316/5317, and 7118/7119; the closing CTA ends
  at row 6998.
- At 800, the main container is x 40–759, the first major hairline is row 1208,
  and benefit-grid rules start at row 1563.
- At 375, the container is x 16–358 and the first major hairline is row 1168.

Measure every page-specific value that is not already owned by a token before
coding it. Use `magick` at native comp size, never a scaled viewer: thresholded
ink bounds for text, palette masks for flat rectangles, row/column scans for
rules and gaps, and crop comparison for `object-fit`/`object-position`. Record
the crop, observed value/range, and whether the shipped value is a measurement
or judgement in `docs/landing.md`. If a recurring product value lacks a token,
add it to `docs/design-system.md`, `app/globals.css`, and `lib/utils.ts` in the
same change. A one-off geometry value still needs recorded measurement and must
follow AGENTS.md §9.1; do not smuggle it in as an unexplained arbitrary class.

The comparison must be a real semantic table with row/column headers, not a CSS
grid that merely looks tabular. Inspect the installed `components/ui/table.tsx`
and fetch its current shadcn docs at execution. Use it if the comp can be met
without fighting its baked-in typography, padding, hover state, and client
boundary. If it cannot, build a small Acres semantic table component and record
that measured incompatibility, following the same evidence standard used for
the Acres `Button`; do not edit `components/ui/table.tsx` just for this page.

Keep static content in typed module-level constants and render it from Server
Components. Do not add `"use client"` for layout. Native horizontal scrolling is
enough for the two intentionally clipped mobile regions; do not add a carousel
library or JS state unless the comp proves it necessary.

## Breakpoint behaviour

### 375 px

- Existing closed mobile nav remains above the page.
- Hero is centred on two lines and uses the phone report composite over the
  inset sage band.
- Trusted marks form the comp's 2-column/3-row arrangement.
- Benefits are one column with one hairline per capability.
- All four main photographs use the mobile aspect ratios and measured crops;
  content stacks image/text in the comp's order.
- Big Picture is text/list/button followed by the cylinder image.
- The comparison table keeps three fixed content columns in a horizontally
  scrollable viewport; the first column is fully visible and the next is
  intentionally clipped as in the comp. Do not collapse rows into cards.
- Testimonial stacks image then quote.
- The numbered steps remain one horizontal sequence in a scrollable viewport,
  showing `01` and part/all of `02` at the initial scroll position as the comp
  does; do not turn the sequence into a vertical list.
- Closing CTA is centred and its primary pill follows the measured mobile width.

### 800 px

- Existing horizontal nav remains unchanged.
- Hero stays on two centred lines and uses the desktop/tablet report composite.
- Trusted marks wrap in the exact comp grouping; benefits are 2 × 2.
- Big Picture stacks text/list/button above the cylinder image.
- Comparison table fits all three columns without mobile clipping.
- Testimonial stacks image above quote; numbered steps fit three columns.
- Closing CTA remains centred with its measured tablet width.

### 1280 px

- Hero is one centred line and the report device overlaps the full 1200 px sage
  band.
- Trusted marks are one row; benefits are four columns.
- Big Picture becomes a two-column text/media composition.
- Comparison table spans the container with the elevated/bordered Acres column.
- Testimonial becomes a two-column image/quote composition.
- Numbered steps are three columns and the green aerial image is landscape.
- Closing CTA remains centred with its measured desktop width.

Use the existing `md` breakpoint judgement for the 375→800 structural switch and
the existing `lg` eyebrow rule. Do not invent breakpoints from the export widths.
Where a later 800→1280 composition switch is needed, verify the framework's
default breakpoint against the measured window and record the judgement.

## Reference deltas

1. Every standalone product-name `Area` in the comps becomes `Acres`, including
   benefits copy, feature copy, specs copy, testimonial, closing CTA, and any
   legal copy already corrected by the footer.
2. `Visualize Growth` in the comp becomes the project-contract spelling
   `Visualise Growth`.
3. Existing button hover labels remain black on sage, the approved AA correction
   recorded in `docs/components.md`; do not regress to the comp's failing white.
4. Visible keyboard focus remains on every link and control even though static
   comps do not draw focus states.
5. Horizontal comparison/steps regions must have an accessible scroll affordance
   and keyboard/touch operability even where the comp only shows clipping. Keep
   that affordance within the existing palette and document it.
6. Meaningful media receives accurate alternative text; decorative source marks
   or device chrome use empty alternatives where adjacent content already names
   them.
7. The `cable` and `arrow_outward` identifications retain the uncertainty already
   raised in `docs/components.md`; this step uses the accepted current assets and
   does not falsely close either identification.

No other visual deviation is pre-approved. If measurement exposes a conflict,
record it and raise it rather than silently approximating.

## Expected route and file impact

- `/` changes from the placeholder to the complete landing page.
- `app/page.tsx` becomes the route composition and should remain a Server
  Component.
- Add only focused landing-section components where they materially improve
  readability; do not build a parallel component library.
- Add extracted media assets under `public/assets/ui/landing/`.
- Create `docs/landing.md` as the durable measured build record and change its
  row in the AGENTS.md docs index from `not yet written` to `written`.
- Touch `docs/design-system.md`, `app/globals.css`, and `lib/utils.ts` only if
  page measurement proves a missing reusable token; keep all three synchronized.
- Do not change the established chrome unless live comparison reveals a landing
  integration defect, and then document the evidence.

## Non-goals

- No GSAP, motion dependency, scroll reveal, parallax, animated counters, or new
  hover choreography; those belong to step 5. Existing primitive transitions
  remain.
- No step-6 metadata rewrite or whole-site accessibility/polish pass. This step
  still meets the accessibility floor for every new element it creates.
- No backend, forms, analytics, CMS, auth, database, or invented destination
  routes. Content remains typed constants.
- No redesign, new palette, dark theme, gradients, decorative noise, or stock
  photography.
- No modification of generated `components/ui/` solely to make this page fit.
- No implementation of board-only carousel arrow controls that do not appear in
  the three landing comps.

## Verification and checks

Run all commands and quote their real output in `docs/landing.md` and the final
handoff:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Then serve the production build and use the `docs/automation.md` CDP workflow to:

1. capture full-page screenshots at exact CSS widths **375, 800, and 1280** with
   device scale factor 1 and fonts/images fully loaded;
2. compare each capture section-by-section against its corresponding native comp
   with ImageMagick overlays/diffs, including explicit crop comparisons for all
   four photographs and the report device;
3. measure container widths, hero font/line count, section heading sizes,
   benefits columns/gaps, rules, media radii, button heights, key vertical anchor
   rows, table geometry, mobile scroll widths, and closing-CTA geometry;
4. activate every header/footer anchor and prove the target section exists;
5. keyboard-tab through every link and horizontal scroller, confirm visible focus,
   confirm both mobile overflow regions can be operated without pointer input,
   and confirm the page has one `h1` plus a coherent heading hierarchy;
6. inspect the console at all three widths and report zero hydration, Base UI,
   image-sizing, and accessibility warnings;
7. run the current `web-design-guidelines` audit over every changed UI file and
   resolve all in-scope findings before completion;
8. run a text search proving no landing copy ships the standalone product name
   `Area`, while avoiding false positives inside words such as `area`.

Do not report only a global pixel-diff percentage: font rasterisation and the
already-built chrome can make that number misleading. Report measured anchor
deltas and named visual mismatches, fix every in-scope mismatch, and repeat the
captures after the last change.

## Documentation and completion

`docs/landing.md` must record:

- every source asset and repeatable extraction/mask command;
- the exact copy and icon mapping;
- section-by-section measurements at 375/800/1280;
- every judgement and reference delta;
- server/client boundaries and the comparison-table decision;
- screenshot/diff findings and final browser measurements;
- exact output from typecheck, lint, build, and the UI guideline audit.

After the final clean checks, use `caveman-commit` to generate the message, stage
only this prompt's implementation files, and commit the completed work to
`main`. Do not push. End with exact commands to run and view the result locally.
