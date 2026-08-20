import { cn } from "@/lib/utils"

/**
 * The one container every section sits in, including the full-bleed-looking
 * photographs (AGENTS.md §1.3).
 *
 * The measured rule is `min(100vw − 2 × gutter, 1200px)` applied to the CONTENT
 * — 375/16/343, 800/40/720, 1280/40/1200 (docs/design-system.md §3.1). That is
 * why the gutter and the cap sit on two different elements: with both on one
 * border-box element, `max-w-page` would cap the padding box and leave 1120 of
 * content at 1280. Measured in the browser before it was split; see
 * docs/components.md §2.4.
 *
 * The gutter steps at `md`, which is the breakpoint docs/design-system.md §7.3
 * measured — the gutter and the nav change together somewhere in 376–800.
 */
function Container({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="container"
      className={cn("w-full px-4 md:px-10", className)}
      {...props}
    >
      <div className="mx-auto w-full max-w-page">{children}</div>
    </div>
  )
}

export { Container }
