/**
 * Every price in this codebase is an integer number of cents.
 *
 * This module is the single place where cents become a decimal, and it happens
 * only to produce a display string. If you find yourself writing arithmetic on
 * a dollar float anywhere else, the bug is there, not here.
 */

/** $1.00 — below this is a typo or a troll, not a sandwich. */
export const PRICE_MIN_CENTS = 100;
/** $15.00 — above this likewise. Enforced client-side and in firestore.rules. */
export const PRICE_MAX_CENTS = 1500;

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Render cents as currency. The `/ 100` here is the render-layer conversion the
 * integer-cents rule explicitly permits; it never flows back into stored data.
 */
export function formatCents(cents: number): string {
  return USD.format(cents / 100);
}

/** Signed form for deltas against an area median, e.g. `+$0.30`, `-$0.12`, `$0.00`. */
export function formatCentsDelta(cents: number): string {
  if (cents === 0) return USD.format(0);
  const sign = cents > 0 ? "+" : "-";
  return `${sign}${USD.format(Math.abs(cents) / 100)}`;
}

/**
 * Percentage difference of `cents` against `baselineCents`, rounded to one
 * decimal. Returns null when there is no baseline to compare against.
 */
export function percentDelta(cents: number, baselineCents: number | null): number | null {
  if (baselineCents === null || baselineCents === 0) return null;
  return Math.round(((cents - baselineCents) / baselineCents) * 1000) / 10;
}

export function formatPercentDelta(percent: number): string {
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}

/**
 * Parse user input into integer cents without ever constructing a float.
 *
 * `parseFloat("3.19") * 100` yields 318.99999999999994; rounding rescues that
 * particular case but the pattern is a trap, so we do string arithmetic and
 * sidestep it. Accepts `3`, `3.1`, `3.19`, `$3.19`, ` 3.19 `.
 *
 * Returns null for anything unparseable. Range is checked separately by
 * `isValidPriceCents` so callers can distinguish "not a number" from "too big".
 */
export function parseDollarsToCents(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, "").trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (match === null) return null;

  const dollars = Number.parseInt(match[1] ?? "0", 10);
  const fraction = match[2] ?? "";
  // "3.1" means 10 cents, not 1 — pad right to exactly two digits.
  const cents = Number.parseInt(fraction.padEnd(2, "0"), 10) || 0;

  return dollars * 100 + cents;
}

/** Inverse of `parseDollarsToCents`, for prefilling a form field. */
export function centsToInputValue(cents: number): string {
  const dollars = Math.floor(cents / 100);
  const remainder = cents % 100;
  return `${dollars}.${String(remainder).padStart(2, "0")}`;
}

export function isValidPriceCents(cents: number): boolean {
  return (
    Number.isInteger(cents) && cents >= PRICE_MIN_CENTS && cents <= PRICE_MAX_CENTS
  );
}
