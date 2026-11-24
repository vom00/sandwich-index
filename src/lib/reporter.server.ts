import "server-only";

import { createHmac } from "node:crypto";

/**
 * Who a price report came from, as an opaque code.
 *
 * A big price change needs a second report before it counts, and the point is
 * lost if one person can supply both. Anonymous sign-in alone cannot tell:
 * clearing site data hands the same person a fresh identity. So the code is
 * built from something that survives that:
 *
 * - A signed-in (non-anonymous) account is its own reporter, wherever it is.
 * - Anyone else is their network: the IPv4 /24 or the IPv6 /56 they sent
 *   from. Clearing site data, a private window or a second browser on the
 *   same connection all come out as the same reporter. The cost is that two
 *   people on one Wi-Fi network count as one, which only means a third
 *   report (or the price feed) is needed to confirm a change they agree on.
 *
 * The code is an HMAC under `REPORTER_HASH_SECRET`, so it cannot be turned
 * back into an address, and it never leaves the server: it is stored on the
 * submission, which browsers cannot read, and left out of every API response.
 *
 * Without the secret (local development, or before it is configured) the
 * network cannot be hashed safely, since an unkeyed hash of 2^24 prefixes is
 * trivial to reverse. The code then falls back to the sign-in uid, which is
 * exactly what the site enforced before.
 */

export interface ReporterInput {
  uid: string;
  /** True for anonymous sign-in, false for a real account. */
  anonymous: boolean;
  /** The client address from the request, or "local" when there is none. */
  address: string;
  /** REPORTER_HASH_SECRET, if set. */
  secret: string | undefined;
}

/** Expand an IPv6 address to its eight hextets, or null if it is not one. */
function hextets(address: string): number[] | null {
  const [head = "", tail, extra] = address.split("::");
  if (extra !== undefined) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":"));
  const left = parse(head);
  const right = tail === undefined ? [] : parse(tail);
  const fill = 8 - left.length - right.length;
  if (tail === undefined ? fill !== 0 : fill < 1) return null;
  const all = [...left, ...Array<string>(fill).fill("0"), ...right];
  const values = all.map((h) => (/^[0-9a-f]{1,4}$/i.test(h) ? parseInt(h, 16) : NaN));
  return values.some(Number.isNaN) ? null : values;
}

/**
 * The network a client address belongs to: IPv4 /24, IPv6 /56. Null for
 * anything that is not an address (no proxy header, or garbage).
 */
export function networkPrefix(address: string): string | null {
  const trimmed = address.trim().replace(/^\[|\]$/g, "");
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i.exec(trimmed);
  if (v4) {
    const octets = v4.slice(1, 5).map(Number);
    if (octets.some((o) => o > 255)) return null;
    return `v4:${octets.slice(0, 3).join(".")}`;
  }
  const v6 = hextets(trimmed.split("%")[0] ?? "");
  if (v6 === null) return null;
  // /56 is three full hextets and the high byte of the fourth.
  const prefix = [...v6.slice(0, 3), (v6[3] ?? 0) & 0xff00];
  return `v6:${prefix.map((h) => h.toString(16)).join(":")}`;
}

/** The opaque reporter code for one submission. */
export function reporterKey({ uid, anonymous, address, secret }: ReporterInput): string {
  const network = networkPrefix(address);
  const basis =
    !anonymous ? `account:${uid}` : secret && network !== null ? `network:${network}` : `device:${uid}`;
  return createHmac("sha256", secret || "sandwich-index-reporter")
    .update(basis)
    .digest("hex")
    .slice(0, 32);
}
