/**
 * Read MenuPriceTracker's McChicken prices for every US store in the bundled
 * list (`src/data/us-stores.json`), and fold them into the snapshot the server
 * ships (`src/data/feeds/menupricetracker.json`).
 *
 *   npm run fetch:menupricetracker:us                  # read, resuming where it stopped
 *   npm run fetch:menupricetracker:us -- --limit 50    # at most 50 store pages this run
 *   npm run fetch:menupricetracker:us -- --merge       # write what was read into the snapshot
 *
 * Same manners as `fetch-menupricetracker.ts`: robots.txt first, its
 * crawl-delay (never under 10 seconds) before every request, no retries. Store
 * pages are found through the site's per-state sitemaps (about fifty
 * requests), and only pages that name one of our stores are read. At 10
 * seconds a page the whole country takes about a day, so every page read is
 * appended to `feeds/menupricetracker-us.jsonl` straight away and a rerun
 * skips it.
 *
 * Every row is pinned (`storeId`) to the listed store it was matched to here,
 * by state, city and street number. Matching later by city and street number
 * alone, as the Dallas rows do, could put an Irving, NY price on an Irving, TX
 * store; the state is only known at this step, from the page's address.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import usStoreRows from "../src/data/us-stores.json";
import {
  MPT_ORIGIN,
  MPT_USER_AGENT,
  delaySeconds,
  isAllowed,
  parseRobots,
  parseStorePage,
  type RobotsRules,
} from "../src/lib/menupricetracker";
import { toListedStore, type ListedRow, type ListedStore } from "../src/lib/store-list";

const PROGRESS = resolve("feeds/menupricetracker-us.jsonl");
const SNAPSHOT = resolve("src/data/feeds/menupricetracker.json");

interface ReadRow {
  address: string;
  city: string;
  mcchickenCents: number | null;
  observedAt: string;
  url: string;
  listedAs: string | null;
  storeId: string | null;
}

/** The progress file: one line per page attempted, read or not. */
interface ProgressLine {
  path: string;
  row: ReadRow | null;
  note?: string;
}

const values = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bsaint\b/g, "st")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Street words that say nothing about which street it is. */
const FILLER = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west", "rd", "road", "st", "street", "ave", "avenue", "blvd", "boulevard", "dr", "drive", "hwy", "highway", "pkwy", "parkway", "ln", "lane", "fwy", "freeway", "expy", "expressway", "us", "state", "route", "and", "the"]);

function streetWords(street: string): Set<string> {
  return new Set(slug(street).split("-").filter((word) => word !== "" && !FILLER.has(word) && !/^\d+$/.test(word)));
}

interface Candidate {
  store: ListedStore;
  state: string;
  citySlug: string;
  number: string | null;
  words: Set<string>;
}

const STATES: Readonly<Record<string, string>> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado",
  CT: "connecticut", DE: "delaware", DC: "district-of-columbia", FL: "florida", GA: "georgia",
  HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky",
  LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota",
  MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new-hampshire",
  NJ: "new-jersey", NM: "new-mexico", NY: "new-york", NC: "north-carolina", ND: "north-dakota",
  OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode-island",
  SC: "south-carolina", SD: "south-dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont",
  VA: "virginia", WA: "washington", WV: "west-virginia", WI: "wisconsin", WY: "wyoming",
};

function candidates(): Map<string, Candidate[]> {
  const byStateAndNumber = new Map<string, Candidate[]>();
  for (const row of usStoreRows as unknown as ListedRow[]) {
    const store = toListedStore(row);
    const state = STATES[row[5] ?? ""];
    const street = row[3];
    if (state === undefined || street === null) continue;
    const number = /^(\d+)\b/.exec(street.trim())?.[1] ?? null;
    const candidate = { store, state, citySlug: slug(row[4] ?? ""), number, words: streetWords(street) };
    const key = `${state}|${number}`;
    byStateAndNumber.set(key, [...(byStateAndNumber.get(key) ?? []), candidate]);
  }
  return byStateAndNumber;
}

/**
 * The one listed store a page names, or null. Same state and street number
 * always; then the same city, or failing that (the two sources spell some
 * cities differently, "Dfw Airport" and "Dallas") at least two street words
 * in common. Anything still tied is left alone.
 */
