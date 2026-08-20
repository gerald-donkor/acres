import { cn } from "@/lib/utils"

import { ICON_VIEW_BOX, iconPaths, type IconName } from "./icon-paths"

/**
 * A Material Symbol, filled, at 24 px.
 *
 * The set and the size are both measured, not chosen: docs/design-system.md §6
 * records the eight board glyphs and the 24 px box, and docs/components.md §3
 * records the three this step added. Path data comes from
 * `@material-symbols/svg-400` through the generated `icon-paths.ts`, so nothing
 * here is transcribed by hand.
 *
 * The glyph is drawn in `currentColor`, so colour is inherited from the caller
 * and never set here. It is `aria-hidden` by default — every icon in the comps
 * sits beside a text label that already carries the meaning (AGENTS.md §9.4
 * rule 4). Pass a `title` when an icon genuinely stands alone.
 *
 * `viewBox` is overridable for the one case where the comp sizes a glyph by its
 * INK rather than by its box — the pill's ↗, which measures 6 × 6 of ink inside
 * an 11.2 px Material Symbols box. See `button.tsx`.
 */
function Icon({
  name,
  title,
  className,
  viewBox = ICON_VIEW_BOX,
  ...props
}: React.ComponentProps<"svg"> & { name: IconName; title?: string }) {
  return (
    <svg
      data-slot="icon"
      viewBox={viewBox}
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("size-icon shrink-0", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d={iconPaths[name]} />
    </svg>
  )
}

export { Icon, type IconName }
