import "server-only";

import { unstable_cache } from "next/cache";

import { getIndexSnapshot, type IndexSnapshot } from "@/lib/stores.server";

/**
 * The landing page's figures, cached.
 *
 * `getIndexSnapshot` reads both ends of the priced range (up to 250 stores
 * each) plus a count, so an uncached landing page cost about 500 document
 * reads per view, and twice that because the metadata asks too. On
 * Firestore's free tier (50,000 reads a day) that is a hundred visitors. The
 * figures only change when a price does, so they are cached for an hour and
 * dropped early by `refreshIndexSnapshot` whenever a price is recorded.
 *
 * Kept out of `stores.server` so scripts and tests that import the data layer
 * never load `next/cache`, which only works inside a Next.js server.
 */
export const INDEX_SNAPSHOT_TAG = "index-snapshot";

export const getCachedIndexSnapshot: (leaderLimit: number) => Promise<IndexSnapshot> = unstable_cache(
  async (leaderLimit: number) => getIndexSnapshot(undefined, leaderLimit),
  ["index-snapshot"],
  { revalidate: 3600, tags: [INDEX_SNAPSHOT_TAG] },
);
