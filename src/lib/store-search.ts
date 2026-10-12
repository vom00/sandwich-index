/**
 * Searching the stores already loaded on the map: by street, city, ZIP, or the
 * restaurant number a receipt prints.
 *
 * It filters what is on screen; it doesn't fetch. "Change location" is how to
 * look somewhere else, and keeping the two apart means a search never quietly
 * moves the map to a different town.
 *
 * Addresses come from OpenStreetMap spelled out ("North Story Road"), while
 * people type the way receipts and street signs abbreviate ("N Story Rd"). Both
 * sides are normalised to the same long forms, and spaces are ignored inside a
 * word run, so "macarthur" finds "Mac Arthur" and "MacArthur" alike.
 */

/** Abbreviation → the form OpenStreetMap usually spells out. */
const LONG_FORMS: Record<string, string> = {
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  st: "street",
  rd: "road",
  ave: "avenue",
  av: "avenue",
  blvd: "boulevard",
  dr: "drive",
  ln: "lane",
  hwy: "highway",
  fwy: "freeway",
  pkwy: "parkway",
  pky: "parkway",
  expy: "expressway",
  ct: "court",
  cir: "circle",
  pl: "place",
  trl: "trail",
  ft: "fort",
  mt: "mount",
  ih: "interstate",
};

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "")
    .map((word) => LONG_FORMS[word] ?? word);
}

export interface SearchableStore {
  address: string | null;
  locality: string | null;
  restaurantNumber: string | null;
}

/**
 * The words a store can be found by, normalised: its address, its locality
 * (all a store with no street has), and its restaurant number. The same text
 * its label shows, from `lib/store-label`.
 */
function haystack(store: SearchableStore): string[] {
  return words([store.address ?? "", store.locality ?? "", store.restaurantNumber ?? ""].join(" "));
}

/** The query's terms, normalised. Empty when there is nothing to search for. */
export function searchTerms(query: string): string[] {
  return words(query.replace(/#/g, " "));
}

/**
 * Does a term start at the beginning of some word, reading on across the
 * spaces after it? "copp" finds Coppell, "750" finds 75019, and "macarthur"
 * finds "Mac Arthur". Always anchored to a word's start, so "rving" doesn't
 * find Irving and a single letter doesn't find everything.
 */
function startsAWord(list: readonly string[], term: string): boolean {
  for (let start = 0; start < list.length; start += 1) {
    let run = "";
    for (let end = start; end < list.length && run.length < term.length; end += 1) run += list[end];
    if (run.startsWith(term)) return true;
  }
  return false;
}

/** Does every term match? */
export function matchesSearch(store: SearchableStore, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const list = haystack(store);
  return terms.every((term) => startsAWord(list, term));
}
