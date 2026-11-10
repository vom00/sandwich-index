import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { priceTier, type PriceMap } from "@/lib/landing-map";

const path = new URL("../../src/data/landing/price-map.json", import.meta.url);
const map = JSON.parse(readFileSync(path, "utf8")) as PriceMap;

describe("landing price map", () => {
  it("keeps every point inside the box", () => {
    for (const [x, y] of map.points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(map.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(map.height);
    }
  });

  it("counts sum to the projected stores", () => {
    const sum = map.points.reduce((s, p) => s + p[3], 0);
    expect(sum).toBe(map.generatedFrom.stores);
  });

  it("has plausible prices", () => {
    for (const p of map.points) {
      if (p[2] !== 0) {
        expect(p[2]).toBeGreaterThanOrEqual(101);
        expect(p[2]).toBeLessThanOrEqual(600);
      }
    }
  });

  it("prices more than 95% of stores", () => {
    expect(map.generatedFrom.priced / map.generatedFrom.stores).toBeGreaterThan(0.95);
  });

  it("is under 120 KB", () => {
    expect(statSync(path).size).toBeLessThan(120 * 1024);
  });

  it("is sorted by y then x", () => {
    for (let i = 1; i < map.points.length; i++) {
      const a = map.points[i - 1]!;
      const b = map.points[i]!;
      expect(a[1] < b[1] || (a[1] === b[1] && a[0] < b[0])).toBe(true);
    }
  });

  it("tiers prices", () => {
    const s = map.priceCents;
    expect(priceTier(0, s)).toBe("none");
    expect(priceTier(s.p10, s)).toBe("low");
    expect(priceTier(s.median, s)).toBe("mid");
    expect(priceTier(s.p90, s)).toBe("high");
  });
});
