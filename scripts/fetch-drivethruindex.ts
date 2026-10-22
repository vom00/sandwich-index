/**
 * Read Drive Thru Index's McChicken pickup price for every US McDonald's in
 * the bundled list, and write the snapshot the server ships
 * (`src/data/feeds/drivethruindex.json`).
 *
 *   npm run fetch:drivethruindex                 # read, resuming today's run where it stopped
 *   npm run fetch:drivethruindex -- --limit 50   # at most 50 store pages this run
 *   npm run fetch:drivethruindex -- --retry-unparsed  # also re-read pages the parser could not read
 *   npm run fetch:drivethruindex -- --missing    # read the stores our list lacks, for us-stores-dti.json
 *   npm run fetch:drivethruindex -- --merge      # write the newest row per store, across runs, into the snapshot
 *
 * robots.txt first; it asks for no crawl delay, so this keeps its own
 * (`DTI_MIN_DELAY_SECONDS`, longer if robots.txt ever asks) between every
 * request, and never retries in a loop. Store pages are found through the
 * McDonald's sitemaps (about two dozen requests), and only pages whose
 * restaurant number is in our list are read: about 13,700, most of a day.
 * Every page read is appended to `feeds/drivethruindex-<run date>.jsonl` at
 * once, so a rerun the same day skips it.
 *
 * Each row is pinned to our store by restaurant number (`atp-<number>`, which
 * `pinnedOrMatched` also resolves to an OSM store holding that number) and
 * dated by the day the page says it checked the price. Drive Thru Index asks
 * to be credited as "Source: Drive Thru Index (https://drivethruindex.com),
 * prices checked <date>"; the site shows that line (`lib/feeds`).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import dtiStoreRows from "../src/data/us-stores-dti.json";
import usStoreRows from "../src/data/us-stores.json";
import { DTI_MIN_DELAY_SECONDS, DTI_ORIGIN, parseDtiStorePage, restaurantNumberFromPath } from "../src/lib/drivethruindex";
import { parseFeedFile } from "../src/lib/feed-match";
import { delaySeconds, isAllowed, parseRobots, type RobotsRules } from "../src/lib/robots";
import { distanceMeters } from "../src/lib/geohash";
import { LISTED_DUPLICATE_METERS, type ListedRow } from "../src/lib/store-list";

const USER_AGENT = "sandwich-index/0.1 (+https://sandwich-index.vercel.app)";
const FEEDS_DIR = resolve("feeds");
const SNAPSHOT = resolve("src/data/feeds/drivethruindex.json");
const DTI_STORES = resolve("src/data/us-stores-dti.json");

/** All The Places' stores: the list every other source fills in around. */
const ATP_ROWS = usStoreRows as unknown as ListedRow[];
const atpRefs = new Set(ATP_ROWS.map((row) => String(Number(row[0]))));

interface Row {
  address: string;
  city: string;
  mcchickenCents: number | null;
  observedAt: string;
  url: string;
  storeId: string;
  /** Where the page places the store; kept only for stores All The Places lacks. */
  location?: { lat: number; lng: number; state: string | null; postcode: string | null };
}

interface ProgressLine {
  path: string;
  row: Row | null;
  note?: string;
}

const values = (flag: string): string | undefined => {
  const at = process.argv.indexOf(flag);
  return at === -1 ? undefined : process.argv[at + 1];
};

const progressFile = (runDate: string) => resolve(FEEDS_DIR, `drivethruindex-${runDate}.jsonl`);

