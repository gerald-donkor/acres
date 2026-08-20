# AGENTS.md

You are a **principal-level design engineer, full-stack engineer with several years of experience and AI implementation agent** working on **Aetherfield**.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

The same rule binds the rest of the stack. **Tailwind CSS 4** is config-less —
tokens live in `@theme` in `app/globals.css` and there is no
`tailwind.config.js`. **Cache Components / `use cache`** is not the
`unstable_cache` of training data; load `vercel:next-cache-components` before
touching revalidation. **Neon, Resend, Better Auth and Upstash are chosen
(§7.2) and each carries a trap that contradicts its own tutorials — read §7.3
before writing a line against any of them.** If an API cannot be verified from
`node_modules/`, a skill, or live docs, say so instead of guessing.

**Sections 5–12 are the backend contract** — product and the ordered build
sequence, architecture, stack, standing rules, data model, the write-path flow,
roles, and the anti-fabrication rules. Read them before writing any server code. Everything above them is
the *site* contract and still applies in full: the backend is being added to a
finished, measured, byte-stable marketing site, and nothing below licenses
breaking it.

# Project notes — where the detail lives

**This file is the index and the invariants. The build record is in `docs/`,
and it is not summarised here — read the file that covers what you are touching,
before you touch it.** Every number in those files is measured against a comp, a
recording or a production build; none of it is decoration, and a session that
skips the read will re-derive it by hand or silently break it.

| file | covers |
| --- | --- |
| `docs/chrome.md` | `SiteFooter` (settled — do not restyle), `SiteNav`'s frosted glass and its fitted blur/tint, the drawn "Get started" arrow, `NAV_ITEMS` |
| `docs/journal.md` | `/journal`, the scaling `JournalStamp`, `texture-journal.png`, the shared-component extensions made there |
| `docs/articles.md` | `ARTICLES` / `ARTICLE_BODIES`, `/article/[slug]`, all six articles and their generated heroes |
| `docs/careers.md` | `/careers`, `JobCard`, the dashed frame and its CSS march |
| `docs/job-listing.md` | `/job-listing/[slug]`, all three roles, the `Seal`'s tilt and its offsets |
| `docs/about.md` | `/about`, the half-width sky band, the Forecast card, `AetherfieldSeal`, `about-founder.png` |
| `docs/motion-homepage.md` | GSAP on `/` — `Reveal`, the emissions chart and its hover readout, the journal mark, the hero split, the Capabilities section |
| `docs/motion-site.md` | motion everywhere else — `/journal`, the card hovers, the footer's split blur-in, `/about`, `/careers`, the navbar drop-in, `/job-listing` |
| `docs/design-system.md` | `/design-system`, the nine colour swatches and why they no longer print a hex, the specs on that page that still restate `@theme` by hand |
| `docs/site-affordances.md` | the pointer cursor on buttons |
| `docs/backend.md` | the backend build record — the Neon resource, the connection split, `lib/db/`, the phase-one schema's column types and enums, the migrations, `.env.example` |
| `docs/skills.md` | the installed agent skills, where each came from, what was deliberately excluded and why, and how to sync the two authored doc snapshots |
| `docs/architecture.md` | the architecture review of 17 Aug 2026, its six candidates, their order and their dependencies |
| `docs/automation.md` | **read before measuring anything** — comp geometry, crop fitting, `magick` recipes, screenshotting, reading reference recordings, build diffing, GSAP source traps, port and worktree gotchas |

# Invariants

These hold across the whole site. Each one is derived in the `docs/` file that
owns it; break one only with the user's explicit say-so.

**Settled surfaces.** `SiteFooter` is done — geometry, type, colours, texture band
and SVG wordmark. `SiteNav`'s `bg-white/10` over `backdrop-blur-[32px]` is fitted.
Ask before changing either.

**`sticky` only travels within its parent.** `SiteNav` renders *outside*
`Container` and carries its own gutters; page sky bands are document-level
`absolute inset-x-0 top-0 -z-10` siblings, and on `/careers` and
`/job-listing/[slug]` `main` is a **sibling** of the header pulled up under it.
Wrapping the header in anything that scrolls off unpins the bar.

**Two comp deviations are inherited and are never chased.** `--text-p1` /
`--text-p2` are a fixed 20px where the comps set ~17, so mobile runs long; the
shipped Archivo cut runs ~18 % wide, so headings and paragraphs wrap a line
early. `Container`'s 24px desktop gutter puts renders 4px right of the comps'
`+20`. Record, don't chase.

**Bundle rule.** Nothing outside `home/` may import `home/sections.tsx` or any
`home/` client module; `motion/` is the shared surface. Client leaves stay
**component-only** — export a constant or a type from one and GSAP lands in that
page's bundle. Sections stay server components by taking `children` as a prop.

**GSAP discipline.** `DUR` / `EASE` from `motion/register.ts`, never restated;
plugins registered once at module scope; `useGSAP(fn, { scope: ref })` with
`gsap.matchMedia()`, **every condition named** (a lone `reduce` query never
fires for anyone else), and `mm.revert()` as cleanup. No `markers: true` in
committed code.

- **`contextSafe` has no valid use in this codebase.** Every GSAP callback runs
  with its creating context active, so wrapping anything — inline in an
  `mm.add` handler or in an `onComplete` — makes two contexts reference each
  other and `revert()` blows the stack on unmount. It crashed the page twice.
- **No tween may `clearProps` `opacity` or `transform`.** The hidden start
  states live in `globals.css` under
  `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)`;
  clearing hands the element back to them and it vanishes.
- **`fromTo`, never `from`, on any element that block hides** — `from` reads the
  element's current value as the tween's *end* value, so it animates 0 → 0.
- **GSAP consumes Tailwind v4's independent `translate` / `rotate` / `scale`.**
  It folds all three into one `transform` and sets them to `none`, so any tween
  on such an element must author the resting value explicitly — including `y: 0`
  alongside a `yPercent`.
- **Overflow.** Nothing in the ancestor chain of the `Seal`, the journal mark or
  the emissions chart's pill may become `overflow-hidden`; each deliberately
  spills its box.

**Reporting a render comparison.** **Never quote a bare page-wide
`magick compare -metric AE` for `/`, `/journal` or `/careers`** — the scrubbed
capabilities cloth, the stamp's perforation drift and the open-application
card's marching dashes sit at a different phase in any two shots. Mask the box,
report the remainder and the box separately.

**Measured or judged, and say which.** Where a recording cannot resolve a
number, record the observed floor as the measurement and the shipped value as a
judgement on it. Never write "0.5 was measured" for a value the fit could not
separate from 0.7.

**Content conventions.** Dates ship as **2026** even where a comp reads 2028.
Straight apostrophes and quotes throughout, never curly. Article prose is
transcribed from the desktop comp.

**This file is capped, and the cap is on the build record — not on the
contract.** It holds the index, these invariants, the workflow, the commands,
the prompt-file contract, and sections 5–12 (product and build sequence,
architecture, stack, standing rules, data model, write-path flow, roles). It
does **not** grow with the build: a finished prompt adds at most one index row
here, and everything it measured or built goes in `docs/`. An invariant earns
its place here only if a session could break it *without* opening the `docs/`
file that owns it, and a new one replaces or subsumes an existing line rather
than stacking on it.

