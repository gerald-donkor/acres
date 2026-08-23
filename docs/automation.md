# Acres — Automation and Measurement Recipes

This file is the durable record of measurement tools, comp geometry, ImageMagick
recipes, and headless browser automation used across the Acres implementation.

---

## 1. Reference Comps and DPI Geometry

The four reference files in `client/public/assets/ui/` are 1:1 with CSS pixels at their stated widths:

| file | dimensions | notes |
| --- | --- | --- |
| `client/public/assets/ui/ref/acres-design-system.pdf` | 1260 × 8082.33 pt | One page, 72 dpi (`-r 72` → 1260 × 8083 px bitmap) |
| `client/public/assets/ui/landing-pages/Desktop.png` | 1280 × 7389 px | Desktop comp at 1280 CSS px |
| `client/public/assets/ui/landing-pages/Tablet.png` | 800 × 8825 px | Tablet comp at 800 CSS px |
| `client/public/assets/ui/landing-pages/Mobile.png` | 375 × 8833 px | Mobile comp at 375 CSS px |

---

## 2. ImageMagick and PDF Recipes

### 2.1 PDF Extraction

```bash
# Render the design-system board bitmap at 1:1 (72 dpi)
pdftoppm -png -r 72 client/public/assets/ui/ref/acres-design-system.pdf /tmp/ds # produces /tmp/ds-1.png

# Convert PDF directly to SVG vector paths
pdftocairo -svg client/public/assets/ui/ref/acres-design-system.pdf /tmp/ds.svg
```

### 2.2 Accurate Colour Reading (Histograms)

Never sample a single pixel for colour due to subpixel antialiasing. Extract the dominant entry from a histogram over the surface patch:

```bash
# Read dominant non-background colour from patch
magick <comp>.png -crop WxH+X+Y +repage -format %c histogram:info: | sort -rn | head -3
```

### 2.3 Thresholded Ink Bounding Boxes

To measure text run ink or vector icon boundaries honestly:

```bash
magick <comp>.png -crop WxH+X+Y +repage -colorspace gray -negate -threshold 35% -format "%@\n" info:
```

### 2.4 Flat Fill Extents and Radii

```bash
# Isolate a specific fill colour (e.g. #DFECC6) with 2% fuzz
magick ds-1.png -crop WxH+X+Y +repage -fuzz 2% \
  -fill white -opaque '#DFECC6' -fill black +opaque white \
  -colorspace gray -threshold 50% -format "%@\n" info:
```

---

## 3. Headless Browser Automation (CDP)

Browser verification in this repo runs against a Next.js production build (`next build && next start`) with `google-chrome-stable --headless=new` via Chrome DevTools Protocol over Node's native `WebSocket`.

### 3.1 Capturing Viewport Screenshots

```js
await sendSession("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await sendSession("Page.navigate", { url: "http://localhost:3000" });
const screenshot = await sendSession("Page.captureScreenshot", { format: "png" });
writeFileSync("screenshot.png", Buffer.from(screenshot.data, "base64"));
```

### 3.2 Measuring Live Geometry and Computed Styles

```js
const metrics = await evaluate(`(() => {
  const el = document.querySelector('...');
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return {
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    color: style.color,
  };
})()`);
```

### 3.3 Full-page capture of this site — four traps

Added by `prompts/11-responsive-comp-fidelity.md`. Each of these cost a run in
the session that measured the landing page, and none of them announces itself.

**1. The page is blank below the fold unless reduced motion is emulated.** GSAP's
reveal start states leave the content at `opacity: 0`, and ScrollTrigger reverses
them when the capture scrolls back to the top. The first attempt produced a
375-wide capture with a 3458-pixel empty gap through the middle. Emulate it
**before** navigating:

```js
await S("Emulation.setEmulatedMedia", {
  features: [{ name: "prefers-reduced-motion", value: "reduce" }],
});
```

That also makes the capture the *rest* state, which is what a comp diff wants.

**2. `Page.captureScreenshot` stalls silently on a full 8000+ px viewport.**
Capture in **2000 px strips** with an explicit `clip` and `captureBeyondViewport`,
then `-append` them:

