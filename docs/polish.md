# Acres — polish, accessibility and metadata

The build record for step 6 (`prompts/07-polish-accessibility.md`). It owns the
non-visual surface of the site: the accessibility fixes made after the landing
page and the motion layer were both built, the CSS half of the reduced-motion
promise, the typographic glyph corrections, and the whole metadata surface —
`metadata`, `viewport`, the icons, the social card, `sitemap.ts`, `robots.ts`
and `not-found.tsx`.

**Read this before touching `client/app/layout.tsx`, `client/app/globals.css`'s `@layer base`
block, or anything under `client/app/` that Next treats as a metadata file
convention.** `docs/design-system.md` owns the tokens, `docs/landing.md` owns
the page's sections and `docs/motion.md` owns the animation; this file owns the
layer wrapped around all three. It also closes two findings that
`docs/motion.md` §9 left open, one of them by accepting it.

**This step shipped no new section, no new component variant, no new token and
no layout change.** §11's pixel diff is the proof.

---

## 1. Skills loaded, and the one that is still blocked

| skill | outcome |
| --- | --- |
| `web-design-guidelines` | loaded; rules fetched fresh this session and the audit re-run against that copy (§2) |
| `frontend-design` | loaded — every fix kept subordinate to the measured design |
| `vercel-react-best-practices` | loaded — `client/lib/site.ts`, `client/app/not-found.tsx`, `client/app/sitemap.ts` and `client/app/robots.ts` are all server-only |
| `gsap-react` | loaded, for the reduced-motion verification in §9 |
| `tailwind-4-docs` | loaded, **snapshot still uninitialised** — see below |
| `tailwind-design-system` | **not loaded, and not needed**: this step added no token |
| `shadcn` | **not loaded, and not needed**: nothing in `client/components/ui/` was touched |

The guidelines were fetched from
`https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`,
the same source `docs/landing.md` records.

**The Tailwind docs sync is still blocked**, as `docs/motion.md` §9.3 recorded
and as `docs/landing.md` recorded before it.
`python3 .agents/skills/tailwind-4-docs/scripts/sync_tailwind_docs.py --accept-docs-license` was retried once
this session: it **exited 0 with no output**, and left
`references/docs-source.txt` reading `Status: Not initialized` with no
`references/docs/` directory. The skill's documented fallbacks were used
instead — `references/gotchas.md` and `references/engineering-playbook.md` —
and two lines from `gotchas.md` governed choices here:

> `@theme` is for design tokens that should create utilities or variants; use
> `:root` only for plain CSS variables

> Arbitrary CSS variable syntax is `bg-(--brand-color)`

**No claim in this file is backed by the official snapshot.**

---

## 2. The fresh `web-design-guidelines` run

The run reproduced every finding in `prompts/07-polish-accessibility.md`'s
Group A–D table and **turned up nothing new that was in scope**. In the skill's
terse `file:line` form, as of `f29f674`:

```
app/layout.tsx:43           no skip link for main content
app/layout.tsx:45           <main> has no id and is not focusable
app/page.tsx:388-391        scroller is a div with aria-label and no role
app/page.tsx:497-499        scroller is a div with aria-label and no role
app/page.tsx:171            sr-only ordinal text beside an alt="" image
app/page.tsx                scroll-mt-* on inner wrappers, not on the id targets
components/acres/mobile-navigation.tsx  no overscroll-behavior on the panel
app/globals.css             no color-scheme
app/globals.css             no touch-action / -webkit-tap-highlight-color
app/globals.css             transitions ignore prefers-reduced-motion
app/globals.css             fragment navigation jumps instantly
app/                        no not-found.tsx
app/page.tsx:134            deprecated `priority`; preload warning at 800 and 375
app/page.tsx:192,248,310,348  &apos; renders a straight quote
```

After the step 7 workspace split, the current source paths for those files live
under `client/`. The literal output above remains the `f29f674` record.

Confirmed clean by sweep (exit statuses in §8): no `transition-all`, no
`markers: true`, no `ScrollSmoother`, no straight double quotes in shipped
copy, no literal `...`, no `Area`.

