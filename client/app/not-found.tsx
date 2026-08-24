import Link from "next/link"

import { Button } from "@/components/acres/button"
import { Section } from "@/components/acres/section"
import { SiteFooter } from "@/components/acres/site-footer"
import { SiteHeader } from "@/components/acres/site-header"

/**
 * The 404 page.
 *
 * No comp draws one, so it is built from existing primitives and existing type
 * roles only — the `Section` shell, the centred alignment the hero and the two
 * centred sections already use, `text-h2` for the heading and `text-body` for
 * the line under it. No new token, no new variant, no new layout primitive
 * (prompts/07-polish-accessibility.md, reference delta 4).
 *
 * It is a Server Component. It renders inside the root layout, so it keeps the
 * nav and the footer rather than dropping the visitor outside Acres' chrome.
 *
 * Next 16 does not document a `metadata` export for `not-found.tsx`, so none is
 * written here: the root layout's title default applies (docs/polish.md).
 */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 flex flex-col outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Section align="center" className="pb-section">
          <h1 className="font-serif text-h2 text-ink text-balance md:text-h2-md lg:text-h2-lg">
            Page not found.
          </h1>
          <p className="mx-auto mt-7 max-w-[34rem] text-body text-ink-muted">
            That address is not part of <span translate="no">Acres</span>. The
            landing page is the way back.
          </p>
          <Button
            render={<Link href="/" />}
            nativeButton={false}
            variant="primary"
            className="mt-12"
          >
            Back to Home
          </Button>
        </Section>
      </main>
      <SiteFooter />
    </>
  )
}
