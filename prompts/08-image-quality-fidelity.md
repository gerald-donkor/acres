# 08 — Landing Page Image Quality and High-Fidelity Rendering

Fix image blurriness and pixelation reported on the landing page (specifically observed in the testimonial section image `/home/gdk26/Pictures/Screenshots/Screenshot_20260820_222330.png`), upgrade all raster assets to 100% source extraction quality, configure Next.js 16 image optimization allowlist for `quality: 100`, and tune responsive `sizes` so that all images render razor-sharp across 1x, 2x, and 3x Retina displays.

---

## 1. Scope & Why It Is Next

The user submitted a bug report showing noticeable blurriness and pixelation in the landing page's testimonial image (`/home/gdk26/Pictures/Screenshots/Screenshot_20260820_222330.png`) and requested that all images on the landing page have 100% quality.

### Root Cause Analysis
1. **Asset Source Compression**: Assets extracted during step 5 were compressed with lossy `-quality 88` WebP encoding (`stones.webp` was only 328 KB for 4096×2048).
2. **Next.js Default Quality (75)**: Next.js `<Image>` defaults to `quality={75}`. Furthermore, in Next.js 16, specifying `quality={100}` on `<Image>` is silently clamped to `75` unless `images.qualities: [75, 100]` is explicitly configured in `next.config.ts`.
3. **Aspect-Ratio Mismatch & `object-cover` Upscaling in Next.js**:
   - `stones.webp` has a 2:1 native aspect ratio (4096×2048).
   - In `app/page.tsx`, the container applies `aspect-[0.95/1]` at desktop and `aspect-[1.22/1]` at mobile with `object-cover`.
   - The `sizes` attribute was `(max-width: 1023px) 100vw, 44vw`. On a 1280px desktop, `44vw` is 563px, causing Next.js to select `w=640` and resize the whole 4096×2048 image to 640×320.
   - The browser's CSS `object-cover` then cropped only a ~304×320 center strip of that 640×320 image and stretched it to 515×542 CSS pixels (and 1030×1084 physical pixels on 2x Retina screens). This caused an extreme 3.4× upscale with heavy blockiness.
4. **Mark Assets Recompression**: Trusted marks (`trusted-mark-01.png` through `06.png`) are clean 1x PNG logos that should be served unoptimized without re-encoding loss.

---

## 2. Reference Material Read

- **Design System Master PDF**: `public/assets/ui/ref/acres-design-system.pdf` (master vector & raster PDF, 72 dpi)
- **Design Comps**:
  - `public/assets/ui/landing-pages/Desktop.png` (1280 px wide)
  - `public/assets/ui/landing-pages/Tablet.png` (800 px wide)
  - `public/assets/ui/landing-pages/Mobile.png` (375 px wide)
- **User Bug Screenshot**: `/home/gdk26/Pictures/Screenshots/Screenshot_20260820_222330.png`
- **Next.js 16 Documentation**: `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md`
- **Project Records**: `docs/landing.md`, `docs/design-system.md`, `docs/polish.md`, `docs/automation.md`

---

## 3. Implementation Plan

### Step 1: Re-Extract All Landing Page Raster Assets at 100% Quality
Extract all image streams directly from `public/assets/ui/ref/acres-design-system.pdf` with `pdfimages -png` to preserve lossless raw pixels, composite with their alpha masks, and encode to WebP at `-quality 100`:

```bash
pdfimages -png -f 1 -l 1 public/assets/ui/ref/acres-design-system.pdf /tmp/acres-pdf-raw

# Hero Desktop Device (Object 6 + softmask 7) -> 1741 × 1216
magick /tmp/acres-pdf-raw-006.png /tmp/acres-pdf-raw-007.png -alpha off -compose CopyOpacity -composite -strip -quality 100 public/assets/ui/landing/report-device-desktop.webp

# Hero Mobile Device (Object 16 + softmask 17) -> 816 × 1704
magick /tmp/acres-pdf-raw-016.png /tmp/acres-pdf-raw-017.png -alpha off -compose CopyOpacity -composite -strip -quality 100 public/assets/ui/landing/report-device-mobile.webp

# MediaBand 1 Mountain (Object 18 + softmask 19) -> 4096 × 2304
magick /tmp/acres-pdf-raw-018.png /tmp/acres-pdf-raw-019.png -alpha off -compose CopyOpacity -composite -strip -quality 100 public/assets/ui/landing/mountain.webp

# Big Picture Cylinders (Object 24 + softmask 25) -> 3750 × 3000
magick /tmp/acres-pdf-raw-024.png /tmp/acres-pdf-raw-025.png -alpha off -compose CopyOpacity -composite -strip -quality 100 public/assets/ui/landing/cylinders.webp

# Testimonial Stones (Object 22 + softmask 23) -> 4096 × 2048
magick /tmp/acres-pdf-raw-022.png /tmp/acres-pdf-raw-023.png -alpha off -compose CopyOpacity -composite -strip -quality 100 public/assets/ui/landing/stones.webp

# Map Your Success Aerial (Object 20 + softmask 21) -> 4096 × 2731
magick /tmp/acres-pdf-raw-020.png /tmp/acres-pdf-raw-021.png -alpha off -compose CopyOpacity -composite -strip -quality 100 public/assets/ui/landing/aerial.webp
```