Three preload `<link rel="preload" as="font" type="font/woff2">` entries for
Crimson Text, DM Sans and Roboto Mono were **already in the `<head>`** —
`next/font/google` emits them — so the critical-font-preload rule was already
satisfied and nothing was added for it.

### 2.1 Considered and NOT changed — do not re-open these

| item | why not |
| --- | --- |
| `tabular-nums` on number columns | The comparison table has **no numeric column**, and the `01`/`02`/`03` step markers are single-glyph-width labels. Declined, not overlooked (`prompts/07-polish-accessibility.md` C3) |
| `env(safe-area-inset-*)` | Nothing on the page is full-bleed — every section is inset to the container (`AGENTS.md` §1.3) — and the mobile nav card is anchored to the **top** edge, not to a notch-adjacent bottom bar. Not applicable |
| Focus trap, `aria-modal`, body-scroll lock on the mobile menu | Out of scope by decision. The open menu is a disclosure card anchored to the top edge (`docs/chrome.md`), not an overlay covering the page |
| Title Case and active-voice rewrites of the page copy | The comps' measured copy wins (`AGENTS.md` §1.7, §8). **Only glyphs changed** (§5) |

---

## 3. Group A — accessibility

| # | file | change |
| --- | --- | --- |
| A1 | `client/app/layout.tsx` | skip link, first child of `<body>`, `href="#main-content"` |
| A2 | `client/app/layout.tsx` | `<main id="main-content" tabIndex={-1}>` with a focus-visible ring |
| A3 | `client/app/page.tsx` | `role="region"` on both horizontal scrollers |
| A4 | `client/app/page.tsx` | deleted the `sr-only` ordinal beside the trusted marks |
| A5 | `client/app/page.tsx` | `scroll-mt-section` moved onto the four id-bearing sections |
| A6 | `client/components/acres/mobile-navigation.tsx` | `overscroll-contain` on the panel |
| A7 | `client/app/globals.css` | `color-scheme: light` on `html` |
| A8 | `client/app/globals.css` | `touch-action` and `-webkit-tap-highlight-color`, scoped |
| A9 | `client/app/not-found.tsx` | new — a 404 inside Acres' chrome |

**A1 — the skip link is parked, not hidden.** It is moved with `-top-20` →
`focus-visible:top-4`, **not** with `sr-only`/`not-sr-only`. Both of those
utilities set `position`, so which one wins is a CSS-order question inside the
utilities layer rather than a class-order one; a `top` swap has no such
ambiguity. `z-[100]` is **the one arbitrary value added anywhere in this
step**: Tailwind 4 has no `--z-index-*` theme namespace to tokenise it into, and
the link has to clear the mobile navigation card's `z-50`. It changes no
measured pixel at rest (§11).

**A2 — `tabIndex={-1}` is what makes the skip link land.** Without it focus
stays on `<body>` and the next `Tab` returns to the top of the page. The
`outline-none` is paired with the same focus-visible ring every other
interactive element uses, never left bare (`AGENTS.md` §9.4 rule 1).

**A3 — `role="region"` on a labelled scroller.** `aria-label` on a generic
`<div>` is not reliably exposed. `tabIndex={0}`, the labels and
`overscroll-x-contain` are all kept.

**A4 — deleting `<span className="sr-only">Trusted partner mark {index + 1}</span>`.**
It announced ordinal noise to exactly the users the `alt=""` was protecting. The
marks stay decorative, and `<h2 id="trusted-heading">Trusted by:</h2>` already
names the region. The now-unused `index` binding went with it.

**A5 — the anchor target is the element carrying the `id`.** `scroll-mt-section`
was authored on inner wrappers, so fragment navigation landed without the
margin. It moved onto the four `<Section>` elements (`#benefits`,
`#specifications`, `#how-to`, `#contact`). On `#specifications` it came off
`<Rule weight="strong" className="mb-section scroll-mt-section" />`. **`pt-section`
was not touched** — padding is the rhythm (`docs/design-system.md` §3.3) — and
§11 proves nothing moved.

