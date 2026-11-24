import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";

import { siteUrl } from "@/lib/site";
import { getStorePageIds } from "@/lib/stores.server";

/**
 * The four fixed pages and every store page.
 *
 * Rendered per request so that a build never reads the database; the store
 * ids behind it are cached for a day, which costs a few hundred document
 * reads (`getStorePageIds`), not one per store. The list is one file: about
 * 13,800 URLs, well inside a sitemap's 50,000.
 */
export const dynamic = "force-dynamic";

const getCachedStorePageIds = unstable_cache(async () => getStorePageIds(), ["sitemap-store-ids"], {
  revalidate: 86_400,
});

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/map`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/log`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
  ];

  // A failed read is not cached, so the next fetch tries again; meanwhile a
  // sitemap of the fixed pages beats an error.
  let storeIds: string[] = [];
  try {
    storeIds = await getCachedStorePageIds();
  } catch (error) {
    console.error("[sitemap] store ids unavailable; listing the fixed pages only", error);
  }

  return [
    ...fixed,
    ...storeIds.map((id) => ({ url: `${base}/store/${id}`, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
