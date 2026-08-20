# 03 — Chrome

## Scope, and why it is next

**Build the site chrome:** the horizontal navigation used at 800 and 1280, the
closed mobile navigation card and its open menu at 375, and the footer at all
three widths. Mount the header and footer around the route content from
`app/layout.tsx`; keep the mobile disclosure as the smallest possible Client
Component.

This is next because it is **step 3 of AGENTS.md §8.2**, and its two dependencies
are committed: the design system at `0723829` and the Acres primitives at
`efb784a`. Step 4's landing page needs the nav, footer, pill, container and rule;
chrome is the only remaining dependency between the primitive layer and the
page build.

This step also closes two findings deliberately handed forward by step 2:

1. rename the unreachable `--text-brand` type token before the wordmark uses it;
2. verify the Acres `Button` rendered as a link before the nav CTA ships.

---

## Reference material read for this prompt, by path

All reference images were opened at 1:1 before this prompt was written. The PDF
was rendered with `pdftoppm -singlefile -png -r 72` to `/tmp/acres-ds.png`.

| reference | region read |
| --- | --- |
| `public/assets/ui/ref/acres-design-system.pdf` | the `Logo` block, rendered crop `1260x620+0+1050`; the horizontal nav plus closed/open mobile cards, rendered crops `1260x1900+0+2100` and `900x650+20+2850` |
| `public/assets/ui/landing-pages/Desktop.png` | nav `1280x100+0+0`; footer `1280x390+0+6999` |
| `public/assets/ui/landing-pages/Tablet.png` | nav `800x100+0+0`; footer `800x430+0+8395` |
| `public/assets/ui/landing-pages/Mobile.png` | closed nav `375x120+0+0`; footer `375x530+0+8303` |
| `docs/design-system.md` | §2.3–2.5, §3.1–3.3, §4.1–4.3, §6, §7.3–7.7 and §8 |
| `docs/components.md` | §4 (`Button`, `Rule`, icon delivery and `cn()`), §5 reference deltas and §7 findings for this step |
| `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `lib/utils.ts` | read in full |
| `components/acres/button.tsx`, `components/acres/icon.tsx`, `components/acres/icon-paths.ts` | read in full; `menu` and `close` are already generated |
| `components/ui/collapsible.tsx`, `components/ui/navigation-menu.tsx`, `components.json` | read in full; this is Base UI / `base-nova`, not Radix |
| `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` | verified that the root layout owns shared UI around `children` |

`docs/automation.md` is promised by the AGENTS.md index but does not exist yet.
This is the first step after that promise which directly measures both the board
and page comps, so the implementation creates it and moves the durable crop,
profile and screenshot recipes there.

---

## Measurements the implementation must hit

### Horizontal nav — 800 and 1280

- The nav uses the existing `Container`: **720 px with 40 px gutters at 800**,
  and **1200 px with 40 px gutters at 1280**.
- At 1280, the wordmark ink begins at x 40 and the CTA fill spans x 1113–1239;
  the CTA fill is **127 × 48** at x 1113, y 20. The wordmark, link group and CTA
  share the same visual centre at y 44–47.
- At 800, the same row begins and ends at x 40 and x 759. It uses the same
  48 px CTA, the same type and the same vertical placement. Nothing in the nav
  scales between 800 and 1280.
- Wordmark: `Acres`, DM Sans 500, **30 px**, −0.05em. Its ink measures **71 × 22**
  at 800/1280 and **68 × 22** at 375. Rename `--text-brand` to an unambiguous
  type token such as `--text-wordmark` in `app/globals.css`,
  `docs/design-system.md` and `lib/utils.ts` together; `text-brand` currently
  resolves to the colour token and is unusable.
- Links: `Benefits`, `Specifications`, `How-to`, `Contact Us`, using
  `--text-ui` (DM Sans 600, 14 px, −0.018em). They are plain in-page links, not
  dropdown triggers. Do not use `NavigationMenu` for a list that has no popup.
- CTA: `Learn More`, the existing primary `Button`, including its measured
  `arrow_outward`. Use a real anchor through Base UI's verified `render` API;
  do not nest an anchor in a button or duplicate the pill styles.

### Closed mobile nav — 375

- Full viewport width, anchored to the top edge: x 0–374, y 0–77. Its visible
  white card is **78 px high**, with square top corners, **24 px bottom corners**
  and the single `--shadow-card` elevation. The shadow fades back to white by
  row 83 (`docs/design-system.md` §4.3).
- Wordmark ink: x 20–86, y 27–48, **68 × 22**.
- `menu` ink: x 334–351, y 25–37, **18 × 13**. Render it through the existing
  filled Material Symbol `Icon`; the control around it is at least **44 × 44**.
- The mobile card replaces the horizontal bar below `md`; the horizontal bar is
  not squeezed into 375.

### Open mobile menu — board reference

The open state exists on the design-system board, not in `Mobile.png`. Measure
it from the 1:1 PDF render rather than inferring it from the closed landing comp.

- The card remains full-width and top-anchored, white, with only its bottom
  corners rounded and the one card shadow. On the board it is **375 px wide and
  approximately 564 px high**. Re-measure the exact flat fill before tokenising
  the height; record the observed range and the shipped judgement separately.
- The header row keeps the same wordmark and swaps `menu` for the existing
  `close` glyph. Both icon controls retain a 44 × 44 target.
- Link order is exactly: `Benefits`, `Specifications`, `How-to`, `Contact Us`.
  The inner rules run from x 20 to x 354 (**335 px**). Consecutive rules on the
  board are **80 px apart**, so every link row has a stable 80 px target.
- The primary `Learn More` pill sits below the four link rows, aligned to the
  same 20 px inner edge. No backdrop is drawn; do not invent one.
- Use the installed Base UI `Collapsible` only after running
  `npx shadcn@latest docs collapsible` and reading its current docs. The trigger
  must expose its expanded state and the panel must leave a logical keyboard
  order. Activating a menu link closes the panel.
- Open chrome overlays the page from the top rather than reflowing the hero.
  This is a judgement from the anchored open card and its elevation; record it
  as such in `docs/chrome.md`.

### Footer — all three widths

- A 1 px `#E9E9E9` `Rule` begins the footer, spanning the existing `Container`:
  343 / 720 / 1200 px at 375 / 800 / 1280.
