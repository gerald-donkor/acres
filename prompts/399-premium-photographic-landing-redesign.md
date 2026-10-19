# Premium photographic landing redesign

## Request and scope

User request: “Redesign the landing page. Use real representing images.
Makesure its premium”.

Redesign the public `/` landing page for Acres, a B2B regional-data analytics
product. The page should make the subject immediately recognizable and feel
carefully art-directed through photography, typography, composition and spacing.
The single conversion is creating an account at `/register`; secondary actions
explain the workflow on the same page.

This is directly requested marketing work, dependency-safe alongside the existing
application. It does not select the next backend or production-launch phase.
Preparation starts from clean commit `3c4f99a`; recheck status and HEAD before
execution and preserve any intervening unrelated work. Execution was approved by
the user's standalone `y` on 2026-10-19. The completed implementation and browser
evidence are recorded in `docs/landing.md` and `docs/design-system.md`.

## Evidence read and actual files inspected

- `AGENTS.md` and `client/AGENTS.md`.
- `docs/skills.md`, `docs/product.md`, and the opening dependency/process record
  in `docs/build-plan.md`.
- Relevant landing, palette, type, grid, container, primitive, chrome, motion
  hook, accessibility and automation records in `docs/landing.md`,
  `docs/design-system.md`, `docs/components.md`, `docs/chrome.md`,
  `docs/motion.md`, `docs/polish.md`, and `docs/automation.md`.
- All three original static PNGs were visually opened: desktop in full, and
  tablet/mobile through scaled copies in `/tmp`. Scaling was for reading,
  not a new measurement. Sources are
  `client/public/assets/ui/landing-pages/{Desktop,Tablet,Mobile}.png`.
  The hero, full-page section rhythm, photography, comparison and closing CTA
  were inspected. The board PDF remains a reference to open during execution
  if a retained primitive needs further visual verification; this preparation
  does not claim a new PDF measurement.
- The route is actually `client/app/(marketing)/page.tsx`, with chrome mounted
  in `client/app/(marketing)/layout.tsx`. Older documentation pointing to
  `client/app/page.tsx` is historical, not the current editing location.
- Inspected the marketing page/layout, Acres header/footer/button,
  `client/components/acres/landing-motion.tsx`, `client/app/globals.css`,
  `client/lib/utils.ts`, and root package scripts.
- Read installed Next image guidance at
  `node_modules/next/dist/docs/01-app/01-getting-started/12-images.md`.
  Re-read the relevant full Image and page API reference before implementation.

The current page has an illustrative device, decorative cylinders/stones,
generic trusted marks, an attributed testimonial and an unsupported competitor
matrix. No new customer, product-performance or partnership claims are established
by those design assets. The redesign should explain verified product work instead.

## SKILLS USED

- `frontend-design` — visual direction, copy, distinctive composition and critique.
- `tailwind-design-system` — scoped landing tokens within the existing system.
- `tailwind-4-docs` — verify utilities, responsive variants and theme syntax.
- `vercel-react-best-practices` — server rendering, image delivery and bundle cost.
- `web-design-guidelines` — final semantic, focus, responsive and interaction audit.
- `firecrawl` — live-web photo source and licence research during execution.
- `firecrawl-search` — discover real photograph source pages.
- `firecrawl-scrape` — inspect selected source pages and usage terms before download.
- `playwright` — browser inspection and responsive acceptance screenshots.
- `gsap-core` — verify compatibility of existing reveal targets with new markup.
- `gsap-timeline` — preserve the existing two-beat hero entrance.
- `gsap-scrolltrigger` — preserve valid reveal triggers after restructuring sections.
- `gsap-react` — retain existing scoped client leaf and cleanup.
- `gsap-plugins` — verify existing plugin registration; add no plugin.
- `gsap-utils` — preserve scoped target selection and nearest-group behavior.
- `gsap-performance` — avoid layout animations and unnecessary effects.
- `requesting-code-review` — independent reviewer after self-verification.
- `receiving-code-review` — verify feedback, correct valid issues, recheck.
- `caveman-commit` — final local commit message.

