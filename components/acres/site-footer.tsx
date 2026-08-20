import Link from "next/link"

import { Container } from "@/components/acres/container"
import { LogoMark } from "@/components/acres/logo-mark"
import { Rule } from "@/components/acres/rule"
import { cn } from "@/lib/utils"

const FOOTER_LINKS = [
  { href: "#benefits", label: "Benefits" },
  { href: "#specifications", label: "Specifications" },
  { href: "#how-to", label: "How-to" },
] as const

/**
 * SiteFooter renders the shared footer:
 * - 1 px hairline Rule spanning the Container
 * - Links: Benefits, Specifications, How-to (Contact Us is omitted in footer)
 * - Standalone Acres LogoMark and monospace legal lines (© Acres. 2025 / All Rights Reserved)
 */
function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("w-full pt-section", className)}>
      <Container>
        <Rule weight="hairline" />

        {/* Links */}
        <nav
          aria-label="Footer Navigation"
          className="pt-10 md:pt-14 flex flex-col md:flex-row md:items-center gap-6 md:gap-8"
        >
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-ui text-ink hover:text-brand transition-colors duration-(--duration-fast) ease-acres outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm w-fit"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Mark and Legal lines */}
        <div className="pt-16 md:pt-24 pb-10 flex items-end justify-between gap-4">
          <div className="flex items-end gap-6 md:gap-14">
            <LogoMark className="text-ink" />
            <span className="font-mono text-label lg:text-label-lg text-brand whitespace-nowrap">
              © Acres. 2025
            </span>
          </div>

          <span className="font-mono text-label lg:text-label-lg text-brand whitespace-nowrap text-right">
            All Rights Reserved
          </span>
        </div>
      </Container>
    </footer>
  )
}

export { SiteFooter }
