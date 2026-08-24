"use client"

import { useRef } from "react"

import {
  MEDIA_SCALE_FROM,
  MOTION_CONDITIONS,
  PRESS_SCALE,
  REST_SCALE,
  REVEAL_START,
  gsap,
  readMotionTokens,
  staggerOver,
  useGSAP,
  withWillChange,
  type MotionConditions,
} from "@/lib/motion"

/**
 * The landing page's motion layer, and the only client module on `/`.
 *
 * It takes the whole server-rendered landing subtree as `children` and renders
 * nothing of its own: the wrapper is `display: contents`, so it has no box and
 * cannot move a single measured pixel of docs/landing.md's geometry. Every
 * heading, image, table row and button above it stays a Server Component
 * (AGENTS.md §9.2 rules 1 and 2).
 *
 * Targets are addressed only through `data-motion-*` attributes authored on the
 * server markup. No selector here touches a Tailwind class, a tag name used for
 * styling, or a typography token — a class rename must never silently kill an
 * animation.
 *
 * The hooks, and the whole vocabulary:
 *
 * - `data-motion-hero-heading` / `data-motion-hero-media` — the two beats of the
 *   one page-load timeline.
 * - `data-motion-group` — a scroll-revealed group. Its `data-motion-item`
 *   descendants reveal together on one trigger, in DOM order.
 * - `data-motion-pace="tight"` — that group spreads over `--duration-fast`
 *   instead of `--duration-base`. Used for heading/copy/action sequences and
 *   the trusted-by row.
 * - `data-motion-media` — a large photograph. Its own trigger, and the only
 *   place scale appears in a reveal.
 * - `data-motion-card` — a benefit article. Fine-pointer hover lift only; it
 *   gains no interactive semantics, because it performs no action.
 * - `[data-slot="button"]` — the existing pill, for hover lift and press.
 */