Skills covering preparation were read; execution must load every listed skill
again, including full GSAP skills and their applicable references. No new shadcn
primitive, analytics visualization, provider, auth behavior or backend API is
planned, so their implementation skills are not needed. Load an additional owning
skill if scope legitimately touches one of those surfaces.

Tooling notes: the Firecrawl shim currently errors that no Node version is set,
including attempts with `MISE_NODE_VERSION` and `mise exec node@24.21.0`.
Resolve the executable using the installed Node 24 runtime without changing the
user's global configuration; use available web tools if Firecrawl remains
unavailable. No photo or licence is selected or verified by this prompt.
Tailwind's loaded engineering playbook/gotchas provide limited local guidance;
check snapshot availability/freshness at execution and follow its initialization
or blocked-network fallback requirements. Do not claim a fresh snapshot was read.

## Direction

**An atlas for decisions.** The memorable visual is a pair of real aerial
photographs: the built environment beside a working landscape. It directly
connects regional data to the places it describes. Keep the surrounding design
quiet: white canvas, large Crimson Text, restrained green actions, fine rules,
short paragraphs and Roboto Mono captions.

Retain these established colours and roles: white `#FFFFFF` canvas, black
`#000000` headings, grey `#6F6F6F` body, green `#485C11` action/eyebrow,
pale green `#DFECC6` secondary surface, sage `#8E9C78` approved hover surface,
and `#E9E9E9` rules. Reuse tokens, never repeat hex in components. Photographs
naturally contain other colours; that does not create new interface colours.

Keep Crimson Text 400 for headings, DM Sans for body/UI, Roboto Mono for labels
and provenance captions. Keep the 48px pills and approved black labels on sage
hover, 24px photo radius, 14px card radius and shared container. Do not add a
font, new accent, gradient, ambient glow, glass panel, decorative map or fake KPI.

Design critique before coding: a centered title and a device mockup would repeat
the current generic product-launch treatment. Replace the mockup with the
photographic pairing, and replace decorative objects and invented proof with a
concrete account of regional work. Let this pairing be the single visual flourish.

## Proposed page and content

1. **Hero.** Eyebrow “Regional intelligence”. One centered `h1`: “See the bigger
   picture.” Supporting copy: “Turn regional data into clear comparisons,
   traceable reports, and better-informed decisions.” Primary “Create Account”
   links to `/register`; secondary “See how it works” links to `#how-to`.
   Use accessible normal text, not text embedded in imagery. Place the aerial
   image pair below the copy/actions, with a dominant city/infrastructure image
   and a smaller landscape/agriculture image. Captions below images use verified
   subjects or locations only. Keep controls outside animated hero-media targets,
   since their existing entrance uses visibility hiding.
2. **A concise capability strip.** Replace “Trusted by” and placeholder marks
   with supported facts: “CSV, XLSX & GeoJSON”, “Regional comparisons”,
   “Traceable reports”. This is readable supporting content, not fake social
   proof, not a row of customer logos, and not decorative statistics.
3. **Benefits, `#benefits`.** Eyebrow “From data to decisions”, heading “Know what
   matters. See where it happens.” A compact introduction explains analyzing
   organization-owned regional data. Four open articles, each with a top rule:
   “Bring your data together” (supported file formats), “Compare regions”
   (metrics across places and periods), “Keep the source in sight” (traceability),
   “Share a clearer story” (reports and exports). Use specific plain descriptions
   grounded in the product record; remove localization and office-management
   promises. Retain 4 → 2 → 1 grid behavior. Icons are optional; do not introduce
   an unresolved new glyph or make static articles look clickable.
