# Acres — Site Chrome

**What this file is.** The build record for the site chrome: the horizontal
navigation used at 800 and 1280, the closed mobile navigation card and open
menu at 375, and the footer at all three widths. Built to `prompts/03-chrome.md`.

---

## 1. What was built

| file | export | server/client | responsibility |
| --- | --- | --- | --- |
| `components/acres/logo-mark.tsx` | `LogoMark` | server | Extracted, verified board vector in `currentColor` |
| `components/acres/site-header.tsx` | `SiteHeader` | server | Horizontal nav bar on `md+`, mobile client leaf on mobile |
| `components/acres/mobile-navigation.tsx` | `MobileNavigation` | client | Base UI `Collapsible`, disclosure trigger, close-on-link, Escape handler |
| `components/acres/site-footer.tsx` | `SiteFooter` | server | Footer rule, 3 links, standalone mark and legal copy |

`app/layout.tsx` mounts `SiteHeader`, semantic `<main className="flex-1 flex flex-col">{children}</main>`, and `SiteFooter`.

---

## 2. Measurements and Geometry

### 2.1 Horizontal Nav — 800 and 1280

- **Container:** `Container` content is 720 px (40 px gutters) at 800, and 1200 px (40 px gutters) at 1280.
- **Wordmark:** `Acres` in DM Sans 500, 30 px, tracking −0.05em (`--text-wordmark`). Ink measures 70 × 22 px at x = 40.
- **Nav Links:** `Benefits`, `Specifications`, `How-to`, `Contact Us`. Set in DM Sans 600, 14 px, tracking −0.018em (`--text-ui`).
- **Primary CTA:** `Learn More` with `arrow_outward`, rendered via Base UI's verified `render={<Link href="#how-to" />}` prop with `nativeButton={false}`. Height is 48 px, fill width is 126.03 px spanning x = 1113.97–1240.00 at 1280, and x = 633.97–760.00 at 800.
- **Visual alignment:** Wordmark, nav links, and CTA share visual vertical centre at y ≈ 44.

### 2.2 Closed Mobile Nav — 375

- **Card:** Anchored to top edge (x = 0–374), 78 px high (`h-[78px]`).
- **Shape & Elevation:** Square top corners, **24 px bottom corners** (`rounded-b-media`), `--shadow-card` (`0 4px 16px rgb(0 0 0 / 0.05)`).
- **Wordmark:** x = 20 inner padding, ink measures 66 × 22 px.
- **Menu trigger:** `Icon` with filled Material Symbol `menu` (18 × 13 px ink inside 24 px box), wrapped in a 44 × 44 touch target (`size-11 flex items-center justify-center`).

### 2.3 Open Mobile Menu — Board Reference

Measured directly from the 1:1 render of `acres-design-system.pdf` (crop `900x800+30+3000` on `ds-1.png`):

- **Overlay Card:** 375 px wide, **564 px high** flat card with 24 px bottom corners and `--shadow-card`.
- **Header row:** 78 px header row swapping `menu` for `close` glyph in a 44 × 44 target.
- **Link Rows:** 4 links (`Benefits`, `Specifications`, `How-to`, `Contact Us`), each in an **80 px high row** (`h-20`).
- **Rules:** Hairlines `#E9E9E9` run across x = 20–354 (335 px wide) between link rows.
- **CTA:** Primary `Learn More` pill positioned below the link rows with 20 px left alignment.
- **Interactions:** Closes on link activation, toggle trigger click, or `Escape` keypress.

### 2.4 Footer — 375, 800 and 1280

- **Top Rule:** 1 px hairline `#E9E9E9` `Rule` spanning the container (343 / 720 / 1200 px).
- **Rhythm:** Major section gap 120 px (`pt-section`).
- **Links:** 3 links (`Benefits`, `Specifications`, `How-to`) in `--text-ui`. `Contact Us` is omitted from the footer in all three comps.
  - At 800 and 1280: horizontal row (`gap-8`).
  - At 375: vertical stack (`gap-6`).
- **Logo Mark:** Standalone Acres vector mark extracted from the PDF at **31.75 × 70 px** (`ds-1.png` y = 1528.875–1598.867, x = 20.051–51.797).
- **Legal Copy:** Roboto Mono 400 in `#485C11` (`--text-label` / `lg:text-label-lg`):
  - `© Acres. 2025`
  - `All Rights Reserved` aligned to the container right edge.

---

## 3. Vector Extraction of `LogoMark`

The standalone logo mark vector was extracted from the vector stream in `acres-design-system.pdf` (SVG path 503) and normalised to origin `(0, 0)` with viewBox `0 0 31.75 70`:

```svg
<path d="M22.3359 21.5859L31.7461 32.6719L27.9219 35.9062L22.3359 29.3086V44.9961H24.8359V69.9922H19.8359V44.9961H17.3359V14.9961H22.3359V21.5859ZM12.4219 44.9961L7.83594 69.9922H2.75L7.33594 44.9961H12.4219ZM4.67578 35.8828L0 34.1094L7.22266 14.9961H12.5742L4.67578 35.8828ZM17.3359 9.94922H12.3359V0H17.3359V9.94922Z" />
```

---

## 4. Reference Deltas

| # | delta | why |
| --- | --- | --- |
| 1 | Every `Area` becomes `Acres` | AGENTS.md §1.7; product rename |
| 2 | Menu and close controls have ≥ 44 × 44 touch targets | AGENTS.md §9.4 rule 5; accessibility floor |
| 3 | Every interactive element has visible `#485C11` focus ring | AGENTS.md §9.4 rule 1 |
| 4 | Open mobile menu overlays from the top | Preserves document layout of the underlying page |
| 5 | CTA hover label is black on sage | Inherited contrast correction; 7.16:1 vs 2.93:1 |
| 6 | No mobile-menu backdrop | Matches the board design without inventing surfaces outside the 8-value palette |

---

## 5. Token Updates

- `--text-brand` was renamed to `--text-wordmark` in `app/globals.css`, `docs/design-system.md`, and `lib/utils.ts`.
- `lib/utils.ts` `twMerge` config includes `"wordmark"` in `text:` scale.

---

## 6. Verification and Check Results

### 6.1 `npx tsc --noEmit`
```
npm notice run acres@0.1.0 npx
npm notice run 'tsc' --noEmit
```
Clean exit 0.

### 6.2 `npm run lint`
```
npm notice run acres@0.1.0 lint
npm notice run eslint
```
Clean exit 0.

### 6.3 `npm run build`
```
▲ Next.js 16.3.1 (Turbopack)
✓ Running next.config.ts took 29ms
  Creating an optimized production build ...
✓ Compiled successfully in 1023ms
  Finished TypeScript in 1737ms    ✓ Finished TypeScript in 1737ms 
  Collecting page data using 5 workers in 417ms    ✓ Collecting page data using 5 workers in 417ms 
✓ Generating static pages using 5 workers (4/4) in 381ms
  Finalizing page optimization in 6ms    ✓ Finalizing page optimization in 6ms 

Route (app)
┌ ○ /
└ ○ /_not-found
```

### 6.4 Browser Verification via Headless CDP

Measured on live production server:

| Viewport | Component | Property | Measured | Status |
| --- | --- | --- | --- | --- |
| 1280 | Container | Width | 1200 px (40 px gutters) | Pass |
| 1280 | Wordmark | Font / Size / Weight | "DM Sans" 500 30px (−1.5px tracking) | Pass |
| 1280 | CTA Button | Dimensions / Tag | 126.03 × 48 px, `<a href="#how-to">` | Pass |
| 1280 | CTA Arrow | Presence | `arrow_outward` inside anchor | Pass |
| 1280 | Console | Base UI Warnings | 0 mismatch warnings (`nativeButton={false}`) | Pass |
| 1280 | Footer Rule | Width | 1200 px (`#E9E9E9`) | Pass |
| 1280 | Footer Mark | Dimensions | 31.75 × 70 px | Pass |
| 1280 | Footer Legal | Family / Colour | "Roboto Mono" 400, `#485C11` | Pass |
| 800 | Container | Width | 720 px (40 px gutters) | Pass |
| 800 | CTA Button | End X | x = 760 (aligns with container edge) | Pass |
| 800 | Console | Base UI Warnings | 0 mismatch warnings | Pass |
| 375 | Closed Card | Height / Radius | 78 px, `0px 0px 24px 24px` | Pass |
| 375 | Closed Card | Shadow | `0 4px 16px rgba(0,0,0,0.05)` | Pass |
| 375 | Trigger | Target / ARIA | 44 × 44 px, `aria-expanded="false"` | Pass |
| 375 | Open Menu | Rows Height | 4 rows × 80 px (`h-20`) | Pass |
| 375 | Open Menu CTA | Tag / Dimensions | `<a href="#how-to">`, 126.03 × 48 px | Pass |
| 375 | Open Menu CTA | Action | Closes disclosure (`aria-expanded="false"`) | Pass |
| 375 | Open Menu | Console Warnings | 0 mismatch warnings | Pass |
| 375 | Open Menu | ARIA / Escape | `aria-expanded="true"` → `false` on Escape | Pass |