Sections 5–12 are the exception to the growth rule, because they are what a
session needs *before* it opens any `docs/` file — but the same discipline
applies inside them: they carry decisions and boundaries, never the record of
what was built against those decisions. **Column types, DDL, a measured latency,
a migration's contents, an endpoint's full field list belong in
`docs/backend.md`**, and a step in 5.2 is marked done by the repository and
`git log`, never by editing this file. If the front matter above section 5
passes ~250 lines, something in it belongs in `docs/`.

# Content and asset conventions

**Photography comes from `public/assets/images`.** Every image a page needs is
sourced from that folder and treated in-repo into `public/assets/generated` when
the comp shows a duotone, halftone or crop, with the exact `magick` command
recorded in that page's `docs/` file. Cropping artwork straight out of a comp is a fallback for when
the source photograph genuinely is not in that folder (as with
`article-climate-hero.png`), not the default.

**An article title referenced by its image or its comp is a slug.** When the
user points at an article by title or by pointing at a comp, its route is
`/article/<slugified title>` — lowercased, apostrophes and punctuation dropped,
spaces and colons to hyphens, e.g. "Sustainability Isn't a Side Project: Making
Impact Operational" → `sustainability-isnt-a-side-project-making-impact-operational`.
Do not invent a shorter slug; match the entry already in `ARTICLES` when one
exists.

# 1. Workflow

For every implementation request:

1. Read `AGENTS.md` and follow its instructions as the highest priority project guidance. `AGENTS.md` is the source of truth for implementation decisions. User requests may override these rules only when the user explicitly requests a deviation, explains why, and the relevant rule is intentionally changed.
2. **Load every skill the work needs — always, at every stage.** Not only the ones the user names. Before writing the prompt file *and* again before implementing it, look over the available-skills listing and invoke each skill that owns a surface the task touches: the framework (`nextjs`, `next-cache-components`), the styling (`tailwind-4-docs`), the ORM and its migrations (`drizzle-docs`), validation (`zod-docs`), the chosen providers (`neon-postgres`, `resend`, `react-email`, `email-best-practices`, `upstash-ratelimit-js`, `upstash-redis-js`, `better-auth-best-practices`, `better-auth-security-best-practices`, `email-and-password-best-practices`, `organization-best-practices`), the platform (`vercel:marketplace`, `vercel:vercel-storage`, `vercel:env-vars`, `vercel:vercel-functions`, `vercel:vercel-firewall`), motion (`gsap-*`), and design work (`frontend-design:frontend-design`, `figma:*`). `docs/skills.md` records what is installed and what was deliberately excluded. **A skill is the verified source §12 rule 2 demands** — writing an API from memory when a skill for it is one call away is the failure this rule exists to prevent. If no skill covers the surface, say so explicitly rather than proceeding silently.
2b. Read the `docs/` file that covers what the request touches, per the index above — plus `docs/automation.md` if any measurement, screenshot or build comparison is involved. The build record lives there, not here; working from this file alone means working without the measurements.
3. Inspect only the code, files, and dependencies relevant to the request. Do not inspect, modify, or reason about unrelated parts of the repository unless they directly affect the approved implementation.
4. Ask a focused question only if the task has meaningful ambiguity. Do not ask questions when reasonable assumptions can be made without affecting the implementation outcome.
5. Create a detailed prompt file in `prompts/` per the contract in section 4.
6. Ask: `I prepared the implementation prompt at prompts/<file-name>.md. Is this good to execute?`
7. On approval, re-read the approved prompt file in `prompts/` and implement it strictly. Implement only after user approval. Entering `y` or `Y` = `Approved. Execute.`  
8. Run available checks (section 2). Then finally, record all that was implemented in the `docs/` file that owns the area — a new one, added to the index above, if the work does not belong to an existing one. **Never in this file**: the only things a finished prompt may add here are one index row, and a site-wide invariant that meets the cap rule above.
9. Share exact steps to test or run the completed feature.
10. Commit the resulting change to `main`, unprompted. Every executed prompt ends in a commit—never leave implemented work uncommitted. Do not push unless asked.

Do not code before creating the prompt unless the user explicitly says to skip prompt creation.

**Why step 10 matters.** Resolving what is already built (below, and on any resume) reads the files on disk and `git log`, never the prompt files. Work left uncommitted makes that resolution wrong and invites a duplicate prompt for a feature that already exists.

**Resuming in a new session.** Entering `I` or `i` = `Work out what comes next and write its prompt file.` It runs steps 1–6 of this workflow and stops at the approval question. It never implements anything—`i` writes the prompt, `y` executes it.

Resolving what "next" means, in a session with no prior context:

1. **The number** is the highest existing prompt number in `prompts/` plus one. Never renumber, never overwrite, never reuse a number (section 4).
2. **The scope** is the next unbuilt step in **section 5.2's build sequence**, which is already ordered by what unblocks the most downstream work and states each step's dependency. There is **no separate spec file in this repository** — section 5 is the whole product brief, and `ref/ref-agents.md` is a formatting reference from another project, not a source of scope. For site (non-backend) work the scope comes from the user's request and the `docs/` file that owns the area.
3. **Establish what is already built from the repository**—the files on disk and `git log`—not from the existing prompt files. A committed prompt file is evidence that a prompt was written, never that it was executed. Writing a prompt for work that already exists is the main failure mode here.
4. **Name the chosen scope and say why it is next in the first line of the reply**, before writing the file, so a wrong call is visible immediately.
5. If two candidates are genuinely equally unblocking, write neither yet—name both, state the trade-off, and ask.

Then finish with step 6's question as written.

# 2. Commands and checks

Scripts that currently exist in `package.json`:

- `npm run dev` — start the Next.js dev server (Turbopack); watch its terminal for job and pipeline logs
- `npm run build` — Next.js production build
- `npm run start` — run the production build locally after `npm run build`
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest, **scoped to `lib/domain/` and `lib/validation/`** and
  nothing else (the script is a bare `vitest run`; the scope is
  `include: ["lib/{domain,validation}/**/*.test.ts"]` in `vitest.config.mts`,
  not in `package.json`). Added by
  build step 10, because AGENTS.md §6.2 requires the pure domain layer to be
  independently testable and that step put an exact-decimal engine there whose
  output lands in disclosures. **`lib/validation/` was added by prompt 121** and
  is the one addition that argument permits rather than an exception to it: it
  is the one module under `lib/` §6.3 forbids to be `server-only`, to read a
  secret or to import `lib/db/`, and `fieldErrorsFrom` is a pure function with
  no I/O that decides which message a person sees on every write path.
  `vitest.config.mts`'s own docblock carries the full reasoning. A test that
  needs a database, a browser or a mock does not belong in either directory —
  `npm run test:e2e` covers that ground
- `npm run test:watch` — the same, in watch mode
- `npm run test:e2e` — run the complete E2E matrix: Chromium / Firefox natively,
  then WebKit in the pinned rootless Podman container
- `npm run test:e2e:local` — build and start the production app on port 3100
  through Playwright, then run Chromium / Firefox natively
- `npm run test:e2e:webkit` — build and start the production app inside the
  pinned rootless Podman container, then run WebKit (required on Arch Linux)