4. **Product detail, `#specifications`.** A two-column editorial section with a
   third real photograph showing regional infrastructure or a settlement in its
   wider landscape. Heading “The detail behind every decision.” Explain source
   validation, meaningful regional comparisons, and reports tied to evidence in
   three ruled rows. Place source captions on white. No competitor comparison,
   speed ranking, AI promise or compliance badge. The exact textual descriptions
   must be checked against implemented-state documentation before they ship.
5. **Workflow, `#how-to`.** Heading “From your first dataset to your next
   decision.” Three actual sequential steps: “Import your data”, “Explore your
   regions”, “Publish your findings”. Explain validation/mapping, comparisons,
   and governed reports. Use semantic `ol`, no setup-time promise. Show the full
   content on mobile with vertical stacking, replacing horizontal scrolling.
6. **Closing CTA, `#contact`.** Keep a centered close: “Put your regions in
   perspective.” One short sentence and “Create Account” → `/register`.
   Remove scheduling-a-call copy unless a real booking action exists. Preserve
   the `#contact` destination for existing navigation compatibility.
7. **Chrome.** Reuse the established header/mobile disclosure/condensed nav and
   footer. Preserve all four anchor IDs, so no nav behavior rewrite is required.
   Do not add pricing, a contact form or an unimplemented demo control. Only
   change chrome if a concrete integration defect requires it, documenting and
   verifying that adjustment.

Copy above is the intended final content direction; small edits to fit natural
line breaks are allowed without changing the meaning or inventing claims.

## Real photography: acquisition and delivery

- Source three actual photographs: aerial city/infrastructure, aerial working
  landscape, and infrastructure/settlement in geographic context. They represent
  regional analysis, not Acres customers, properties for sale, or live datasets.
- Find original photographer/publisher pages through web research. Inspect the
  actual images before selection. Verify commercial website use and required
  attribution from the publisher's current licence/source page; record the page,
  author, image URL, licence URL and access date. Prefer sources permitting local
  hosting. Do not use watermarked previews, search thumbnails, random image
  endpoints, AI-generated scenes, or assumed rights.
- Download selected images to `client/public/assets/ui/landing/editorial/` with
  descriptive filenames; store a compact `SOURCES.md` beside them. Add visible
  credit when required. If compliant originals cannot be obtained, report that
  specific blocker; do not silently replace them with illustrations.
- Choose a coherent natural green/neutral photographic treatment. Avoid heavy
  filters. Show meaningful urban and geographic detail, rather than exclusively
  beautiful wilderness that could advertise travel.
- Measure each selected source's dimensions and inspect desktop/mobile crops.
  Pick source resolution sufficient for the actual rendered box without claiming
  upscaling adds detail. Set focal positions deliberately and document them.
- Use local `next/image`, intrinsic dimensions or reserved aspect-ratio boxes,
  accurate `sizes`, and the already supported quality configuration. Give only
  the likely hero LCP image high fetch priority; lazy-load lower images. Verify
  these props against the installed Next reference. Do not change deployment
  optimizer routing or image qualities as part of this design task.
- Target, as engineering budgets rather than measurements, a hero source at or
  below roughly 500KB and each supporting photo roughly 350KB when visual quality
  permits. Record actual bytes and render sizes. Do not blur useful photo detail
  solely to hit a budget. No remote runtime image dependency.

## Geometry and token plan

Preserved measured values: container 343px at 375, 720px at 800, 1200px at
1280; 16/40/40 gutters; 20px multi-column benefit gaps; 120px major section
rhythm; 48px pills; existing type families and body/UI styles; 24px media radius.

New design values below are **design judgments for this redesign**, not values
measured from the old comps. Verify with real fonts and image crops, refine only
where browser evidence shows a problem, then record final choices honestly.

- Add landing-specific hero roles, leaving original/global type roles intact:
  `--text-landing-hero` = 4rem (64px), `--text-landing-hero-md` = 6rem (96px),
  `--text-landing-hero-lg` = 8rem (128px); line height .95, tracking -.04em,
  weight 400. Document companion properties. Register their names in `cn()`.
