/**
 * Composing a printable address out of loose geocoding fields.
 *
 * Shared by the two places addresses enter the system — OpenStreetMap tags via
 * Overpass, and the reverse geocoder that fills in what OSM leaves blank — so
 * both apply the same rule about what counts as an address. A store whose
 * address came from either path has to read identically; a user cannot tell
 * which lookup produced it and should not have to.
 */

export interface AddressParts {
  houseNumber?: string | undefined;
  street?: string | undefined;
  city?: string | undefined;
  state?: string | undefined;
  postcode?: string | undefined;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

/**
 * A street-level address, or null.
 *
 * Null unless there is at least a street, because a bare city and postcode is
 * not an address a person can navigate to and rendering it as one would be
 * misleading. `composeLocality` covers that case honestly instead.
 */
export function composeStreetAddress(parts: AddressParts): string | null {
  const street = clean(parts.street);
  if (street === undefined) return null;

  const line1 = [clean(parts.houseNumber), street].filter(Boolean).join(" ");
  const line2 = composeLocality(parts);

  return line2 === null ? line1 : `${line1}, ${line2}`;
}

/**
 * "Euless, TX 76039" — where a store is, when nothing says precisely where.
 *
 * Deliberately not a fallback *address*: it is shown as a locality, labelled as
 * such, so nobody mistakes it for a doorstep. Null when even the town is
 * unknown, which is the only remaining case worth admitting to.
 */
export function composeLocality(parts: AddressParts): string | null {
  const city = clean(parts.city);
  const region = [clean(parts.state), clean(parts.postcode)].filter(Boolean).join(" ");

  const composed = [city, region].filter((part) => part !== "").join(", ");
  return composed === "" ? null : composed;
}
