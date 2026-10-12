import { createPrivateKey, generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { describeKey, normalizeCredentials } from "@/lib/firebase/private-key";

// A throwaway key made for this test, in the same PKCS#8 PEM shape as a
// service-account file's `private_key`.
const { privateKey: pem } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
// A key whose base64 ends in "=" padding, for the padding-debris cases.
const padded = (() => {
  for (;;) {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    if (/=\n-----END/.test(privateKey)) return privateKey;
  }
})();
const EMAIL = "firebase-adminsdk-test@example-project.iam.gserviceaccount.com";
const escaped = pem.replace(/\n/g, "\\n");

function parses(key: string): boolean {
  try {
    createPrivateKey(key);
    return true;
  } catch {
    return false;
  }
}

describe("normalizeCredentials", () => {
  const pastes: Record<string, string> = {
    "the key as is, real newlines": pem,
    "escaped newlines": escaped,
    "the JSON string with its quotes": `"${escaped}"`,
    "the JSON string with quotes and a trailing comma": `"${escaped}",`,
    "the whole JSON line": `"private_key": "${escaped}",`,
    "Windows line endings": pem.replace(/\n/g, "\r\n"),
    "one line, spaces where the newlines were": pem.replace(/\n/g, " "),
    "surrounding whitespace": `\n  ${escaped}  \n`,
    "zero-width spaces and soft hyphens from a copied viewer": pem
      .split("\n")
      .map((line, i) => (i % 3 === 1 ? `${line.slice(0, 20)}​${line.slice(20)}­` : line))
      .join("\n"),
    "the whole service-account file": JSON.stringify({ type: "service_account", private_key: pem, client_email: EMAIL }, null, 2),
  };

  for (const [name, raw] of Object.entries(pastes)) {
    it(`repairs ${name}`, () => {
      expect(parses(normalizeCredentials(EMAIL, raw).privateKey)).toBe(true);
    });
  }

  it("drops a character left after the padding by a newline that lost its backslash", () => {
    const damaged = padded.replace(/=\n-----END/, "=n\n-----END");
    expect(parses(damaged)).toBe(false);
    expect(parses(normalizeCredentials(EMAIL, damaged).privateKey)).toBe(true);
  });

  it("takes the email from a pasted file, since the file's key and email belong together", () => {
    const file = JSON.stringify({ private_key: pem, client_email: EMAIL });
    expect(normalizeCredentials("", file).clientEmail).toBe(EMAIL);
    expect(normalizeCredentials("someone-else@other.iam.gserviceaccount.com", file).clientEmail).toBe(EMAIL);
  });

  it("strips quotes pasted around the email", () => {
    expect(normalizeCredentials(`"${EMAIL}",`, pem).clientEmail).toBe(EMAIL);
  });

  it("leaves a value with no key in it unparseable rather than inventing one", () => {
    expect(parses(normalizeCredentials(EMAIL, "not a key").privateKey)).toBe(false);
  });
});

describe("describeKey", () => {
  it("reports shape, never content", () => {
    const shape = describeKey(`"${escaped}"`);
    expect(shape).toMatchObject({ hasBegin: true, hasEnd: true, wrappedInQuotes: true, escapedNewlines: true });
    expect(JSON.stringify(shape)).not.toContain(pem.split("\n")[1]);
    expect(shape.bodyLooksLikeDer).toBe(true);
    expect(shape.strayCharacters).toEqual([]);
  });

  it("finds the line a character was added to, and debris after the padding", () => {
    const lines = pem.split("\n");
    lines[5] = `${lines[5]}A`;
    expect(describeKey(lines.join("\n")).oddLines).toContain("5:65");
    expect(describeKey(padded.replace(/=\n-----END/, "=n\n-----END")).charsAfterPadding).toBe(1);
  });

  it("names invisible characters by code point", () => {
    const lines = pem.split("\n");
    lines[2] = `${lines[2]}​`;
    expect(describeKey(lines.join("\n")).strayCharacters).toEqual(["U+200B"]);
  });
});