- Use the existing section-heading roles (50/52/60px) for subsequent headings.
- Hero top inset: 40px mobile, 60px tablet, 64px desktop; image gap 40px mobile,
  48px tablet, 64px desktop. Use existing verified spacing utilities.
- Hero photo rows: 16:10 then 16:9 on mobile; two columns at 800 and 1280,
  with a 2:1 track ratio and 20px gap. Shared photo height 360px at 800 and
  440px at 1280. Add named spacing tokens for those heights and register them.
- Caption gap 12px, body max line length approximately 45–60 characters;
  supporting hero copy centered at a readable maximum width. Prefer verified
  existing container-width tokens. If new widths/aspect ratios need tokens,
  add them to `@theme`, its documentation and merge configuration as applicable.
- Detail image: approximately 4:5 desktop, 16:10 tablet/mobile; use reserved
  aspect ratios, not a fixed height that stretches images.

No raw pixel values or hex in component markup. Use existing spacing tokens or
the verified Tailwind spacing scale first. New semantic tokens must be documented
as a part of the one existing system, not a replacement design system.

## Breakpoint behaviour

| Width | Hero                                                                                                             | Benefits     | Detail                                                             | Workflow                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 375   | Centered 64px title; natural wrapping; actions wrap or stack without clipping; both photos stacked and captioned | One column   | Photo and text stacked in meaningful DOM order                     | Three visible vertical steps, no horizontal scroller                       |
| 800   | Centered 96px title; paired photos in 2:1 tracks; preserve 720px container                                       | Two columns  | Full-width photo and copy stacked, avoiding narrow reading columns | Three columns if readable at 720px, otherwise stack with recorded evidence |
| 1280  | Centered 128px title; paired 440px-tall photos; preserve 1200px container                                        | Four columns | Two columns with balanced photo/text mass                          | Three equal columns                                                        |

Keep existing breakpoint meanings (`md` 768, `lg` 1024). Check 320px, 390px,
1024px and 1440px too for interpolation, long text and overflow. At 200% zoom,
all content and actions remain available. Large headings must never be clipped.

## Reference deltas and authorization record

The user's explicit redesign request authorizes changing the landing composition
and imagery. On execution, add a concise dated exception under `AGENTS.md` §0:
Prompt 399 supplies the approved direction for the public landing page's new
composition, copy and sourced photography; the original comps remain the source
for retained brand primitives and all unrelated surfaces. This is a bounded
exception to pixel fidelity, not permission to change the whole product identity.

Record these deliberate deltas in `docs/landing.md`:

- New headline, hero type roles, supporting copy/actions, and paired real photos
  replace the device-over-sage composition.
- Capability strip replaces unverified trusted marks.
- Product-specific benefits replace the former four marketing promises.
- Real geographic context replaces decorative mountain/stone/cylinder sections.
- Evidence-focused product detail replaces the unsupported comparison matrix and
  testimonial; no replacement customer claim is invented.
- Mobile workflow stacks instead of scrolling horizontally.
- Closing CTA describes the actual account action rather than booking a call.
- Overall page length changes intentionally; acceptance is the new design,
  preserved brand contract and responsive usability, not the old full-page diff.

## Implementation order and files

1. Re-read this prompt, owning records, skills and framework references. Check
   git status, current branch and Node runtime. Use the existing Node 24 version
   rather than changing global tooling. Record the pre-change HEAD.
2. Source and visually approve all three real photos and their licences. Record
   sources and actual dimensions before building layouts around them.
3. Add only the scoped tokens needed in `client/app/globals.css`, update
   `client/lib/utils.ts` merge recognition and `docs/design-system.md` together.
   Correct the top CSS comment so new judged values are not described as measured
   from the original comps. Do not change global body, auth or app styles.
