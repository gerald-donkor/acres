import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `tailwind-merge` has to be told about the Acres scales.
 *
 * Out of the box it only knows Tailwind's default theme, so every NAMED token in
 * `app/globals.css` looks like an unknown class to it — and the failure is
 * silent and wrong, not loud. Two examples measured in the browser before this
 * was added:
 *
 *  - `cn("text-ui", "text-canvas")` dropped `text-ui`, because both look like
 *    `text-<color>` and the last one wins. The pill rendered at 15 px / 500
 *    (inherited body copy) instead of the measured 14 px / 600.
 *  - `cn("size-icon", "size-arrow")` kept BOTH, because neither parses as a size,
 *    so stylesheet order decided it. The button's ↗ rendered at 24 px instead of
 *    the measured 6 px of ink.
 *
 * Every list below is read off the `@theme` block; adding a token there means
 * adding it here. `brand` is deliberately absent from `text`: Tailwind resolves
 * `text-brand` to `--color-brand`, which makes `--text-brand` unreachable under
 * that name — a finding for step 3, recorded in docs/components.md §7.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "canvas",
        "ink",
        "ink-muted",
        "ink-faint",
        "rule",
        "rule-strong",
        "control",
        "brand",
        "brand-soft",
        "sage",
        "hover",
      ],
      text: [
        "hero",
        "hero-md",
        "hero-lg",
        "h2",
        "h2-md",
        "h2-lg",
        "quote",
        "h3",
        "stat",
        "title",
        "ui",
        "body",
        "label",
        "label-lg",
      ],
      spacing: ["pill-x", "pill-gap", "arrow", "icon", "target", "section"],
      radius: ["control", "card", "media"],
      container: ["page"],
      ease: ["acres"],
      shadow: ["card"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
