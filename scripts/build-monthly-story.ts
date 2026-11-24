/**
 * Builds `src/data/monthly/<yyyy-mm>.json`, the figures behind one month's
 * data story (`/story/<yyyy-mm>`), and the index the page imports them from.
 *
 *   npm run build:monthly-story                      the month of the feed's newest reading
 *   npm run build:monthly-story -- --month 2026-11
 *   npm run build:monthly-story -- --month 2026-11 --firestore
 *
 * Every figure is counted from data on file (rules and tie-breaks in
 * `lib/monthly-story`):
 *
 *   - This month's prices: the Drive Thru Index reading committed at
 *     `src/data/feeds/drivethruindex.json`, rows dated inside the month.
 *   - The previous reading, for the month's price changes: the newest
 *     version of that file in this branch's git history taken wholly before
 *     the month began. Only commits reachable from HEAD count, so the story
 *     quotes the same readings the site shows; a refresh still waiting on its
 *     own branch is left out until it is merged.
 *   - Visitor reports accepted in the month: only with `--firestore`, which
 *     reads the live database (read only; at most READ_LIMIT documents, one
 *     query). It needs the Admin credentials the server uses
 *     (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY) in
 *     the environment, and refuses the emulator, whose reports are test data,
 *     unless the output goes outside `src/data/monthly` (`--out`).
 *
 * Without a source a figure is left null and listed in the file's `missing`
 * with the reason; the page shows it blank. Deterministic for the same inputs
 * apart from `generatedAt`.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMonthlyStory,
  isStoryMonth,
  monthBounds,
  type FeedRow,
  type ListedStore,
} from "../src/lib/monthly-story";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FEED_PATH = "src/data/feeds/drivethruindex.json";
const STORY_DIR = resolve(ROOT, "src/data/monthly");
/** More reports than this in one month and the count is left blank rather than half read. */
const READ_LIMIT = 5000;

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const readJson = <T>(path: string): T => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as T;

function listedStores(): ListedStore[] {
  type Row = [string, number, number, string, string, string, string];
  const rows = [...readJson<Row[]>("src/data/us-stores.json"), ...readJson<Row[]>("src/data/us-stores-dti.json")];
  const byId = new Map<string, ListedStore>();
  for (const [number, , , address, city, state] of rows) {
    byId.set(`atp-${number}`, { id: `atp-${number}`, address: address ?? "", city: city ?? "", state: state ?? "" });
  }
  return [...byId.values()];
}

const newestOf = (rows: readonly FeedRow[]) => rows.reduce((max, row) => (row.observedAt > max ? row.observedAt : max), "");

/** The newest committed reading taken wholly before `start`, or null. */
function previousReading(start: string): { rows: FeedRow[]; rev: string } | null {
  let revs: string[];
  try {
    revs = execFileSync("git", ["log", "--format=%H", "HEAD", "--", FEED_PATH], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    console.warn("git is not available here, so there is no previous reading to compare with.");
    return null;
  }
  for (const rev of revs) {
    const text = execFileSync("git", ["show", `${rev}:${FEED_PATH}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const rows = (JSON.parse(text) as { rows: FeedRow[] }).rows;
    if (newestOf(rows) < start) return { rows, rev: rev.slice(0, 7) };
  }
  return null;
}

async function countConfirmed(start: string, end: string, out: string): Promise<{ count: number | null; reason?: string }> {
  if (process.env.FIRESTORE_EMULATOR_HOST !== undefined && out.startsWith(STORY_DIR)) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is set: the emulator's reports are test data, not a month's figures. " +
        "Unset it to read the live database, or pass --out with a path outside src/data/monthly.",
    );
  }
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const snapshot = await getAdminDb()
    .collection("submissions")
    .where("submittedAt", ">=", new Date(start))
    .where("submittedAt", "<", new Date(end))
    .select("status")
    .limit(READ_LIMIT + 1)
    .get();
  console.log(`Read ${snapshot.size} report(s) from the database.`);
  if (snapshot.size > READ_LIMIT) {
    return { count: null, reason: `More than ${READ_LIMIT} reports this month; the count was not read in full.` };
  }
  return { count: snapshot.docs.filter((doc) => doc.get("status") === "accepted").length };
}

/** Rewrites `src/data/monthly/index.ts` from the story files present. */
function writeIndex(): string[] {
  const months = readdirSync(STORY_DIR)
    .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
    .map((name) => name.slice(0, 7))
    .sort();
  const ident = (month: string) => `story_${month.replace("-", "_")}`;
  const lines = [
    "// Written by scripts/build-monthly-story.ts (npm run build:monthly-story). Do not edit by hand.",
    "",
    'import type { MonthlyStory } from "@/lib/monthly-story";',
    "",
    ...months.map((month) => `import ${ident(month)} from "./${month}.json";`),
    "",
    "/** Every month with a data story, oldest first. */",
    "export const MONTHLY_STORIES: Readonly<Record<string, MonthlyStory>> = {",
    ...months.map((month) => `  "${month}": ${ident(month)} as MonthlyStory,`),
    "};",
    "",
  ];
  writeFileSync(resolve(STORY_DIR, "index.ts"), lines.join("\n"));
  return months;
}

async function main() {
  const current = readJson<{ rows: FeedRow[] }>(FEED_PATH).rows;
  const month = arg("month") ?? newestOf(current).slice(0, 7);
  if (!isStoryMonth(month)) throw new Error(`--month must be yyyy-mm, got ${month}`);
  const { start, end } = monthBounds(month);
  const out = resolve(ROOT, arg("out") ?? `src/data/monthly/${month}.json`);

  const previous = previousReading(start);
  console.log(
    previous === null
      ? "No reading from before the month in this branch's history."
      : `Comparing with the reading at ${previous.rev} (newest ${newestOf(previous.rows).slice(0, 10)}).`,
  );

  let confirmed: number | null = null;
  // Shown to readers on the page, so it says what happened, not which flag to pass.
  let confirmedMissingReason = "Reports from visitors are counted in the site’s live database, which was not read when this story was built.";
  if (!flag("firestore")) console.log("Visitor reports not counted: run with --firestore and the live database's Admin credentials to count them.");
  if (flag("firestore")) {
    const result = await countConfirmed(start, end, out);
    confirmed = result.count;
    if (result.reason) confirmedMissingReason = result.reason;
  }

  const story = buildMonthlyStory({
    month,
    generatedAt: new Date().toISOString(),
    listed: listedStores(),
    current,
    previous: previous?.rows ?? null,
    confirmed,
    confirmedMissingReason,
  });

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(story, null, 2)}\n`);
  console.log(`Wrote ${out}`);
  if (out.startsWith(STORY_DIR)) console.log(`Stories: ${writeIndex().join(", ")}`);
  for (const { field, reason } of story.missing) console.log(`  missing ${field}: ${reason}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