### Step 2: Configure Next.js 16 Image Qualities in `next.config.ts`
Allow `100` quality in `next.config.ts`:
```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 100],
  },
};

export default nextConfig;
```

### Step 3: Update `app/page.tsx` with `quality={100}`, `unoptimized` on Marks, and High-DPI `sizes`
1. **Hero Device**:
   - Add `quality={100}`
   - Update `sizes="(max-width: 767px) 100vw, (max-width: 1280px) 100vw, 1200px"`
2. **Trusted Marks**:
   - Add `unoptimized` prop to `<Image>` to serve the clean trimmed PNGs directly without re-compression.
3. **MediaBand (`mountain.webp`)**:
   - Add `quality={100}`
   - Update `sizes="(max-width: 1280px) 100vw, 1200px"`
4. **Big Picture Feature (`cylinders.webp`)**:
   - Add `quality={100}`
   - Update `sizes="(max-width: 1023px) 100vw, (max-width: 1280px) 60vw, 700px"`
5. **Testimonial (`stones.webp`)**:
   - Add `quality={100}`
   - Update `sizes="(max-width: 1023px) 100vw, (max-width: 1280px) 70vw, 900px"` so that Next.js delivers high-resolution srcset buffers (`w=1080`, `w=1200`, `w=1920`) ensuring the center crop retains over 1000px of physical resolution on 2x/3x Retina screens.
6. **Map Your Success Feature (`aerial.webp`)**:
   - Add `quality={100}`
   - Update `sizes="(max-width: 1280px) 100vw, 1200px"`

---

## 4. Expected Impact

- `public/assets/ui/landing/*.webp`: Upgraded from `-quality 88` (compressed) to `-quality 100` (full fidelity master extraction).
- `next.config.ts`: Adds `images.qualities: [75, 100]`.
- `app/page.tsx`: Image quality upgraded to 100, sizes adjusted for Retina clarity, marks unoptimized.
- `docs/landing.md`: Records the 100% quality extraction commands and verification metrics.
- Zero visual regression in layout, geometry, typography, or accessibility.

---

## 5. Non-Goals

- Changing layout spacing, font sizes, colors, or DOM hierarchy.
- Adding client-side image canvas filters or heavy external libraries.
- Replacing the semantic HTML structure or GSAP motion hooks.

---

## 6. Verification & Checks

1. `npx tsc --noEmit` — clean exit 0.
2. `npm run lint` — clean exit 0.
3. `npm run build` — production Turbopack build succeeds with static generation (exit 0).
4. Visual verification and screenshot check:
   - Compare rendered `/` images against user screenshot `/home/gdk26/Pictures/Screenshots/Screenshot_20260820_222330.png` and master comps at 1280px, 800px, and 375px.
   - Confirm sharpness and lack of artifacts/blurriness across all sections.

---

## SKILLS USED

- `vercel-react-best-practices`: Next.js 16 `<Image>` optimization configuration, `sizes` calculations, `qualities` allowlist, and zero client footprint.
- `web-design-guidelines`: Accessibility compliance, preservation of image alt text, semantic HTML, and focus rings.
- `frontend-design`: Visual craft, pixel precision, fidelity matching reference comps, and aesthetic quality.
- `tailwind-design-system`: Ensuring no token violations or unintended style overrides.
- `tailwind-4-docs`: Verifying Tailwind v4 responsive and aspect ratio utilities.
- `requesting-code-review`: Dispatching subagent review following the two-stage code review loop.
- `receiving-code-review`: Rigorously evaluating and addressing code review feedback.
- `caveman-commit`: Formatting terse conventional commit message.
