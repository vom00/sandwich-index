/**
 * The ZIP code check, without zod.
 *
 * The location gate is the only client code that validates anything with a
 * schema, and importing `zipSchema` there put all of zod (about 67 KB
 * gzipped) on `/map`, which the site header then prefetched from every page.
 * A five-digit test needs none of it. `zipSchema` in validation.ts uses the
 * same pattern and message, so the API and the form cannot disagree.
 */

export const ZIP_PATTERN = /^\d{5}$/;
export const ZIP_MESSAGE = "Enter a 5-digit ZIP code";

/** The trimmed ZIP, or null when it isn't five digits. */
export function parseZip(value: string): string | null {
  const trimmed = value.trim();
  return ZIP_PATTERN.test(trimmed) ? trimmed : null;
}