4. Rebuild `client/app/(marketing)/page.tsx` as a Server Component, with typed
   module-level content arrays and small local server helpers where repetition
   warrants them. No new client boundary or UI package is needed.
5. Reuse `LandingMotion` and its documented hooks without new choreography.
   Hero hooks belong to heading/photo containers without focusable descendants;
   later content uses the existing nearest-group rules. Do not animate the same
   node from both hero and generic-media hooks. Preserve reduced motion and
   static visibility with JavaScript disabled. Touch no motion module unless a
   reproduced defect requires the smallest correction, with full re-verification.
6. Inspect all anchors, alt text, keyboard behavior, image crops and the full page
   in a browser. Iterate spacing/crops to achieve the intended hierarchy. Keep
   a coherent visual balance at each specified width, not merely absence of
   overflow.
7. Self-verify, request independent review, evaluate findings, fix valid issues,
   repeat affected checks and re-review significant changes.
8. Append the factual build record to `docs/landing.md`, token decisions to
   `docs/design-system.md`, and the bounded §0 exception to `AGENTS.md`.
   Update `docs/motion.md`/`docs/chrome.md`/`docs/polish.md` only if their owned
   behavior actually changes. Record image provenance in the asset manifest.
9. Stage only this scope, inspect the staged diff, commit to local `main` using
   `caveman-commit`. No push or deployment is included.

Expected files: this prompt; marketing page; global token additions; merge
configuration; three production image assets plus sources; landing/design-system
records; bounded AGENTS exception. Prefer no other changes.

## Verification and exit evidence

- Inspect existing formatting configuration and run its actual available check
  on changed text/code files. Do not invent a `format` script or install a new
  formatter. Run `git diff --check`.
- Run root `npm run lint`, `npm run typecheck`, and `npm run build`. Quote their
  real output/exits, including blockers. Fix task-caused failures before review.
  A root bare `tsc` is not a check. The backend suite is not required for this
  static marketing change; no backend behavior changes.
- Capture hero and full-page screenshots at 375, 800 and 1280, and inspect them
  visually after fonts load and all photos decode. Use `output/playwright/` or
  temporary artifacts consistently with the selected browser workflow. Also check
  intermediate widths. Record measurements, do not infer them from screenshots.
- Verify direct photo URLs and optimized image responses decode; all displayed
  images have natural dimensions; no broken image, distortion, missing source,
  hydration error or unused hero preload warning.
- Test primary CTA navigation to `/register` without creating an account. Test
  both header navigation forms, all four anchor targets, mobile close-on-link and
  Escape, skip link, logical tab order and visible focus. Ensure condensed nav
  remains correct on scroll. Do not hide an integration defect behind unchanged
  shared component source.
- Repeat representative browser checks under reduced motion and with JavaScript
  disabled. Content must remain visible and links usable. Confirm no document
  horizontal overflow, clipped titles, invisible CTA or mobile photo focal loss.
- Fetch the fresh web-interface guidelines and audit the changed page. Text on
  white retains verified contrast. Keep text off varying photo backgrounds.
- Request reviewer with explicit requirements, changed paths, actual check and
  screenshot evidence, baseline SHA and current HEAD plus the uncommitted diff
  (HEAD may still equal baseline before the required final commit). Do not imply
  an uncommitted diff is a separate commit SHA. Resolve important findings.
- Provide the local commit ID and exact preview steps:
  `npm run dev:client`, then open `http://localhost:3000/` (or the actual port
  printed by Next). Report browser/tool limitations honestly if acceptance could
  not be completed; do not claim a premium visual result without inspecting it.

## Non-goals and rollback

No authenticated-app redesign, data mutation, backend/schema/API changes,
dashboard mock data, AI integration, pricing, analytics tracking, external
messages, production launch approval, deployment or push. Do not delete old
reference images or assets merely because this page no longer uses them.

The implementation is reversible as one scoped local commit. Reverting it should
restore the previous marketing composition without changing product data or
runtime contracts.
