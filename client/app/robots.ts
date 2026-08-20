import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site"

/**
 * Acres has one public route and nothing to hide from a crawler, so the rule is
 * a plain allow. The sitemap URL is absolute, which the Robots Exclusion
 * Standard requires.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
