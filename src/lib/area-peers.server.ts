import "server-only";

import { unstable_cache } from "next/cache";

import { getAreaPeers, type AreaPeer } from "@/lib/stores.server";

/**
 * A store page's neighbours, cached per geohash cell for an hour.
 *
 * Reading them on every view cost 150 to 300 documents in a city. Cached by
 * cell, the first view in an area pays that once an hour and every other
 * store in the cell shares it. The store's own price is still read fresh on
 * every view; only what it is compared against can be up to an hour old.
 *
 * Deliberately not tagged with the landing page's snapshot tag: every sync
 * that records a price drops that, and while an area fills that is every few
 * seconds, which would put the reads straight back.
 *
 * Kept out of `stores.server` for the same reason as `index-snapshot.server`:
 * scripts and tests that import the data layer must not load `next/cache`.
 */
export const getCachedAreaPeers: (cell: string) => Promise<AreaPeer[]> = unstable_cache(
  async (cell: string) => getAreaPeers(cell),
  ["area-peers"],
  { revalidate: 3600 },
);
