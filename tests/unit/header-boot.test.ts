import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FIGURE_SEEN_KEY, HEADER_BOOT_ID, headerBootScript, LOGO_BUILT_KEY } from "@/lib/header-boot";
import { loadNationalMedian } from "@/lib/landing-map";

/** Runs the pre-paint snippet against a stand-in page and reports the style it added, if any. */
function boot(figure: string | null, page: { reduced?: boolean; session?: Record<string, string>; local?: Record<string, string> }) {
  const added: { id: string; textContent: string; dataset: Record<string, string> }[] = [];
  const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null });
  const document = {
    createElement: () => ({ id: "", textContent: "", dataset: {} as Record<string, string> }),
    head: { appendChild: (node: (typeof added)[number]) => added.push(node) },
  };
  const matchMedia = () => ({ matches: page.reduced === true });
  new Function("document", "matchMedia", "sessionStorage", "localStorage", headerBootScript(figure))(
    document,
    matchMedia,
    storage(page.session ?? {}),
    storage(page.local ?? {}),
  );
  return added[0] ?? null;
}

describe("header pre-paint gate", () => {
  it("holds the logo and the figure on a first visit", () => {
    const style = boot("219", {});
    expect(style?.id).toBe(HEADER_BOOT_ID);
    expect(style?.dataset).toEqual({ logo: "1", figure: "1" });
    expect(style?.textContent).toContain(".logo-layer");
    expect(style?.textContent).toContain(".odo-col");
  });

  it("does nothing on a later page once both have played", () => {
    expect(boot("219", { session: { [LOGO_BUILT_KEY]: "1" }, local: { [FIGURE_SEEN_KEY]: "219" } })).toBeNull();
  });

  it("rolls the figure again only when it has changed", () => {
    const style = boot("229", { session: { [LOGO_BUILT_KEY]: "1" }, local: { [FIGURE_SEEN_KEY]: "219" } });
    expect(style?.dataset).toEqual({ logo: "", figure: "1" });
    expect(style?.textContent).not.toContain(".logo-layer");
  });

  it("builds the logo in a new session without replaying a figure already seen", () => {
    const style = boot("219", { local: { [FIGURE_SEEN_KEY]: "219" } });
    expect(style?.dataset).toEqual({ logo: "1", figure: "" });
  });

  it("holds no figure when there is none", () => {
    expect(boot(null, {})?.dataset).toEqual({ logo: "1", figure: "" });
  });

  it("never runs under reduced motion", () => {
    expect(boot("219", { reduced: true })).toBeNull();
  });

  it("lets go by itself if the app never takes over", () => {
    // Both holds are delayed one-frame animations: after 3s they end and the
    // finished header shows, whether or not any JavaScript ran.
    expect(boot("219", {})?.textContent.match(/1ms 3s both/g)).toHaveLength(2);
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
