/**
 * Turning a feed's rows into observations of our stores.
 *
 * Two jobs, both pure so they can be tested without a database:
 *
 * 1. **Parse** a feed file into rows, refusing anything that would put a wrong
 *    number in front of a visitor: prices outside the plausible range, dates in
 *    the future, rows with no observation date at all.
 *
 * 2. **Match** each row to one of our OSM-synced stores. The join key is
 *    (city, street number), learned from the 2026-08-10 sample: street *names*
 *    alias freely between sources ("Round Grove Road" is "FM 3040", "S Business
 *    121" is "S Hwy 121") and even ZIPs disagree, but number + city held for 15
 *    of 15 sampled stores with nothing ambiguous. Two McDonald's in one city
 *    almost never share a street number. "Almost never" is why a row that
 *    matches more than one store is reported as ambiguous for a human rather
 *    than resolved by guessing.
 */

import { z } from "zod";

import { priceCentsSchema } from "@/lib/validation";
import type { StoreWithId } from "@/types";

/** One row of a feed, normalised. */
export interface FeedRow {
  /** Street address as the feed writes it, e.g. "813 Macarthur Blvd". */
  address: string;
  city: string;
  /** Null when the feed lists the store but has no McChicken price for it. */
  priceCents: number | null;
  /** ISO 8601. When the feed says it saw this price. */
  observedAt: string;
  /** The feed's own page for this store, when it has one. */
  sourceUrl: string | null;
  /**
   * Our store this row belongs to, when it was linked by location rather than
   * address: the feed and OpenStreetMap give the same restaurant different
   * street numbers ("190 Shiloh Rd" and "7201 N President George Bush Hwy").
   * Set only by a build step that checked the link; see `pinnedOrMatched`.
   */
  storeId: string | null;
}

export interface ParsedFeed {
  rows: FeedRow[];
  /** One entry per rejected row, saying which and why. */
  problems: string[];
}

const dateString = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "not a date");

/**
 * Accepts the shape of `research/tracker-samples.json` as well as the plain
 * one: `mcchickenCents` for `priceCents`, and a file-level `verifiedAt` as the
 * default observation date.
 */
const feedFileSchema = z.object({
  observedAt: dateString.optional(),
  verifiedAt: dateString.optional(),
  rows: z.array(
    z.object({
      address: z.string().trim().min(1),
      city: z.string().trim().min(1),
      priceCents: z.number().nullable().optional(),
      mcchickenCents: z.number().nullable().optional(),
      observedAt: dateString.optional(),
      url: z.string().url().nullable().optional(),
      sourceUrl: z.string().url().nullable().optional(),
      storeId: z.string().trim().min(1).max(200).nullable().optional(),
    }),
  ),
});

/** A day of clock skew between the feed and us is fine; a week is a typo. */
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export function parseFeedFile(input: unknown, now: Date = new Date()): ParsedFeed {
  const parsed = feedFileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      rows: [],
      problems: parsed.error.issues.map(
        (issue) => `file: ${issue.path.join(".") || "(root)"} ${issue.message}`,
      ),
    };
  }

  const fileDate = parsed.data.observedAt ?? parsed.data.verifiedAt;
  const rows: FeedRow[] = [];
  const problems: string[] = [];

  parsed.data.rows.forEach((raw, index) => {
    const where = `row ${index + 1} (${raw.address}, ${raw.city})`;

    // An undated price is the one thing a feed must never supply: there is no
    // way to show it honestly, and no way to know when it went stale.
    const dated = raw.observedAt ?? fileDate;
    if (dated === undefined) {
      problems.push(`${where}: no observation date, on the row or the file`);
      return;
    }
    const observedAt = new Date(dated);
    if (observedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
      problems.push(`${where}: observed ${dated}, which is in the future`);
      return;
    }

    const cents = raw.priceCents ?? raw.mcchickenCents ?? null;
    if (cents !== null) {
      const check = priceCentsSchema.safeParse(cents);
      if (!check.success) {
        problems.push(`${where}: ${check.error.issues[0]?.message ?? "invalid price"}`);
        return;
      }
    }

    rows.push({
      address: raw.address,
      city: raw.city,
      priceCents: cents,
      observedAt: observedAt.toISOString(),
      sourceUrl: raw.sourceUrl ?? raw.url ?? null,
      storeId: raw.storeId ?? null,
    });
  });

  return { rows, problems };
}

/** "8435 N Beltline Road" → "8435". Null when the address has no leading number. */
export function streetNumber(address: string): string | null {
  const match = /^(\d+)\b/.exec(address.trim());
  return match?.[1] ?? null;
}

/**
 * The city of one of our stores: the second-to-last comma segment of
 * "813 South MacArthur Boulevard, Coppell, TX 75019", falling back to the
 * locality when there is no street address.
 */
export function storeCity(store: Pick<StoreWithId, "address" | "locality">): string | null {
  const source = store.address ?? store.locality;
  if (source === null) return null;
  const parts = source.split(",").map((part) => part.trim());
  return parts.length >= 2 ? (parts[parts.length - 2] ?? null) : null;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export type FeedMatch =
  | { kind: "match"; storeId: string }
  | { kind: "ambiguous"; storeIds: string[] }
  | { kind: "miss" };

export function matchFeedRow(
  row: Pick<FeedRow, "address" | "city">,
  stores: readonly Pick<StoreWithId, "id" | "address" | "locality">[],
): FeedMatch {
  const number = streetNumber(row.address);
  if (number === null) return { kind: "miss" };
  const city = normalise(row.city);

  const candidates = stores.filter((store) => {
    if (store.address === null) return false;
    const cityOfStore = storeCity(store);
    return (
      streetNumber(store.address) === number &&
      cityOfStore !== null &&
      normalise(cityOfStore) === city
    );
  });

  if (candidates.length === 1 && candidates[0] !== undefined) {
    return { kind: "match", storeId: candidates[0].id };
  }
  if (candidates.length > 1) {
    return { kind: "ambiguous", storeIds: candidates.map((store) => store.id) };
  }
  return { kind: "miss" };
}

/**
 * A pinned row goes to its store when that store is among `stores`; any other
 * row is matched by city and street number. A pin naming a store we don't have
 * is a miss, never a fallback to the address, so a stale pin can't land on a
 * neighbour.
 */
export function pinnedOrMatched(
  row: Pick<FeedRow, "address" | "city" | "storeId">,
  stores: readonly Pick<StoreWithId, "id" | "address" | "locality">[],
): FeedMatch {
  if (row.storeId !== null) {
    return stores.some((store) => store.id === row.storeId)
      ? { kind: "match", storeId: row.storeId }
      : { kind: "miss" };
  }
  return matchFeedRow(row, stores);
}

/**
 * One observation per feed, store and day. Deterministic, so importing the
 * same file twice writes the same documents instead of doubling the history.
 */
export function observationId(feed: string, storeId: string, observedAt: string): string {
  return `${feed}_${storeId}_${observedAt.slice(0, 10)}`;
}
