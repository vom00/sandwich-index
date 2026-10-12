/**
 * Read MenuPriceTracker's McChicken prices for the stores we already have, and
 * write them as a feed file for `npm run import:observations`.
 *
 *   npm run fetch:menupricetracker
 *   npm run fetch:menupricetracker -- --out feeds/mpt.json --limit 20
 *   npm run fetch:menupricetracker -- --city /mcdonalds/texas/irving
 *
 * Then:
 *
 *   npm run import:observations -- --feed menupricetracker --file feeds/menupricetracker-<date>.json
 *
 * Why this exists: the owner decided on 2026-10-11 to show MenuPriceTracker's
 * prices, named and linked, while a licensing request is outstanding. See
 * `unlicensedUse` in src/lib/feeds.ts.
 *
 * How it behaves on their site:
 *
 * - It reads robots.txt first, skips anything disallowed for unnamed bots, and
 *   waits at least the crawl-delay it asks for (10 seconds today) between
 *   every request, never less than 10.
 * - It only fetches what it needs. For each city our stores are in, one city
 *   page lists that city's stores; only store pages whose street number and
 *   city match one of ours are fetched. About one request per store we have.
 * - It never retries in a loop. A failed page is logged and skipped.
 *
 * Reads stores from whichever Firestore the environment points at, and writes
 * nothing to it. The output file goes to `feeds/` (gitignored: it is their
 * data, regenerated on demand, not ours to commit).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { matchFeedRow } from "../src/lib/feed-match";
import { getAdminDb } from "../src/lib/firebase/admin";
import {
  MPT_ORIGIN,
  MPT_USER_AGENT,
  cityPathForAddress,
  delaySeconds,
  isAllowed,
  parseCityPage,
  parseRobots,
  parseStorePage,
  type RobotsRules,
} from "../src/lib/menupricetracker";

interface Options {
  out: string;
  limit: number;
  cities: string[];
}

function parseArgs(argv: readonly string[]): Options {
  const values = (flag: string): string[] =>
    argv.flatMap((arg, at) => (arg === flag && argv[at + 1] !== undefined ? [argv[at + 1] as string] : []));

  const today = new Date().toISOString().slice(0, 10);
  const limit = Number.parseInt(values("--limit")[0] ?? "", 10);
  return {
    out: values("--out")[0] ?? `feeds/menupricetracker-${today}.json`,
    limit: Number.isFinite(limit) && limit > 0 ? limit : Number.POSITIVE_INFINITY,
    cities: values("--city"),
  };
}

interface StoreRef {
  id: string;
  address: string | null;
  locality: string | null;
}

async function loadStores(): Promise<StoreRef[]> {
  const snapshot = await getAdminDb().collection("stores").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      address: typeof data["address"] === "string" ? data["address"] : null,
      locality: typeof data["locality"] === "string" ? data["locality"] : null,
    };
  });
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** One polite GET. The wait is before the request, so the first one waits too. */
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
        headers: { "User-Agent": MPT_USER_AGENT, Accept: "text/html" },
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

interface OutputRow {
  address: string;
  city: string;
  mcchickenCents: number | null;
  observedAt: string;
  url: string;
  /** The page's own freshness claim, kept for the record; not used as the date. */
  listedAs: string | null;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const stores = await loadStores();
  console.log(`${stores.length} stores in the database.`);

  const robotsResponse = await fetch(`${MPT_ORIGIN}/robots.txt`, {
    headers: { "User-Agent": MPT_USER_AGENT },
  });
  if (!robotsResponse.ok) {
    console.error(`robots.txt answered ${robotsResponse.status}; not crawling without it.`);
    process.exit(1);
  }
  const rules = parseRobots(await robotsResponse.text());
  console.log(`robots.txt: ${delaySeconds(rules)}s between requests, ${rules.disallow.length} disallowed prefixes.\n`);
  const get = makeFetcher(rules);

  const cityPaths =
    options.cities.length > 0
      ? options.cities
      : [
          ...new Set(
            stores
              .map((store) => (store.address === null ? null : cityPathForAddress(store.address)))
              .filter((path): path is string => path !== null),
          ),
        ].sort();
  console.log(`${cityPaths.length} city pages to read.`);

  const rows: OutputRow[] = [];
  let storePagesFetched = 0;

  for (const cityPath of cityPaths) {
    if (storePagesFetched >= options.limit) break;
    const cityHtml = await get(cityPath);
    if (cityHtml === null) continue;

    const listed = parseCityPage(cityHtml);
    const wanted = listed.filter((entry) => matchFeedRow(entry, stores).kind === "match");
    console.log(`CITY    ${cityPath}: ${listed.length} listed, ${wanted.length} match our stores`);

    for (const entry of wanted) {
      if (storePagesFetched >= options.limit) break;
      const storeHtml = await get(entry.path);
      storePagesFetched += 1;
      if (storeHtml === null) continue;

      const page = parseStorePage(storeHtml);
      if (page === null) {
        console.log(`NOPAGE  ${entry.path} (no store data on the page)`);
        continue;
      }
      rows.push({
        address: page.address,
        city: page.city,
        mcchickenCents: page.priceCents,
        observedAt: new Date().toISOString(),
        url: `${MPT_ORIGIN}${entry.path}`,
        listedAs: page.verifiedLabel,
      });
      const price = page.priceCents === null ? "no McChicken listed" : `$${(page.priceCents / 100).toFixed(2)}`;
      console.log(`STORE   ${page.address}, ${page.city}: ${price}`);
    }
  }

  const out = resolve(options.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        feed: "menupricetracker",
        source: MPT_ORIGIN,
        note: "Each row is dated by when its page was read. The site gives a month per store, not a day.",
        rows,
      },
      null,
      2,
    )}\n`,
  );

  const priced = rows.filter((row) => row.mcchickenCents !== null).length;
  console.log(`\n${rows.length} store pages read, ${priced} with a McChicken price. Wrote ${options.out}.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