function storeFor(
  index: Map<string, Candidate[]>,
  state: string,
  citySlug: string,
  street: string,
): ListedStore | null {
  const number = /^(\d+)\b/.exec(street.trim())?.[1] ?? null;
  if (number === null) return null;
  const words = streetWords(street);
  const scored = (index.get(`${state}|${number}`) ?? [])
    .map((candidate) => {
      const shared = [...candidate.words].filter((word) => words.has(word)).length;
      const sameCity = candidate.citySlug === citySlug;
      return { candidate, shared, sameCity, ok: (sameCity && (shared > 0 || words.size === 0 || candidate.words.size === 0)) || shared >= 2 };
    })
    .filter((entry) => entry.ok)
    .sort((a, b) => Number(b.sameCity) - Number(a.sameCity) || b.shared - a.shared);
  const [best, next] = scored;
  if (best === undefined) return null;
  if (next !== undefined && next.sameCity === best.sameCity && next.shared === best.shared) return null;
  return best.candidate.store;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function makeFetcher(rules: RobotsRules) {
  const waitMs = delaySeconds(rules) * 1000;
  let last = Date.now();
  return async function get(path: string): Promise<string | null> {
    if (!isAllowed(path, rules)) {
      console.log(`SKIP    ${path} (disallowed by robots.txt)`);
      return null;
    }
    const due = last + waitMs - Date.now();
    if (due > 0) await sleep(due);
    last = Date.now();
    try {
      const response = await fetch(`${MPT_ORIGIN}${path}`, {
        headers: { "User-Agent": MPT_USER_AGENT, Accept: "text/html,application/xml" },
        redirect: "follow",
      });
      if (!response.ok) {
        console.log(`HTTP    ${response.status} ${path}`);
        return null;
      }
      return await response.text();
    } catch (error) {
      console.log(`FAIL    ${path} (${error instanceof Error ? error.message : String(error)})`);
      return null;
    }
  };
}

function readProgress(): Map<string, ProgressLine> {
  const done = new Map<string, ProgressLine>();
  if (!existsSync(PROGRESS)) return done;
  for (const line of readFileSync(PROGRESS, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const entry = JSON.parse(line) as ProgressLine;
    done.set(entry.path, entry);
  }
  return done;
}

async function read(limit: number): Promise<void> {
  const robots = await fetch(`${MPT_ORIGIN}/robots.txt`, { headers: { "User-Agent": MPT_USER_AGENT } });
  if (!robots.ok) {
    console.error(`robots.txt answered ${robots.status}; not crawling without it.`);
    process.exit(1);
  }
  const rules = parseRobots(await robots.text());
  const get = makeFetcher(rules);
  console.log(`robots.txt: ${delaySeconds(rules)}s between requests.`);

  const index = candidates();
  const done = readProgress();
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as { rows: { url?: string }[] };
  const inSnapshot = new Set(snapshot.rows.map((row) => row.url?.replace(MPT_ORIGIN, "")));

  const indexXml = await get("/sitemap-index.xml");
  if (indexXml === null) process.exit(1);
  const stateMaps = [...indexXml.matchAll(/<loc>https:\/\/menupricetracker\.com(\/sitemap-state-[a-z-]+\.xml)<\/loc>/g)].map((m) => m[1]!);
  console.log(`${stateMaps.length} state sitemaps.`);

  const wanted: string[] = [];
  for (const map of stateMaps) {
    const xml = await get(map);
    if (xml === null) continue;
    let listed = 0;
    for (const match of xml.matchAll(/<loc>https:\/\/menupricetracker\.com(\/mcdonalds\/([a-z-]+)\/([a-z0-9-]+)\/(\d+-[a-z0-9-]+))<\/loc>/g)) {
      listed += 1;
      const [, path, state, citySlug, streetSlug] = match as unknown as [string, string, string, string, string];
      if (inSnapshot.has(path) || done.has(path)) continue;
      if (storeFor(index, state, citySlug, streetSlug.replace(/-/g, " ")) !== null) wanted.push(path);
    }
    console.log(`MAP     ${map}: ${listed} store pages listed, ${wanted.length} to read so far`);
  }

  console.log(`\n${wanted.length} store pages to read (${done.size} already read). About ${Math.round((wanted.length * delaySeconds(rules)) / 3600)} hours.`);
  mkdirSync(dirname(PROGRESS), { recursive: true });

  let fetched = 0;
  for (const path of wanted) {
    if (fetched >= limit) break;
    const html = await get(path);
    fetched += 1;
    const [, , state, citySlug] = path.split("/") as [string, string, string, string];
    let line: ProgressLine;
    const page = html === null ? null : parseStorePage(html);
    if (page === null) {
      line = { path, row: null, note: html === null ? "not read" : "no store data on the page" };
    } else {
      const store = storeFor(index, state, slug(page.city) || citySlug, page.address) ?? storeFor(index, state, citySlug, page.address);
      line = {
        path,
        row: {
          address: page.address,
          city: page.city,
          mcchickenCents: page.priceCents,
          observedAt: new Date().toISOString(),
          url: `${MPT_ORIGIN}${path}`,
          listedAs: page.verifiedLabel,
          storeId: store?.osmId ?? null,
        },
      };
      const price = page.priceCents === null ? "no McChicken" : `$${(page.priceCents / 100).toFixed(2)}`;
      console.log(`STORE   ${page.address}, ${page.city} ${state}: ${price} -> ${store?.osmId ?? "no unique store"}`);
    }
    // A page that failed to load is not recorded, so a rerun tries it again.
    if (html !== null) appendFileSync(PROGRESS, `${JSON.stringify(line)}\n`);
  }
  console.log(`\nRead ${fetched} store pages this run.`);
}

/** Fold the pinned, priced rows read so far into the shipped snapshot. */
function merge(): void {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8")) as { note: string; rows: (ReadRow & { storeId?: string | null })[] };
  const have = new Set(snapshot.rows.map((row) => row.url));
  const pinnedTo = new Set(snapshot.rows.map((row) => row.storeId).filter(Boolean));
  const fresh = [...readProgress().values()]
    .map((entry) => entry.row)
    .filter((row): row is ReadRow => row !== null && row.storeId !== null && !have.has(row.url))
    .filter((row) => {
      // Two pages pinned to one store means one of the pins is wrong; keep neither.
      return !pinnedTo.has(row.storeId);
    });
  const counts = new Map<string, number>();
  for (const row of fresh) counts.set(row.storeId!, (counts.get(row.storeId!) ?? 0) + 1);
  const rows = fresh.filter((row) => counts.get(row.storeId!) === 1);

  snapshot.rows.push(...rows);
  snapshot.note = `${snapshot.note.replace(/ US rows: .*$/, "")} US rows: ${snapshot.rows.length} in all, those outside Dallas read through the per-state sitemaps and pinned to a store from the bundled list (storeId) by state, city and street number.`;
  writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Added ${rows.length} rows (${fresh.length - rows.length} dropped as double pins); snapshot now ${snapshot.rows.length} rows.`);
}

if (process.argv.includes("--merge")) {
  merge();
} else {
  const limit = Number.parseInt(values("--limit") ?? "", 10);
  read(Number.isFinite(limit) && limit > 0 ? limit : Number.POSITIVE_INFINITY).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
