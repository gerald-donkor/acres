# Prompt 423 — premium survey-plate landing

## Scope and why this is next

Direct user request, 2026-10-21: make the public landing page look premium, after
a deep look at sites like Acres. This is not the next Phase 12 operations unit.
`docs/build-plan.md` leaves the next repository-executable engineering unit
unnamed and forbids another baseline-reconciliation prompt; it also says a
direct, dependency-safe request is honoured. The public `/` surface is already
built. Nothing in this prompt depends on an unbuilt phase.

Highest existing prompt number before this file: 422. This preparation writes
only this uncommitted prompt. No component, token, asset, documentation, stage,
commit, push or deployment is authorized until the user approves execution.

Parent surfaces: the marketing landing finished through Prompt 402, which
simplified Prompt 401's product-led hybrid. Prompt 400's removal of visible photo
credits remains in effect. The original comps remain authoritative for brand
primitives; the 2026-10-19 landing exception in `AGENTS.md` §0 permits a
documented composition change on `/` and does not permit a new product identity.

## What "premium" means here

Acres is a B2B regional-data instrument: import a file, compare places and
periods, and publish a finding that still names its source. Premium, for that
subject, is a printed survey plate — quiet paper, one large evidence object,
exact type, and enough air that the plate can be read. It is not a darker theme,
a louder accent, or a longer page.

Brainstorm, then the revision that keeps it specific:

| axis | first impulse | revision, and why |
| --- | --- | --- |
| Colour | a warm paper canvas or a near-black field with one acid accent | Rejected. Both are the generic defaults `frontend-design` names, and both contradict the measured canvas `#FFFFFF` and the seven-colour palette. Stay on white, ink, pale green and olive. Spend the one chromatic accent only on the plate and the primary action. |
| Type | a new display face | Rejected. Crimson Text, DM Sans and Roboto Mono are identified. The premium move is scale, tracking and role discipline already in the tokens, not a fourth family. |
| Layout | a split dark hero with a floating product card | Rejected. The hero, "Why Choose Acres?" and "Connect with us" are centred at every breakpoint (`AGENTS.md` §1.3). Do not break that. The signature is the plate going full container width under a short centred thesis. |
| Signature | a logo marquee, a fake metric, or a second chart | Rejected. There are no customers to name and no live number to claim. The memorable object is the existing canopy comparison, enlarged and given the rhythm of a survey sheet. |

## References read

Web, fetched this session with Firecrawl CLI 1.26.18. Local copies, gitignored
by the existing `.firecrawl` ignore if present, otherwise left untracked and
**not part of the approved diff**:

- `.firecrawl/search-premium-landing.json` — Linear as a product-page structure
  reference, not a palette.
- `.firecrawl/linear.md` from `https://linear.app/` — one sentence, then the
  product itself as the hero object.
- `.firecrawl/search-geo-products.json` and `.firecrawl/felt.md` from
  `https://felt.com/` — the closest subject: the map/record is the thesis;
  sections are short and operational.
- `.firecrawl/search-location-intel.json`, `.firecrawl/placer.md` from
  `https://www.placer.ai/`, and `.firecrawl/carto.md` from `https://carto.com/`.

Borrowed, and only as structure:

- Linear: the hero is a sentence plus one large, specific product artifact.
  Reject the near-black canvas, gradient mesh, and issue-tracker chrome.
- Felt: a geographic plate can carry the page, and a photograph is context, not
  a second subject. Reject watercolor illustration, the logo marquee, and a
  video theater.
- Placer and CARTO: location-intelligence products lead with the thing you can
  inspect. Reject partner walls, cloud-vendor strips, tabbed marketplaces, and
  claims Acres does not make (foot traffic, agentic GIS, "trusted by").

Repository, opened this preparation:

- `AGENTS.md` §§0–1, §5, §8, §9.1–9.4, §10.
- `docs/landing.md` opening status and the Prompt 402 record (from line 1143).
- `docs/design-system.md` §§1, 4.3 and 12–14.
- `docs/product.md` §1 (job only).
- `docs/motion.md` opening; `client/components/acres/landing-motion.tsx` hook
  vocabulary.
- `client/app/(marketing)/page.tsx` (complete, 229 lines).
- `client/components/acres/landing-product-visuals.tsx` and
  `client/components/acres/landing-example.ts`.
