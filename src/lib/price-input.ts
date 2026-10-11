/**
 * Turning what somebody typed into cents, and saying why when it will not.
 *
 * This lives on its own because two surfaces now read a price from a text
 * field — the single-store dialog and the bulk logging run — and the accepted
 * range is also written into firestore.rules. Three copies of one rule is two
 * too many; the rules file is the one that actually decides, and this is the
 * single client-side statement of the same thing.
 *
 * Returns cents rather than a boolean so callers never parse twice. The old
 * shape validated a string, then re-parsed it to get the number, which meant
 * two chances for the two paths to disagree about what the string meant.
 */

import {
  PRICE_MAX_CENTS,
  PRICE_MIN_CENTS,
  formatCents,
  parseDollarsToCents,
} from "@/lib/money";

export type PriceInputResult =
  | { ok: true; cents: number }
  | { ok: false; message: string };

/**
 * `blank` is a distinct outcome from invalid. In a bulk run most rows are
 * deliberately left empty and skipped, so an empty field there is not an error
 * to complain about; the single-store form treats it as one. Callers decide.
 */
export function isBlank(raw: string): boolean {
  return raw.trim() === "";
}

export function readPriceInput(raw: string): PriceInputResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, message: "Enter the price you paid." };

  const cents = parseDollarsToCents(trimmed);
  if (cents === null) return { ok: false, message: "Dollars and cents only, like 3.19." };

  if (cents < PRICE_MIN_CENTS) {
    return {
      ok: false,
      message: `That is under ${formatCents(PRICE_MIN_CENTS)}. Worth a second look.`,
    };
  }
  if (cents > PRICE_MAX_CENTS) {
    return {
      ok: false,
      message: `That is over ${formatCents(PRICE_MAX_CENTS)}. Worth a second look.`,
    };
  }

  return { ok: true, cents };
}