```js
for (let y = 0; y < H; y += 2000) {
  const h = Math.min(2000, H - y);
  const shot = await S("Page.captureScreenshot", {
    format: "png", captureBeyondViewport: true,
    clip: { x: 0, y, width: w, height: h, scale: 1 },
  });
}
// magick strip-*.png -append live-<w>.png
```

**3. Re-using one page target across widths hangs after the second navigation.**
Open a **fresh target per width** (`Target.createTarget` →
`Target.attachToTarget` with `flatten: true`) and `Target.closeTarget` it after.
Below-fold images are lazy, so force them in and walk the page before capturing:

```js
document.querySelectorAll("img").forEach((i) => { i.loading = "eager"; i.decoding = "sync" });
for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await tick() }
window.scrollTo(0, 0);
```

**4. `pkill -f "next start -p 3112"` kills your own shell** — the pattern matches
the shell's own command line, and the tool call returns **exit 144** with the
work half-done. Resolve the pid instead:

```bash
PID=$(ss -ltnp | grep ':3112' | sed -n 's/.*pid=\([0-9]*\).*/\1/p'); [ -n "$PID" ] && kill "$PID"
```

Check the port before binding, too — stale `next start` processes from earlier
sessions were still holding 3100 and 3111, and each serves the build that was on
disk when it started, not the one you just made.

### 3.4 Two measurement recipes that disagree, and which to trust

**Colour extent: sample pixels directly, never `-fuzz` + `-opaque`.** Locating
the hero's sage band by isolating `#8E9C78` with a fuzz-based `-opaque` pass
produced a false top edge at desktop `y = 384`; a direct
`%[pixel:p{X,Y}]` grid matching within ±14 per channel gave the true 538. The
fuzz pass bleeds into the antialiased boundary between the band and the device
above it.

**Band profile for images, ink boxes for text.** Collapsing each row to its mean
finds content bands cheaply:

```bash
magick <img> -colorspace gray -resize 1x! -depth 8 txt:-
# runs of rows whose mean is under ~250 are the content bands
```

It is reliable for image blocks and full-width rules and **unreliable for text**
— a short run averaged across 1280 px does not move the row mean. It also
produces false positives on layout: the benefits intro was flagged as a 148 px
defect by the band profile and cleared by a side-by-side crop. Re-check every
text-level claim with a thresholded ink bounding box:

```bash
magick <img> -crop WxH+X+Y +repage -colorspace gray -negate -threshold 35% -format "%@\n" info:
```

and read the crops. The profile proves image geometry; only the crops prove the
text-level layout.

---

## 4. Step 7 Workspace Split

Step 7 moved the completed Next.js application into `client/` and made the
repository root an npm-workspace coordinator. No route, URL, image selection,
metadata convention, Server Component boundary, or visual behavior was intended
to change.

### 4.1 Final Tree Contract

The root owns coordination files only: `AGENTS.md`, `docs/`, `prompts/`,
skills directories, `README.md`, `.gitignore`, `package.json`,
`package-lock.json`, and `skills-lock.json`. The Next.js app root is
`client/`, which owns `app/`, `components/`, `hooks/`, `lib/`, `public/`,
`scripts/`, `.env.example`, `components.json`, `eslint.config.mjs`,
`next.config.ts`, `postcss.config.mjs`, `package.json`, and `tsconfig.json`.

The Git-tracked relocation map was:

| from | to |
| --- | --- |
| `app/` | `client/app/` |
| `components/` | `client/components/` |
| `hooks/` | `client/hooks/` |
| `lib/` | `client/lib/` |
| `public/` | `client/public/` |
| `scripts/` | `client/scripts/` |
| `.env.example` | `client/.env.example` |
| `components.json` | `client/components.json` |
| `eslint.config.mjs` | `client/eslint.config.mjs` |
| `next.config.ts` | `client/next.config.ts` |
| `postcss.config.mjs` | `client/postcss.config.mjs` |
| `tsconfig.json` | `client/tsconfig.json` |

`packages/shared`, `server/`, deployment manifests, Docker files, CI files, and
NestJS host selection were explicitly deferred to step 8.

