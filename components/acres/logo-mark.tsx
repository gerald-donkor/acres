import { cn } from "@/lib/utils"

/**
 * The standalone Acres logo mark, extracted from the design system PDF vector.
 *
 * Measured at 31.75 × 70 px (ds-1.png y=1528.875–1598.867, x=20.051–51.797).
 * Rendered in currentColor with a 0 0 31.75 70 viewBox.
 */
function LogoMark({
  className,
  title,
  ...props
}: React.ComponentProps<"svg"> & { title?: string }) {
  return (
    <svg
      data-slot="logo-mark"
      viewBox="0 0 31.75 70"
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("h-[70px] w-[31.75px] shrink-0", className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path d="M22.3359 21.5859L31.7461 32.6719L27.9219 35.9062L22.3359 29.3086V44.9961H24.8359V69.9922H19.8359V44.9961H17.3359V14.9961H22.3359V21.5859ZM12.4219 44.9961L7.83594 69.9922H2.75L7.33594 44.9961H12.4219ZM4.67578 35.8828L0 34.1094L7.22266 14.9961H12.5742L4.67578 35.8828ZM17.3359 9.94922H12.3359V0H17.3359V9.94922Z" />
    </svg>
  )
}

export { LogoMark }
