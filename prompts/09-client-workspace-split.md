# Step 7 — Split the Next.js client into an npm workspace

## Scope and why this is next

This is build-sequence step 7 from `AGENTS.md` §8.2: move the completed Acres
Next.js application into `client/` and make the repository root an npm-workspace
coordinator. Steps 1–6 are committed (`0723829` through `509a44e`), including
the design system, primitives, chrome, landing page, motion, and polish. The
server remains explicitly out of scope until step 8, so the UI is the complete
and stable boundary to relocate now.

This step unblocks the future NestJS application without introducing it early.
It must preserve the client route, all static asset URLs, visual geometry,
metadata, accessibility behavior, and client/server boundaries exactly.

## Decisions made for this step

- Use **npm workspaces**, not Turborepo. The repository needs one package now,
  and root script forwarding supplies an ergonomic interface without adding a
  task runner or cache layer before it has more than one executable package.
- Move the full Next.js application to `client/` with `git mv`, including its
  source, static assets, configuration, asset-generation script, and committed
  environment example. Do not copy-and-delete, because history must remain
  traceable through the relocation.
- Defer `packages/shared` to step 8. It would otherwise be an empty package with
  no DTO consumer, whereas step 8 is the point at which both NestJS and the
  client have a real shared contract to own.
- Keep the server deployment host undecided. Next deployment on Vercel is
  already settled by `AGENTS.md`; the NestJS host must be chosen at the start of
  step 8 before jobs and scheduling are designed, using the operational
  constraints available then. Do not invent a provider, configuration, or
  deployment manifest here.

## Reference material read

The move does not alter visual design, but it relocates every design reference
and every code path that records one. Read these records before making any edit:

- `AGENTS.md` §§0, 2, 5–10, especially §8.2 step 7 and §9.2.
- `docs/automation.md`, whose reference table and command recipes use
  `public/assets/ui/` paths.
- `docs/design-system.md`, `docs/components.md`, `docs/chrome.md`,
  `docs/landing.md`, `docs/motion.md`, and `docs/polish.md`; all contain pinned
  client paths, and `docs/polish.md` §11 expressly assigns these rewrites to
  step 7.
- `public/assets/ui/ref/acres-design-system.pdf` and the three existing landing
  comps at `public/assets/ui/landing-pages/{Desktop,Tablet,Mobile}.png` before
  the move. Their destination becomes the same subtree below `client/public/`.
- Installed Next 16.3.1 documentation:
  `node_modules/next/dist/docs/01-app/01-getting-started/01-installation.md`
  and `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md`.
  These verify that an App Router app owns `app/`, `public/`, `package.json`,
  and its configuration at its own project root, and that files in that app's
  `public/` directory continue to be served from `/`.

## SKILLS USED

- `vercel-react-best-practices` — preserve the existing Server Component-first
  architecture, client leaf boundaries, direct imports, and zero new bundle
  cost while relocating the Next.js package.
- `requesting-code-review` — dispatch a read-only reviewer after all checks
  pass, with the pre-split and post-split SHAs and this prompt as requirements.
- `receiving-code-review` — validate every reviewer finding against the moved
  workspace before fixing it; do not implement feedback by reflex.
- `caveman-commit` — generate the mandatory conventional commit message for
  the final committed step.

No UI primitive, Tailwind token, shadcn component, GSAP behavior, or route/state
transition changes in this step, so `frontend-design`, the Tailwind skills,
`shadcn`, GSAP skills, `web-design-guidelines`, and view-transition guidance do
not own an implementation surface here. The visual/accessibility result is
verified through existing behavior rather than redesigned.

## Required workspace structure

After the move, the root remains the repository coordinator and contains
`AGENTS.md`, `.agents/`, `.claude/`, `.codex/`, `docs/`, `prompts/`,
`skills-lock.json`, `.gitignore`, `README.md`, root `package.json`, and root
`package-lock.json`. It must not retain a duplicate Next source tree or a
second `public/` directory.

The Next.js package root is `client/` and must contain:

```text
client/
  app/
  components/
  hooks/
  lib/
  public/
  scripts/
  .env.example
  components.json
  eslint.config.mjs
  next.config.ts
  package.json
  postcss.config.mjs
  tsconfig.json
```

`client/package.json` becomes the package that owns the existing application
dependencies, dev dependencies, and direct Next commands:

```json
{
  "name": "@acres/client",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  }
}
```

Preserve all currently installed dependency versions in that package exactly;
do not upgrade, remove, or add dependencies as part of a move. Root
`package.json` becomes private workspace metadata with `workspaces: ["client"]`
and forwards its existing developer commands to that workspace:

```json
{
  "name": "acres",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["client"],
  "scripts": {
    "dev": "npm run dev --workspace=@acres/client",
    "build": "npm run build --workspace=@acres/client",
    "start": "npm run start --workspace=@acres/client",
    "lint": "npm run lint --workspace=@acres/client"
  }
}
```

