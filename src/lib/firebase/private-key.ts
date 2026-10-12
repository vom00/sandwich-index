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
  /** Characters in the body that aren't base64 or ordinary whitespace, as code points. */
  strayCharacters: string[];
  /** Base64 characters in the body; a 2048-bit key has about 1620. */
  bodyLength: number;
  /** Whether the decoded body starts like a DER key (0x30 0x82). */
  bodyLooksLikeDer: boolean;
}

/** What the raw value looks like, without any of its content. */
export function describeKey(raw: string): KeyShape {
  const trimmed = raw.trim();
  // Escaped newlines are already understood; look past them for real debris.
  const unescaped = trimmed.replace(/\\n/g, "\n");
  const begin = unescaped.indexOf(BEGIN);
  const end = unescaped.indexOf(END);
  const rawBody = begin !== -1 && end > begin ? unescaped.slice(begin + BEGIN.length, end) : "";
  const stray = [...new Set(rawBody.replace(/[A-Za-z0-9+/=\s]/g, ""))].map(
    (char) => `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`,
  );
  const body = rawBody.replace(/[^A-Za-z0-9+/=]/g, "");
  const head = Buffer.from(body.slice(0, 4), "base64");
  return {
    strayCharacters: stray.slice(0, 10),
    bodyLength: body.length,
    bodyLooksLikeDer: head[0] === 0x30 && head[1] === 0x82,
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

  // Rebuild the PEM from its base64 body. Only base64 belongs there, so
  // anything else is paste debris: spaces where newlines were, or the
  // invisible characters (zero-width spaces, soft hyphens) some viewers put
  // into long lines when they are copied.
  const begin = key.indexOf(BEGIN);
  const end = key.indexOf(END);
  if (begin !== -1 && end > begin) {
    const body = key.slice(begin + BEGIN.length, end).replace(/[^A-Za-z0-9+/=]/g, "");
    const lines = body.match(/.{1,64}/g) ?? [];
    key = `${BEGIN}\n${lines.join("\n")}\n${END}\n`;
  }

  return { clientEmail: email, privateKey: key };
}