function LandingMotion({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    (_context, contextSafe) => {
      const el = root.current
      if (!el || !contextSafe) return

      const tokens = readMotionTokens()
      const mm = gsap.matchMedia()

      mm.add(
        MOTION_CONDITIONS,
        (context) => {
          const { reduceMotion, motionOK, finePointer } =
            context.conditions as MotionConditions

          const everyTarget = gsap.utils.toArray<HTMLElement>(
            el.querySelectorAll(
              "[data-motion-hero-heading], [data-motion-hero-media], [data-motion-item], [data-motion-media], [data-motion-card], [data-slot='button']"
            )
          )

          // Reduced motion: no entrance, no scroll reveal, no hover, no press.
          // The server markup is already the visible rest state, so there is
          // nothing to reveal — only any inline style a previous branch left
          // behind to strip. `motionOK` is required rather than merely
          // `!reduceMotion` so that a browser reporting neither gets the static
          // page instead of an animation nobody asked for.
          if (reduceMotion || !motionOK) {
            gsap.set(everyTarget, { clearProps: "all" })
            return
          }

          // -- page load -------------------------------------------------------
          // One timeline, defaults from the tokens, and the overlap expressed as
          // a position parameter rather than a delay (AGENTS.md §9.3 rule 1).
          const heroHeading = el.querySelectorAll("[data-motion-hero-heading]")
          const heroMedia = el.querySelectorAll("[data-motion-hero-media]")

          if (heroHeading.length > 0 && heroMedia.length > 0) {
            gsap
              .timeline({ defaults: { duration: tokens.slow, ease: tokens.ease } })
              .from(
                heroHeading,
                withWillChange({ autoAlpha: 0, y: tokens.revealY })
              )
              .from(
                heroMedia,
                withWillChange({
                  autoAlpha: 0,
                  y: tokens.revealY,
                  scale: MEDIA_SCALE_FROM,
                }),
                `<${tokens.base}`
              )
          }

          // -- scroll reveals --------------------------------------------------
          // One query in document order, so the triggers are created top to
          // bottom and refresh in page order without needing refreshPriority.
          // Each is a top-level tween — never a child of a timeline — and each
          // is `once: true`, so nothing reverses, re-plays or scrubs.
          const scrollRoots = gsap.utils.toArray<HTMLElement>(
            el.querySelectorAll("[data-motion-group], [data-motion-media]")
          )

          scrollRoots.forEach((node) => {
            const scrollTrigger = {
              trigger: node,
              start: REVEAL_START,
              once: true,
            }

            if (node.hasAttribute("data-motion-media")) {
              gsap.from(
                node,
                withWillChange({
                  autoAlpha: 0,
                  y: tokens.revealY,
                  scale: MEDIA_SCALE_FROM,
                  duration: tokens.base,
                  ease: tokens.ease,
                  scrollTrigger,
                })
              )
              return
            }

            // Groups may nest — the Big Picture rows sit inside the Big Picture
            // heading group, and the comparison table sits inside the Specs
            // group. An item belongs to its NEAREST group and to no other, so a
            // row never reveals twice.
            const items = gsap.utils
              .toArray<HTMLElement>(node.querySelectorAll("[data-motion-item]"))
              .filter((item) => item.closest("[data-motion-group]") === node)

            if (items.length === 0) return

            // `opacity`, deliberately, and NOT `autoAlpha` — a group can hold a
            // pill, and `autoAlpha` sets `visibility: hidden`, which takes a
            // focusable element OUT of the tab order entirely. Measured before
            // this line existed: a keyboard user tabbing down the built page
            // went header → the two scroller regions → footer and never reached
            // any of the visible CTA links on the first
            // pass (WCAG 2.1.1). At `opacity: 0` the control stays tabbable,
            // focusing it scrolls it into view, and that scroll is what fires
            // its own reveal. `autoAlpha` is kept for the hero and the
            // photographs, which contain nothing focusable.
            gsap.from(
              items,
              withWillChange({
                opacity: 0,
                y: tokens.revealY,
                duration: tokens.base,
                ease: tokens.ease,
                stagger: staggerOver(
                  node.dataset.motionPace === "tight" ? tokens.fast : tokens.base
                ),
                scrollTrigger,
              })
            )
          })

          // -- hover and press -------------------------------------------------
          // Only under a real fine pointer. Touch keeps the CSS colour hovers
          // Tailwind 4 already gates on input capability and gains no transform.
          if (!finePointer) return

          const lift = contextSafe((target: HTMLElement) => {
            gsap.to(target, {
              y: -tokens.liftY,
              scale: REST_SCALE,
              duration: tokens.fast,
              ease: tokens.ease,
              overwrite: "auto",
            })
          })

          const settle = contextSafe((target: HTMLElement) => {
            gsap.to(target, {
              y: 0,
              scale: REST_SCALE,
              duration: tokens.fast,
              ease: tokens.ease,
              overwrite: "auto",
            })
          })

          const press = contextSafe((target: HTMLElement) => {
            gsap.to(target, {
              scale: PRESS_SCALE,
              duration: tokens.fast,
              ease: tokens.ease,
              overwrite: "auto",
            })
          })

          const bindings: [HTMLElement, string, EventListener][] = []

          const bind = (
            target: HTMLElement,
            type: string,
            handler: EventListener
          ) => {
            target.addEventListener(type, handler)
            bindings.push([target, type, handler])
          }

          const enter = (event: Event) => lift(event.currentTarget as HTMLElement)
          const leave = (event: Event) =>
            settle(event.currentTarget as HTMLElement)
          const down = (event: Event) => press(event.currentTarget as HTMLElement)
          const up = (event: Event) => lift(event.currentTarget as HTMLElement)

          gsap.utils
            .toArray<HTMLElement>(el.querySelectorAll("[data-slot='button']"))
            .forEach((button) => {
              bind(button, "pointerenter", enter)
              bind(button, "pointerleave", leave)
              bind(button, "pointerdown", down)
              bind(button, "pointerup", up)
              bind(button, "pointercancel", leave)
            })

          // The card lifts, and its icon rides along inside it. Nothing here
          // adds a cursor, a focus state, a shadow or link semantics — the
          // response is visual depth, not an affordance for an action the card
          // does not perform.
          gsap.utils
            .toArray<HTMLElement>(el.querySelectorAll("[data-motion-card]"))
            .forEach((card) => {
              bind(card, "pointerenter", enter)
              bind(card, "pointerleave", leave)
              bind(card, "pointercancel", leave)
            })

          return () => {
            bindings.forEach(([target, type, handler]) =>
              target.removeEventListener(type, handler)
            )
          }
        },
        el
      )

      return () => {
        mm.revert()
      }
    },
    { scope: root }
  )

  return (
    <div ref={root} data-slot="landing-motion" className="contents">
      {children}
    </div>
  )
}

export { LandingMotion }
