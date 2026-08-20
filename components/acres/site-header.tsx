import Link from "next/link"

import { Button } from "@/components/acres/button"
import { Container } from "@/components/acres/container"
import { MobileNavigation } from "@/components/acres/mobile-navigation"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "#benefits", label: "Benefits" },
  { href: "#specifications", label: "Specifications" },
  { href: "#how-to", label: "How-to" },
  { href: "#contact", label: "Contact Us" },
] as const

/**
 * SiteHeader renders the shared navigation chrome:
 * - Horizontal bar in Container at tablet (800 px) and desktop (1280 px).
 * - Closed/open mobile navigation card at mobile (375 px).
 */
function SiteHeader({ className }: { className?: string }) {
  return (
    <header className={cn("w-full", className)}>
      {/* Desktop and Tablet navigation */}
      <div className="hidden md:block py-5">
        <Container>
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="text-wordmark text-ink font-sans outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm"
            >
              Acres
            </Link>

            <nav aria-label="Main Navigation" className="flex items-center gap-8">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-ui text-ink hover:text-brand transition-colors duration-(--duration-fast) ease-acres outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <Button render={<Link href="#how-to" />} variant="primary">
              Learn More
            </Button>
          </div>
        </Container>
      </div>

      {/* Mobile navigation */}
      <MobileNavigation />
    </header>
  )
}

export { SiteHeader }
