/**
 * The monthly data story: one month of the index in a few figures, every one
 * of them counted from data on file and none of them estimated.
 *
 * `scripts/build-monthly-story.ts` gathers the inputs (the Drive Thru Index
 * readings committed to this repository, the US store list and, when it is
 * given read access, the live database) and calls `buildMonthlyStory`, which
 * is pure so the rules below are tested on their own. The result is written
 * to `src/data/monthly/<yyyy-mm>.json`, which the story page renders and the
 * planned monthly video reads (`docs/plans/monthly-video.md`), so the two can
 * never disagree.
 *
 * A figure the inputs cannot support is left null and named in `missing`
 * with the reason, and the page shows it blank. Nothing is filled in.
 */

/** The feed whose readings the story is counted from. */
export const STORY_FEED = "drivethruindex";

/**
 * Prices outside this range are left out, as on the landing map and the
 * national strip (`scripts/build-landing-map.ts`): a parse that read a meal,
 * or a page with a typo, rather than a McChicken.
 */
export const STORY_MIN_CENTS = 100; // exclusive
export const STORY_MAX_CENTS = 600; // inclusive

/** A state is ranked only with at least this many priced stores. */
export const MIN_STATE_STORES = 20;

/** How many of the month's biggest price changes the story names. */
export const MOVERS_SHOWN = 3;

/** One row of a Drive Thru Index reading (`src/data/feeds/drivethruindex.json`). */
export interface FeedRow {
  storeId: string;
  mcchickenCents: number;
  observedAt: string;
}

/** A store from the US store list (`src/data/us-stores.json`). */
export interface ListedStore {
  id: string;
  address: string;
  city: string;
  state: string;
}

export interface StateRank {
  medianCents: number;
  /** Every state at this median, most stores first: a tie is shown as one. */
  states: { state: string; stores: number }[];
}

export interface Mover {
  storeId: string;
  label: string;
  fromCents: number;
  toCents: number;
  /** ISO dates of the two readings. */
  fromAt: string;
  toAt: string;
}

export type StoryField = "feed" | "states" | "movers" | "confirmed";

export interface MonthlyStory {
  /** `yyyy-mm`. */
  month: string;
  /** ISO. When the script ran. */
  generatedAt: string;
  /** The feed's readings inside the month that the figures are counted from. */
  feed: { id: string; from: string; to: string; stores: number } | null;
  /** US McDonald's in the store list, priced or not. */
  listedStores: number;
  states: {
    minStores: number;
    /** States with at least `minStores` priced stores. */
    ranked: number;
    cheapest: StateRank;
    priciest: StateRank;
  } | null;
  movers: {
    /** The feed's previous reading, before the month began. */
    previous: { from: string; to: string };
    /** Stores priced in both readings. */
    compared: number;
    up: number;
    down: number;
    /** The biggest changes, largest first. */
    top: Mover[];
    /** How many stores share the largest change, so a tie is never hidden. */
    tiedAtTop: number;
  } | null;
  /** Visitor reports accepted in the month, from the live database. */
  confirmed: { count: number } | null;
  /** Every field left null, with why. */
  missing: { field: StoryField; reason: string }[];
}

