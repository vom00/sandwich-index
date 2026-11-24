import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * The four fixed surfaces. Store pages are deliberately absent for now: a
 * crawler that reads all ~13,800 of them once costs about 290,000 Firestore
 * reads (mostly each store's neighbour comparison), nearly six days of the
 * free tier. Caching store pages makes repeat visits cheap but not that first
 * pass. The version that lists every store is kept on the
 * `sitemap-all-stores` branch for when the reads are paid for or cheaper.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/map`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/log`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