**A6 — Base UI was read, not assumed.**
`node_modules/@base-ui/react/collapsible/trigger/CollapsibleTrigger.js` lines
53–56 set `'aria-controls': open ? panelId : undefined` and
`'aria-expanded': open`, so **nothing was added** for either. Only
`overscroll-contain` was, to stop a gesture reaching the panel's edge from
chaining to the page behind it.

**A7 — `color-scheme: light` is the opposite of adding a dark theme.** Acres has
no designed one (`docs/design-system.md` §7.7); declaring the scheme stops a UA
in dark mode painting scrollbars and form controls dark against a white canvas.

**A8 — scoped to `a, button, summary, [role="button"]`, not blanketed over `*`.**
`touch-action: manipulation` drops the 300 ms double-tap delay without disabling
pinch zoom; the tap highlight is set to transparent deliberately, because a
focus-visible ring and a colour hover already answer for the feedback.

**A9 — `client/app/not-found.tsx`.** A Server Component: one `<h1>` ("Page not
found."), one line of copy in the register of `AGENTS.md` §8, one primary
`Button` back to `/`. Built from `Section` and existing type roles — no new
token, no new variant, no new layout primitive. **No `metadata` export**: Next
16 does not document one for `not-found.tsx`, so the root layout's title default
applies.

---

## 4. Group B — the two findings step 5 handed over

### 4.1 B1 — the hero entrance flash is ACCEPTED. Closed.

`docs/motion.md` §9.1 measured a **~110 ms** window at 1280 in which the hero
paints at rest from the server HTML and then disappears to begin its entrance.
**By the user's decision of 2026-08-20 this is accepted, not fixed. No code
changed.**

The trade-off, stated so it does not have to be re-derived: removing the flash
means putting the entrance's start state in CSS, and that means **shipping
server markup that is invisible without JavaScript**. That breaks the no-JS case
and the reduced-motion case outright — the page would render blank for anyone
whose JavaScript never arrives, which is precisely what `AGENTS.md` §9.3 rule 4
forbids. A ~110 ms flash on a cold load is the cheaper defect.

**This is a closed finding, not an open one.** A later session must not "improve"
it while passing through `client/app/page.tsx` or `client/components/acres/landing-motion.tsx`.
Reopening it requires the user, not a judgement call in the file.

### 4.2 B2 — `priority` → `fetchPriority="high"`

`client/app/page.tsx:134`. Two lines from the installed Next 16.3.1 docs
(`01-app/03-api-reference/02-components/image.md`) are the whole justification:

> Starting with Next.js 16, the `priority` property has been deprecated in favor
> of the `preload` property…

and, on art-directed images:

> You cannot use `preload` or `loading="eager"` because that would cause both
> images to load. Instead, you can use `fetchPriority="high"`.

The hero is exactly that case — a `<picture>` with a `<source media="(max-width:
767px)">` wrapping the `next/image`. The change clears a deprecated prop and
removes the console warning §8 tabulates.

### 4.3 B3 and B4 — the CSS half of the reduced-motion promise

GSAP honours `prefers-reduced-motion` through `gsap.matchMedia()`
(`docs/motion.md` §6.1), but the CSS `transition-colors` on the pills, the nav
links, the footer links and the mobile card did not. `client/app/globals.css` gained a
`@media (prefers-reduced-motion: reduce)` block in `@layer base` collapsing
`animation-duration`, `animation-iteration-count`, `transition-duration` and
`scroll-behavior` on `*, *::before, *::after`. **Durations go to `0.01ms`, not
`0`**, so `transitionend` still fires and nothing waits forever.

B4 added `scroll-behavior: smooth` on `html`, which the same block cancels.
**Smooth scrolling is a JUDGEMENT, not a measurement** — the references are
static images and say nothing about it. It is justified by every CTA on the page
being a fragment link. §9 measures that the two rules do not fight.

---

## 5. Group C — typography

**C1.** Four `&apos;` in `client/app/page.tsx` (lines 191, 247, 310, 348 pre-change)
replaced with the literal `’`. **Wording is unchanged; this is a glyph fix, not
an edit to the comps' copy.** The blockquote's double quotes were already curly,
so the page was inconsistent with itself before this.

**C2.** The sweep for `...`, `&quot;`, `&#39;` and straight double quotes in
shipped copy found nothing else (§8).

**C3.** `tabular-nums` — declined. See §2.1.

These four glyphs are the **only** pixels on the whole page that this step
changed, and §11 proves it band by band.

---

## 6. Group D — the metadata surface

Every file below was verified against the installed Next 16.3.1 docs in
`node_modules/next/dist/docs/` **before** it was written, and every one is a
Server Component or a server route.

| # | file | what it holds |
| --- | --- | --- |
| D1 | `client/lib/site.ts` (new) | `SITE_URL`, `SITE_NAME`, `SITE_TITLE`, `SITE_DESCRIPTION` |
| D2 | `client/app/layout.tsx` | the `metadata` object and a separate `viewport` export |
| D3 | `client/app/icon.svg` (new) | the Acres mark, 88 × 88 |
| D4 | `client/app/apple-icon.png` (new) | 180 × 180, sRGB, white ground |
| D5 | `client/app/favicon.ico` | the create-next-app default replaced; 16 / 32 / 48 |
| D6 | `client/app/opengraph-image.png` + `.alt.txt` (new) | 1200 × 630, 289 KB |
| D7 | `client/app/twitter-image.png` + `.alt.txt` (new) | the same image, as a separate file |
| D8 | `client/app/sitemap.ts` (new) | one entry, built from `SITE_URL` |
| D9 | `client/app/robots.ts` (new) | `allow: "/"` plus the sitemap URL |
| D10 | `client/.env.example` (new) | `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and a one-line comment |

**D1 — no domain is invented.** `SITE_URL` is
`process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000"`, so unset,
empty and whitespace-only values all fall back to the local dev origin. Acres has
no domain yet and inventing one is `AGENTS.md` §10 rule 6. The module exports
plain constants and is server-only by convention (§9.2 rule 3): importing it
from a client module would drag it into that route's bundle.

**D2 — what was deliberately omitted.** `authors` and `creator` were **omitted
rather than invented** — nothing in the repository names a person or an
organisation to put there. `formatDetection` was omitted too: the copy contains
no phone number for iOS to auto-link, so the field would be noise. `themeColor`
is in the **`viewport`** export, not in `metadata`, because
`03-api-reference/04-functions/generate-viewport.md` is explicit that it moved.

**D3 — the mark is copied, not redrawn.** The path is taken byte for byte from
`client/components/acres/logo-mark.tsx`, which extracted it from the design-system PDF
vector. Two deliberate differences: the fill is an explicit `#000000`, because
`currentColor` has no meaning in a standalone favicon; and the 31.75 × 70 mark is
centred in an 88 × 88 square by `transform="translate(28.125 9)"`, because a
`0 0 31.75 70` viewBox renders as a sliver in a browser tab.

**D4 — the white ground is not a default.** iOS ignores transparency on an
apple-touch-icon and would paint it black.

**D7 — a separate `twitter-image` file, and why.** The installed doc documents
`opengraph-image` and `twitter-image` as **two separate file conventions and
states no fallback from one to the other**, so a separate file was written
rather than relying on the OG image being reused. The built `<head>` confirms
the answer: `twitter:image` points at `/twitter-image.png`, not at
`/opengraph-image.png` (§7).

**D10 — `.gitignore` needed a line.** `.env*` was ignoring `client/.env.example`, so
the file would never have been committed. `!client/.env.example` was added directly
under that rule, with a comment saying the file carries no secret.

### 6.1 The exact commands that produced the artwork

```bash
# D4 — apple-icon
magick -background white -density 1200 client/app/icon.svg -resize 180x180 \
  -gravity center -background white -extent 180x180 \
  -alpha remove -alpha off PNG32:client/app/apple-icon.png

# D5 — favicon.ico, 16 / 32 / 48 from the same source
for n in 48 32 16; do
  magick -background none -density 1200 client/app/icon.svg -resize ${n}x${n} \
    -gravity center -background none -extent ${n}x${n} -depth 8 fav-$n.png
done
magick fav-16.png fav-32.png fav-48.png client/app/favicon.ico

# D6/D7 — the OG card, cropped from the real comp, never re-typeset
magick client/public/assets/ui/landing-pages/Desktop.png -crop 1280x672+0+0 +repage \
  -resize 1200x630 -background white -alpha remove -alpha off -strip \
  -quality 92 client/app/opengraph-image.png
cp client/app/opengraph-image.png client/app/twitter-image.png
```

**The crop arithmetic.** `1280 × 672` is the crop because
**1280 / 672 = 1.90476** and **1200 / 630 = 1.90476** — the same aspect ratio, so
the comp scales into the card with no letterboxing and, crucially, **no
re-typesetting in a substituted face** (`AGENTS.md` §10 rule 7). The type in the
card is the comp's own Crimson Text and DM Sans rendering. The crop carries the
wordmark, the four nav links, the `Learn More` pill, the 160 px `Browse
everything.` and the top of the sage band and the device.

Alt text, on both `.alt.txt` files:

```
The Acres landing page: the wordmark, the headline “Browse everything.”, and a
regional analytics report open on a laptop.
```

---

## 7. The `<head>`, dumped from the production build at 1280

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
<title>Acres — Browse everything.</title>
<meta name="description" content="Acres turns regional data into decisions. Comprehensive analytics that reveal where growth is, and where it is going.">
<meta name="application-name" content="Acres">
<meta name="keywords" content="regional data,regional analytics,data intelligence,business intelligence,growth reporting">
<meta name="robots" content="index, follow">
<meta name="googlebot" content="index, follow, max-image-preview:large">
<link rel="canonical" href="http://localhost:3000">
<meta property="og:title" content="Acres — Browse everything.">
<meta property="og:description" content="…">
<meta property="og:url" content="http://localhost:3000">
<meta property="og:site_name" content="Acres">
<meta property="og:locale" content="en">
<meta property="og:image" content="http://localhost:3000/opengraph-image.png?…">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The Acres landing page: the wordmark, the headline “Browse everything.”, and a regional analytics report open on a laptop.">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Acres — Browse everything.">
<meta name="twitter:description" content="…">
<meta name="twitter:image" content="http://localhost:3000/twitter-image.png?…">
<meta name="twitter:image:alt" content="…">
<meta name="twitter:image:type" content="image/png">
<meta name="twitter:image:width" content="1200">
<meta name="twitter:image:height" content="630">
<link rel="icon" href="/favicon.ico?…" sizes="48x48" type="image/x-icon">
<link rel="icon" href="/icon.svg?…" sizes="any" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-icon.png?…" sizes="180x180" type="image/png">
```

The `localhost:3000` origin is `NEXT_PUBLIC_SITE_URL` being unset locally — the
fallback doing its job, not a hardcoded origin.

---

## 8. The checks — exact output

`npx tsc --noEmit` → no output, exit 0.
`npm run lint` → no output, exit 0.

**Both were clean on the pre-change tree too**, which is what makes `AGENTS.md`
§8.1's "two known lint errors" sentence stale (`AGENTS.md` §10 rule 8). It was
corrected in the same change.

`npm run build`:

```
▲ Next.js 16.3.1 (Turbopack)
✓ Compiled successfully in 3.2s
  Finished TypeScript in 5.2s ...
✓ Generating static pages using 7 workers (10/10) in 504ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /apple-icon.png
├ ○ /icon.svg
├ ○ /opengraph-image.png
├ ○ /robots.txt
├ ○ /sitemap.xml
└ ○ /twitter-image.png
```

Sweeps, after the change:

| sweep | result |
| --- | --- |
| `&apos;` / `&quot;` / `&#39;` in `client/app client/components/acres` | exit 1, no matches |
| a literal `...` in copy | exit 1, no matches |
| a straight `"` in JSX text in `client/app/page.tsx` | exit 1, no matches |
| `Area` (`AGENTS.md` §1.7) | exit 1, no matches |
| `markers: true` / `ScrollSmoother` | exit 1, no matches |
| `priority` image prop in `client/app/page.tsx client/components/acres` | exit 1, no matches; `client/app/sitemap.ts` still has the valid sitemap `priority: 1` field |
| `transition-all` | exit 1, no matches |
| `outline-none` in `client/app client/components/acres` | 10 hits, **every one** paired with a `focus-visible:outline-*` replacement |

Served output:

```
$ curl -s http://localhost:3100/robots.txt
User-Agent: *
Allow: /

Sitemap: http://localhost:3000/sitemap.xml

$ curl -s http://localhost:3100/sitemap.xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>http://localhost:3000</loc><lastmod>2026-08-20T21:20:59.426Z</lastmod><changefreq>monthly</changefreq><priority>1</priority></url>
</urlset>

$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/does-not-exist
404
```

---

## 9. Browser verification

### 9.0 The harness

Production build (`npm run build`), `npx next start -p 3100`,
`google-chrome-stable --headless=new --remote-debugging-port=9222` driven over
CDP with Node's native `WebSocket` (`docs/automation.md` §3). Widths 1280, 800
and 375. Both harness facts of `docs/motion.md` §7 were honoured:
`Emulation.setScrollbarsHidden({hidden: true})` on **every** run, or each width
reads 15 px short; `Emulation.setEmulatedMedia` used for
`prefers-reduced-motion` only, never for pointer type.

The BASELINE column throughout is the tree at `f29f674`, built and served the
same way — the step-6 work was stashed, the baseline built and captured, then
restored. **An out-of-tree git worktree was tried first and rejected by
Turbopack**: `Symlink [project]/node_modules is invalid, it points out of the
filesystem root`. Scripts and artifacts lived in the session scratchpad, never
in the repository.

### 9.1 Console

Counts are CDP `Log.entryAdded` + `Runtime.consoleAPICalled` over a full load
and a full scroll pass.

| run | 1280 | 800 | 375 |
| --- | --- | --- | --- |
| baseline, normal motion | 0 | **1** | 0 |
| baseline, reduced motion | 0 | **1** | **1** |
| current, normal motion | 0 | **0** | **0** |
| current, reduced motion | 0 | **0** | **0** |

The baseline warning, verbatim:

```
[warning] The resource http://localhost:3100/_next/image?url=%2Fassets%2Fui%2Flanding%2Freport-device-desktop.webp&w=750&q=75 was preloaded using link preload but not used within a few seconds from th…
```

(the 375 instance is the same text with `w=640`). That is B2, and it is gone. It
is **timing-dependent** — baseline 375 showed it on one run of two — which is why
four runs are tabulated rather than one.

### 9.2 Reduced motion

Measured on every motion target (`[data-motion-item]`, `[data-motion-media]`,
`[data-motion-hero-heading]`, `[data-motion-hero-media]`) after load and a full
scroll pass, plus every `a`, `button`, `[data-slot="button"]` and `nav *`:

| | elements below opacity 0.99 | elements with a transition longer than 50 ms |
| --- | --- | --- |
| baseline, reduced, 1280 / 800 / 375 | 0 / 0 / 0 | **8 / 8 / 8** |
| current, reduced, 1280 / 800 / 375 | **0 / 0 / 0** | **0 / 0 / 0** |

The baseline's eight are the `transition-colors duration-(--duration-fast)`
links and pills, all reading `0.15s` — the exact gap B3 closes. **Nothing is
hidden by a start state in either build**, so `AGENTS.md` §9.3 rule 4 holds.

### 9.3 Focus order, the skip link, and fragments

A real `Tab`-key walk from a genuinely fresh load. Every stop reported
`outline: solid 2px rgb(72, 92, 17)` and `:focus-visible` matching.

**1280** — 1 Skip to Main Content [180×48] · 2 Acres [73×30] · 3 Benefits ·
4 Specifications · 5 How-to · 6 Contact Us · 7 Learn More [126×48] · 8 Discover
More [137×48] · 9 Discover More.

**375** — 1 Skip to Main Content [180×48] · 2 Acres · 3 the menu trigger
[**44×44**] · 4 Discover More · 5 Discover More · 6 the comparison-table region
[343×613] · 7 Discover More · 8 the three-step region [343×258] · 9 Learn More
[126×48]. The menu trigger meets `AGENTS.md` §9.4 rule 5 exactly.

Skip link — fresh load, first `Tab`, then `Enter`:

| | 1280 | 375 |
| --- | --- | --- |
| box at rest once focused | top 16, left 16, 180×48 | top 16, left 16, 180×48 |
| `z-index` / covered by anything | 100 / no | 100 / no |
| focus after `Enter` | `MAIN#main-content` | `MAIN#main-content` |
| outline on the landed element | `solid` | `solid` |

Fragment navigation, one fresh load per target, following the real nav link.
`scrollMarginTop` computes to **`120px`** on all four at both widths:

| | `#benefits` | `#specifications` | `#how-to` | `#contact` |
| --- | --- | --- | --- | --- |
| 1280, section top in viewport | **120** | **120** | **120** | 157 |
| 375, section top in viewport | **120** | **120** | **120** | 133 |

`#contact` is the last section, so the document runs out of scroll before the
margin can be satisfied. **That is a document-end clamp, not a failed margin** —
the computed `scroll-margin-top` is `120px` there too.

---

## 10. The pixel diff — polish did not become redesign

Full-page renders of both builds under `prefers-reduced-motion: reduce`, which
runs no GSAP at all, so the composition is fully settled and comparable — the
same method `docs/motion.md` §5.2 used. `magick compare -metric AE -fuzz 4%`:

| width | page height, baseline | page height, current | differing pixels |
| --- | --- | --- | --- |
| 1280 | 6911 | **6911** | 2704 (0.00031) |
| 800 | 7722 | **7722** | 3615 (0.00059) |
| 375 | 7964 | **7964** | 1288 (0.00043) |

**The page height is identical to the pixel at all three widths**, and identical
to the figures `docs/motion.md` §5.1 recorded for step 4 and step 5. Nothing
moved. In particular, A5's `scroll-margin` change moved no geometry — it is
inert until a fragment link is followed.

The differing pixels are neither noise nor a layout change: **they are C1's four
apostrophes.** Collapsing each diff mask to one column per row gives exactly
four bands per width, and nothing outside them:

| width | the four bands (rows) |
| --- | --- |
| 1280 | 1311–1356, 2598–2614, 3434–3450, 4655–4690 |
| 800 | 1332–1370, 2619–2635, 4114–4130, 5882–5917 |
| 375 | 1464–1500, 3179–3195, 4518–4534, 6165–6200 |

**Four bands, four apostrophes**, and their heights track the type role: ~45 rows
at the 60 px `We’ve cracked the code.`, ~16 rows at the 15 px body lines, ~35
rows at the 38 px blockquote. Cropping band one from both builds and stacking
them shows `We've` above `We’ve` and nothing else different. Every other pixel
of all three pages is unchanged.

---

## 11. Raised, and deliberately not fixed

| item | disposition |
| --- | --- |
| The ~110 ms hero entrance flash (`docs/motion.md` §9.1) | **Closed as accepted** by the user's decision (§4.1). Not to be "improved" by a later session |
| `tabular-nums`, `env(safe-area-inset-*)`, focus trap / `aria-modal` / scroll lock | Considered and declined, with reasons, in §2.1 |
| The `tailwind-4-docs` snapshot | Still blocked after one retry this session (§1). Nothing here rests on the official snapshot |
| A web-app manifest (`manifest.ts`) | **Recorded, not built.** A manifest implies an installable PWA that the references (`AGENTS.md` §0) do not specify |
| `authors`, `creator`, a Twitter handle, a verification token | Omitted rather than invented (`AGENTS.md` §10 rule 6). They land when the user supplies real values |
| The four glyph questions of `docs/components.md` §3 | Untouched here — two remain provisional and are the user's to close |
| A real origin for `NEXT_PUBLIC_SITE_URL` | Left unset. The fallback is the dev server; the variable is documented in `client/.env.example` |

**Step 7 completed.** The `client/` split rewrote this file's current filesystem
path pins. `docs/automation.md` §4 records the relocation classes and command
contract. Step 8's server work touches nothing recorded here.
