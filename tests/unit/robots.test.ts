import { describe, expect, it } from "vitest";

import { decodeEntities, delaySeconds, isAllowed, parseRobots } from "@/lib/robots";

describe("decodeEntities", () => {
  it("turns the entities pages use back into characters", () => {
    expect(decodeEntities("McDonald&#x27;s &amp; Co")).toBe("McDonald's & Co");
  });
});

describe("robots.txt", () => {
  // A real file's shape, shortened: named crawlers get no delay, the rest of
  // us get ten seconds and a few disallowed prefixes.
  const ROBOTS = `
User-agent: Googlebot
Allow: /
Disallow: /internal
Crawl-delay: 0

# All other bots — slow crawl, block internals
User-agent: *
Crawl-delay: 10
Disallow: /api/
Disallow: /search?
Disallow: /internal/
`;

  it("applies the rules for unnamed bots, not Googlebot's", () => {
    const rules = parseRobots(ROBOTS);
    expect(rules.crawlDelaySeconds).toBe(10);
    expect(rules.disallow).toEqual(["/api/", "/search?", "/internal/"]);
  });

  it("allows ordinary pages and refuses the disallowed prefixes", () => {
    const rules = parseRobots(ROBOTS);
    expect(isAllowed("/restaurants/us/vt/barre/mcdonalds-12751", rules)).toBe(true);
    expect(isAllowed("/api/prices", rules)).toBe(false);
    expect(isAllowed("/search?q=irving", rules)).toBe(false);
  });

  it("waits what the file asks, and never less than our own floor", () => {
    expect(delaySeconds(parseRobots("User-agent: *\nCrawl-delay: 2"), 10)).toBe(10);
    expect(delaySeconds(parseRobots("User-agent: *\nCrawl-delay: 30"), 10)).toBe(30);
    expect(delaySeconds(parseRobots(""), 2)).toBe(2);
  });

  it("treats consecutive User-agent lines as one group", () => {
    const rules = parseRobots("User-agent: Foo\nUser-agent: *\nDisallow: /private");
    expect(rules.disallow).toEqual(["/private"]);
  });
});