- `client/app/globals.css` `@theme` landing and spacing tokens.
- `prompts/402-simplify-landing-content-and-spacing.md` as the superseded
  density contract, not as a composition to restore.

Visual reference still required at execution, before changing geometry: the
desktop benefits crop `1280×630+0+1120` of
`client/public/assets/ui/landing-pages/Desktop.png`, used only to keep the
hairline, type roles and restraint of the brand. It is not a composition to
restore. No new photograph is authorized.

## SKILLS USED

- `frontend-design` — direction, copy restraint, one signature, self-critique.
- `tailwind-design-system` — token-first spacing and type; no raw hex or pixel.
- `tailwind-4-docs` — any utility not already verified in this file's utilities.
- `web-design-guidelines` — fetch the current guidelines and review the changed
  landing files before calling the page finished.
- `vercel-react-best-practices` — keep the page a Server Component; do not add a
  client boundary.
- `gsap-core`, `gsap-react`, `gsap-timeline` — only if a hook must move; the
  intent is to keep the existing client leaf untouched.
- `accessibility-compliance` — contrast, name, and reading order of the enlarged
  plate.
- `playwright` — production-browser measurement at 375, 800 and 1280.
- `requesting-code-review` — reviewer subagent after self-verification.
- `receiving-code-review` — verify findings before any fix.
- `caveman-commit` — the local commit message.

Listing is not loading. Invoke each at its stage before acting. Do not load
Nest, database, security-threat, or operations skills: those surfaces do not
change. `shadcn` is not required unless a generated `client/components/ui/`
primitive is edited, which this prompt forbids.

## Expected impact

Routes: `/` only. Shared chrome, `/login`, `/register`, `/app`, and every API
stay untouched.

Permitted files:

- `client/app/(marketing)/page.tsx`
- `client/components/acres/landing-product-visuals.tsx`
- `client/components/acres/landing-example.ts` only if a label string must move
  with the plate and no example value changes
- `client/app/globals.css` only if a spacing or type judgment cannot be expressed
  with the existing scale; any new token is added in the same change to
  `docs/design-system.md`
- `docs/landing.md` and `docs/design-system.md`
- this prompt, once approved

`LandingMotion` stays the only client module on `/`. New markup uses the existing
hooks: `data-motion-hero-heading`, `data-motion-hero-media` on the plate and the
photo, `data-motion-group` / `data-motion-item`, `data-motion-media` on the
report plate, and `data-motion-card` only if a benefit article remains a
non-interactive hover target. Do not add a second timeline, a scroll-scrub, or
a custom cursor.

## Composition

Keep the five sections and their ids: hero (no id), `#benefits`,
`#specifications`, `#how-to`, `#contact`. Keep both actions: primary
`Create Account` to `/register`, secondary `See how it works` to `#how-to`.
Keep the current sentences. Do not restore the 640-word Prompt 401 page, the
capability strip, the seven previews, the mapping card, or a comparison table.

### Hero

Centred thesis, then one full-width plate, then the photograph as a quiet
context band — not a competing column.

```
[ eyebrow ]
[ See the bigger picture. ]
[ one sentence ]
[ Create Account ] [ See how it works ]

+------------------------------------------+
| Regional comparison plate, full         |
| container width. Three regions, scale,  |
| source.                                  |
+------------------------------------------+
| Prampram photograph, full container,    |
| short 21:9 band from md, 16:9 below md  |
+------------------------------------------+
```

Judged spacing, using the default `0.25rem` scale unless execution finds a
utility that does not exist:

| relationship | 375 | 800 | 1280 |
| --- | ---: | ---: | ---: |
| Hero top inset | 80px (`pt-20`) | 96px (`md:pt-24`) | 128px (`lg:pt-32`) |
| Thesis to actions | 32px | 32px | 40px |
| Actions to plate | 64px | 80px | 96px |
| Plate to photo | 24px | 32px | 40px |
| Plate inset | 32px | 40px | 56px |
| Region-row gap | 40px | 40px | 48px |

The hero heading keeps `text-landing-hero` and its md/lg steps. Do not invent a
larger size. The eyebrow stays Roboto Mono in `#485C11`.