- `npm run test:e2e:ui` — open Playwright's interactive UI for the native
  Chromium / Firefox projects
- `npm run db:generate` — Drizzle Kit: write a migration from `lib/db/schema.ts`
- `npm run db:migrate` — apply pending migrations over the **direct** connection
- `npm run db:studio` — Drizzle Studio against the same direct connection
- `npm run db:seed:factors` — seed the published DESNZ conversion factors from
  the committed CSV. Idempotent: an already-seeded revision writes nothing

Report the exact command output; never claim a check passed without running it.

> **Gaps to flag, not to invent.** **There is no
> email-preview script — build step 3 did not add one.** This note used to
> predict that it would; it is corrected here rather than left predicting
> something that did not happen (§12 rule 8). `react-email`'s `email dev` CLI
> wants a directory of default-exporting email components, and
> `lib/email/templates/` holds named exports plus a shared shell that is not an
> email; reshaping the templates to suit a preview server was not worth it for
> two messages. They are rendered and inspected with `render()` directly — see
> `docs/backend.md`, step 3. **Never reference a script name before it exists.**
> Because only Next.js auto-loads `.env.local` (§7.3),
> any script reaching the database or a provider is written as
> `dotenv -e .env.local -- <command>` from the day it is added.

# 3. Automation

**Moved to `docs/automation.md` — read it before measuring, screenshotting,
cropping, fitting a recording or diffing two builds.** It is the accumulated
list of steps already worked out by hand, so a session starts from the command
rather than the investigation.

**Standing instruction:** each session, watch for steps repeated by hand and add
the mechanical ones to `docs/automation.md`, so later sessions start from the
command rather than the investigation.

# 4. Prompt files

Every implementation request gets a file in `prompts/`, written before any code
(section 1, step 5) and re-read verbatim at execution time (step 7).

**Numbering.** `NN-<kebab-case-scope>.md`, where `NN` is the highest existing
number in `prompts/` plus one. Never renumber, never overwrite, never reuse a
number — the sequence is the project's build history and a gap or a reused
number makes "what is already built" unresolvable in a later session.

**A prompt file must state**, in whatever order the work makes natural:

- the scope, and why it is next;
- the reference material read for it — comps, screenshots, recordings, source
  files — by path;
- the measurements the implementation must hit, or the measurement procedure
  that will produce them, never eyeballed numbers;
- the expected impact, including which routes' prerendered HTML must stay
  identical;
- non-goals — what is deliberately out of scope, and why;
- the checks to run (section 2), and which `docs/` file the result must be
  recorded in afterwards.

**`## SKILLS USED`** — required, in every prompt file. List every skill the
implementation should invoke, by its exact name from the skill listing, with one
line each saying what it is for. Include skills already loaded while writing the
prompt as well as ones only the implementation will need. Write `None` if the
work genuinely needs no skill, rather than omitting the section.

**Why it is required.** The prompt file is the whole brief on execution — after
a `/clear`, an approving `y` is answered by re-reading the file and nothing
else. A skill that was loaded while writing the prompt is not loaded when the
prompt runs, so an unlisted skill is a skill the implementation will silently
work without. Naming them in the file is what makes the run reproducible.

**And listing is not loading.** The section is a manifest, not a substitute:
step 7 re-reads the file and **invokes every skill named in it** before writing
code, exactly as step 2 requires. A prompt whose `SKILLS USED` section was
written but never acted on is the same failure as one that omitted it.

**Backend prompts carry three extra headings** (section 8 explains each):

- **Prerender impact** — name every route whose prerendered HTML or render mode
  changes, and why. `none — no route changes` is the expected answer for a
  prompt that only adds `app/api/*`, and it must be *verified*, not assumed.
- **Trust boundary** — what crosses from the browser to the server, where it is
  validated, what authorises it, and what a rejected request returns. If the
  task has no request path, write `none` and say why.
- **Secrets and data** — which environment variables the change reads, which are
  `NEXT_PUBLIC_*` and therefore public, and what personal data the change
  stores, logs or transmits.

---

# 5. Product — what Aetherfield is, and what the backend adds

Keep the client in context on every task. **Aetherfield is a B2B
sustainability-intelligence platform.** Its thesis is stated in the site's own
copy and should not be re-derived: emissions, energy and waste data live
scattered across procurement systems, building sensors, vendor spreadsheets and
departmental silos, inside stacks built to optimise for sales and cost rather
than carbon. So sustainability reporting becomes manual, retrospective and
error-prone — an annual ESG document instead of an operational input. The
product's answer is the four-verb loop in `home/capabilities.tsx`:

**Track** emissions, energy and waste across the value chain · **Model**
performance and goal alignment · **Report** ESG disclosures and automate
frameworks · **Act** on surfaced insights and operational next steps.

`home/dashboard.tsx` is the product mockup that makes that concrete, and it is
the closest thing to a specification the phase-two work has: a tenant sees a
tCO₂e total, MWh consumption with a period-over-period delta, a forecast card
("You're 16% off your 2027 emissions goal"), and a monthly emissions trend.
**Treat it as intent, not as a comp** — it is a marketing illustration, and its
numbers are traced from a design file.

**Register is measured and operational.** The site's voice is
evidence-first — "clarity and confidence", "progress over perfection". Server
copy, error messages and emails match it. Never campaigning, never
startup-cheerful, never alarmist about climate.

## 5.1 What is already built

A complete, static marketing site: seven routes, all prerendered, content
hand-authored as typed constants in `app/_content/`, and thirty-six prompts of
comp-matched design engineering behind it. **There is no backend of any
kind** — no `app/api`, no database, no auth, no environment variables, no server
actions. Every call to action is deliberately inert (`chrome.tsx` "Get started",
`journal/page.tsx` "Sign up to newsletter", `job/sections.tsx` "Apply now",
`home/hero.tsx` "Request a demo").

## 5.2 The build sequence

**This is the order, and the dependency column is why.** One step is one prompt
file unless it says otherwise. A step is "done" when its work is committed —
resolved from the repository and `git log`, never from this list and never from
`prompts/` (section 1). Do not tick anything here; the file records the plan,
not the progress.

> **Citation convention, and it matters — the numbers collide.** Build steps run
> 1–14 and sections run 1–11, so "10" is ambiguous on its own. **`§N` always
> means a section of this file; "step N" always means a row of the tables
> below.** Never write a bare number for either. Prompt-file numbers are a third
> sequence again (`prompts/NN-…`) and do **not** correspond to build steps —
> prompt 37 implements step 1.

### Phase one — the marketing backend

Makes the shipped site's four dead CTAs real, and lays the database, email and
auth foundations phase two runs on.

