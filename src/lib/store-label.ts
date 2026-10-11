/**
 * How a store is named on screen.
 *
 * Five surfaces render a store's identity — the list, the map marker's label,
 * the detail sheet, the store page, and the landing leaderboard — and every one
 * of them has to answer the same awkward question: what do you call a store
 * whose address nobody has recorded? Answering it in five places is how they
 * drift apart, so it is answered once, here.
 *
 * The ladder, best available first:
 *
 *   1. A street address. What everybody wants and most stores have.
 *   2. A locality — "Elizabeth, NJ 07208" — labelled as such, so it is never
 *      mistaken for somewhere you can walk to.
 *   3. The name, and an admission that we have nothing else.
 *
 * `qualifier` exists so callers can render the caveat in muted text beside the
 * label without having to know which rung of the ladder produced it.
 */

export interface StoreLabelParts {
  name: string;
  address: string | null;
  locality: string | null;
}

export interface StoreLabel {
  /** Never empty. Suitable as a heading on its own. */
  text: string;
  /** Muted caveat, or null when `text` is a real street address. */
  qualifier: string | null;
}

export function storeLabel(store: StoreLabelParts): StoreLabel {
  if (store.address !== null) return { text: store.address, qualifier: null };
  if (store.locality !== null) {
    return { text: store.locality, qualifier: "street address unknown" };
  }
  return { text: store.name, qualifier: "no address on file" };
}

/** One flat string, for aria-labels, page titles and other plain-text slots. */
export function storeLabelText(store: StoreLabelParts): string {
  const { text, qualifier } = storeLabel(store);
  return qualifier === null ? text : `${text} (${qualifier})`;
}
