import type { Metadata, Viewport } from "next";
import { Crimson_Text, DM_Sans, Roboto_Mono } from "next/font/google";

import { SiteFooter } from "@/components/acres/site-footer";
import { SiteHeader } from "@/components/acres/site-header";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

import "./globals.css";

// The three faces identified in AGENTS.md §1.2 and scaled in
// docs/design-system.md §2. Crimson Text is NOT variable, so a weight array is
// required; only 400 is used anywhere on the comps.
const crimsonText = Crimson_Text({
  variable: "--font-crimson-text",
  subsets: ["latin"],
  weight: ["400"],
});

// Variable on wght (100-1000) and opsz (9-40). opsz is deliberately not pinned:
// font-optical-sizing defaults to auto, so the browser drives it from font-size,
// which is what the comps measure (docs/design-system.md §2.1).
const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
});

// The metadata surface, recorded in docs/polish.md. Every string here is either
// measured from the comps' own copy or read from client/lib/site.ts; nothing about the
// company — an author, a Twitter handle, a verification token — is invented
// (AGENTS.md §10 rule 6), so those fields are omitted rather than filled.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "regional data",
    "regional analytics",
    "data intelligence",
    "business intelligence",
    "growth reporting",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en",
    url: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
    },
  },
};

// themeColor moved out of `metadata` and into the `viewport` export in Next 14
// and is documented that way in the installed 16.3.1 docs
// (03-api-reference/04-functions/generate-viewport.md). It matches the one
// canvas of AGENTS.md §9.1 rule 4, and colorScheme states what globals.css
// states: Acres has no designed dark theme (docs/design-system.md §7.7).
export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${crimsonText.variable} ${dmSans.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/*
          The skip link. It is in no comp — it is a web-interface-guidelines
          requirement and it changes no measured pixel at rest, because it is
          parked above the viewport rather than hidden (docs/polish.md).

          It is moved with `top`, not with `sr-only`/`not-sr-only`: those two
          both set `position`, and which one wins inside the utilities layer is
          an ordering question rather than a class-order one.

          `z-[100]` is the one arbitrary value in this file. Tailwind 4 has no
          `--z-index-*` theme namespace to tokenise it into, and it has to clear
          the mobile navigation card's `z-50`.
        */}
        <a
          href="#main-content"
          className="fixed -top-20 left-4 z-[100] inline-flex h-12 items-center rounded-full bg-brand px-pill-x text-ui text-canvas outline-none focus-visible:top-4 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Skip to Main Content
        </a>
        <SiteHeader />
        {/*
          `tabIndex={-1}` is what makes the skip link's target focusable; without
          it focus stays on <body> and the next Tab returns to the top of the
          page. The `outline-none` is paired with a focus-visible replacement,
          never left bare (AGENTS.md §9.4 rule 1).
        */}
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 flex flex-col outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
