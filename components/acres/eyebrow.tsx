import { cn } from "@/lib/utils"

/**
 * The monospace label above a section heading — `Benefits`, `Specs`.
 *
 * Three things about it are measured and all three are easy to lose
 * (`Desktop.png` crops 700x120+30+1180 and 1240x210+20+3320):
 *
 *  - it is SENTENCE CASE, not uppercase;
 *  - it is not letter-spaced — `--text-label` carries `letter-spacing: 0em`,
 *    and docs/design-system.md §2.4 records the monospace as the one style on
 *    the page set at exactly zero;
 *  - its alignment is INHERITED. `Benefits` is left-aligned and `Specs` is
 *    centred, because centring is a per-section decision (AGENTS.md §1.3), so
 *    this component must not fix either.
 *
 * It steps once, 11 px → 12 px, and it steps at `lg` (1024) rather than `md`.
 * That is a correction to prompts/02-primitives.md, which named `md` while its
 * own breakpoint table asked for 11 px at 800: the eyebrow's `Benefits` ink
 * measures 50 x 9 on `Tablet.png` and 55 x 9 on `Desktop.png` (50/55 = 0.909,
 * against 11/12 = 0.917), so the step happens somewhere in 801-1280 and `lg`
 * is the default breakpoint inside that window. docs/design-system.md §7.3's
 * `md` judgement is about the gutter and the nav, whose change was measured
 * between 375 and 800 — a different window, and a different answer. No custom
 * breakpoint is added either way. docs/components.md §5, delta 5.
 *
 * It is the only primitive in this step that changes with the breakpoint.
 */
function Eyebrow({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="eyebrow"
      className={cn("font-mono text-label text-brand lg:text-label-lg", className)}
      {...props}
    />
  )
}

export { Eyebrow }