Use the actual npm syntax supported by the installed npm version if it differs
from the example, and record the verified form in the build record. Root command
names must remain `npm run dev`, `npm run build`, `npm run start`, and
`npm run lint`, so existing developer and verification instructions still work.

Run `npm install` from the repository root after the manifests move. It must
regenerate the single root `package-lock.json` for the workspace layout; do not
hand-edit lockfile package entries. Keep the physical hoisted `node_modules/`
directory at the root. Do not create or commit `client/node_modules/`.

## Exact relocation and configuration work

1. Start clean: capture `BASE_SHA=$(git rev-parse HEAD)`, run `git status
   --short`, and stop if unrelated user changes appear after planning. This
   prompt assumes the currently clean tree at `509a44e`.
2. Use `git mv` for the application-owned paths:
   - `app` → `client/app`
   - `components` → `client/components`
   - `hooks` → `client/hooks`
   - `lib` → `client/lib`
   - `public` → `client/public`
   - `scripts` → `client/scripts`
   - `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`,
     `eslint.config.mjs`, `components.json`, and `.env.example` → `client/`
   Create `client/package.json` from the current app package manifest, then
   replace root `package.json` with the workspace coordinator described above.
3. Do not move `AGENTS.md`, `docs/`, `prompts/`, skills directories,
   `skills-lock.json`, `.gitignore`, `.git`, `README.md`, root `package-lock.json`,
   or ignored build output. Do not create `server/`, `packages/`, a root
   `turbo.json`, a `nest-cli.json`, Docker files, CI files, or deployment files.
4. Keep the client package's TypeScript alias contract unchanged: within
   `client/tsconfig.json`, `@/*` still resolves to `./*`; all existing
   `@/components`, `@/lib`, and `@/hooks` imports remain valid from the client
   package root. Do not rewrite imports to relative paths merely because files
   moved together.
5. Keep `client/components.json` aligned with its new root: its Tailwind CSS
   path remains `app/globals.css`, and its aliases stay `@/components`,
   `@/components/ui`, `@/lib`, and `@/hooks`. Verify the installed base-nova
   files need no source change after the config moves.
6. Preserve Next's static URL contract. Moving `public/` under the Next project
   root means all in-code paths such as `/assets/ui/landing/*.webp`, `/icon.svg`,
   `/robots.txt`, and `/sitemap.xml` remain URL-identical. Never prefix an
   `Image`, `<source>`, icon, or metadata URL with `/client`.
7. Update `.gitignore` so generated artifacts are ignored at the new package
   location (`client/.next/`, `client/next-env.d.ts`, and client TypeScript
   build info), workspace-local environment files remain ignored while
   `client/.env.example` remains tracked, and root `node_modules/` remains
   ignored. Keep the existing `/ref` contract. Prefer scoped patterns over a
   broad ignore that could mask future committed packages.
8. Update the root `README.md` away from create-next-app boilerplate. State
   only verified workspace commands and their purpose: root `npm install`,
   `npm run dev`, `npm run lint`, `npm run build`, and `npm run start`; identify
   `client/` as the Next.js application and preserve no stale references to
   root `app/`, root `public/`, Geist, or one-click deployment marketing.
9. Update root `AGENTS.md` in the same change wherever it pins a moved path or
   describes the repository's application root. This includes the §0 reference
   table and recipes (`client/public/assets/ui/...`), the Next-doc resolution
   explanation where relevant, the current-state snapshot, and step-7 wording.
   Keep the build sequence as a plan rather than marking it complete. Preserve
   all product invariants and the ALWAYS ledger unchanged.
10. Update every path pin in all written build records, not only the first
    occurrence found by search. In particular, rewrite code paths in
    `docs/automation.md`, `docs/design-system.md`, `docs/components.md`,
    `docs/chrome.md`, `docs/landing.md`, `docs/motion.md`, and `docs/polish.md`:
    - source paths such as `app/...`, `components/...`, `hooks/...`, `lib/...`,
      and `scripts/...` become `client/...`;
    - reference and asset paths such as `public/assets/ui/...` become
      `client/public/assets/ui/...`;
    - recorded commands and file tables must use paths valid from the repository
      root after the split;
    - browser URL paths remain slash-rooted and must not change;
    - prose about a code location must not be mechanically changed when it is
      referring to a URL rather than a filesystem path.
11. Add a concise step-7 section to `docs/automation.md` or a new
    `docs/workspace.md` build record. Prefer `docs/automation.md` unless a
    standalone workspace record is necessary to keep its scope coherent. Record
    the final root/client tree, the npm workspace command contract, the exact
    `git mv` source/destination map, the decisions deferred to step 8, every
    documentation path class rewritten, the command output, and the parity
    evidence. If a new document is created, add its index row to `AGENTS.md` in
    the same change.
12. Run a post-move search from the repository root. Resolve every stale
    filesystem path in tracked source, configuration, `AGENTS.md`, docs, and
    README. Do not rewrite prior prompt files: they are historical approved
    briefs, not current path authority. Keep historical Git SHAs and URLs
    untouched. The final sweep must distinguish path text from literal output
    that is intentionally historical, and must be explained in the build
    record rather than hidden with a broad replacement.