- Link order is `Benefits`, `Specifications`, `How-to`. `Contact Us` is absent
  from the footer in all three comps. Use `--text-ui` and real anchors.
- Use the standalone Acres mark shown in the board's `Logo` block. Extract its
  vector geometry from the PDF and fit it to the comp; do not approximate it
  with text, CSS bars, a Material Symbol or a newly drawn path. Its comp ink is
  approximately **31 × 70 px** at every breakpoint; re-measure the exact ink
  box before creating the tokens and record the result.
- Legal lines use Roboto Mono 400 and the existing responsive label role:
  `© Acres. 2025` and `All Rights Reserved`, both `#485C11`. The comp's `Area`
  is the unfinished rename and must not ship.
- At 800 and 1280, footer links form one horizontal row; the mark and two legal
  lines form the lower row, with the rights line aligned to the container's
  right edge. At 375, the three links stack vertically, and the mark/legal
  content occupies the lower region exactly as `Mobile.png` shows.
- The measured major-section gap remains **120 px**: on Desktop the closing CTA
  ends at row 6998 and the footer rule begins at 7118. Step 4 will supply the
  preceding section; the footer must not bake that gap into itself twice.

### Measurement procedure for unresolved geometry

1. Render the board at 72 dpi and crop the named regions at 1:1.
2. Measure fills and rules from full horizontal/vertical profiles. Measure text
   and the mark from thresholded ink bounding boxes, not a single pixel.
3. Use a histogram for colours; never sample an antialiased edge.
4. Add a token only for a governed chrome dimension not already expressed by
   Tailwind's spacing scale. Update `docs/design-system.md`, `@theme` and
   `lib/utils.ts` together for every new named token.
5. In the browser, verify computed geometry at 375, 800 and 1280, then compare
   screenshots of the closed states plus a separate 375 open-state capture.

---

## Component and route structure

Create a small chrome layer in `components/acres/`:

| file | responsibility |
| --- | --- |
| `site-header.tsx` | Server Component; horizontal nav plus the mobile client leaf |
| `mobile-navigation.tsx` | Client Component; Base UI `Collapsible`, trigger state, close-on-link behavior |
| `site-footer.tsx` | Server Component; footer links, mark and legal copy |
| `logo-mark.tsx` | Server Component; the extracted, verified board vector in `currentColor` |

Static link data stays in a server module or inside the Server Components. Do
not export constants or types from `mobile-navigation.tsx` (AGENTS.md §9.2).

Update `app/layout.tsx` to render:

1. `SiteHeader`;
2. one semantic `<main>` containing `children` and retaining the body's flex
   growth;
3. `SiteFooter`.

`app/page.tsx` remains the `Home` placeholder. Step 4 owns the landing content
and its section IDs. The chrome's hash links may point ahead to the exact IDs
`#benefits`, `#specifications`, `#how-to` and `#contact`; document that they
become live when step 4 lands.

Before writing code, read the current Next 16 layout guide under
`node_modules/next/dist/docs/`, the installed Base UI Button/Collapsible source,
and the shadcn docs returned for `collapsible`. Do not write an API from memory.

---

## Reference deltas

| # | delta | why |
| --- | --- | --- |
| 1 | Every `Area` in the board/comp becomes `Acres` | AGENTS.md §1.7; the product rename is settled |
| 2 | Menu and close controls have at least 44 × 44 targets around their measured ink | AGENTS.md §9.4 rule 5; the visual glyph geometry stays unchanged |
| 3 | Every link and disclosure trigger has a visible `#485C11` focus indicator | the static references show no focus state; AGENTS.md §9.4 rule 1 requires one |
| 4 | The open card overlays rather than reflows page content | the board shows a top-anchored elevated card but no surrounding page; overlay preserves the closed header's document geometry and is recorded as a judgement |
| 5 | The hover label on the primary CTA is black on sage | inherited approved step-2 accessibility correction; black/sage is 7.16:1, white/sage is 2.93:1 |
| 6 | No mobile-menu backdrop | the open board state draws none; adding one would invent a surface outside the eight-value palette |