### 4.2 npm Workspace Commands

The verified npm workspace script form is:

```json
{
  "workspaces": ["client"],
  "scripts": {
    "dev": "npm run dev --workspace=@acres/client",
    "build": "npm run build --workspace=@acres/client",
    "start": "npm run start --workspace=@acres/client",
    "lint": "npm run lint --workspace=@acres/client"
  }
}
```

`npm install` must be run from the repository root. It regenerates the single
root `package-lock.json`; no `client/node_modules/` is created or committed.

### 4.3 Path Rewrite Classes

Filesystem references in `AGENTS.md`, `README.md`, source comments, and written
build records were rewritten from root app paths to root-relative workspace
paths:

| old class | new class |
| --- | --- |
| `app/...` | `client/app/...` |
| `components/...` | `client/components/...` |
| `hooks/...` | `client/hooks/...` |
| `lib/...` | `client/lib/...` |
| `scripts/...` | `client/scripts/...` |
| `public/assets/ui/...` | `client/public/assets/ui/...` |

Browser URL paths did not change. Assets still resolve from `/assets/...`,
metadata files still publish at `/favicon.ico`, `/icon.svg`,
`/apple-icon.png`, `/opengraph-image.png`, `/twitter-image.png`,
`/robots.txt`, and `/sitemap.xml`, because `client/public/` is the public
folder for the Next.js project root.

### 4.4 Step 7 Verification Record

Commands run from the repository root:

```text
npm install

added 1 package, and audited 673 packages in 7s

240 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm warn install-scripts 1 package had install scripts blocked because they are not covered by allowScripts:
npm warn install-scripts   unrs-resolver@1.12.2 (postinstall: node postinstall.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

The install-script warning was not approved in this step; no dependency change
or native rebuild policy change was required for the workspace split.

```text
npm run lint

npm notice run acres@0.1.0 lint
npm notice run npm run lint --workspace=@acres/client
npm notice run @acres/client@0.1.0 lint
npm notice run eslint
```

```text
npx tsc --noEmit -p client/tsconfig.json

npm notice run acres@0.1.0 npx
npm notice run 'tsc' --noEmit -p client/tsconfig.json
```

```text
npm run build

npm notice run acres@0.1.0 build
npm notice run npm run build --workspace=@acres/client
npm notice run @acres/client@0.1.0 build
npm notice run next build
▲ Next.js 16.3.1 (Turbopack)
✓ Running next.config.ts took 26ms

  Creating an optimized production build ...
✓ Compiled successfully in 5.0s
  Running TypeScript ...
  Finished TypeScript in 3.6s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/10) ...
  Generating static pages using 7 workers (2/10)
  Generating static pages using 7 workers (4/10)
  Generating static pages using 7 workers (7/10)
✓ Generating static pages using 7 workers (10/10) in 210ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /apple-icon.png
├ ○ /icon.svg
├ ○ /opengraph-image.png
├ ○ /robots.txt
├ ○ /sitemap.xml
└ ○ /twitter-image.png


○  (Static)  prerendered as static content
```

```text
npm run start

