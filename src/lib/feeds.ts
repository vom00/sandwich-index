/**
 * Price feeds: sources of McChicken prices that are not visitors.
 *
 * A feed is somebody else's observation of what a store charges — a licensed
 * dataset, a vendor export — and every price it supplies is shown with its
 * name and the date it was observed. That labelling is the whole point. A
 * visitor can judge "MenuPriceTracker saw $2.49 in August" for themselves; an
 * unlabelled $2.49 asks them to trust a number nobody can account for.
 *
 * A feed has to be declared here before anything it supplies can be imported,
 * and the declaration has to say what permission we hold to republish it. See
 * research/price-sources.md for why that question is the hard part.
 */

export interface FeedDefinition {
  /** Stable id, stored on every observation. Never rename one in place. */
  id: string;
  /** What the UI calls it. */
  name: string;
  homepage: string;
  /**
   * How the feed gets its numbers, as a phrase that completes "Observed by
   * {name}, {method}" — shown to visitors so they can weigh it.
   */
  method: string;
  /**
   * The permission held to republish this feed's prices, or null for none.
   *
   * Null is not a formality. The import script refuses to write an unlicensed
   * feed anywhere but the local emulator, so a feed cannot reach real visitors
   * until someone records here what allows it to.
   */
  licence: string | null;
}

export const FEEDS: Readonly<Record<string, FeedDefinition>> = {
  menupricetracker: {
    id: "menupricetracker",
    name: "MenuPriceTracker",
    homepage: "https://menupricetracker.com",
    method: "read from the McDonald's app",
    // No licence. Its pages are usable as a one-store spot-check; republishing
    // them in bulk is not ours to decide. The inquiry email is drafted in
    // research/price-sources.md.
    licence: null,
  },
};

/**
 * True once any feed is licensed, and so able to reach real visitors.
 *
 * The site's copy promises that every price was paid by the person who
 * submitted it. That promise holds exactly as long as no feed can be imported
 * to production, so the copy is keyed off this rather than off somebody
 * remembering to edit three files on the day a licence arrives.
 */
export const HAS_LICENSED_FEED = Object.values(FEEDS).some((feed) => feed.licence !== null);

export function feedById(id: string): FeedDefinition | null {
  return Object.hasOwn(FEEDS, id) ? (FEEDS[id] ?? null) : null;
}

/** For display. An observation from a feed since removed still needs a name. */
export function feedName(id: string): string {
  return feedById(id)?.name ?? "a price feed";
}
