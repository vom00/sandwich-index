/**
 * Reading other people's sites politely: their robots.txt, and the HTML
 * entities their pages escape text with. Used by the price-feed readers in
 * `scripts/`.
 */

export interface RobotsRules {
  disallow: string[];
  crawlDelaySeconds: number | null;
}

/**
 * The rules robots.txt sets for bots it doesn't name (`User-agent: *`). We are
 * not a search engine, so the named groups don't apply to us.
 */
export function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], crawlDelaySeconds: null };
  let inStarGroup = false;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines share one group.
      inStarGroup = lastWasAgent ? inStarGroup || value === "*" : value === "*";
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!inStarGroup) continue;

    if (field === "disallow" && value !== "") rules.disallow.push(value);
    if (field === "crawl-delay") {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0) rules.crawlDelaySeconds = seconds;
    }
  }
  return rules;
}

export function isAllowed(path: string, rules: RobotsRules): boolean {
  return !rules.disallow.some((prefix) => path.startsWith(prefix));
}

/** The wait between requests: what robots.txt asks for, and never less than `floorSeconds`. */
export function delaySeconds(rules: RobotsRules, floorSeconds: number): number {
  return Math.max(floorSeconds, rules.crawlDelaySeconds ?? 0);
}

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|quot|#x27|#39|apos|lt|gt|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
}