## Runtime and visual parity requirements

The client is a relocation, not a redesign:

- `/` and `/_not-found` must render exactly as before under normal and reduced
  motion. The root layout still owns the skip link, header, `<main>`, and footer.
- The current static image and metadata file conventions must still generate
  `/favicon.ico`, `/icon.svg`, `/apple-icon.png`, `/opengraph-image.png`,
  `/twitter-image.png`, `/robots.txt`, and `/sitemap.xml` at the same URL paths.
- `client/.env.example` and `client/lib/site.ts` must keep the public-origin
  behavior: unset `NEXT_PUBLIC_SITE_URL` falls back to `http://localhost:3000`.
- `LandingMotion` remains the only landing-page client leaf. No component is
  converted to a client component as a side effect of moving it.
- The approved hero entrance-flash trade-off, the focus behavior, reduced-motion
  behavior, and all measured layout roles remain unchanged.

### Breakpoint behaviour

There is no responsive implementation change. Confirm the moved client keeps
the existing measured output at all reference widths:

| viewport | required preserved behavior |
| --- | --- |
| 375 px | 343 px container with 16 px gutters; 78 px mobile nav card; 44 px menu target; same vertical landing layout and horizontal table/steps regions |
| 800 px | 720 px container with 40 px gutters; horizontal desktop/tablet chrome; same 2-column and art-directed image behavior |
| 1280 px | 1200 px container with 40 px gutters; 4-column benefits grid; identical desktop images, metadata, and full landing-page composition |

### Reference deltas

No intended rendered delta exists at 375, 800, or 1280. The only allowed
differences are build artifact paths and source-map/internal module filenames
under `client/`; the public URLs, page height, geometry, image selection, and
visible pixels remain unchanged. If a comparison shows a visual difference,
investigate and fix it rather than documenting it as an accepted relocation
delta.

## Non-goals

- No NestJS scaffold, route handler, database, auth, forms, scheduled job,
  package DTO, server package, server deployment selection, or deployment
  configuration.
- No Turborepo, pnpm, Yarn, Bun, Nx, Docker, CI, package publishing, or
  workspace package beyond `client/`.
- No visual design, copy, token, typography, animation, accessibility, metadata
  content, route, or dependency-version change.
- No generated icon, asset extraction, or image-quality change; existing files
  move byte-for-byte with Git history.
- No manual `package-lock.json` editing and no destructive rewrite of user work.

## Verification

Run all checks from the repository root after `npm install`, preserving their
real output in the build record:

1. `git status --short` before and after relocation; `git diff --summary` must
   report renames for moved tracked paths rather than delete/add pairs where Git
   can detect identity.
2. `npm run lint`.
3. `npx tsc --noEmit --project client/tsconfig.json` (there is no typecheck
   script; use the explicit client project path).
4. `npm run build`; verify its route table includes the same `/`, `/_not-found`,
   icon, social-image, `robots.txt`, and `sitemap.xml` outputs recorded in
   `docs/polish.md`.
5. Start the production app through the root forwarding command on an unused
   port, then inspect `/`, `/robots.txt`, `/sitemap.xml`, and a guaranteed
   missing route. Confirm status/content parity and that client public assets
   load from their existing slash-root URLs.
6. Use the documented CDP harness from `docs/automation.md` at 375, 800, and
   1280 under `prefers-reduced-motion: reduce`. Capture screenshots and verify
   container widths/gutters, key chrome measurements, page heights, focus skip
   link behavior, and that no reveal target remains hidden. Compare the captures
   against a pre-move baseline from `509a44e` using the existing ImageMagick
   recipe. Any nonzero visual diff must be investigated; expected relocation
   result is zero rendered-pixel difference.
7. Search tracked repository content for stale moved filesystem path prefixes,
   then manually classify any intentional historical references. Confirm source
   imports retain `@/` aliases and asset URL strings do not contain `/client/`.
8. Inspect `git diff --check`, `git diff --stat`, and the complete diff. Ensure
   no `server/` or `packages/shared/` path is added and no dependency version
   moves accidentally.
9. Run the mandatory two-stage review loop only after all self-checks pass:
   dispatch a read-only reviewer following `requesting-code-review` with
   `BASE_SHA` and the post-change `HEAD_SHA`; use `receiving-code-review` to
   verify every finding before any correction; re-run affected checks and obtain
   re-review if a correction changes workspace architecture or configuration.
10. Commit to `main` after review with a message generated by
    `caveman-commit`; do not push.

## Documentation handoff

Record exact check output and the verified migration result in the owning
workspace/automation record. Update every affected path reference in the seven
existing build records and `AGENTS.md` during the same change so future sessions
resolve the real `client/` layout from files on disk rather than from stale
documentation. The final response must state the root command to run the client
and the local URL supplied by the started dev server.
