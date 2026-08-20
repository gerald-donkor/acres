import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

import { Icon, type IconName } from "./icon"

/**
 * The board's carousel control: a 40 × 40 rounded square holding one 24 px
 * glyph, in an inactive and an active fill (`ds-1.png` rows 2156–2349).
 *
 * The 40 px fill is the measurement and it ships unchanged; the hit area is
 * pushed to 44 × 44 by a pseudo-element, so AGENTS.md §9.4 rule 5 holds without
 * moving the drawn box (docs/components.md §5, reference delta 4).
 *
 * Nothing in this step drives it — the carousel it belongs to is step 4's.
 */
const iconButtonVariants = cva(
  [
    "relative inline-flex size-10 shrink-0 items-center justify-center rounded-control",
    "text-ink select-none",
    "transition-colors duration-(--duration-fast) ease-acres",
    "outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-50",
    // The 44 px touch target, centred on the 40 px fill.
    "after:absolute after:-inset-0.5 after:rounded-control",
  ],
  {
    variants: {
      state: {
        inactive: "bg-control hover:bg-brand-soft",
        active: "bg-brand-soft",
      },
    },
    defaultVariants: {
      state: "inactive",
    },
  }
)

function IconButton({
  className,
  state = "inactive",
  icon,
  label,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof iconButtonVariants> & {
    icon: IconName
    /** Required: the control carries no visible text of its own. */
    label: string
  }) {
  return (
    <ButtonPrimitive
      data-slot="icon-button"
      aria-label={label}
      className={cn(iconButtonVariants({ state, className }))}
      {...props}
    >
      <Icon name={icon} />
    </ButtonPrimitive>
  )
}

export { IconButton, iconButtonVariants }