| # | step | depends on | prerender impact |
| --- | --- | --- | --- |
| 1 | **Data layer and schema** — provision Neon, `lib/db/`, the phase-one tables (§9), `.env.example`, the migration workflow and its `package.json` scripts | — | none |
| 2 | **Demo-request capture** — `/`'s hero "Request a demo" and the `CtaBand`. Provisions Upstash and establishes the **whole write-path pattern** (§10): client-leaf form, shared Zod schema, typed result, rate limit, BotID. `lead_source`'s `nav` value remains for a possible mobile-drawer demo CTA | 1 | `/` and the `/design-system` exhibit gain a dialog leaf — **the only step in phase one that changes a prerendered page's markup**. Not `/journal`, whose band is the newsletter's (step 4), and not `/about`, whose band is "View open roles" |
| 3 | **Transactional email** — provision Resend, `lib/email/`, templates, the send helper. Demo requests get their confirmation and internal notification | 1, 2 | none |
| 4 | **Newsletter signup, double opt-in** — `/journal`'s subscribe band, the confirm and unsubscribe routes | 3 — **double opt-in cannot exist before email** | `/journal` form leaf; two new routes |
| 5 | **Blob upload and job applications** — `lib/storage/`, private CV upload, `/job-listing/[slug]` and `/careers`'s open-application card | 1, 3 | `/careers`, `/job-listing/[slug]` form leaves |
| 6 | **Better Auth** — `lib/auth/`, the catch-all mount, `proxy.ts`, sign-in and sign-up screens built from existing primitives, the roles in §11. Password reset and email verification land with step 3, which can send their email | 1 | none, if 8.1 is obeyed — **verify, do not assume** |
| 7 | **The submissions view** — an authenticated route reading leads, subscribers and applications, with signed CV links | 6, and 2 / 4 / 5 for anything to show | new authenticated routes only |

**Steps 2 and 3 are the load-bearing ones.** Step 2 sets the pattern every later
form copies, and step 3 sets the pattern every later email copies. Get them
right slowly rather than getting to step 7 quickly.

### Phase two — the platform

The authenticated product `home/dashboard.tsx` mocks up. **Do not start any of
this while a phase-one step is unbuilt.**

| # | step | depends on |
| --- | --- | --- |
| 8 | **Organisations and multi-tenancy** — Better Auth's organization plugin, membership, and the tenant scope every later query carries | 6 |
| 9 | **Activity-data ingestion** — CSV import first, connectors later; staged rows, validation, and a visible import outcome | 8 |
| 10 | **Emission factors and the calculation engine** — scopes 1, 2 and 3, as pure functions in `lib/domain/` (§6.2) | 9 |
| 11 | **Targets and forecasting** — goal tracking, the "16% off your 2027 goal" reading | 10 |
| 12 | **The dashboard routes** — behind auth, the four-verb loop made real | 10, 11 |
| 13 | **ESG report generation and export** | 10, 11 |
| 14 | **Scheduled recalculation and threshold alerts** | 10, 12 |

### Do not overbuild

No second design system. No separate backend service or framework. No admin
panel beyond step 7. No public API, no billing, no marketing-automation
platform, no analytics product. **AI is bounded by §5.3, not banned.** **No
feature that is not a step above** — if it seems necessary, say so and ask
rather than adding it.

**The sequence is a dependency graph, not a schedule.** It says what must exist
before what, and nothing about dates. Every rule in this file applies on every
step regardless of phase.

## 5.3 AI — where it is sanctioned, and the line it never crosses

**Phase one uses no AI at all.** Nothing in steps 1–7 benefits from it, and
adding it to a form, a validation or an email is out of scope.

Phase two has three genuine surfaces. They are **sanctioned, not scheduled** —
each is a part of its step, not a step of its own:

| step | surface | shape |
| --- | --- | --- |
| 9 | mapping arbitrary vendor CSV headers onto the schema | structured extraction |
| 10 | matching a messy activity description to the right emission factor — *"Diesel #2, 500 gal, Fleet ops"* | embeddings + rerank, **not** generation |
| 13 | ESG report narrative over already-computed figures | generation |

### The hard rule

**An LLM never produces a number that appears in a disclosure.** These figures
go into regulatory filings, and a plausible invented number is the single worst
failure this product can have.

- **All arithmetic is deterministic**, in `lib/domain/`'s pure functions (§6.2).
  A model may select a factor; it never multiplies by one.
- A model's output is **a suggestion with a confidence and a provenance**, not a
  committed value. Step 9's mappings and step 10's factor matches are reviewable,
  and a low-confidence match is **surfaced, never silently accepted**.
- Step 13's narrative is generated **from computed figures passed as context**,
  and every figure in the prose must trace to one. A report is a reviewed draft;
  nothing auto-publishes.
- Never send a tenant's raw activity data to a third-party model without an
  explicit recorded decision — it is a customer's commercial data (§8.3's
  reasoning, extended to phase two).

### Choosing a provider

**Resolved at build step 13**, through **Vercel AI Gateway** and the **`ai`**
package — which is where model routing, fallback and cost tracking belong.
Authentication is the project's Vercel-managed OIDC token, so **no AI
environment variable and no provider API key exists**; a direct provider SDK
(`@ai-sdk/anthropic`, `openai`, …) stays out of bounds.

This line previously predicted resolution at step 9 through the `vercel:ai-sdk`
skill. Neither happened, and it is corrected here rather than left predicting
something that did not occur (§12 rule 8): steps 9 and 10 shipped deterministic
matchers and needed no model, and that skill is **not installed** in this
environment — step 13 verified the APIs against live docs and `node_modules/`
instead. **The chosen model, its price, the verification sources and their date
live in `docs/backend.md`, step 13, not here** — model IDs and prices move fast
enough that anything written in this file would go stale (§12 rule 7).

**Nothing before step 13's sanctioned surfaces may call a model**, and §5.3's
hard rule binds every one that does.

## 5.4 Architecture remediation sequence

An architecture review taken on 17 Aug 2026 against `2337ab1` found six
candidates, all in the write path §10 describes and no module owns. Its
recommended order is **1 → 3 → 2 → 4, 5, 6**, and one prompt covers one
candidate.

| # | candidate | depends on |
| --- | --- | --- |
| 1 | **Map a `ZodError` once** — one adapter in `lib/validation/result.ts` for every site turning a validation failure into `fieldErrors` | — |
| 3 | **One tenant gate that also spends the limiter** — collapse `resolveTenant` and `resolveMembershipForWrite` in `lib/auth/tenant.ts` | — |
| 2 | **The submit lifecycle is a module** — one client-side module owning the six stages 24 leaves copy | 1 |
| 4 | **Cut `app/activity/actions.ts` along its three routes.** The review offered "move `lib/validation/emissions.ts` with it, or not at all"; prompt 125 took **not at all**, and that file is unmoved | 3 |
| 5 | **`lib/rate-limit/` — 20 wrappers become one policy table.** The review counted 18; prompt 126 recounted and found **twenty**, which is what landed | 3 |
| 6 | **One workspace boundary shell** for the eight `loading.tsx` / `error.tsx` copies | a design answer from the user |

**This is a plan, and nothing in it is ticked.** Which candidate is built is
resolved from the repository and `git log` (§12 rule 5), never from this table.
**The detail lives in `docs/architecture.md`** — each candidate's problem,
solution, stated cost, the reason behind every dependency above, and the record
of what each prompt actually changed. Read it before writing a candidate's
prompt file.

---

# 6. Backend architecture

## 6.1 Code layers

- **UI** — routes, Server Components, client components, forms. Renders data and
  calls Server Actions.
- **Server Actions** — the only mutation path for this app's own forms.
  Validation, authorisation, orchestration. Colocated with the routes that use
  them.
