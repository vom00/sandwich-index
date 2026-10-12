/**
 * Price feeds: sources of McChicken prices that are not visitors.
 *
 * A feed is somebody else's record of what a store charges — a licensed
 * dataset, a vendor export, a public tracker — and every price it supplies is
 * shown with its name and a date. That labelling is the whole point. A visitor
 * can judge "MenuPriceTracker lists $2.49" for themselves; an unlabelled $2.49
 * asks them to trust a number nobody can account for.
 *
 * A feed has to be declared here before anything it supplies can be imported,
 * and the declaration has to say on what basis we show it: a licence, or the
 * owner's dated decision to show it without one. See research/price-sources.md
 * for why that question is the hard part.
 */

export interface UnlicensedUse {
  /** ISO date the owner decided this. */
  decidedOn: string;
  /** Why, and what would end it. Shown in the import script's output. */
  note: string;
}

export interface FeedDefinition {
  /** Stable id, stored on every observation. Never rename one in place. */
  id: string;
  /** What the UI calls it. */
  name: string;
  homepage: string;
  /**
   * Where the feed says its numbers come from, as a phrase that completes
   * "Listed by {name}, {method}" — shown to visitors so they can weigh it.
   */
  method: string;
  /**
   * What the date on this feed's prices means, as the verb in "checked 3 days
   * ago". "observed" when the feed says when it saw each price; "checked" when
   * the only honest date is the day we read the feed's page.
   */
  dateVerb: string;
  /** The licence held to republish this feed's prices, or null for none. */
  licence: string | null;
  /**
   * The owner's decision to show this feed without a licence, or null.
   *
   * This turns the site's copy over to describing the feed, so the pages stay
   * true once its prices are in the database. It does not open the import
   * script's guard: that still refuses to write any feed without a licence
   * anywhere but the local emulator. Loosening it for a real Firebase project
   * is a separate change, to be made on purpose.
   */
  unlicensedUse: UnlicensedUse | null;
}

export const FEEDS: Readonly<Record<string, FeedDefinition>> = {
  menupricetracker: {
    id: "menupricetracker",
    name: "MenuPriceTracker",
    homepage: "https://menupricetracker.com",
    method: "which says it reads them from the McDonald's app",
    // Its store pages give a month ("last verified October 2026"), never a
    // day, so the import dates each price by when we read the page.
    dateVerb: "checked",
    licence: null,
    unlicensedUse: {
      decidedOn: "2026-10-11",
      note:
        "Owner's decision: show MenuPriceTracker's prices, named and linked, while the " +
        "licensing request in research/feed-outreach.md is outstanding. Stop if they say no.",
    },
  },
};

/** Whether the site shows this feed: licensed, or used by the owner's decision. */
export function isFeedActive(feed: FeedDefinition): boolean {
  return feed.licence !== null || feed.unlicensedUse !== null;
}

/**
 * True once any feed is in use.
 *
 * Until then the site's copy promises that every price was submitted by a
 * person who saw it. That promise stops being true the day a feed's prices go
 * in, so the copy is keyed off this rather than off somebody remembering to
 * edit five files on that day.
 */
export const HAS_ACTIVE_FEED = Object.values(FEEDS).some(isFeedActive);

/** The feeds in use, for copy that names them. */
export const ACTIVE_FEEDS: readonly FeedDefinition[] = Object.values(FEEDS).filter(isFeedActive);

export function feedById(id: string): FeedDefinition | null {
  return Object.hasOwn(FEEDS, id) ? (FEEDS[id] ?? null) : null;
}

/** For display. An observation from a feed since removed still needs a name. */
export function feedName(id: string): string {
  return feedById(id)?.name ?? "a price feed";
}

/** The verb for a feed's dates: "checked", "observed". */
export function feedDateVerb(id: string): string {
  return feedById(id)?.dateVerb ?? "observed";
}
