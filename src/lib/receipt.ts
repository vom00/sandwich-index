/**
 * Reading a McChicken price out of the text on a receipt or an app screenshot.
 *
 * The text comes from OCR on the visitor's own device (`lib/ocr.ts`); this file
 * only interprets it, so it runs anywhere and is tested without images. It
 * never submits anything. What it finds is put in the form for the person to
 * check, and every rule a typed price faces still applies after that.
 *
 * Two kinds of picture, both exact:
 *   - A receipt is what one store charged on one day. McDonald's receipt FAQ
 *     puts "McDonald's Restaurant #" and the store number above the address,
 *     and the date and time below it. The item-line wording ("1 McChicken
 *     2.49") is inferred, not confirmed, so it is matched loosely.
 *   - An app screenshot of the McChicken, with a store selected, is the price
 *     that store's menu shows. Its layout is guessed too; only the name and a
 *     "$2.49" just under it are relied on.
 *
 * Only the plain sandwich counts. A Spicy McChicken, a McChicken Meal or a
 * McChicken Biscuit is a different price, and quoting it as this one would be
 * exactly the wrong number with exactly the right name.
 */

export type PictureKind = "receipt" | "app";

export interface McChickenLine {
  /** The price of one sandwich. "2 McChicken 5.98" is 299. */
  unitCents: number;
  quantity: number;
  /** The line as read, for showing the person what was found. */
  line: string;
}

export type MissingReason =
  /** OCR found next to no text: a blurry, dark or sideways photo. */
  | "no-text"
  /** It mentions McChicken, but only a meal, a Spicy McChicken or the like. */
  | "only-variants"
  /** Text, but no McChicken at all. */
  | "no-mcchicken";

export interface ReadPicture {
  kind: PictureKind | null;
  /** The number after "Restaurant #", as printed. */
  restaurantNumber: string | null;
  /** "813 S MACARTHUR BLVD", or the app's pickup address. */
  street: string | null;
  /** "COPPELL, TX 75019". */
  locality: string | null;
  /** YYYY-MM-DD, from a receipt. */
  date: string | null;
  mcchicken: McChickenLine | null;
  missing: MissingReason | null;
}

/** A receipt older than this isn't today's price, and a report says it is. */
export const MAX_RECEIPT_AGE_DAYS = 7;

/** Levenshtein distance, for names OCR got one letter wrong. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

function words(name: string): string {
  return name
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/**
 * "McChicken", "MCCHICKEN", "Mc Chicken", "McChicken®", and one OCR slip
 * ("McChlcken"). Not "Spicy McChicken", "McChicken Meal" or "McChicken
 * Biscuit": any other word in the name rules it out.
 */
export function isPlainMcChicken(name: string): boolean {
  const joined = words(name).replace(/ /g, "");
  return joined.length >= 8 && joined.length <= 10 && distance(joined, "mcchicken") <= 1;
}

function mentionsMcChicken(name: string): boolean {
  return words(name)
    .split(" ")
    .some((word, index, all) => {
      const pair = word === "mc" ? `mc${all[index + 1] ?? ""}` : word;
      return pair.length >= 8 && distance(pair, "mcchicken") <= 1;
    });
}

/**
 * A price at the end of a line. OCR reads a decimal point as a colon or a
 * comma often enough that both are accepted; nothing else is guessed at.
 */
const TRAILING_PRICE = /\$?\s?(\d{1,3})[.:,](\d{2})(?:\s+[A-Z])?$/;

function centsFrom(dollars: string, cents: string): number {
  return Number(dollars) * 100 + Number(cents);
}

function readDate(text: string): string | null {
  const match = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);
  if (match === null) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = match[3]!.length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const STREET_LINE = /^\d{1,6}\s+[A-Za-z0-9]/;