The plate stays `bg-brand-soft`, `rounded-media`, and a `<figure>`. Its title
stays Crimson `text-quote`. Values, periods, scale and source stay Roboto Mono
with `tabular-nums`. Bar widths remain the data percentages on a shared 0–100
scale; do not restyle them into a decorative chart. Outline versus fill remains
the non-colour distinction. The disclosure "Illustrative data · invented values"
stays visible. `aria-describedby` still names `regional-canopy-example.csv · v1`.

The photograph uses the existing
`/assets/ui/landing/editorial/prampram-context.webp`, the existing alt text, and
`quality={100}`. Update `sizes` to the new full-container box before shipping.
From `md`, constrain it with an aspect utility that evaluates to 21:9 if that
utility exists in the installed Tailwind; otherwise add one token,
`--aspect-landing-context: 21 / 9`, in `@theme` and `docs/design-system.md` §15,
and say it is a judgment. Below `md`, keep 16:9 so the place remains legible.
No caption, no credit, no number on the photograph.

### Benefits

Keep four articles, the 1 / 2 / 4 column change, the `#E9E9E9` top rule, and
serif `text-h3` titles. Increase the heading-to-grid gap to 96px from `md`
(`mt-24`) and 80px below. Do not add icons, cards, shadows, or numbers: these
are not a sequence. `data-motion-card` may stay for the existing fine-pointer
lift. Do not give the articles button semantics.

### Report

Keep the sage frame, white sheet, disclosure, Greater Accra excerpt, `+6
percentage points`, and the one visible source filename. At 1280 the tracks stay
equal. At 800, stack with 80px between plate and copy rather than squeezing the
sheet. Let the sheet's type use the existing quote and label roles; do not add
a display number outside the figure. The figure must still say it is a published
example, revision 1.

### Workflow and close

Keep `01` `02` `03` because the content is a sequence. Markers stay
`text-stat` in the faint role, never body text. Increase the gap before the list
to 96px from `md`. The close stays centred, one sentence, one primary action,
and the existing top rule. Do not add a band, a second button, or a new
background.

## Reference deltas

Record these in `docs/landing.md` and `docs/design-system.md` §15. They are
judgments, not comp measurements.

- The Prompt 402 2:1 hero (comparison beside photo) becomes a stacked
  full-width plate and a context band. Reason: the split made both objects small;
  the plate is the product thesis.
- Hero top inset moves from 64/80/96 to 80/96/128. Reason: the current inset
  meets the nav too quickly for a page whose only object is the plate.
- Section interiors gain one step of air. The 120px section rhythm token does
  not change.
- No palette, type family, radius, button, or elevation change. Elevation stays
  the one measured 3–4% shadow; this page still should not add a second.

## Non-goals

- No new hex, font, icon set, illustration, stock photograph, or video.
- No customer names, partner logos, testimonials, prices, ratings, or live data.
- No claim of AI, real-time maps, foot traffic, or coverage Acres does not have.
- No change to nav, footer, auth, app, API, schema, or motion implementation
  unless a hook is orphaned by deleted markup. If markup moves, retarget the
  existing hook; do not rewrite `landing-motion.tsx` for taste.
- No restoration of removed landing sections.
- No dark mode, gradient mesh, glass panel, marquee, or custom cursor.
- No commit of `.firecrawl/` research dumps.

## Breakpoint behaviour

| | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| Container / gutter | 343 / 16 | 720 / 40 | 1200 / 40 |
| Hero | centred; plate then photo, both full container; photo 16:9 | centred; photo 21:9 | centred; photo 21:9 |
| Benefits | 1 column | 2 columns, 20px gap | 4 columns, 20px gap |
| Report | stacked, 48px | stacked, 80px | equal columns, 80px |
| Workflow | 1 column, 64px row gap | 3 columns, 20px | 3 columns, 20px |
| Close | centred | centred | centred |

Also check 320, 390, 1024 and 1440 for overflow and clipped text. At 320 the
source filename may wrap; it must not overflow. No page-level horizontal scroll
at any of those widths.

## Copy contract

Do not add a sentence. Permitted micro-edits, only if the enlarged plate makes
the current label ambiguous:

- keep "Illustrative data · invented values" as the first text in each numeric
  figure;
