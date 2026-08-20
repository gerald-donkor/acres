import { Container } from "./container"
import { cn } from "@/lib/utils"

/**
 * The section shell: a `<section>` carrying the 120 px vertical rhythm and the
 * container.
 *
 * The rhythm is applied as top padding only, so that stacking sections produces
 * gaps of exactly 120 px rather than 240 (docs/design-system.md §3.3 measured
 * 119–120 at five rectangle-to-rectangle gaps on `Desktop.png`). It does not
 * scale — 120 px at 375, 800 and 1280 alike.
 *
 * `align` is a per-section decision, not a breakpoint behaviour: the hero,
 * "Why Choose Acres?" and "Connect with us" are centred at every width and
 * every other section is left-aligned (AGENTS.md §1.3).
 */
function Section({
  className,
  containerClassName,
  align = "start",
  children,
  ...props
}: React.ComponentProps<"section"> & {
  align?: "start" | "center"
  containerClassName?: string
}) {
  return (
    <section
      data-slot="section"
      data-align={align}
      className={cn("pt-section", className)}
      {...props}
    >
      <Container
        className={cn(align === "center" && "text-center", containerClassName)}
      >
        {children}
      </Container>
    </section>
  )
}

export { Section }
