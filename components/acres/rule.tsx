import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

/**
 * A horizontal rule, in the two weights the comps draw:
 *
 *  - `hairline` — 1 px `#E9E9E9`, above each feature-grid cell and around the
 *    comparison-table card;
 *  - `strong` — 1 px `#929292`, the ONE major section division, measured at
 *    `Desktop.png` row 3364 running the full container, x 40–1239
 *    (docs/design-system.md §1.2).
 *
 * It renders `Separator` rather than an `<hr>`, per the `shadcn` skill's rule.
 * That makes this the one primitive in the step whose subtree reaches a client
 * component — Base UI marks `Separator` `"use client"` even though it renders a
 * static `<div role="separator">`. It is a leaf and it takes no props from us
 * beyond a class, so it satisfies AGENTS.md §9.2 rule 2. See
 * docs/components.md §4.
 */
function Rule({
  className,
  weight = "hairline",
  ...props
}: React.ComponentProps<typeof Separator> & {
  weight?: "hairline" | "strong"
}) {
  return (
    <Separator
      data-weight={weight}
      className={cn(weight === "strong" ? "bg-rule-strong" : "bg-rule", className)}
      {...props}
    />
  )
}

export { Rule }