npm notice run acres@0.1.0 start
npm notice run npm run start --workspace=@acres/client
npm notice run @acres/client@0.1.0 start
npm notice run next start
▲ Next.js 16.3.1
- Local:         http://localhost:3000
- Network:       http://192.168.0.170:3000
✓ Ready in 153ms
✓ Running next.config.ts took 24ms
```

The localhost smoke test was run with Node `fetch` because `curl` was not
installed in the shell. The sandbox blocked localhost fetches with `EPERM`
until the same read-only smoke test was rerun with escalation:

```text
200 /
404 /_not-found
200 /favicon.ico
200 /icon.svg
200 /apple-icon.png
200 /opengraph-image.png
200 /twitter-image.png
200 /robots.txt
200 /sitemap.xml
200 /assets/ui/landing/report-device-desktop.webp
```

`/_not-found` returning 404 is the expected HTTP status for the rendered
not-found route.

### 4.5 Turbopack missing transitive module during development

Added by `prompts/21-repair-picocolors-resolution.md`.

A Next.js development overlay can report a missing transitive module from a CSS
import trace even when the installed dependency graph is healthy. The observed
case was:

```text
./client/app/globals.css
Error: Cannot find module 'picocolors'
at node_modules/next/node_modules/postcss/lib/css-syntax-error.js
```

The repair path is evidence-based:

1. Confirm the installed dependency graph and Node resolution are healthy:

   ```bash
   npm ls picocolors postcss next --all
   node -p "require.resolve('picocolors')"
   node -p "require.resolve('picocolors', {paths: [require.resolve('next/node_modules/postcss/lib/css-syntax-error.js')]})"
   ```

2. Inspect the exact listener on the development port before stopping
   anything:

   ```bash
   ss -ltnp sport = :3000
   ps -p <pid> -o pid=,ppid=,cwd=,args=
   ```

   Stop only the confirmed Acres `next dev` parent process. Do not use
   wildcards or broad process kills; a stale dev process can continue serving
   the Turbopack graph it started with.

3. Restart from the repository root with:

   ```bash
   npm run dev:client
   ```

4. Verify `/` and any fragment URL in a browser. The fragment is browser-local,
   so the server route remains `/`; browser automation is what proves
   `/#benefits` renders instead of the error overlay.

In the 2026-08-23 repair, `npm ls` and both `require.resolve` checks found
`picocolors@1.1.1`, including resolution from Next's nested PostCSS module. A
fresh `npm run dev:client` then served `/` with HTTP 200 and Playwright loaded
`http://localhost:3000/#benefits` with the page title
`Acres — Browse everything.` The successful repair was therefore a restart of
the stale dev process only. No `npm install`, `npm ci`, manifest change,
lockfile change, CSS edit, or direct `picocolors` dependency was required.

If a fresh process still reproduces the same missing-module error after these
checks, repair the install from the root lockfile in order: run root
`npm install`, inspect any lockfile diff, re-run the graph and resolution
checks, and only then use root `npm ci` as a deterministic clean-install
fallback. Do not declare a transitive dependency directly without dependency
graph evidence that the owning package no longer declares it.

---

## 5. A tooling gap, and a page-region-plus-alpha-mask extraction recipe

Added by `prompts/12-hero-device-bezel.md`, which closed `docs/landing.md` §8's
"device asset has no bezel" item.

### 5.1 `magick`/`convert`/`identify` are not installed in this environment

Every recipe in §2 above is correct against ImageMagick, but the binary itself
is not guaranteed present — this is the first prompt to hit that.
`apt-get install --dry-run imagemagick` resolves cleanly (Ubuntu 26.04, ESM
apps pocket), so it can be installed with the user's confirmation if a task
ever needs ImageMagick specifically. This prompt did not: poppler
(`pdftoppm`/`pdftocairo`/`pdfimages`) and `python3` + Pillow (12.1.1, via the
system `python3`, no venv) cover every recipe below. Pillow is not a repository
dependency; it was used as a one-off extraction tool the same way §2's `magick`
commands are, not installed into any workspace.

### 5.2 Why a plain PDF crop is not enough for page-content art

`pdftoppm` flattens the page — whatever sits behind an element (here, the
design-system board's own sage band, then its mint page background) fills the
crop below, right of, and around any rounded corners, with no alpha. §2.1's
recipe gets clean alpha from an **embedded image's own soft mask**
(`pdfimages` extracts the image and its `smask` object separately). The hero
device's *frame* has no such mask, because the frame is page content (a vector
rounded rect drawn by the PDF), not an embedded raster — `pdfimages -list`
does not list it at all. The replacement technique renders the page region
as a flat bitmap and builds the alpha mask by hand from the frame's own
measured geometry.

### 5.3 The recipe, per device

1. **Locate the region.** Render a generous recon crop at a moderate DPI
   (150 was used here) with `pdftoppm -png -r <dpi> -x <x0> -y <y0> -W <w>
   -H <h> <pdf> <out>` — `-x/-y/-W/-H` are **output pixels at that DPI**, i.e.
   `px = pt × dpi / 72`. Read the PNG to confirm which device group landed in
   frame; the design-system board's "Photo Links" section holds three device
   treatments on their own sage bands; page-row gaps (a row-wise dark-pixel
   count that drops to 0) separate them.
