import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

import { Icon } from "./icon"

/**
 * The Acres pill, in the two variants the board draws (AGENTS.md §1.5).
 *
 * Geometry is measured on `ds-1.png` rows 1830–2360 and recorded in
 * docs/components.md §2: 48 px tall in all four states, a true pill, 23 px of
 * side padding on both variants, and a 6 × 6 `arrow_outward` on the primary set
 * 3 px after the label. That arrow is the ONLY difference between the two
 * widths — 126 − 117 = 9 = 3 + 6 — which is the arithmetic that proves the
 * variant is right.
 *
 * This does NOT wrap `client/components/ui/button.tsx`; it defines its own `cva` on the
 * same Base UI primitive. The installed component's largest size is 36 px and
 * its two hover rules produce neither of the board's, so wrapping it would mean
 * overriding height, radius, padding, type scale and both hovers through
 * `className`. See docs/components.md §4.
 */
/**
 * `arrow_outward`'s ink, in its own viewBox units — measured with `getBBox()` in
 * the browser and cross-checked against the SVG's trim box (514/960 = 0.5354,
 * matching a 257 px trim on a 480 px render).
 *
 * The comp sizes this mark by its INK (6 × 6), not by the 11.2 px Material
 * Symbols box it sits in. Cropping the viewBox to the ink is what makes the
 * drawn arrow and the laid-out box the same 6 px — which is what turns the
 * primary's width into 117 + 3 + 6 = 126.
 */
const ARROW_INK_VIEW_BOX = "200 -760 514 514"

const buttonVariants = cva(
  [
    "group/button inline-flex h-12 shrink-0 items-center justify-center rounded-full",
    "px-pill-x gap-pill-gap text-ui whitespace-nowrap select-none",
    "transition-colors duration-(--duration-fast) ease-acres",
    "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        // Both variants hover to the same sage — the board's pattern, and not a
        // darken-on-hover. The label goes black there rather than white:
        // white-on-sage is 2.93:1 and fails AA, black is 7.16:1
        // (docs/components.md §5, reference delta 1).
        primary: "bg-brand text-canvas hover:bg-hover hover:text-ink",
        secondary: "bg-brand-soft text-ink hover:bg-hover",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  }
)

function Button({
  className,
  variant = "primary",
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    >
      {children}
      {variant === "primary" ? (
        <Icon
          name="arrow_outward"
          data-icon="inline-end"
          viewBox={ARROW_INK_VIEW_BOX}
          className="size-arrow"
        />
      ) : null}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
