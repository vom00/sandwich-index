/**
 * Matching stores to McDonald's restaurant numbers.
 *
 * The number is what every receipt prints ("McDonald's Restaurant #4412"), so
 * a receipt read on a store's page can be checked against the right store and
 * a store can be searched for by it. The table comes from All The Places
 * (CC0), built by `scripts/build-store-numbers.ts` as
 * `[number, lat, lng, streetNumber]` rows.
 *
 * A store gets a number only when the match is unambiguous, the same rules
 * `scripts/import-store-numbers.ts` uses:
 *   - exactly one restaurant within 150 m whose street number agrees with
 *     ours, or, when either side has no street number (airport terminals, OSM
 *     entries without an address), exactly one within 60 m; and
 *   - no other store in the same set claims the same number.
 * A missing number only means a receipt check falls back to the street
 * number; a wrong one would send someone's receipt to the wrong store.
 */

export type NumberRow = readonly [number: string, lat: number, lng: number, streetNumber: string | null];

const NEAR_METERS = 150;
const NEAR_WITHOUT_STREET_METERS = 60;
/** Grid cell size in degrees: about 1.1 km of latitude, so 150 m fits in a 3x3 block. */
const CELL = 0.01;

export interface NumberIndex {
  readonly cells: ReadonlyMap<string, readonly NumberRow[]>;
}

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL)}:${Math.floor(lng / CELL)}`;
}

export function buildNumberIndex(rows: readonly NumberRow[]): NumberIndex {
  const cells = new Map<string, NumberRow[]>();
  for (const row of rows) {
    const key = cellKey(row[1], row[2]);
    const cell = cells.get(key);
    if (cell === undefined) cells.set(key, [row]);
    else cell.push(row);
  }
  return { cells };
}

function meters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

/** The leading house number of an address line, if it has one. */
export function streetNumber(address: string | null): string | null {
  return address?.trim().match(/^(\d{1,6})\b/)?.[1] ?? null;
}

export interface NumberableStore {
  id: string;
  lat: number;
  lng: number;
  address: string | null;
}

/** The one restaurant number this store unambiguously matches, or null. */
export function numberFor(store: NumberableStore, index: NumberIndex): string | null {
  const row = Math.floor(store.lat / CELL);
  const col = Math.floor(store.lng / CELL);
  const near: { row: NumberRow; distance: number }[] = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      for (const candidate of index.cells.get(`${row + dr}:${col + dc}`) ?? []) {
        const distance = meters(store.lat, store.lng, candidate[1], candidate[2]);
        if (distance <= NEAR_METERS) near.push({ row: candidate, distance });
      }
    }
  }

  const ours = streetNumber(store.address);
  const agreeing = near.filter(({ row: r }) => ours !== null && r[3] !== null && r[3] === ours);
  if (agreeing.length === 1) return agreeing[0]!.row[0];
  if (agreeing.length > 1) return null;

  const unnumbered = near.filter(
    ({ row: r, distance }) => (ours === null || r[3] === null) && distance <= NEAR_WITHOUT_STREET_METERS,
  );
  return unnumbered.length === 1 ? unnumbered[0]!.row[0] : null;
}

/**
 * Numbers for a set of stores, one number to one store: a number two stores
 * would both get goes to neither.
 */
export function chooseNumbers(
  stores: readonly NumberableStore[],
  index: NumberIndex,
): Map<string, string> {
  const picks = new Map<string, string>();
  const claims = new Map<string, number>();
  for (const store of stores) {
    const number = numberFor(store, index);
    if (number === null) continue;
    picks.set(store.id, number);
    claims.set(number, (claims.get(number) ?? 0) + 1);
  }
  for (const [storeId, number] of picks) {
    if ((claims.get(number) ?? 0) > 1) picks.delete(storeId);
  }
  return picks;
}
