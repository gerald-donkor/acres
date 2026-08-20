/**
 * The one place the site's identity strings live.
 *
 * `client/app/layout.tsx`, `client/app/sitemap.ts` and `client/app/robots.ts` all read from here so
 * that the title, the description and the origin cannot drift apart across the
 * metadata surface.
 *
 * This module is imported ONLY by Server Components and server route handlers
 * (AGENTS.md §9.2 rule 3): it exports plain constants, so importing it from a
 * client module would drag it — and anything it ever grows to import — into that
 * route's bundle.
 *
 * No domain is invented here. `NEXT_PUBLIC_SITE_URL` is the deployment's origin
 * and the fallback is the dev server, because Acres has no domain yet
 * (AGENTS.md §10 rule 6). See `client/.env.example`.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000"

const SITE_NAME = "Acres"

const SITE_TITLE = "Acres — Browse everything."

const SITE_DESCRIPTION =
  "Acres turns regional data into decisions. Comprehensive analytics that reveal where growth is, and where it is going."

export { SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION }
