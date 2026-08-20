import type { Metadata } from "next";
import { Crimson_Text, DM_Sans, Roboto_Mono } from "next/font/google";

import { SiteFooter } from "@/components/acres/site-footer";
import { SiteHeader } from "@/components/acres/site-header";

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

export const metadata: Metadata = {
  title: "Acres — Browse everything.",
  description:
    "Acres turns regional data into decisions. Comprehensive analytics that reveal where growth is, and where it is going.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${crimsonText.variable} ${dmSans.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1 flex flex-col">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
