"use client"

import { useRef } from "react"
import Link from "next/link"

import {
  MOTION_CONDITIONS,
  gsap,
  readMotionTokens,
  useGSAP,
  withWillChange,
  type MotionConditions,
} from "@/lib/motion"

const NAV_LINKS = [
  { href: "#benefits", label: "Benefits" },
  { href: "#specifications", label: "Specifications" },
  { href: "#how-to", label: "How-to" },
  { href: "#contact", label: "Contact Us" },
] as const

/**
 * The floating, condensed nav pill shown once the full header (marked
 * `data-motion-header` in `site-header.tsx`) scrolls out of view at 800/1280
 * (prompts/15-scroll-condensed-navigation.md). `autoAlpha`, not `opacity`, is
 * deliberate here: this is a persistent, reversible toggle of a duplicate nav
 * — unlike the one-time reveals in `landing-motion.tsx`, hiding it must also
 * remove its links from the tab order (docs/motion.md).
 */
function CondensedNav() {
  const navRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const header = document.querySelector<HTMLElement>("[data-motion-header]")
      if (!header || !navRef.current) return

      const tokens = readMotionTokens()

      // Every condition named (AGENTS.md §9.3 rule 3), matching
      // `landing-motion.tsx`'s pattern: the trigger and the pill are both
      // `hidden` below `md`, so `wide` is required alongside `motionOK` —
      // without it, a mobile pageview still pays for a live ScrollTrigger
      // that can never do anything (its trigger and target are `display:
      // none`).
      gsap.matchMedia().add(MOTION_CONDITIONS, (context) => {
        const { wide, motionOK } = context.conditions as MotionConditions
        if (!wide || !motionOK) return

        gsap.to(
          navRef.current,
          withWillChange({
            autoAlpha: 1,
            y: 0,
            duration: tokens.base,
            ease: tokens.ease,
            scrollTrigger: {
              trigger: header,
              start: "bottom top",
              // `end: "max"` is GSAP's documented shorthand for "end of the
              // page", but it silently corrupts here (gsap 3.15.0,
              // node_modules/gsap/ScrollTrigger.js): `_parseClamp()` detects
              // a `clamp(...)` wrapper with `value.indexOf("max") > -1`, a
              // check broad enough to also match the literal special value
              // "max" itself, then strips it as `"max".substr(6, -4)` →
              // `""`. The empty result falls back to `parsedEndTrigger`'s
              // own `"100% 0"`, i.e. `end` collapses to ≈ `start`. Verified
              // by creating two ScrollTriggers side by side in the same
              // refresh tick: `end: "max"` measured `end ≈ 88` against a
              // real `ScrollTrigger.maxScroll(window)` of `6249` in the same
              // tick — not a timing artifact, a genuine mis-parse.
              // `endTrigger: document.body` + `end: "bottom bottom"` is the
              // equivalent, page-height-driven idiom that measured
              // correctly, so the pill stays visible for the rest of the
              // scroll rather than onEnter/onLeave firing back-to-back on
              // the same event (docs/motion.md §4.5).
              endTrigger: document.body,
              end: "bottom bottom",
              toggleActions: "play reverse play reverse",
            },
          })
        )
      })
    },
    { scope: navRef }
  )

  return (
    <nav
      ref={navRef}
      aria-label="Condensed Navigation"
      className="fixed top-5 left-1/2 -translate-x-1/2 z-50 hidden md:flex items-center gap-8 rounded-full bg-canvas/70 backdrop-blur-md shadow-card px-8 py-4 invisible opacity-0"
    >
      {NAV_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-ui text-ink hover:text-brand transition-colors duration-(--duration-fast) ease-acres outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring rounded-sm whitespace-nowrap"
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )
}

export { CondensedNav }
