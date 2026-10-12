/**
 * Turning whatever was pasted into FIREBASE_PRIVATE_KEY into a PEM key.
 *
 * The key comes from the service-account JSON file, and pasting it into a
 * hosting dashboard goes wrong in a handful of predictable ways: the JSON
 * string's quotes come along, the newlines stay as the two characters `\n`,
 * Windows line endings creep in, or the whole file gets pasted. Each of those
 * is recoverable without anyone having to paste it again.
 *
 * Kept apart from `admin.ts` (which is `server-only`) so it can be unit
 * tested. Nothing here logs or returns the key's content.
 */

const BEGIN = "-----BEGIN PRIVATE KEY-----";
const END = "-----END PRIVATE KEY-----";

export interface KeyShape {
  hasBegin: boolean;
  hasEnd: boolean;
  wrappedInQuotes: boolean;
  escapedNewlines: boolean;
  realNewlines: boolean;
  looksLikeJson: boolean;
  length: number;
}

/** What the raw value looks like, without any of its content. */
export function describeKey(raw: string): KeyShape {
  const trimmed = raw.trim();
  return {
    hasBegin: trimmed.includes(BEGIN),
    hasEnd: trimmed.includes(END),
    wrappedInQuotes: /^["'][\s\S]*["'],?$/.test(trimmed),
    escapedNewlines: trimmed.includes("\\n"),
    realNewlines: trimmed.includes("\n"),
    looksLikeJson: trimmed.startsWith("{"),
    length: trimmed.length,
  };
}

/** The pasted credentials, repaired where the paste went wrong. */
export function normalizeCredentials(
  clientEmail: string,
  privateKey: string,
): { clientEmail: string; privateKey: string } {
  let email = clientEmail.trim().replace(/^["']|["'],?$/g, "");
  let key = privateKey.trim();

  // The whole service-account file, pasted into the key field.
  if (key.startsWith("{")) {
    try {
      const parsed = JSON.parse(key) as { private_key?: unknown; client_email?: unknown };
      if (typeof parsed.private_key === "string") key = parsed.private_key;
      if (typeof parsed.client_email === "string" && email === "") email = parsed.client_email;
    } catch {
      // Not valid JSON after all; carry on with the other repairs.
    }
  }

  // `"private_key": "-----BEGIN…"` or the JSON string with its quotes.
  key = key.replace(/^\s*"private_key"\s*:\s*/, "");
  key = key.replace(/^["']/, "").replace(/["'],?$/, "");

  key = key.replace(/\\n/g, "\n").replace(/\r\n?/g, "\n");

  // A key pasted onto one line with spaces where the newlines were: rebuild
  // the PEM from its base64 body.
  const begin = key.indexOf(BEGIN);
  const end = key.indexOf(END);
  if (begin !== -1 && end > begin) {
    const body = key.slice(begin + BEGIN.length, end).replace(/\s+/g, "");
    const lines = body.match(/.{1,64}/g) ?? [];
    key = `${BEGIN}\n${lines.join("\n")}\n${END}\n`;
  }

  return { clientEmail: email, privateKey: key };
}