const LOCALITY_LINE = /^[A-Za-z .'-]+,\s*[A-Za-z]{2}\b/;

export function readPictureText(text: string): ReadPicture {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "");

  const read: ReadPicture = {
    kind: null,
    restaurantNumber: null,
    street: null,
    locality: null,
    date: null,
    mcchicken: null,
    missing: null,
  };

  const letters = lines.join("").replace(/[^A-Za-z]/g, "").length;
  if (letters < 6) {
    read.missing = "no-text";
    return read;
  }

  // A receipt: the store number, then the address under it.
  const restaurantAt = lines.findIndex((line) => /restaurant\s*[#H]?\s*\d{3,5}\b/i.test(line));
  if (restaurantAt !== -1) {
    read.kind = "receipt";
    read.restaurantNumber = lines[restaurantAt]!.match(/restaurant\s*[#H]?\s*(\d{3,5})\b/i)![1]!;
    const after = lines.slice(restaurantAt + 1, restaurantAt + 4);
    read.street = after.find((line) => STREET_LINE.test(line)) ?? null;
    read.locality = after.find((line) => LOCALITY_LINE.test(line) && !STREET_LINE.test(line)) ?? null;
    read.date = readDate(text);
  }

  let sawVariant = false;
  for (const line of lines) {
    const price = line.match(TRAILING_PRICE);
    if (price === null) {
      if (mentionsMcChicken(line) && !isPlainMcChicken(line)) sawVariant = true;
      continue;
    }
    const before = line.slice(0, price.index).trim();
    const quantity = before.match(/^(\d{1,2})\s+(.+)$/);
    const name = quantity === null ? before : quantity[2]!;
    if (isPlainMcChicken(name)) {
      const count = quantity === null ? 1 : Number(quantity[1]);
      if (count >= 1 && read.mcchicken === null) {
        read.mcchicken = {
          unitCents: Math.round(centsFrom(price[1]!, price[2]!) / count),
          quantity: count,
          line,
        };
      }
    } else if (mentionsMcChicken(name)) {
      sawVariant = true;
    }
  }

  // An app screenshot: the name on its own line, the price just under it.
  if (read.mcchicken === null && read.kind === null) {
    const nameAt = lines.findIndex((line) => isPlainMcChicken(line));
    if (nameAt !== -1) {
      for (const next of lines.slice(nameAt + 1, nameAt + 3)) {
        const price = next.match(/^\$\s?(\d{1,3})[.:,](\d{2})\b/);
        if (price !== null) {
          read.kind = "app";
          read.mcchicken = { unitCents: centsFrom(price[1]!, price[2]!), quantity: 1, line: `${lines[nameAt]} ${next}` };
          break;
        }
      }
    }
    if (read.kind === "app") {
      const pickupAt = lines.findIndex((line) => /^(pick ?up|order(ing)? (from|at)|your restaurant)\b/i.test(line));
      const candidates = pickupAt === -1 ? lines.slice(0, Math.max(3, nameAt)) : lines.slice(pickupAt, pickupAt + 2);
      const street = candidates
        .map((line) => line.replace(/^(pick ?up at|order(ing)? (from|at))\s*/i, ""))
        .find((line) => STREET_LINE.test(line));
      read.street = street ?? null;
    }
  }

  if (read.mcchicken === null) read.missing = sawVariant ? "only-variants" : "no-mcchicken";
  return read;
}

export type StoreCheck =
  | { verdict: "match"; by: "number" | "street" }
  | { verdict: "mismatch"; by: "number" | "street" }
  | { verdict: "unknown" };

function streetNumber(value: string | null): string | null {
  return value?.trim().match(/^(\d{1,6})\b/)?.[1] ?? null;
}

/**
 * Is this picture from the store being logged?
 *
 * The restaurant number decides when both sides have one. Otherwise the
 * street number does; it is the one part of an address OCR rarely mangles and
 * that two nearby stores rarely share. Neither known means "unknown", which
 * the form treats as the person's call, as it does for a typed price.
 */
export function checkStore(
  read: ReadPicture,
  store: { restaurantNumber: string | null; address: string | null },
): StoreCheck {
  if (read.restaurantNumber !== null && store.restaurantNumber !== null) {
    return read.restaurantNumber === store.restaurantNumber
      ? { verdict: "match", by: "number" }
      : { verdict: "mismatch", by: "number" };
  }
  const theirs = streetNumber(read.street);
  const ours = streetNumber(store.address);
  if (theirs !== null && ours !== null) {
    return theirs === ours ? { verdict: "match", by: "street" } : { verdict: "mismatch", by: "street" };
  }
  return { verdict: "unknown" };
}

/**
 * Whole days between a receipt's date and now, in the visitor's time zone.
 * Null for a date in the future, which is an OCR misread, not a receipt.
 */
export function receiptAgeDays(date: string, now: Date = new Date()): number | null {
  const [year, month, day] = date.split("-").map(Number);
  const printed = new Date(year!, month! - 1, day!);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((today.getTime() - printed.getTime()) / 86_400_000);
  return days < 0 ? null : days;
}