function readProgress(file: string): Map<string, ProgressLine> {
  const done = new Map<string, ProgressLine>();
  if (!existsSync(file)) return done;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.trim() !== "") {
      const entry = JSON.parse(line) as ProgressLine;
      done.set(entry.path, entry);
    }
  }
  return done;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function makeFetcher(rules: RobotsRules) {
  const waitMs = delaySeconds(rules, DTI_MIN_DELAY_SECONDS) * 1000;
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
      const response = await fetch(`${DTI_ORIGIN}${path}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xml" },
        signal: AbortSignal.timeout(60_000),
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

async function read(limit: number, runDate: string, retryUnparsed: boolean, missing: boolean): Promise<void> {
  const robots = await fetch(`${DTI_ORIGIN}/robots.txt`, { headers: { "User-Agent": USER_AGENT } });
  if (!robots.ok) {
    console.error(`robots.txt answered ${robots.status}; not reading without it.`);
    process.exit(1);
  }
  const rules = parseRobots(await robots.text());
  const get = makeFetcher(rules);

  const ours = new Set([...atpRefs, ...(dtiStoreRows as unknown as ListedRow[]).map((row) => String(Number(row[0])))]);
  const file = progressFile(runDate);
  const done = readProgress(file);

  const index = await get("/sitemap.xml");
  if (index === null) process.exit(1);
  const maps = [...index.matchAll(/<loc>https:\/\/drivethruindex\.com(\/sitemaps\/restaurants-mcdonalds-\d+\.xml)<\/loc>/g)].map((m) => m[1]!);
  console.log(`${maps.length} McDonald's sitemaps.`);

  const wanted: { path: string; number: string }[] = [];
  const seen = new Set<string>();
  for (const map of maps) {
    const xml = await get(map);
    if (xml === null) continue;
    for (const match of xml.matchAll(/<loc>https:\/\/drivethruindex\.com([^<]+)<\/loc>/g)) {
      const path = match[1]!;
      const number = restaurantNumberFromPath(path);
      // --missing reads the stores our lists lack instead of the ones they have.
      if (number === null || seen.has(number) || ours.has(number) === missing) continue;
      seen.add(number);
      // A page read before in a shape the parser has since learned is read again.
      if (!done.has(path) || (retryUnparsed && done.get(path)?.row === null)) wanted.push({ path, number });
    }
    console.log(`MAP     ${map}: ${wanted.length} to read so far`);
  }
  console.log(`\n${wanted.length} store pages to read (${done.size} already read in this run).`);
  mkdirSync(dirname(file), { recursive: true });

  let fetched = 0;
  for (const { path, number } of wanted) {
    if (fetched >= limit) break;
    const html = await get(path);
    fetched += 1;
    if (html === null) continue; // not recorded, so a rerun tries again
    const page = parseDtiStorePage(html);
    const line: ProgressLine =
      page === null
        ? { path, row: null, note: "not a store page in the expected shape" }
        : {
            path,
            row: {
              address: page.address,
              city: page.city,
              mcchickenCents: page.priceCents,
              // Their daily run starts at 08:00 UTC; the page gives the day.
              observedAt: `${page.checkedOn}T08:00:00.000Z`,
              url: `${DTI_ORIGIN}${path}`,
              storeId: `atp-${number}`,
              ...(page.location !== null && !atpRefs.has(number) ? { location: page.location } : {}),
            },
          };
    appendFileSync(file, `${JSON.stringify(line)}\n`);
    if (fetched % 100 === 0) console.log(`READ    ${fetched}/${wanted.length}`);
  }
  console.log(`\nRead ${fetched} store pages this run.`);
}

/**
 * Replace the snapshot with each store's newest row across every run, so a
 * page the latest run missed (gone from a sitemap that day, or unreadable)
 * keeps the last price read for it. A page that was read but showed no
 * McChicken counts as read: no older price is put back under it.
 */
function merge(): void {
  const runs = readdirSync(FEEDS_DIR).filter((name) => /^drivethruindex-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort();
  const latest = runs.at(-1);
  if (latest === undefined) {
    console.error("No run to merge. Read first.");
    process.exit(1);
  }
  const newest = new Map<string, ProgressLine>();
  for (const run of runs) {
    for (const line of readProgress(resolve(FEEDS_DIR, run)).values()) {
      // A page's path ends in its restaurant number, so it names one store.
      if (line.row !== null || !newest.has(line.path)) newest.set(line.path, line);
    }
  }
  const lines = [...newest.values()];
  // About one store in 170 shows a placeholder from the app ($19.99, $99.99,
  // $0.12). A McChicken has never been near either end of this range. A flat
  // $1.00 is the sandwich's share of a bundle (lib/drivethruindex), not the
  // sandwich's price, so it is out too.
  const plausible = (cents: number) => cents > 100 && cents <= 600;
  const priced = lines
    .map((line) => line.row)
    .filter((row): row is Row => row !== null && row.mcchickenCents !== null);
  const rows = priced
    .filter((row) => plausible(row.mcchickenCents!))
    .sort((a, b) => a.storeId.localeCompare(b.storeId))
    // The location goes to the store list, not the price feed.
    .map((row) => ({ ...row, location: undefined }));
  for (const row of priced.filter((r) => !plausible(r.mcchickenCents!))) {
    console.log(`DROP    ${row.mcchickenCents} cents at ${row.url} (implausible)`);
  }
  // The server drops a row it cannot parse; this makes sure none ship.
  const check = parseFeedFile({ rows });
  if (check.problems.length > 0) {
    console.error(`The snapshot would ship ${check.problems.length} rows the server rejects:`);
    for (const problem of check.problems.slice(0, 20)) console.error(`  ${problem}`);
    process.exit(1);
  }
  writeFileSync(
    SNAPSHOT,
    `${JSON.stringify(
      {
        feed: "drivethruindex",
        source: DTI_ORIGIN,
        note:
          `Read up to ${latest.slice(15, 25)} from drivethruindex.com store pages: each row is the McChicken's ` +
          "pickup price and the day the page says it was checked, pinned to our store by restaurant number. " +
          "Credit: Source: Drive Thru Index (https://drivethruindex.com), prices checked <date>.",
        rows,
      },
      null,
      1,
    )}\n`,
  );
  const supplement = writeStoreSupplement(lines);
  const unpriced = lines.filter((line) => line.row !== null && line.row.mcchickenCents === null).length;
  console.log(`Wrote ${supplement} stores All The Places lacks to ${DTI_STORES}.`);
  console.log(
    `Wrote ${rows.length} priced rows from ${runs.length} run(s), newest ${latest} (${priced.length - rows.length} implausible, ` +
      `${unpriced} pages had no McChicken, ${lines.length - priced.length - unpriced} unreadable).`,
  );
}

/**
 * Stores Drive Thru Index has a page for and All The Places doesn't (about one
 * in a hundred), placed where the page puts them, as rows in the bundled
 * list's format. One standing within `LISTED_DUPLICATE_METERS` of a listed
 * store is that store under another number, and is left out.
 */
function writeStoreSupplement(lines: readonly ProgressLine[]): number {
  const supplement: ListedRow[] = [];
  for (const { row } of lines) {
    if (row === null || row.location === undefined) continue;
    const ref = row.storeId.replace(/^atp-/, "");
    if (atpRefs.has(ref)) continue;
    const at = { lat: row.location.lat, lng: row.location.lng };
    const near = ATP_ROWS.some(
      (listed) =>
        Math.abs(listed[1] - at.lat) < 0.01 && distanceMeters(at, { lat: listed[1], lng: listed[2] }) < LISTED_DUPLICATE_METERS,
    );
    if (near) {
      console.log(`SKIP    #${ref} ${row.address}, ${row.city}: within ${LISTED_DUPLICATE_METERS} m of a listed store`);
      continue;
    }
    supplement.push([ref, at.lat, at.lng, row.address, row.city, row.location.state, row.location.postcode]);
  }
  supplement.sort((a, b) => Number(a[0]) - Number(b[0]));
  const body = supplement.map((entry) => JSON.stringify(entry)).join(",\n");
  writeFileSync(DTI_STORES, supplement.length === 0 ? "[]\n" : `[\n${body}\n]\n`);
  return supplement.length;
}

if (process.argv.includes("--merge")) {
  merge();
} else {
  const limit = Number.parseInt(values("--limit") ?? "", 10);
  const runDate = values("--run") ?? new Date().toISOString().slice(0, 10);
  read(
    Number.isFinite(limit) && limit > 0 ? limit : Number.POSITIVE_INFINITY,
    runDate,
    process.argv.includes("--retry-unparsed"),
    process.argv.includes("--missing"),
  ).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
