import { describe, expect, it } from "vitest";

import { networkPrefix, reporterKey } from "@/lib/reporter.server";

describe("networkPrefix", () => {
  it("keeps the /24 of an IPv4 address", () => {
    expect(networkPrefix("203.0.113.77")).toBe("v4:203.0.113");
    expect(networkPrefix("203.0.113.1")).toBe(networkPrefix("203.0.113.254"));
    expect(networkPrefix("203.0.114.1")).not.toBe(networkPrefix("203.0.113.1"));
  });

  it("treats an IPv4-mapped IPv6 address as IPv4", () => {
    expect(networkPrefix("::ffff:203.0.113.77")).toBe("v4:203.0.113");
  });

  it("keeps the /56 of an IPv6 address", () => {
    expect(networkPrefix("2001:db8:abcd:12ff:1:2:3:4")).toBe("v6:2001:db8:abcd:1200");
    // Privacy addresses rotate the low 64 bits; a /56 customer block keeps
    // its first 56. Both stay the same reporter.
    expect(networkPrefix("2001:db8:abcd:1234::9")).toBe(networkPrefix("2001:db8:abcd:12ab:ffff::1"));
    expect(networkPrefix("2001:db8::1")).toBe("v6:2001:db8:0:0");
  });

  it("rejects anything that is not an address", () => {
    expect(networkPrefix("local")).toBeNull();
    expect(networkPrefix("300.1.1.1")).toBeNull();
    expect(networkPrefix("1::2::3")).toBeNull();
    expect(networkPrefix("")).toBeNull();
  });
});

describe("reporterKey", () => {
  const secret = "test-secret";

  it("gives the same code for two anonymous identities on one network", () => {
    const first = reporterKey({ uid: "anon-1", anonymous: true, address: "203.0.113.5", secret });
    const afterClearingSiteData = reporterKey({ uid: "anon-2", anonymous: true, address: "203.0.113.9", secret });
    expect(afterClearingSiteData).toBe(first);
  });

  it("gives different codes on different networks", () => {
    const home = reporterKey({ uid: "anon-1", anonymous: true, address: "203.0.113.5", secret });
    const elsewhere = reporterKey({ uid: "anon-1", anonymous: true, address: "198.51.100.5", secret });
    expect(elsewhere).not.toBe(home);
  });

  it("follows a signed-in account wherever it is", () => {
    const home = reporterKey({ uid: "user-1", anonymous: false, address: "203.0.113.5", secret });
    const away = reporterKey({ uid: "user-1", anonymous: false, address: "198.51.100.5", secret });
    const other = reporterKey({ uid: "user-2", anonymous: false, address: "203.0.113.5", secret });
    expect(away).toBe(home);
    expect(other).not.toBe(home);
  });

  it("falls back to the sign-in uid without a secret or an address", () => {
    const noSecret = (uid: string) => reporterKey({ uid, anonymous: true, address: "203.0.113.5", secret: undefined });
    expect(noSecret("anon-1")).not.toBe(noSecret("anon-2"));
    const local = (uid: string) => reporterKey({ uid, anonymous: true, address: "local", secret });
    expect(local("anon-1")).not.toBe(local("anon-2"));
  });

  it("depends on the secret and does not contain the address", () => {
    const a = reporterKey({ uid: "x", anonymous: true, address: "203.0.113.5", secret: "one" });
    const b = reporterKey({ uid: "x", anonymous: true, address: "203.0.113.5", secret: "two" });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("203");
  });
});
