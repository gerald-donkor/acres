import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site"

/**
 * One route exists, so the sitemap has one entry. It is generated rather than
 * written as static XML so the origin comes from client/lib/site.ts and cannot drift
 * from metadataBase.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ]
}
