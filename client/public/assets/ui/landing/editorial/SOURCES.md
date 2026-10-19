# Landing photography

## Current contextual photograph — Prompt 401

The current `/` uses only `prampram-context.webp`. The three Prompt 399 assets
below are retained for history and are unused by the landing page. Visible
photographer/location captions remain removed under Prompt 400.

- Photographer: [The Artboard](https://unsplash.com/@theartboardgh).
- Publisher: [Prampram inner township, Ghana](https://unsplash.com/photos/an-aerial-view-of-a-city-with-lots-of-houses-VouIExnbUzc).
- Publisher metadata and [Unsplash License](https://unsplash.com/license)
  rechecked 2026-10-19. The page identifies this as a free-license photo.
- Download: `https://images.unsplash.com/photo-1636783187647-cc97111bffdc?fm=jpg&q=85&w=1400&fit=max`.
- Measured rendition: 1400 × 786, 352299 bytes; decoded and visually inspected.
- Local WebP: 1400 × 786, **223752 bytes**. No enlargement, colour filter,
  sharpening or generative modification. ImageMagick processing:
  `magick prampram-download.jpg -strip -quality 80 prampram-context.webp`.

The photograph supplies geographic context alongside explicitly invented canopy
figures. It is not their measurement source. The wide 16:9 reserved box keeps
houses, roads and green land legible with a near-native centered crop at all
widths. `next/image` serves a local path, permitted quality 100 and responsive
`sizes`; it uses default lazy loading without preload or forced high priority.
The native comparison and heading carry the hero.

## Retired photographic composition — Prompt 399

Selected and source/licence pages accessed 2026-10-19 for approved prompt 399.
All three individual photo pages explicitly identify the free Unsplash License;
none is an Unsplash+ asset. The [publisher’s licence](https://unsplash.com/license)
permits downloading, modification, local distribution and commercial website use
without mandatory attribution. Credits are retained in this manifest; visible
photo captions were removed at the user's request in prompt 400.
These are editorial illustrations of regional context, not Acres customers,
properties for sale, product screenshots or live datasets.

| Local asset                   | Photographer                                          | Original publisher page                                | Verified subject/location                 |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------- |
| `melbourne-neighborhood.webp` | [Tom Rumble](https://unsplash.com/@tomrumble)         | [7lvzopTxjOU](https://unsplash.com/photos/7lvzopTxjOU) | Residential streets, Melbourne, Australia |
| `ladenburg-fields.webp`       | [Bernd Dittrich](https://unsplash.com/@hdbernd)       | [3FeutXJdruk](https://unsplash.com/photos/3FeutXJdruk) | Cultivated fields, Ladenburg, Germany     |
| `espoo-road.webp`             | [Julius Jansson](https://unsplash.com/@juliusjansson) | [iBjO3rbIHtg](https://unsplash.com/photos/iBjO3rbIHtg) | Länsiväylä highway, Espoo, Finland        |

## Acquisition and processing

Publisher-hosted image URLs downloaded, rather than search thumbnails:

- City: `https://images.unsplash.com/photo-1524813686514-a57563d77965?fm=jpg&q=90&w=2400&fit=max`
- Fields: `https://images.unsplash.com/photo-1720155390935-f49e18525eb9?fm=jpg&q=85&w=1800&fit=max`
- Road: `https://images.unsplash.com/photo-1567792213673-cdf2c27dbde2?fm=jpg&q=90&w=2200&fit=max`

These are sized publisher renditions, not a claim about original camera-file
resolution. The downloads were visually inspected before selection. ImageMagick
resized them without enlargement, stripped metadata and encoded WebP. No colour
filter, generative modification or sharpening was applied.

| Asset  | Download dimensions | Local dimensions | Actual bytes | Conversion                         |
| ------ | ------------------- | ---------------- | -----------: | ---------------------------------- |
| City   | 2400 × 1350         | 2200 × 1238      |       458390 | `-resize 2200x -strip -quality 78` |
| Fields | 1800 × 1222         | 1200 × 815       |       301724 | `-resize 1200x -strip -quality 78` |
| Road   | 2200 × 2936         | 1440 × 1922      |       267030 | `-resize 1440x -strip -quality 80` |

The retired composition used `object-fit: cover; object-position: center` deliberately: the
central junction anchors the street grid, the farm-road intersection remains
visible in the narrow field crop, and the highway remains central in both the
wide and portrait road crops.
That composition reserved each image box and served local paths through `next/image`,
with the existing permitted quality 100 to avoid unnecessary second-generation
loss; only the first hero photo is eager/high priority. Other photos are lazy.
The source-file budgets (roughly 500KB hero, 350KB supporting) are met.
