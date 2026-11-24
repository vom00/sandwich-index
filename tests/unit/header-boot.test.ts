import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIGURE_ROLL_ID, FIGURE_SEEN_KEY, HEADER_BOOT_ID, headerBootScript, LOGO_BUILT_KEY } from "@/lib/header-boot";
import { loadNationalMedian } from "@/lib/landing-map";

/**
 * Runs the pre-paint snippet against a stand-in page. Returns the logo's hold
 * and the figure's roll (each the style it added, or undefined), what it left
 * in localStorage, and how many styles it added.
 */
function boot(figure: string | null, page: { reduced?: boolean; session?: Record<string, string>; local?: Record<string, string> }) {
  const added: { id: string; textContent: string }[] = [];
  const local: Record<string, string> = { ...page.local };
  const storage = (values: Record<string, string>) => ({
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value;
    },
  });
  const document = {
    createElement: () => ({ id: "", textContent: "" }),
    head: { appendChild: (node: (typeof added)[number]) => added.push(node) },
  };
  const matchMedia = () => ({ matches: page.reduced === true });
  new Function("document", "matchMedia", "sessionStorage", "localStorage", headerBootScript(figure))(
    document,
    matchMedia,
    storage({ ...page.session }),
    storage(local),
  );
  return {
    hold: added.find((node) => node.id === HEADER_BOOT_ID),
    roll: added.find((node) => node.id === FIGURE_ROLL_ID),
    seen: local[FIGURE_SEEN_KEY] ?? null,
    count: added.length,
  };
}

describe("header pre-paint gate", () => {
  it("holds the logo and rolls the figure on a first visit", () => {
    const run = boot("219", {});
    expect(run.hold?.textContent).toContain(".logo-layer");
    expect(run.roll?.textContent).toContain("odo-roll");
    expect(run.seen).toBe("219");
  });

  it("does nothing on a later page once both have played", () => {
    expect(boot("219", { session: { [LOGO_BUILT_KEY]: "1" }, local: { [FIGURE_SEEN_KEY]: "219" } }).count).toBe(0);
  });

  it("rolls the figure again only when it has changed", () => {
    const run = boot("229", { session: { [LOGO_BUILT_KEY]: "1" }, local: { [FIGURE_SEEN_KEY]: "219" } });
    expect(run.hold).toBeUndefined();
    expect(run.roll).toBeDefined();
    expect(run.seen).toBe("229");
  });

  it("builds the logo in a new session without replaying a figure already seen", () => {
    const run = boot("219", { local: { [FIGURE_SEEN_KEY]: "219" } });
    expect(run.hold).toBeDefined();
    expect(run.roll).toBeUndefined();
  });

  it("rolls no figure when there is none", () => {
    const run = boot(null, {});
    expect(run.roll).toBeUndefined();
    expect(run.seen).toBeNull();
  });

  it("never runs under reduced motion", () => {
    expect(boot("219", { reduced: true }).count).toBe(0);
  });

  it("lets go of the logo by itself if the app never takes over", () => {
    // The hold is a delayed one-frame animation: after 3s it ends and the
    // finished logo shows, whether or not any JavaScript ran.
    expect(boot("219", {}).hold?.textContent).toContain("1ms 3s both");
  });

  it("rolls the wheels from the first paint, never holding them at zero", () => {
    // The Odometer's own load roll: no delay before the first wheel and a
    // backwards fill, so each wheel is moving from its first frame on.
    const css = boot("219", {}).roll?.textContent ?? "";
    expect(css).toContain("calc(var(--k,0)*70ms) backwards");
    expect(css).toContain("prefers-reduced-motion:no-preference");
  });
});

describe("masthead figure", () => {
  const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

  it("is the national median and newest date of the landing map", async () => {
    const map = read("../../src/data/landing/price-map.json");
    expect(await loadNationalMedian()).toEqual({ cents: map.priceCents.median, checkedAt: map.generatedFrom.newestObservedAt });
  });

  it("comes from the same snapshot as the store page's national strip", () => {
    const map = read("../../src/data/landing/price-map.json");
    const strip = read("../../src/data/landing/price-strip.json");
    expect(strip.medianCents).toBe(map.priceCents.median);
    expect(strip.source.newestObservedAt).toBe(map.generatedFrom.newestObservedAt);
    expect(strip.source.oldestObservedAt).toBe(map.generatedFrom.oldestObservedAt);
    expect(strip.source.stores).toBe(map.generatedFrom.priced);
  });
});
