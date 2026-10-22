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
   * anywhere but the local emulator, so nothing reaches production from a
   * development machine by accident.
   *
   * Production gets an active feed's prices from the snapshot shipped with
   * the server (`src/data/feeds/`, applied by `backfillFeedObservations` in
   * `stores.server` as areas sync). That was the purposeful change: the
   * owner's goal of 2026-10-12 was that every store that can have a price
   * shows one on the live site.
   */
  unlicensedUse: UnlicensedUse | null;
  /**
   * The credit line the feed asks for, shown under a price it supplied, with
   * `{date}` replaced by the day it checked that price (YYYY-MM-DD), or null
   * when it asks for none beyond being named.
   */
  attribution: string | null;
  /** What the date on its prices is, for the About page, or null. */
  dateNote: string | null;
}

export const FEEDS: Readonly<Record<string, FeedDefinition>> = {
  menupricetracker: {
    id: "menupricetracker",
    name: "MenuPriceTracker",
    homepage: "https://menupricetracker.com",
    method: "which says it reads its prices from the McDonald's app",
    // Its store pages give a month ("last verified October 2026"), never a
    // day, so the import dates each price by when we read the page.
    dateVerb: "checked",
    licence: null,
    // Shown from 2026-10-11 by the owner's decision, and removed by the owner
    // on 2026-10-22, once research showed its prices were a single scrape
    // published around 2026-04-16 under a date generated on every page view
    // (reports/Accurate McChicken price sources.md). Inactive, its
    // observations are no longer read (`getObservationsForStore`), so its
    // prices are gone from every page; the definition stays so the id is
    // never reused.
    unlicensedUse: null,
    attribution: null,
    dateNote:
      "Its pages give a month rather than a day for each store, so its prices are dated by the day we read them, and say “checked”.",
  },
  drivethruindex: {
    id: "drivethruindex",
    name: "Drive Thru Index",
    homepage: "https://drivethruindex.com",
    method: "which reads every store's pickup prices from the McDonald's app each day",
    // Each store page says "Pickup prices from the McDonald's app, checked
    // 2026-10-21": a day, which the import keeps as the price's date.
    dateVerb: "checked",
    // From drivethruindex.com/llms.txt ("figures are free to quote with
    // attribution") and /insights#citing, which gives the credit line below;
    // both read 2026-10-21. No other terms are published.
    licence: "the permission on its own site to quote its figures with attribution",
    unlicensedUse: {
      decidedOn: "2026-10-21",
      note:
        "Owner's decision: quote Drive Thru Index's McChicken pickup price for every US store, " +
        "with its credit line, date and a link. Its permission is to quote with attribution; it " +
        "names no operator and publishes no other terms. Stop if it asks.",
    },
    attribution: "Source: Drive Thru Index (https://drivethruindex.com), prices checked {date}",
    dateNote:
      "Each of its store pages says which day it checked the price, and that day is the date shown here. Its prices are the McDonald’s app’s pickup prices.",
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

/** The credit line a feed asks for under a price it checked on `observedAt`, or null. */
export function feedAttribution(id: string, observedAt: string): string | null {
  return feedById(id)?.attribution?.replace("{date}", observedAt.slice(0, 10)) ?? null;
}

/** The verb for a feed's dates: "checked", "observed". */
export function feedDateVerb(id: string): string {
  return feedById(id)?.dateVerb ?? "observed";
}