- **Route Handlers** — thin, and for *external* callers only: webhooks, upload
  callbacks, cron endpoints, health checks. No business logic.
- **Data** — the query layer. Nothing else in the codebase talks to the
  database, and no SQL is written outside it.
- **Email** — template rendering and send. Server-only.
- **Storage** — blob upload and signed access, for CVs and, later, imported
  data files.
- **Auth** — session, role and organisation resolution. One module; every
  authorisation decision reads from it.
- **Domain** (phase two) — emission-factor lookup, scope calculation,
  forecasting. Pure functions over typed inputs, no I/O.

## 6.2 Hard boundaries

- **Server Actions are the only mutation path for the app's own forms.** The UI
  does not mutate through Route Handlers. Route Handlers exist for callers that
  are not this application.
- **Only Server Components fetch initial page data.** No client-side
  data-fetching library on primary read paths.
- Database queries, email sends, blob writes and secret reads never run in
  browser code.
- The UI never constructs a query. It calls the data layer or an action.
- **Every mutation authorises server-side, inside the action.** Hiding a control
  in the UI is presentation and never enforcement.
- **Every mutation validates its input server-side with a schema**, even when
  the same schema ran in the browser. Client validation is a courtesy to the
  user; it is not a check.
- Phase two's domain layer stays pure and independently testable — no
  database handle, no `fetch`, no `Date.now()` passed implicitly.

## 6.3 Where the code goes

```
app/
  api/<external-caller>/route.ts   webhooks, callbacks, cron — thin
  <route>/actions.ts               Server Actions, colocated
  _actions/                        Server Actions with no one owning route
lib/
  db/         schema, client, queries        server-only
  validation/ shared Zod schemas             NOT server-only, deliberately
  rate-limit/ the Upstash limiter            server-only
  email/      templates and send             server-only
  storage/    blob upload and signed reads   server-only
  auth/       session, roles, org resolution server-only
  domain/     phase two, pure                no I/O
  reporting/  step 13's one model call        server-only
```

Every module under `lib/` that touches a secret carries `import "server-only"`
at the top — the import exists to make a mistaken client import a **build**
error rather than a leaked key at runtime. **`lib/validation/` is the one
exception and must stay one**: its schemas are imported by client leaves *and*
by actions, which is what makes "the rules exist once and run twice" true
(§10 rule 1). Nothing that reads a secret may be added to it, and it must not
import from `lib/db/` — `schema.ts` calls `pgEnum` at module scope, so an
import there puts `drizzle-orm/pg-core` in a marketing page's browser bundle.

**`app/_actions/` is for actions with no single owning route.** Colocation at
`app/<route>/actions.ts` is still the default and assumes one owner; a form
reached from shared chrome on several pages has none, and `app/_actions/`
follows the existing `app/_components/` and `app/_content/` convention.

---

# 7. Tech stack

## 7.1 Settled

- **Next.js 16.2** — App Router, Turbopack, React 19.2. Server Actions and Route
  Handlers; **no separate backend service.**
- **TypeScript** throughout.
- **Tailwind CSS 4** — config-less, `@theme` in `app/globals.css`.
- **Zod** — one schema per input, shared between the client form and the Server
  Action so the rules exist once.
- **Vercel Blob** (`@vercel/blob`) — CV and document upload. Native to the platform, not a
  Marketplace integration, and private by default.
- **Vercel BotID** — bot protection on public write paths.
- **Vercel** — hosting. Fluid Compute (the default), Node.js runtime.

**Not `runtime = "edge"`.** Fluid Compute runs in the same regions at the same
price with full Node.js, streaming and SSE included. Edge is a downgrade here.

## 7.2 The chosen providers

Chosen by the procedure in §7.4, on 7 Aug 2026. The project is linked as
`dgsloxx417s-projects/aetherfield`. **Neon is provisioned** (resource
`neon-purple-candle`, plan `free_v3`, region `iad1`, `auth=false`); the other
three are decisions on record only. **Provisioning state is not tracked in this
file beyond that line** — read it from `vercel integration list` and
`vercel env ls`, per §12 rule 5.

| need | provider | package | resolved by |
| --- | --- | --- | --- |
| relational data | **Neon Postgres** — *provisioned* | **`pg`** + `@vercel/functions`, with **Drizzle** as the ORM | `vercel:vercel-storage` for the provider; the driver is corrected below |
| transactional email | **Resend** | `resend` | `vercel:marketplace` `discover --category messaging` — the **only** result |
| authentication | **Better Auth** v1.6 | `better-auth` | see below — chosen over Clerk on the user's explicit "best and free" criterion |
| rate limiting | **Upstash Redis** | `@upstash/redis` + `@upstash/ratelimit` | `vercel:vercel-storage` — §8.2 requires a limiter on every public write path, and a Postgres counter is the wrong tool |

`@vercel/postgres` and `@vercel/kv` **no longer exist** as first-party products.
Do not import either; do not reintroduce them from training data.

### The driver is `pg`, not `@neondatabase/serverless`

