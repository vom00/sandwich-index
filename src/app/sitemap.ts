import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * The four fixed surfaces. Store pages are deliberately absent for now:
 * listing every synced store makes the sitemap a function of the database,
 * and that trade — crawl coverage against a Firestore read on every crawler
 * fetch — is worth deciding once a production domain exists, not before.
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