2. **Find the frame's dark-pixel bounding box** at that same render, by a
   direct RGB scan (`r,g,b < 40` on every channel), not a fuzz/threshold pass —
   antialiasing on the frame's own edge is a few px wide and a strict scan
   finds the true ink extent reliably. Convert the box back to PDF pt
   (`pt = px × 72 / dpi`) for a reproducible region.
3. **Choose the production DPI from the embedded photo's native resolution**,
   not an arbitrary target. `pdfimages -list` reports each embedded image's
   `x-ppi`/`y-ppi` — the desktop screen photo (object 6/7) is 144 ppi, the
   mobile screen photo (object 16/17) is 235 ppi. Rendering the *page* at that
   same DPI puts the embedded raster at 1:1 with its own source pixels: no
   upsampling softness, no discarded resolution. (144 was chosen over a higher
   DPI for the desktop frame specifically because rendering higher does not
   add real information — the photo is the resolution ceiling, per
   `prompts/12-…`'s "no dependency is added" / no-fabrication constraint on
   inventing sharpness that is not in the source.)
4. **Re-render the exact frame region at the production DPI**, with a small
   pixel margin (a few px) so the crop does not clip the frame's own
   antialiasing, and re-run the bounding-box scan (step 2) at that resolution
   for the final, tight crop coordinates — reusing the pt numbers from step 1
   at a new DPI accumulates rounding error, so re-measure rather than convert.
5. **Measure the corner radius** by tracing the top-left corner: for each row
   from the box's top edge, find the offset of the first dark pixel from the
   box's left edge, and read the row where that offset first reaches 0 — that
   row index is the radius (a rounded-rect's quarter-circle corner has this
   exact property: at row `y` the inset is `R − √(R² − (R−y)²)`, which equals
   `R` at `y=0` and `0` at `y=R`). Desktop: **40 px at r144** (≈ 20 pt/px at
   page scale). Mobile: **98 px at r235** (≈ 30 pt/px at page scale) — a
   phone's corner is proportionally rounder than a tablet's, which is what
   this technique should find if it is measuring correctly, not an error to
   average away.
6. **Build the alpha mask** at the crop's own resolution with
   `PIL.ImageDraw.rounded_rectangle([frame_bbox], radius=R, fill=255)` on an
   `L`-mode canvas the same size as the crop, then `Image.putalpha(mask)`.
   Draw the **full** frame — both top and bottom corners — never pre-clipped
   to a target box; clipping to the hero's box shape is CSS's job
   (`overflow-hidden` on the existing wrapper), not the asset's.
7. **Export lossless WebP** (`Image.save(path, "WEBP", lossless=True)`),
   matching the encoding `file` reports on every other asset in
   `client/public/assets/ui/landing/` (`RIFF … Web/P image, lossless, with
   alpha`).
8. **Verify by 1:1 crop against the comp**, not by pixel-diff — the comp's
   device is a JPEG-compressed embed at 1280/375 page width, and the new
   asset is sourced at a different (usually higher) resolution, so they will
   never diff to zero. Confirm silhouette, corner radius and composition by
   eye, then confirm the *built* page (not just the static asset) against the
   comp with a full §3.3 CDP capture at 375/800/1280.

### 5.4 Result

| device | production DPI | crop (px) | corner radius | final asset |
| --- | --- | --- | --- | --- |
| desktop | 144 (matches embedded photo's 144 ppi) | 1810 × 1288 | 40 px | `report-device-desktop.webp` |
| mobile | 235 (matches embedded photo's 235 ppi) | 878 × 1765 | 98 px | `report-device-mobile.webp` |

Both replace the previous screen-only extractions in place (same paths). No
hero token (`--spacing-hero-band` / `-wing-*` / `-overhang-*` / `-device-*`)
needed to change — the frame's outer edge already sat within a few px of the
box the screen-only asset was tuned against — confirmed by the CDP capture in
step 8 above, not assumed. `docs/landing.md` §8 records the visual result and
the recomputed `object-cover` cropping arithmetic for the new asset aspect
ratios.