**This corrects the `vercel:vercel-storage` skill**, which names
`@neondatabase/serverless`. That is the generic Neon answer; the Vercel-specific
one is different, and it comes from Neon's own docs
(<https://neon.com/docs/connect/choose-connection.md>, confirmed 7 Aug 2026):

> Vercel Fluid keeps functions warm long enough to reuse TCP connections, so you
> skip the connection setup cost on subsequent requests.

So this project uses **`pg` (node-postgres)** with `attachDatabasePool` from
`@vercel/functions`, which is what gives the pool connection reuse across
requests and a graceful shutdown. `@neondatabase/serverless` exists for runtimes
with **no** persistent pooling — Netlify Functions, Deno Deploy, Cloudflare
Workers without Hyperdrive. Its HTTP transport is faster for a single one-shot
query (~3 round trips against TCP's ~8) and that advantage does not apply here.

**Drizzle is the ORM**, per Neon's own recommendation, and it owns schema and
migrations exclusively — never a hand-run `ALTER TABLE` against the database
(§9). It lives in `lib/db/` like everything else that touches Postgres (§7.5).

### Why Better Auth and not Clerk

**This overrides the `vercel:auth` skill, which recommends Clerk.** That skill
answers "what integrates best with Vercel"; the user asked "what is best and
free", and the answers differ. Do not silently revert to Clerk on a later
session because a skill recommends it.

Better Auth is MIT, self-hosted, and has **no MAU meter at all** — sessions live
in the Neon database this project is already provisioning, so auth adds zero
infrastructure and zero cost. Two things decided it, and neither is price:

1. **Clerk's free tier cannot remove Clerk branding** (Hobby: 50,000 MRU, but
   MFA, passkeys, SSO and branding removal are Pro at $25/mo). This repo is
   thirty-six prompts of comp-matched design engineering with a settled footer
   and a fitted nav; a third party's badge on the sign-in page is a real
   mismatch, and the fix is a subscription.
2. **Phase two is multi-tenant.** Better Auth ships organizations, access
   control and multi-session in core, free — exactly the §5 build-list item.

The accepted cost is that **we own the sign-in, reset and verify screens**,
built from the existing primitives in `app/_components/`. Treat that as design
work under the front-matter rules, not as scaffolding.

**Better Auth is a library, not a Marketplace integration** — §7.4's provisioning
procedure does not apply to it. There is nothing to `add` and nothing to bill;
generate `BETTER_AUTH_SECRET` locally.

## 7.3 The traps these carry

Each of these contradicts what a model writes from memory, and each is one line
away from being hit.

**Next.js 16**

- **`middleware.ts` is `proxy.ts` in Next 16.** Every auth tutorial, Better
  Auth's own docs included, says `middleware.ts`. On 16.2 that file is renamed,
  and a `middleware.ts` here is a file the framework never loads — auth would
  look configured and enforce nothing.
- **`headers()` and `cookies()` are async.** Session reads are
  `auth.api.getSession({ headers: await headers() })`.

**Better Auth**

- **`getSessionCookie()` performs no validation — anyone can forge that cookie.**
  It exists for an *optimistic redirect* in `proxy.ts` and nothing more. The
  real check belongs on every protected page and in every action, which is
  §6.2's rule restated: hiding a route is presentation, never enforcement.
- **Mounted as a catch-all Route Handler** at `app/api/auth/[...all]/route.ts`
  via `toNextJsHandler(auth)`. This is the **one sanctioned exception** to
  §6.2's "Route Handlers are for external callers only" — the auth client is the
  caller, the handler is the library's own mount point, and no business logic of
  ours goes in it.
- **`BETTER_AUTH_SECRET` must be at least 32 characters.** `BETTER_AUTH_URL` is
  the app's base URL. Rotation uses `BETTER_AUTH_SECRETS`, plural.
- **`npx auth@latest migrate` is Kysely-only.** On any ORM adapter it is
  `generate`, which writes schema or SQL for us to apply — it does not touch the
  database. Do not expect `migrate` to work and do not skip applying the output.

**Neon**

- **Two connection strings, and using the wrong one is silent.** `DATABASE_URL`
  is **pooled** (PgBouncer, the `-pooler` host) and is what the app uses.
  `DATABASE_URL_UNPOOLED` is **direct** and is what **migrations, `pg_dump`,
  logical replication and `LISTEN`/`NOTIFY` require** — PgBouncer breaks session
  state, so a migration over the pooled URL can fail in confusing ways or leave
  a partial apply. Drizzle Kit gets the unpooled URL; the app never does.
- **Never wrap the database client in a `Proxy`.** The idiomatic-looking lazy
  `Proxy` breaks any library that inspects the adapter object — and Better Auth
  is exactly such a library. The request chain hangs with **no error**. Use a
  plain `getDb()` over a module-level `let`.
- **Construct the pool lazily.** Next evaluates top-level module code during
  `next build`, so a client built at import time against an unset
  `DATABASE_URL` fails the build before any route renders.
- **Nothing but Next.js auto-loads `.env.local`.** `drizzle-kit`, `tsx` and any
  seed or migration script need `dotenv -e .env.local --` in front of them.
- **Scale-to-zero is on** (free plan, 5-minute idle suspend, not disableable
  below Launch). The first query after an idle period pays a cold start of
  roughly a few hundred ms. That is expected behaviour, **not** a performance
  bug to chase, and any latency measurement must say whether it was warm.

**Blob**

- **A CV is `access: 'private'`**, read back through `get()` and a short-lived
  signed URL — never `access: 'public'` (§8.3).

**BotID**

- **The package is `botid`, not `@vercel/botid`.** The scoped name is the
  natural guess and it 404s on npm. Verified at step 2.
- **Both halves are required.** `initBotId()` in `instrumentation-client.ts`
  names the protected paths; `checkBotId()` verifies. A path missing from that
  list makes the server call **fail**, not pass, so a new trigger surface is a
  change in two files.
- **A Server Action's path is the page it was invoked from**, not an API route —
  the action POSTs to its own page. Protect `/`, not `/api/anything`.
- Next 15.3+ takes the client half through `instrumentation-client.ts`, which is
  what lets BotID ship **without** the root-layout component its own README also
  documents — §8.1 forbids that one.

## 7.4 The resolution procedure

This is how the table in 7.2 was produced, and how any future provider is
chosen. It is not optional, and it runs **before** any code is written.

1. Vercel CLI installed (`npm i -g vercel`) and the project linked.
2. Load the skill that owns the need. **Storage, authentication and AI have
   dedicated skills** — `vercel:vercel-storage`, `vercel:auth`, `vercel:ai-sdk`
   — and do **not** go through the Marketplace catalog. Everything else does.
3. For a Marketplace need: `vercel integration categories`, then
   `vercel integration discover --category <slug>`. Both are read-only. Take the
   top relevant result unless the user names another provider.
4. **Read `vercel integration add <name> --help` first.** It prints that
   provider's own `--plan` values and `-m KEY=VALUE` metadata keys, which cannot
   be guessed — and the defaults are not always what this project wants (Neon's
   `auth` defaults to `true`, which would have provisioned a second auth system
   alongside Better Auth). Then provision:
   `vercel integration add <name> --plan <id> -m <k>=<v> --no-claim`.
   **`--yes` is not a valid option** on `integration add` in CLI 58.7.1 and the
   command errors out; the marketplace skill documents it anyway. `env pull`
   runs automatically unless `--no-env-pull` is passed.
5. Provisioning creates billable resources: **ask the user before running it.**
   If the provider hands off to a browser or dashboard step — Neon required
   accepting marketplace terms — **stop, ask them to finish it, and retry the
   command the CLI returns in `next[]`.** Never work around the handoff.
6. Build against the real environment variables, and record the decision and its
   reasoning in `docs/backend.md`.

**A mock is not a resolution.** A `.env.example` with sample data behind it is
not an installed integration, and scaffolding a stand-in "to wire up later" is
throwaway work — the integration provides the backend and it is not
provider-agnostic. Provision first, then build.

## 7.5 Do not use

- a separate backend framework or service, or a separate API server
- `runtime = "edge"` (see 7.1)
- a hand-wired provider SDK installed with `npm install` instead of provisioned
  through the resolution procedure above
- **`@vercel/postgres` or `@vercel/kv`** — both are sunset and no longer exist
- **a `Proxy` wrapper around the database client** (§7.3)
- an ORM, query builder or raw SQL outside `lib/db/`
- a client-side data-fetching library on primary read paths
- local JSON or filesystem storage for application data
- a second design system, or a component library that is not the existing
  primitives in `app/_components/`
- GSAP for anything in the backend UI — `motion/` is the shared surface and its
  discipline (front matter) is unchanged. **One granted exception: the demo
  dialog's close-button hover**, authorised by the user on 7 Aug 2026 after
  being shown this rule and offered a CSS-only alternative. See
  `docs/backend.md`, step 2, for what it does and which numbers are judged
- `localStorage` or a cookie for anything an authorisation decision reads

---

# 8. Standing backend rules

These apply to every backend task, in every phase, permanently.

## 8.1 The static site is not collateral

The marketing site is finished, measured and byte-stable, and thirty-six prompts
of comp-fitting sit behind it. **ARTICLES and JOBS stay as typed constants in
`app/_content/`** — that decision is made, and the routes stay prerendered:

```
/  /journal  /about  /careers  /design-system   ○ Static
/article/[slug]  (6)   /job-listing/[slug]  (3) ● SSG
```

- **Adding `app/api/*` changes no route's HTML.** A backend prompt that alters a
  prerendered page's markup or render mode has exceeded its scope unless the
  prompt said so up front and the user approved it.
- A form is a **client leaf** taking `children`, exactly as `Reveal`,
  `NavDrop` and `FooterMotion` do — it takes the settled element over and adds
  no box. The bundle rule in the front matter applies unchanged: client leaves
  stay component-only.
- **Auth adds no root provider.** Better Auth reads the session server-side and
  needs nothing wrapped around `app/layout.tsx`, so the nine static routes have
  no reason to go dynamic — which is a large part of why it survives §8.1 at all
  (a provider around the root layout is the usual way auth quietly knocks a
  whole site off its prerender). Nothing in phase one may introduce one, and
  `proxy.ts`'s matcher must **skip the marketing routes** rather than match all
  and exclude — the difference is whether a static page pays for auth per
  request.
- The verification is the existing one — `npm run build`, confirm the route
  table above, then diff the prerendered HTML per `docs/automation.md`, with the
  standing warning about `/`, `/journal` and `/careers` still in force.

## 8.2 Every public write path is hostile input

1. Validate server-side with the shared Zod schema. Reject with a typed,
   handled result — never a thrown string, never a swallowed error.
2. Rate-limit it, and protect it with BotID. Every one of these endpoints is an
   unauthenticated `POST` on a public marketing site.
3. Uploads are constrained by **type and size, checked server-side**, and stored
   privately. A CV is personal data, not a public asset.
4. An honest failure is a visible state. **Never a silent success** — a form
   that appears to submit while the write failed is worse than an error.
5. Success and failure are both accessible: the result is announced, focus is
   managed, and the state is legible without colour alone.

## 8.3 Personal data

The three phase-one flows collect real personal data — names, work emails,
employers, CVs. It is the users' data and mishandling it is not recoverable.

1. Collect only what the flow needs. No speculative fields.
2. **Never log a request body, an email address, or a CV's contents** — not to
   the console, not to an error report, not to analytics.
3. Newsletter signup is **double opt-in**, and every marketing email carries a
   working one-click unsubscribe.
4. A CV is private-by-default blob storage read through short-lived signed URLs.
   Never a public URL, never a guessable path.
5. Retention is finite and stated. Do not build a permanent archive by default.

## 8.4 Secrets

- Only `NEXT_PUBLIC_*` reaches browser code. Everything else is server-only, and
  every module reading one imports `server-only`.
- The canonical list lives in `.env.example`, **created by build step 1** and
  committed. **Real values never are** — they come from `vercel env pull`.
- Never echo a secret's value. `vercel env ls` shows names only, and that is the
  only listing to quote.

Expected by the end of phase one, by the step that introduces each. All are
server-only — **phase one needs no `NEXT_PUBLIC_*` at all**, and adding one is a
decision to make a value public:

| variable | step | source |
| --- | --- | --- |
| `DATABASE_URL` | 1 | Neon, auto-provisioned — **pooled** |
| `DATABASE_URL_UNPOOLED` | 1 | Neon, auto-provisioned — the **direct** connection, and the one Drizzle Kit, `pg_dump`, logical replication and `LISTEN`/`NOTIFY` require (§7.3). It was always in `.env.example`; this table simply never carried the row |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | 2 | Upstash, auto-provisioned — **not** `UPSTASH_REDIS_REST_*`, which is what this table predicted and what `Redis.fromEnv()` looks for. The Marketplace integration sets the KV-prefixed names; corrected from `vercel env ls` at step 2 |
| `RESEND_API_KEY` | 3 | Resend — **added by hand, not auto-provisioned.** The name matched this prediction, but the source did not: `vercel integration add resend` requires `-m domain=<a domain you own>` and Aetherfield owns none, so §7.4 is unsatisfiable for this provider until one exists. Recorded as a deviation in `docs/backend.md`, step 3, with what to do when a domain lands |
| `LEAD_NOTIFICATION_EMAIL` | 3 | **ours, chosen here** — where a demo request's internal notification goes. Unset is supported: the notification is skipped, logging no address |
| `BLOB_READ_WRITE_TOKEN` | 5 | Vercel Blob |
| `APPLICATION_NOTIFICATION_EMAIL` | 5 | **ours, chosen here** — `LEAD_NOTIFICATION_EMAIL`'s sibling, where a job application's internal notification goes. Unset is supported the same way: the notification is skipped, logging no address |
| `BETTER_AUTH_SECRET` | 6 | **generated locally**, ≥ 32 chars (§7.3) |
| `BETTER_AUTH_URL` | 6 | the app's base URL |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 6, extended by prompt 41 | **ours, chosen here** — Better Auth's `socialProviders.google` takes `clientId` / `clientSecret` as config and names no variable, so these two names are the project's. Issued by Google Cloud, **added by hand**; no integration provisions them. Both are required — a provider configured with one is not configured |
| `CRON_SECRET` | build step 14 | **generated locally** (64 base64 chars), **added by hand with `vercel env add`** — Vercel does not set it, despite calling the endpoint. It gates all three cron routes, and an unset value fails closed. Not a phase-one step: phase one's build sequence introduces no cron |

Do not invent a variable name before the step that provisions it — read the name
the provider actually set with `vercel env ls`. **The canonical list is
`.env.example`, and this table is reconciled against it** — it fell five rows
behind before prompt 95 caught it, so a row missing here is a defect in this
file rather than evidence a variable does not exist. The last row is past phase
one and says so; every row remains server-only.

## 8.5 Recording the result

Backend work is recorded in **`docs/backend.md`** — created by the first backend
prompt and added to the index at the top of this file in that same change. The
schema's column types, every endpoint and its fields, the environment variables
as provisioned, and the measured behaviour all live there. **Never in this
file** (see the cap rule in the front matter): sections 5–12 hold decisions and
boundaries; `docs/backend.md` holds what was built against them.

---

# 9. Data model

Entities and the rules that govern them. **Column types, indexes and the
migrations themselves go in `docs/backend.md`**, not here.

## 9.1 Phase-one entities

- **`lead`** — a demo request. Name, work email, company, message, and the
  **surface it came from** (hero / nav / CTA band), because three CTAs feed one
  table and "which one converts" is unanswerable without it.
- **`subscriber`** — a newsletter address and its **state**, not a boolean:
  `pending` → `confirmed` → `unsubscribed`. Plus the confirmation token and the
  timestamps for each transition (§8.3 requires double opt-in).
- **`application`** — a job application. The **`job_slug`**, the applicant's
  details, and the CV's private blob reference. Never the CV's bytes.
- **Better Auth's own tables** — user, session, account, verification. These are
  **generated by `npx auth@latest generate`**; do not hand-author them, and do
  not add columns to them directly (§7.3).

## 9.2 Rules

1. **`job_slug` is a reference, not a foreign key.** Jobs live in
   `app/_content/jobs.ts` as typed constants (§8.1) and there is no `job` table.
   Validate the slug against `JOBS` at write time; an application must survive
   the role being closed and removed from that file.
2. **Status is an enum, defined once** and imported everywhere. Never a string
   union re-declared in UI code, and never a boolean where a third state is
   already foreseeable.
3. **Every table carries `created_at`.** Anything with a lifecycle carries the
   timestamp of each transition, not just a current-state column.
4. **Email addresses are stored lowercased and compared lowercased.** A
   subscriber list that treats two casings as two people is a compliance problem,
   not a display bug.
5. **Soft-delete anything a person can ask to have removed**, so an erasure
   request is one operation with an audit trail rather than a cascade.
6. **Phase two is tenant-scoped from its first line.** Every phase-two table
   carries an organisation reference and **every query filters on it** — there is
   no "add multi-tenancy later" that is not a rewrite. Phase-one tables are
   deliberately *not* tenant-scoped: leads and applications belong to Aetherfield,
   not to a customer.

   **Published reference data is the one exception, and it is narrow.** A table
   holding a third party's published dataset — `emission_factor_set` and
   `emission_factor` are the only ones today — carries a **nullable**
   organisation reference, where `null` means published and shared by every
   tenant and non-null means a set a customer supplied under its own licence.
   **Every query on such a table filters `organization_id IS NULL OR
   organization_id = $1`**, so no cross-tenant read is possible, which is what
   this rule exists to guarantee. The alternative is duplicating thousands of
   identical published rows per organisation. Approved by the user on
   10 Aug 2026 at build step 10; `docs/backend.md` records the reasoning. A
   table holding a customer's own data or choices is **not** covered and stays
   `not null` — `activity_factor_mapping` and `activity_emission` are both
   strictly tenant-scoped.
7. Phase-two entities, when they arrive: `organization`, `member`, `site`,
   `activity_record`, `emission_factor`, `target`, `report`. Extend them; never
   fork a parallel table for the same concept.

---

# 10. The write-path flow

**Every public form follows this path.** Step 2 of the build sequence
establishes it; every later flow copies it rather than inventing its own.

Its internal stages are lettered, not numbered, so they can never be confused
with a build step or a section (see §5.2's citation convention).

```
client leaf form  (§8.1 — takes children, adds no box)
   │  validates with the shared Zod schema, for the user's benefit only
   ▼
Server Action     (§6.2 — the only mutation path for our own forms)
   │  a. BotID check                    → reject
   │  b. rate limit, keyed by IP        → reject, with retry timing
   │  c. parse with the SAME Zod schema → typed field errors
   │  d. authorise, if the path is not public
   │  e. write via lib/db/              → the only DB caller
   │  f. queue/send email via lib/email/
   ▼
typed result  { ok: true } | { ok: false, error, fieldErrors? }
   │
   ▼
the leaf renders it: announced, focus managed, legible without colour (§8.2)
```

**The rules that make it a contract, not a diagram:**

1. **Validation runs twice and the schema exists once.** The client copy is a
   courtesy; the server copy is the check (§6.2).
2. **The action returns a typed result. It never throws to the client** and never
   returns a bare string. A thrown error is a bug, not a validation outcome.
3. **Order matters — a, b, then c.** BotID and the rate limit come *before*
   parsing, and parsing comes before any write, otherwise the cheap rejections
   pay for the expensive work.
4. **A failed email never fails the write.** The lead is captured first; the
   notification is best-effort and its failure is logged (without the address,
   §8.3) rather than surfaced as a failed submission.
5. **No redirect on success.** These forms sit inside settled, measured pages;
   they swap to a success state in place. A navigation would discard the page's
   scroll position and its motion state.
6. **The same path applies to phase two's mutations**, with stage **d** doing
   real work (§11) instead of being skipped.

---

# 11. Roles and authorisation

Introduced by build step 6; **nothing before it is authenticated**, and the
three public forms in steps 2, 4 and 5 stay deliberately unauthenticated.

## 11.1 The roles

| role | can |
| --- | --- |
| **staff** | read the submissions view — leads, subscribers, applications — and download a CV through a signed link |
| **admin** | everything staff can, plus managing staff accounts and removing leads, subscribers and applications from the active submissions workspace |

Phase two adds tenant-side roles inside an organisation (**owner**, **member**),
which are **orthogonal** to these two: an Aetherfield staff member is not
thereby a member of any customer's organisation, and must never be able to read a
tenant's data by virtue of being staff. Build step 8 makes that explicit; do not
pre-empt it with a role that spans both.

## 11.2 Rules

1. **Every protected page and every action authorises server-side.** A `proxy.ts`
   redirect is an optimistic convenience and is **not** enforcement — §7.3's
   `getSessionCookie()` trap is exactly this mistake.
2. **Authorisation is checked inside the action**, not in the component that
   renders the control. Hiding a button is presentation (§6.2).
3. **Public self-signup creates customer accounts with no staff role.** A signup
   can never grant itself `staff` or `admin`; those roles are admin-granted and
   remain the only roles that can read the submissions view (step 7).
4. **A CV is reachable only through a short-lived signed URL** minted per request
   for an authorised session (§8.3). Never a stored public URL.
5. **The role lives in the database, never in a cookie or `localStorage`**
   (§7.5), and is re-read per request rather than trusted from the session
   payload.

---

# 12. Do not fabricate

The rules elsewhere in this file each guard one surface. **This section is the
general one**, and it outranks the instinct to produce a complete-looking answer.
A gap named is cheap; a gap filled with a plausible invention costs a debugging
session and can ship.

**The standing rule: an unverified claim is stated as unverified, or not stated.**
"I don't know", "not checked", and "this needs verifying" are complete,
acceptable answers. A hedge is not a failure — a confident wrong answer is.

1. **Never cite a path you have not opened.** File paths, component names,
   exported symbols and function names are *checked*, not recalled — including
   ones this file names, which may have moved. `docs/` files are the same: quote
   what one says, never paraphrase it from memory.
2. **Never write an API you have not verified** in `node_modules/`, a loaded
   skill, or live docs fetched this session. This is the whole reason §7.3
   exists: all four chosen providers have surfaces that contradict what a model
   writes from memory, and Next 16 contradicts almost every tutorial.
3. **Never claim a check passed without running it and quoting its output**
   (§2). Never describe a build's route table you did not just produce.
4. **Never present a judgement as a measurement** — the front matter's rule,
   generalised. Say which, every time.
5. **Never assert what is built from this file or from `prompts/`.** A prompt
   file proves a prompt was written, never that it ran. Resolve from the
   repository and `git log` (§1). §5.2 is a *plan*; it says nothing about what
   exists.
6. **Never invent a name that a provider owns** — an environment variable, a
   table a library generates, a CLI flag, a package export. Read it back from
   `vercel env ls`, the generated schema, or `--help`.
7. **Never invent a number.** Prices, limits, free-tier thresholds, model IDs
   and version numbers move; fetch them or say they are unchecked. The Clerk
   free tier moved by 5× in six months and the figure in this file is dated for
   that reason.
8. **Contradicting this file is allowed; doing it silently is not.** If the
   repository disagrees with something written here, the repository is the fact
   and this file is stale — say so, and fix the line in the same change.
9. **A blocked or uncertain step is reported, not routed around.** Do not
   substitute a mock, a placeholder, or a narrower deliverable and present it as
   the requested one (§7.4 says the same thing about integrations).
