import Link from "next/link"

import { Button } from "@/components/acres/button"
import { CondensedNav } from "@/components/acres/condensed-nav"
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
    // `sticky top-0` lives on `<header>`, not on MobileNavigation's own
    // wrapper: a sticky element is bounded by its containing block, and that
    // inner div's containing block (this header) is only ~78px tall — no room
    // for the sticky travel range, so the card would just scroll away with
    // the page. `<header>`'s own containing block is `<body>`, which spans
    // the full page height. `md:static` resets this at 768px+, where the full
    // bar scrolling out of view is exactly what `CondensedNav` (§"the scroll
    // trigger") depends on via `data-motion-header`.
    //
    // `has-[[data-open]]:static` resets it back at mobile too, while the
    // disclosure is open: Base UI's `CollapsiblePanel` stamps `data-open` on
    // itself when expanded (`mobile-navigation.tsx`'s `CollapsibleContent`),
    // and the open panel renders in normal document flow inside this same
    // `<header>`, growing its box to ~490px. Left sticky, that whole block —
    // not just the closed 78px card — would pin to the viewport top while
    // scrolling, covering most of a phone screen; that contradicts
    // docs/chrome.md §4 delta #4 ("preserves document layout of the
    // underlying page") and was never evidenced in any recording (the open
    // menu is never shown mid-scroll in rec-flows/). `:has()` gives this
    // strictly higher specificity than the bare `sticky`, so it wins
    // regardless of utility generation order.
    <header
      className={cn(
        "w-full sticky top-0 z-50 has-[[data-open]]:static md:static md:z-auto",
        className
      )}
    >
      {/* Desktop and Tablet navigation */}
      <div data-motion-header className="hidden md:block py-5">
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

            <Button
              render={<Link href="#how-to" />}
              nativeButton={false}
              variant="primary"
            >
              Learn More
            </Button>
          </div>
        </Container>
      </div>
      <CondensedNav />

      {/* Mobile navigation */}
      <MobileNavigation />
    </header>
  )
}

export { SiteHeader }