- keep region names, years, percentages and `+6 percentage points` exact;
- keep `Greater Accra`, `Ashanti`, `Northern`, 18/24, 35/41, 54/58.

If a label is still clear, change nothing.

## Accessibility and integrity

- One `h1`. Heading order does not skip.
- The comparison remains a `figure` with a programmatic source description.
- Bars stay `aria-hidden`; the percentages stay real text.
- Colour is not the only series distinction.
- Primary white-on-olive and body `#6F6F6F` on white stay. Do not put body copy
  on sage or pale green. The known white-on-sage hover failure is unchanged and
  is not "fixed" by recolouring the button in this prompt.
- Focus rings stay the existing button treatment.
- Reduced motion: content is visible without waiting for the timeline.
- JavaScript disabled: both figures and all three actions remain in the server
  HTML.
- `sizes` matches the rendered box closely enough that the browser does not
  download the desktop crop for a 343px phone. Verify against the installed
  Next Image reference before editing it:
  `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`.

## Execution procedure

1. Re-read this file, `AGENTS.md`, `docs/landing.md` (Prompt 402 record),
   `docs/design-system.md` §§1 and 12–14, and `docs/motion.md` §§1–3.
2. Invoke every skill named above. Fetch
   `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
   before the UI review. Read the installed Next Image and page docs before
   changing `sizes` or the server boundary. If a Tailwind utility is uncertain,
   read `tailwind-4-docs` and the installed `tailwindcss` theme; do not guess a
   v3 class.
3. Open the desktop benefits crop named above. Confirm the implementation still
   uses a hairline and serif feature titles rather than cards.
4. Implement only the composition in this file. Keep example data identical.
5. Do not start a second client component. If motion hooks no longer match the
   new order, adjust attributes only, then read `landing-motion.tsx` to confirm
   the hero timeline still finds both a heading and a media target.
6. Self-critique against `frontend-design`: if the page could be a generic SaaS
   template with the logo swapped, remove the extra element. The plate is the
   one risk. Everything else gets quieter.

## Verification

Use Node 24.21.0 for project checks (`~/.local/share/mise/installs/node/24.21.0/bin`
first on `PATH`). The default shell node is 26 and is not sufficient for a
claimed pin.

From the repository root:

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

Do not run the server suite or operations drills. This change has no server
surface.

Browser, production build, reduced motion, at 375, 800 and 1280, using the
`playwright` skill and `docs/automation.md` recipes:

- fonts ready, photo decoded;
- record page height, hero height, plate box, photo box, benefits height,
  report height and workflow height;
- confirm container widths 343 / 720 / 1200 and gutters 16 / 40 / 40;
- confirm bar widths still match 18, 24, 35, 41, 54 and 58 within 0.01
  percentage point of the plate's content box;
- confirm no horizontal overflow at 320, 390, 1024 and 1440;
- one normal-motion pass settles every reveal target visible, with no console
  error;
- one JavaScript-disabled pass still shows both figures and the three actions.

Visually open the full-page captures and the hero, benefits, report and workflow
crops before writing the docs record. Save ignored evidence under
`output/playwright/423/`. Do not commit it.

Quote real command output in the final report. A check not run is reported as
not run.

## Documentation

Append a Prompt 423 record to `docs/landing.md` and mark it as the current
public landing, superseding Prompt 402's composition but not its copy reduction
or Prompt 400's credit removal. Add `docs/design-system.md` §15 for any new
judgment or token. If no token is added, §15 still records that the composition
reused the existing scale and names the spacing table above as judgments checked
in the browser. Do not edit `AGENTS.md` unless a cited line is now false; the
centred-hero invariant must remain true.

## Review and commit

After the checks pass, dispatch one reviewer subagent with `requesting-code-review`.
Give it the requirements in this file, the files changed, and the captured
measurements. Evaluate findings with `receiving-code-review` against the code.
Fix only verified defects, then re-check the affected command. Re-review if the
layout structure changes again.

Commit to `main` with `caveman-commit`. Stage only files permitted above plus
this prompt. Do not stage `.firecrawl/`, `output/`, or unrelated dirty files.
Do not push.

## Rollback

One local commit can be reverted. No schema, provider, or content-addressed
asset changes. The existing photograph and example module remain valid if the
composition commit is reverted.
