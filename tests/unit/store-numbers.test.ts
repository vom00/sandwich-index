import { describe, expect, it } from "vitest";

import rows from "@/data/restaurant-numbers.json";
import {
  buildNumberIndex,
  chooseNumbers,
  numberFor,
  streetNumber,
  type NumberRow,
} from "@/lib/store-numbers";

// One degree of latitude is about 111 km, so 0.0001° is about 11 m.
const M = 0.0001 / 11;
const BASE = { lat: 32.95, lng: -96.99 };

function store(id: string, metersNorth: number, address: string | null) {
  return { id, lat: BASE.lat + metersNorth * M, lng: BASE.lng, address };
}

describe("streetNumber", () => {
  it("reads the leading house number", () => {
    expect(streetNumber("125 South Denton Tap Road")).toBe("125");
    expect(streetNumber("  4401 W Airport Fwy")).toBe("4401");
  });
  it("is null without one", () => {
    expect(streetNumber("Terminal C")).toBeNull();
    expect(streetNumber(null)).toBeNull();
  });
});

describe("numberFor", () => {
  it("matches one restaurant within 150 m whose street number agrees", () => {
    const index = buildNumberIndex([["4412", BASE.lat + 120 * M, BASE.lng, "125"]]);
    expect(numberFor(store("a", 0, "125 Main St"), index)).toBe("4412");
  });

  it("ignores an agreeing street number more than 150 m away", () => {
    const index = buildNumberIndex([["4412", BASE.lat + 200 * M, BASE.lng, "125"]]);
    expect(numberFor(store("a", 0, "125 Main St"), index)).toBeNull();
  });

  it("refuses when two nearby restaurants agree", () => {
    const index = buildNumberIndex([
      ["4412", BASE.lat + 20 * M, BASE.lng, "125"],
      ["4413", BASE.lat - 20 * M, BASE.lng, "125"],
    ]);
    expect(numberFor(store("a", 0, "125 Main St"), index)).toBeNull();
  });

  it("refuses a disagreeing street number, however close", () => {
    const index = buildNumberIndex([["4412", BASE.lat + 5 * M, BASE.lng, "900"]]);
    expect(numberFor(store("a", 0, "125 Main St"), index)).toBeNull();
  });

  it("without a street number on our side, takes the one restaurant within 60 m", () => {
    const index = buildNumberIndex([["4412", BASE.lat + 40 * M, BASE.lng, "125"]]);
    expect(numberFor(store("a", 0, null), index)).toBe("4412");
  });

  it("without a street number, doesn't reach past 60 m", () => {
    const index = buildNumberIndex([["4412", BASE.lat + 100 * M, BASE.lng, "125"]]);
    expect(numberFor(store("a", 0, null), index)).toBeNull();
  });

  it("without a street number on their side, takes the one within 60 m", () => {
    const index = buildNumberIndex([["4412", BASE.lat + 40 * M, BASE.lng, null]]);
    expect(numberFor(store("a", 0, "125 Main St"), index)).toBe("4412");
  });

  it("finds restaurants across a grid-cell boundary", () => {
    // 32.9999 and 33.0001 fall in different 0.01° cells.
    const index = buildNumberIndex([["4412", 33.0001, BASE.lng, "125"]]);
    expect(numberFor({ id: "a", lat: 32.9999, lng: BASE.lng, address: "125 Main St" }, index)).toBe("4412");
  });
});

describe("chooseNumbers", () => {
  it("gives a number two stores would share to neither", () => {
    const index = buildNumberIndex([["4412", BASE.lat, BASE.lng, null]]);
    const picks = chooseNumbers([store("a", 10, null), store("b", -10, null), store("c", 5000, null)], index);
    expect(picks.size).toBe(0);
  });

  it("keeps the unambiguous ones", () => {
    const index = buildNumberIndex([
      ["4412", BASE.lat, BASE.lng, "125"],
      ["4413", BASE.lat + 3000 * M, BASE.lng, "900"],
    ]);
    const picks = chooseNumbers([store("a", 0, "125 Main St"), store("b", 3000, "900 Elm St")], index);
    expect(Object.fromEntries(picks)).toEqual({ a: "4412", b: "4413" });
  });
});

describe("the bundled table", () => {
  const table = rows as unknown as NumberRow[];

  it("covers the US", () => {
    expect(table.length).toBeGreaterThan(13_000);
    for (const row of table.slice(0, 50)) {
      expect(row[0]).toMatch(/^\d{3,5}$/);
      expect(Math.abs(row[1])).toBeLessThanOrEqual(90);
      expect(Math.abs(row[2])).toBeLessThanOrEqual(180);
    }
  });

  it("matches a restaurant standing where the table says one is", () => {
    const index = buildNumberIndex(table);
    const row = table.find((r) => r[3] !== null)!;
    expect(numberFor({ id: "x", lat: row[1], lng: row[2], address: `${row[3]} Some Road` }, index)).toBe(row[0]);
  });
});
