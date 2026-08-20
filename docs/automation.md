# Acres — Automation and Measurement Recipes

This file is the durable record of measurement tools, comp geometry, ImageMagick
recipes, and headless browser automation used across the Acres implementation.

---

## 1. Reference Comps and DPI Geometry

The four reference files in `public/assets/ui/` are 1:1 with CSS pixels at their stated widths:

| file | dimensions | notes |
| --- | --- | --- |
| `public/assets/ui/ref/acres-design-system.pdf` | 1260 × 8082.33 pt | One page, 72 dpi (`-r 72` → 1260 × 8083 px bitmap) |
| `public/assets/ui/landing-pages/Desktop.png` | 1280 × 7389 px | Desktop comp at 1280 CSS px |
| `public/assets/ui/landing-pages/Tablet.png` | 800 × 8825 px | Tablet comp at 800 CSS px |
| `public/assets/ui/landing-pages/Mobile.png` | 375 × 8833 px | Mobile comp at 375 CSS px |

---

## 2. ImageMagick and PDF Recipes

### 2.1 PDF Extraction

```bash
# Render the design-system board bitmap at 1:1 (72 dpi)
pdftoppm -png -r 72 public/assets/ui/ref/acres-design-system.pdf /tmp/ds # produces /tmp/ds-1.png

# Convert PDF directly to SVG vector paths
pdftocairo -svg public/assets/ui/ref/acres-design-system.pdf /tmp/ds.svg
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
