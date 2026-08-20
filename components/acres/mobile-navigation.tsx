"use client"

import * as React from "react"
import Link from "next/link"

import { Button } from "@/components/acres/button"
import { Icon } from "@/components/acres/icon"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "#benefits", label: "Benefits" },
  { href: "#specifications", label: "Specifications" },
  { href: "#how-to", label: "How-to" },
  { href: "#contact", label: "Contact Us" },
] as const

/**
 * Mobile navigation disclosure card (375 px comp & board reference).
 *
 * Closed state: 78 px high white card with rounded-b-media (24 px) and --shadow-card.
 * Open state: 375 px wide, ~564 px tall overlay with 4 x 80 px link rows + CTA.
 */
function MobileNavigation({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false)

  // Close on Escape key
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && open) {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open])

  return (
    <div className={cn("block md:hidden relative z-50", className)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div
          className={cn(
            "w-full bg-canvas transition-[border-radius,box-shadow] duration-(--duration-base) ease-acres",
            open ? "rounded-none" : "rounded-b-media shadow-card"
          )}
        >
          <div className="h-[78px] px-5 flex items-center justify-between">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="text-wordmark text-ink font-sans outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm"
            >
              Acres
            </Link>

            <CollapsibleTrigger
              aria-label={open ? "Close navigation menu" : "Open navigation menu"}
              className="relative inline-flex size-11 items-center justify-center -mr-2.5 rounded-control text-ink hover:text-brand transition-colors duration-(--duration-fast) ease-acres outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Icon
                name={open ? "close" : "menu"}
                className="size-6 shrink-0"
              />
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent
          className={cn(
            "w-full bg-canvas rounded-b-media shadow-card overflow-hidden",
            "outline-none"
          )}
        >
          <nav aria-label="Mobile Navigation" className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <div
                key={link.href}
                className="h-20 border-t border-rule px-5 flex items-center"
              >
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="text-ui text-ink hover:text-brand transition-colors duration-(--duration-fast) ease-acres outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm py-2 block w-full"
                >
                  {link.label}
                </Link>
              </div>
            ))}

            <div className="px-5 pt-4 pb-8">
              <Button
                render={<Link href="#how-to" />}
                nativeButton={false}
                onClick={() => setOpen(false)}
                variant="primary"
              >
                Learn More
              </Button>
            </div>
          </nav>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

export { MobileNavigation }