---

## Breakpoint behaviour — 375, 800 and 1280

| surface | 375 | 800 | 1280 |
| --- | --- | --- | --- |
| header | full-width 78 px closed card; wordmark + menu | horizontal bar in 720 px container | horizontal bar in 1200 px container |
| open menu | 375 px top overlay; four 80 px rows + CTA | unavailable/hidden | unavailable/hidden |
| wordmark | 30 px role, 68 × 22 ink | same role, 71 × 22 ink | same role, 71 × 22 ink |
| CTA | only inside open menu | right edge, 48 px pill | right edge, 48 px pill |
| footer links | vertical stack | horizontal row | horizontal row |
| footer mark/legal | mobile arrangement from comp | horizontal lower row | horizontal lower row |
| container | 343 / 16 gutter | 720 / 40 gutter | 1200 / 40 gutter |

The mode switch is the existing default `md` breakpoint (768 px), the same
single breakpoint established in `docs/design-system.md` §7.3. No custom
breakpoint is added.

---

## Expected impact

- `/` gains shared site chrome around the existing `Home` placeholder. The page
  body still looks unfinished by design; step 4 replaces it.
- Every future route under the root layout inherits the same header and footer.
- `app/globals.css`, `docs/design-system.md` and `lib/utils.ts` change together
  for the wordmark-token rename and any measured chrome tokens.
- `docs/chrome.md` is created as the build record: exact measurements, vector
  extraction, component boundaries, link targets, reference deltas, screenshots
  and real check output.
- `docs/automation.md` is created from AGENTS.md §0's seed plus the exact recipes
  used here. Update the AGENTS.md index row from “not yet written” to “written.”
- Add a `docs/chrome.md` row to the AGENTS.md index. This is the one index-row
  addition §1.8 permits; do not add implementation detail to AGENTS.md.
- No dependency is added. GSAP remains uninstalled.

---

## Non-goals

| not built | why |
| --- | --- |
| landing-page sections or final section IDs | step 4; `app/page.tsx` remains untouched |
| GSAP or menu animation | step 5; the references are static and GSAP is not installed |
| sticky-header behavior | no reference specifies it |
| dropdown navigation, a backdrop, focus trap or modal semantics | the open state is a disclosure card, not a dialog, and none appears in the board |
| a dynamic copyright year | the comp specifies 2025; this step corrects only the product name |
| dark mode | no Acres dark comp exists (`docs/design-system.md` §7.7) |
| changes inside generated `components/ui/` | compose the installed Collapsible; do not fork it |
| a new icon package or hand-authored substitute logo | the menu/close paths exist and the logo vector comes from the PDF |

---

## SKILLS USED

- `frontend-design` — keep the restrained, measured Acres identity and reject generic nav/footer embellishment.
- `tailwind-design-system` — govern the wordmark rename and any new chrome geometry as Tailwind 4 tokens.
- `tailwind-4-docs` — verify responsive/state utilities against the official v4 snapshot before implementation; its local snapshot is currently incomplete, so initialize it with the user's license acceptance before using it as authority.
- `shadcn` — verify and compose the installed Base UI Collapsible without assuming Radix APIs.
- `vercel-react-best-practices` — preserve the Server Component chrome and isolate the mobile disclosure to a client leaf.
- `web-design-guidelines` — fetch the current checklist and audit the completed header/footer for interaction and accessibility findings.
- `caveman-commit` — write the mandatory final Conventional Commit message.

No GSAP skill is used: this step contains no motion, and loading motion skills
would imply work reserved for step 5.

---

## Checks, comparison and documentation

Run and quote the real output of:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Then run the production build and verify with browser screenshots at:

- 375 × 900, mobile menu closed;
- 375 × 900, mobile menu open;
- 800 × 1000;
- 1280 × 900.

Browser checks must cover:

- exact container bounds, wordmark ink, CTA fill and mobile-card geometry;
- the 375-only mode switch and open/close behavior;
- `aria-expanded`, keyboard activation, logical focus order, Escape behavior if
  Base UI provides it, close-on-link, and 44 px targets;
- no horizontal overflow or overlap at any named width;
- computed font families, sizes, colours, radii and shadow;
- `Button` rendered as an anchor with one valid interactive element and its
  arrow intact;
- footer stack/order and `© Acres. 2025` copy;
- the fresh `web-design-guidelines` audit, with every finding fixed or recorded.

Because `app/page.tsx` remains a placeholder, compare the chrome regions only;
do not report a full-page visual diff as meaningful. Record the commands,
screenshots, computed measurements, honest tolerances and exact check output in
`docs/chrome.md`. Record reusable measurement and screenshot recipes in
`docs/automation.md`.

Finally, stage the complete executed prompt, load `caveman-commit`, commit to
`main`, and do not push.