export interface StoryInput {
  month: string;
  generatedAt: string;
  listed: readonly ListedStore[];
  /** The newest reading of the feed. Only its rows dated inside the month count. */
  current: readonly FeedRow[];
  /** The newest reading taken wholly before the month began, if there is one. */
  previous: readonly FeedRow[] | null;
  /** Accepted visitor reports in the month, or null when it could not be counted. */
  confirmed: number | null;
  /** Why `confirmed` is null, when it is. */
  confirmedMissingReason?: string;
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isStoryMonth(value: string): boolean {
  return MONTH.test(value);
}

/** The month's first instant and the next month's, as ISO strings (UTC). */
export function monthBounds(month: string): { start: string; end: string } {
  const match = MONTH.exec(month);
  if (match === null) throw new Error(`Not a month: ${month} (expected yyyy-mm)`);
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return {
    start: new Date(Date.UTC(year, index, 1)).toISOString(),
    end: new Date(Date.UTC(year, index + 1, 1)).toISOString(),
  };
}

function isStoryPrice(cents: number): boolean {
  return Number.isInteger(cents) && cents > STORY_MIN_CENTS && cents <= STORY_MAX_CENTS;
}

/** The middle price, halves rounded to the nearest cent (as the national strip does). */
export function medianCents(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * Each listed store's newest usable price in the given rows: a store on the
 * list, a price in range and, when `within` is given, a date inside it.
 */
export function latestPrices(
  rows: readonly FeedRow[],
  listed: ReadonlyMap<string, ListedStore>,
  within?: { start: string; end: string },
): Map<string, { cents: number; at: string }> {
  const prices = new Map<string, { cents: number; at: string }>();
  for (const row of rows) {
    if (!listed.has(row.storeId) || !isStoryPrice(row.mcchickenCents)) continue;
    if (within && (row.observedAt < within.start || row.observedAt >= within.end)) continue;
    const seen = prices.get(row.storeId);
    if (seen === undefined || row.observedAt > seen.at) {
      prices.set(row.storeId, { cents: row.mcchickenCents, at: row.observedAt });
    }
  }
  return prices;
}

/** Cheapest and priciest states by median, ties kept together. */
export function rankStates(
  prices: ReadonlyMap<string, { cents: number }>,
  listed: ReadonlyMap<string, ListedStore>,
  minStores = MIN_STATE_STORES,
): MonthlyStory["states"] {
  const byState = new Map<string, number[]>();
  for (const [id, { cents }] of prices) {
    const state = listed.get(id)?.state;
    if (!state) continue;
    const list = byState.get(state) ?? [];
    list.push(cents);
    byState.set(state, list);
  }
  const ranked = [...byState]
    .filter(([, list]) => list.length >= minStores)
    .map(([state, list]) => ({ state, stores: list.length, median: medianCents(list) }));
  if (ranked.length < 2) return null;

  const at = (median: number): StateRank => ({
    medianCents: median,
    states: ranked
      .filter((row) => row.median === median)
      .sort((a, b) => b.stores - a.stores || a.state.localeCompare(b.state))
      .map(({ state, stores }) => ({ state, stores })),
  });
  const medians = ranked.map((row) => row.median);
  return {
    minStores,
    ranked: ranked.length,
    cheapest: at(Math.min(...medians)),
    priciest: at(Math.max(...medians)),
  };
}

/** "715 East Memorial Blvd, Lakeland, FL", or the town alone when the list has no street. */
export function storyStoreLabel(store: ListedStore): string {
  const place = [store.city, store.state].filter(Boolean).join(", ");
  return store.address ? `${store.address}, ${place}` : `McDonald’s in ${place}`;
}

function restaurantNumber(id: string): number {
  const n = Number(id.replace(/^\D+/, ""));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Stores priced in both readings, and the biggest changes between them:
 * largest change in cents first, then largest as a share of the old price,
 * then lowest restaurant number, so the order never depends on file order.
 */
export function findMovers(
  current: ReadonlyMap<string, { cents: number; at: string }>,
  previous: ReadonlyMap<string, { cents: number; at: string }>,
  listed: ReadonlyMap<string, ListedStore>,
  shown = MOVERS_SHOWN,
): NonNullable<MonthlyStory["movers"]> {
  let compared = 0;
  let up = 0;
  let down = 0;
  let from = "";
  let to = "";
  const changed: Mover[] = [];
  for (const [id, now] of current) {
    const before = previous.get(id);
    if (before === undefined) continue;
    compared += 1;
    if (!from || before.at < from) from = before.at;
    if (!to || before.at > to) to = before.at;
    if (now.cents === before.cents) continue;
    if (now.cents > before.cents) up += 1;
    else down += 1;
    changed.push({
      storeId: id,
      label: storyStoreLabel(listed.get(id)!),
      fromCents: before.cents,
      toCents: now.cents,
      fromAt: before.at,
      toAt: now.at,
    });
  }
  const size = (m: Mover) => Math.abs(m.toCents - m.fromCents);
  changed.sort(
    (a, b) =>
      size(b) - size(a) ||
      size(b) / b.fromCents - size(a) / a.fromCents ||
      restaurantNumber(a.storeId) - restaurantNumber(b.storeId),
  );
  const top = changed.slice(0, shown);
  return {
    previous: { from, to },
    compared,
    up,
    down,
    top,
    tiedAtTop: top.length === 0 ? 0 : changed.filter((m) => size(m) === size(top[0]!)).length,
  };
}

export function buildMonthlyStory(input: StoryInput): MonthlyStory {
  const bounds = monthBounds(input.month);
  const listed = new Map(input.listed.map((store) => [store.id, store]));
  const missing: MonthlyStory["missing"] = [];

  const current = latestPrices(input.current, listed, bounds);
  let feed: MonthlyStory["feed"] = null;
  if (current.size > 0) {
    const dates = [...current.values()].map((p) => p.at).sort();
    feed = { id: STORY_FEED, from: dates[0]!, to: dates[dates.length - 1]!, stores: current.size };
  } else {
    missing.push({ field: "feed", reason: "The feed has no reading dated inside this month." });
  }

  const states = current.size > 0 ? rankStates(current, listed) : null;
  if (states === null) {
    missing.push({
      field: "states",
      reason:
        current.size > 0
          ? `Fewer than two states had ${MIN_STATE_STORES} or more priced stores.`
          : "No prices this month to rank states by.",
    });
  }

  let movers: MonthlyStory["movers"] = null;
  if (current.size > 0 && input.previous !== null) {
    const found = findMovers(current, latestPrices(input.previous, listed), listed);
    if (found.compared > 0) movers = found;
  }
  if (movers === null) {
    missing.push({
      field: "movers",
      reason:
        input.previous === null
          ? "No earlier reading of the feed, from before this month, to compare with."
          : "No store was priced in both this month's reading and the one before.",
    });
  }

  if (input.confirmed === null) {
    missing.push({
      field: "confirmed",
      reason: input.confirmedMissingReason ?? "Visitor reports were not counted for this month.",
    });
  }

  return {
    month: input.month,
    generatedAt: input.generatedAt,
    feed,
    listedStores: listed.size,
    states,
    movers,
    confirmed: input.confirmed === null ? null : { count: input.confirmed },
    missing,
  };
}

/** "November 2026". */
export function storyMonthName(month: string): string {
  const { start } = monthBounds(month);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(start));
}

/** "Nov 1", or "Oct 22 to 30" / "Oct 22 to Nov 1" for a span. */
export function storyDateSpan(from: string, to: string): string {
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const a = day.format(new Date(from));
  if (from.slice(0, 10) === to.slice(0, 10)) return a;
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const b = sameMonth ? String(new Date(to).getUTCDate()) : day.format(new Date(to));
  return `${a} to ${b}`;
}

export const US_STATE_NAMES: Readonly<Record<string, string>> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington, DC", FL: "Florida",
  GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana",
  IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine",
  MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin",
  WY: "Wyoming",
};

export function stateName(code: string): string {
  return US_STATE_NAMES[code] ?? code;
}
