import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { CustomEase } from "gsap/CustomEase"
import { ScrollTrigger } from "gsap/ScrollTrigger"

/**
 * The one place GSAP is configured for Acres.
 *
 * Registration happens here, at module scope, exactly once (AGENTS.md §9.3
 * rule 2). This module has no `"use client"` of its own — it is a plain module
 * that only a client leaf imports, which keeps the GSAP bundle on the one route
 * that animates and keeps `client/app/page.tsx` a Server Component.
 *
 * `useGSAP` is itself a plugin and has to be registered alongside the two real
 * ones, which is what the @gsap/react README and the gsap-react skill both say.
 *
 * Everything below reads its value from a CSS custom property in
 * `client/app/globals.css`. Not one duration, easing curve or distance is restated at
 * a call site (AGENTS.md §9.1 rule 1, §9.3 rule 1).
 */
gsap.registerPlugin(useGSAP, ScrollTrigger, CustomEase)

/**
 * The one shared ScrollTrigger `start`, used by every reveal on the page.
 *
 * JUDGEMENT, not a measurement — the three comps are static and contain no
 * trigger evidence whatsoever (docs/motion.md §3). `top 85%` fires when the
 * top of a group crosses the lower 15 % of the viewport: late enough that the
 * reveal reads as a response to scrolling, early enough that nothing has to be
 * waited for once it is on screen.
 */
export const REVEAL_START = "top 85%"

/**
 * Scale judgements, defined once so no tween restates one.
 *
 * Translation plus opacity is the default everywhere; scale is reserved for
 * media entrance and for press feedback. Cards and buttons rest at 1 and never
 * grow on hover.
 */
export const MEDIA_SCALE_FROM = 1.02
export const PRESS_SCALE = 0.98
export const REST_SCALE = 1

/**
 * Every media condition, named. A lone `prefers-reduced-motion: reduce` query
 * never fires for anyone else and the animation then silently never runs, so
 * `motionOK` is named explicitly and the handler branches on both
 * (AGENTS.md §9.3 rule 3).
 */
export const MOTION_CONDITIONS = {
  compact: "(max-width: 767px)",
  wide: "(min-width: 768px)",
  reduceMotion: "(prefers-reduced-motion: reduce)",
  motionOK: "(prefers-reduced-motion: no-preference)",
  finePointer: "(hover: hover) and (pointer: fine)",
} as const

export type MotionConditions = Record<keyof typeof MOTION_CONDITIONS, boolean>

export type MotionTokens = {
  /** `--duration-fast`, in GSAP seconds. Hover, press, tight staggers. */
  fast: number
  /** `--duration-base`, in GSAP seconds. Every reveal. */
  base: number
  /** `--duration-slow`, in GSAP seconds. The hero entrance only. */
  slow: number
  /** `--ease-acres`, as a GSAP ease. The only easing on the site. */
  ease: gsap.EaseFunction
  /** `--motion-reveal-distance`, in px. */
  revealY: number
  /** `--motion-lift-distance`, in px. */
  liftY: number
}

const EASE_ID = "acres"

let cached: MotionTokens | null = null

function read(style: CSSStyleDeclaration, name: string) {
  const value = style.getPropertyValue(name).trim()
  if (!value) {
    throw new Error(
      `Acres motion: ${name} is not defined on :root. Motion tokens live in client/app/globals.css and are recorded in docs/design-system.md §5.`
    )
  }
  return value
}

/** `150ms` or `0.15s` → GSAP's seconds. CSS may serialise either. */
function toSeconds(name: string, value: string) {
  const amount = Number.parseFloat(value)
  if (Number.isNaN(amount)) {
    throw new Error(`Acres motion: ${name} is not a CSS time (got "${value}").`)
  }
  return value.endsWith("ms") ? amount / 1000 : amount
}

function toPixels(name: string, value: string) {
  const amount = Number.parseFloat(value)
  if (Number.isNaN(amount)) {
    throw new Error(`Acres motion: ${name} is not a CSS length (got "${value}").`)
  }
  return amount
}

/**
 * GSAP does NOT understand a CSS `cubic-bezier()` string. Verified in this
 * session against gsap 3.15.0: `ease: "cubic-bezier(0.22, 1, 0.36, 1)"` is not
 * rejected, it silently falls back to the default `power1.out` — a tween at
 * progress 0.5 returned 0.75 (power1.out) rather than the 0.961 the curve
 * gives. A silent wrong ease is exactly what AGENTS.md §10 rule 2 exists to
 * stop, so the four control points are parsed out of the token and handed to
 * CustomEase, which returns 0.961309 at 0.5.
 */
function toEase(name: string, value: string) {
  const points = value
    .replace(/^cubic-bezier\(/, "")
    .replace(/\)$/, "")
    .split(",")
    .map((point) => point.trim())

  if (points.length !== 4 || points.some((point) => Number.isNaN(Number(point)))) {
    throw new Error(
      `Acres motion: ${name} must be a four-point cubic-bezier() (got "${value}").`
    )
  }

  return CustomEase.create(EASE_ID, points.join(","))
}

/**
 * Read the motion tokens off `:root` once, and hand back GSAP-shaped values.
 *
 * Client-only: it touches `getComputedStyle`. Call it from inside `useGSAP`,
 * never at module scope.
 */
export function readMotionTokens(): MotionTokens {
  if (cached) return cached

  const style = getComputedStyle(document.documentElement)

  cached = {
    fast: toSeconds("--duration-fast", read(style, "--duration-fast")),
    base: toSeconds("--duration-base", read(style, "--duration-base")),
    slow: toSeconds("--duration-slow", read(style, "--duration-slow")),
    ease: toEase("--ease-acres", read(style, "--ease-acres")),
    revealY: toPixels(
      "--motion-reveal-distance",
      read(style, "--motion-reveal-distance")
    ),
    liftY: toPixels(
      "--motion-lift-distance",
      read(style, "--motion-lift-distance")
    ),
  }

  return cached
}

/**
 * A stagger whose TOTAL spread is a token, not whose per-item step is.
 *
 * `{ amount }` divides the spread across however many items there are, so a
 * six-mark row and a three-step row both finish in the same tokenised window
 * and no group can grow itself a long tail by gaining items.
 */
export function staggerOver(total: number) {
  return { amount: total, from: "start" as const }
}

/**
 * `will-change` for the duration of the tween and not one frame longer.
 *
 * Applying it permanently to every reveal target is the documented way to make
 * a page slower rather than faster, so it goes on at `onStart` and is removed
 * at `onComplete`. `onReverseComplete` gets the same cleanup: GSAP fires
 * `onComplete` only on a forward finish, never on a `.reverse()` finish
 * (`CondensedNav`'s `toggleActions: "play reverse play reverse"` is the one
 * consumer that actually reverses) — without this, `will-change` would stick
 * indefinitely on an element that toggles hidden/shown by scrolling back up.
 */
export function withWillChange<T extends gsap.TweenVars>(vars: T): T {
  return {
    ...vars,
    onStart(this: gsap.core.Tween) {
      gsap.set(this.targets(), { willChange: "transform, opacity" })
    },
    onComplete(this: gsap.core.Tween) {
      gsap.set(this.targets(), { clearProps: "willChange" })
    },
    onReverseComplete(this: gsap.core.Tween) {
      gsap.set(this.targets(), { clearProps: "willChange" })
    },
  }
}

export { gsap, ScrollTrigger, useGSAP }
