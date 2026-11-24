import { beforeEach, describe, expect, it } from "vitest";

import { clientAddress, rateLimited, resetRateLimits, takeToken, type RateLimitRule } from "@/lib/rate-limit";

const RULE: RateLimitRule = { name: "test", limit: 3, windowMs: 60_000 };

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/stores", { headers });
}

describe("rate limit", () => {
  beforeEach(() => resetRateLimits());

  it("allows the limit, then refuses with a retry time", () => {
    const t = 1_000_000;
    expect(takeToken(RULE, "1.2.3.4", t)).toEqual({ ok: true, remaining: 2 });
    expect(takeToken(RULE, "1.2.3.4", t + 1)).toEqual({ ok: true, remaining: 1 });
    expect(takeToken(RULE, "1.2.3.4", t + 2)).toEqual({ ok: true, remaining: 0 });
    expect(takeToken(RULE, "1.2.3.4", t + 20_000)).toEqual({ ok: false, retryAfterSeconds: 40 });
  });

  it("opens a fresh window once the old one has passed", () => {
    const t = 2_000_000;
    for (let i = 0; i < 3; i += 1) takeToken(RULE, "1.2.3.4", t);
    expect(takeToken(RULE, "1.2.3.4", t + 59_999).ok).toBe(false);
    expect(takeToken(RULE, "1.2.3.4", t + 60_000).ok).toBe(true);
  });

  it("counts each address and each route separately", () => {
    const t = 3_000_000;
    for (let i = 0; i < 3; i += 1) takeToken(RULE, "1.2.3.4", t);
    expect(takeToken(RULE, "5.6.7.8", t).ok).toBe(true);
    expect(takeToken({ ...RULE, name: "other" }, "1.2.3.4", t).ok).toBe(true);
  });

  it("reads the client from the first x-forwarded-for entry", () => {
    expect(clientAddress(request({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientAddress(request({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientAddress(request())).toBe("local");
  });

  it("answers 429 with Retry-After once a client is over", async () => {
    const r = () => request({ "x-forwarded-for": "4.4.4.4" });
    expect(rateLimited(RULE, r())).toBeNull();
    expect(rateLimited(RULE, r())).toBeNull();
    expect(rateLimited(RULE, r())).toBeNull();
    const refused = rateLimited(RULE, r());
    expect(refused?.status).toBe(429);
    expect(Number(refused?.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await refused?.json()).toEqual({ error: "Too many requests. Try again shortly." });
  });

  it("never limits a request with no proxy address (local dev)", () => {
    for (let i = 0; i < 10; i += 1) expect(rateLimited(RULE, request())).toBeNull();
  });
});
