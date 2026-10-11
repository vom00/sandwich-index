/**
 * Shared validation schemas.
 *
 * Used on both sides of the wire, but never mistaken for security. The
 * authoritative checks live in firestore.rules; these exist to give an honest
 * contributor an immediate, specific error instead of a rejected write.
 */

import { z } from "zod";

import { PRICE_MAX_CENTS, PRICE_MIN_CENTS } from "@/lib/money";
import { PRICE_SOURCES } from "@/types";

/** Matches the OSM element id format used as a store document id. */
export const storeIdSchema = z
  .string()
  .regex(/^(node|way|relation)-\d+$/, "Not a valid store id");

export const priceCentsSchema = z
  .number()
  .int("Price must be a whole number of cents")
  .min(PRICE_MIN_CENTS, `Price must be at least $${(PRICE_MIN_CENTS / 100).toFixed(2)}`)
  .max(PRICE_MAX_CENTS, `Price must be at most $${(PRICE_MAX_CENTS / 100).toFixed(2)}`);

export const priceSourceSchema = z.enum(PRICE_SOURCES);

export const submissionInputSchema = z.object({
  storeId: storeIdSchema,
  priceCents: priceCentsSchema,
  source: priceSourceSchema,
});

export type SubmissionInput = z.infer<typeof submissionInputSchema>;

/**
 * A required coordinate parsed from an untrusted string.
 *
 * The `preprocess` step is not decoration. `URLSearchParams.get()` returns null
 * for an absent parameter and `z.coerce.number()` turns null into 0, so a
 * request with no coordinates at all would validate cleanly as latitude 0,
 * longitude 0 — a point in the Gulf of Guinea — and answer 200 with an empty
 * list instead of telling the caller they forgot the arguments. Mapping null
 * and empty string to undefined lets zod's own "required" check fire.
 *
 * Empty string is not the only spelling of "absent", which is why this trims
 * rather than comparing to `""`. `Number("")`, `Number(" ")` and `Number("\t\n")`
 * are all 0, so `?lat=%20` reached the same Gulf of Guinea this guard exists to
 * prevent, and answered 200 with an empty list.
 */
function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

function coordinate(min: number, max: number) {
  return z.preprocess(blankToUndefined, z.coerce.number().min(min).max(max));
}

export const coordinatesSchema = z.object({
  lat: coordinate(-90, 90),
  lng: coordinate(-180, 180),
});

/** 15 miles is the default search radius; 50 is the ceiling to keep Overpass sane. */
export const radiusMilesSchema = z.preprocess(
  blankToUndefined,
  z.coerce.number().positive().max(50).default(15),
);

export const nearbyQuerySchema = coordinatesSchema.extend({
  radiusMiles: radiusMilesSchema,
});

/** US ZIP, the manual fallback for anyone who declines geolocation. */
export const zipSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "Enter a 5-digit ZIP code");
