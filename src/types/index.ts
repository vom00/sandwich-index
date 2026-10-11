/**
 * Domain types for Sandwich Index.
 *
 * Two representations exist for every timestamp:
 *   - In Firestore it is a native `Timestamp`, because security rules compare
 *     against `request.time` and cannot do date arithmetic on strings.
 *   - Everywhere else (props, JSON responses, component state) it is an ISO
 *     8601 string, converted at the Firestore converter boundary.
 *
 * Money is integer cents at every layer. See `lib/money.ts` — that module owns
 * the only conversion to a decimal representation, and only for display.
 */

export const PRICE_SOURCES = ["in_store", "drive_thru", "app", "delivery"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export const SUBMISSION_STATUSES = ["accepted", "pending", "rejected"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * Delivery platforms apply their own markup on top of the franchise price, so
 * those reports describe a different product than the one being indexed. They
 * are stored and displayed, but never allowed to set a store's price.
 */
export const PRICE_EXCLUDED_SOURCES: readonly PriceSource[] = ["delivery"];

export const PRICE_SOURCE_LABELS: Record<PriceSource, string> = {
  in_store: "In store",
  drive_thru: "Drive-thru",
  app: "Mobile app",
  delivery: "Delivery",
};

/**
 * A McDonald's location sourced from OpenStreetMap, plus denormalized price
 * rollups so the map and list views render from a single query.
 *
 * Rollups are written exclusively by the Admin SDK. Clients cannot write to
 * `stores` — the outlier gate in firestore.rules trusts `priceCents`,
 * so a client-writable store document would defeat abuse control entirely.
 */
export interface Store {
  /** OSM element id prefixed with its type, e.g. `node-1234567890`. Equals the document id. */
  osmId: string;
  name: string;
  /**
   * Street-level address. Null is expected: a share of OSM entries carry no
   * address tags at all, and the reverse geocoder that backfills them cannot
   * always find a street either. Every surface that renders an address must
   * handle this — see `lib/store-label.ts`, which is how they all do it.
   */
  address: string | null;
  /**
   * "Euless, TX 76039". What is known about where a store is when its street is
   * not. Separate from `address` on purpose: a town and a postcode is not
   * somewhere you can walk to, and presenting it as one would be a lie of
   * formatting.
   */
  locality: string | null;
  lat: number;
  lng: number;
  geohash: string;
  /**
   * ISO 8601. When the reverse geocoder was last asked about this store, set
   * whether or not it had an answer. Null means never asked. Without it, a
   * store the geocoder genuinely cannot place would be looked up again on every
   * single sync, forever.
   */
  addressCheckedAt: string | null;
  /** Every report ever made, regardless of source or status. */
  reportCount: number;
  /**
   * Reports that were eligible to set the price (accepted, non-delivery).
   * This — not `reportCount` — is the honest confidence signal to display.
   */
  confirmedCount: number;
  /**
   * What this restaurant charges: the most recent accepted report, not an
   * average of anything. Null when nobody has established it yet.
   *
   * Written exclusively by the Admin SDK via the recompute path. A
   * client-writable price would defeat the move gate entirely, since the gate
   * in firestore.rules tests a new report against this value.
   */
  priceCents: number | null;
  /** ISO 8601. When `priceCents` was reported. Null when there is no price. */
  pricedAt: string | null;
  /**
   * A report that moved the price too far to apply on its own and is waiting
   * for a second opinion. Null when there is nothing outstanding.
   */
  heldPriceCents: number | null;
  /** ISO 8601. When this record was last reconciled against OpenStreetMap. */
  lastSyncedAt: string;
}

export type StoreWithId = Store & { id: string };

export interface Submission {
  storeId: string;
  priceCents: number;
  /** ISO 8601. Server-stamped via `request.time`; clients cannot backdate. */
  submittedAt: string;
  source: PriceSource;
  status: SubmissionStatus;
  /**
   * Reserved. No surface sets this in v1 — there is no moderation UI. Kept so
   * the schema does not need a migration when one lands. See README.
   */
  flagCount: number;
}

export type SubmissionWithId = Submission & { id: string };

/**
 * Private per-device, per-store write ledger backing the 24h rate limit.
 * Document id is `{uid}_{storeId}`, which is what makes it reachable from a
 * security rule — rules can `get()` a known path but cannot run a query.
 */
export interface RateLimitEntry {
  storeId: string;
  /** ISO 8601 in app code, `Timestamp` in Firestore. */
  lastSubmittedAt: string;
}

/** A store is stale when its newest price predates this window. */
export const STALE_AFTER_DAYS = 90;
