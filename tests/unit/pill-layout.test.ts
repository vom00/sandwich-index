import { describe, expect, it } from "vitest";

import { placePills, rankPills, type PillCandidate } from "@/lib/pill-layout";

const pill = (id: string, x: number, y: number, width = 64): PillCandidate => ({ id, x, y, width, height: 44 });
const view = { width: 800, height: 600 };

describe("rankPills", () => {
  it("puts the selected store first, then priced cheapest first, then stale, then unpriced, nearest first within each", () => {
    expect(
      rankPills([
        { id: "none-near", selected: false, standing: 2, priceCents: null, distance: 1 },
        { id: "stale", selected: false, standing: 1, priceCents: 150, distance: 5 },
        { id: "dear", selected: false, standing: 0, priceCents: 299, distance: 1 },
        { id: "cheap-far", selected: false, standing: 0, priceCents: 179, distance: 90 },
        { id: "cheap-near", selected: false, standing: 0, priceCents: 179, distance: 10 },
        { id: "picked", selected: true, standing: 2, priceCents: null, distance: 300 },
      ]),
    ).toEqual(["picked", "cheap-near", "cheap-far", "dear", "stale", "none-near"]);
  });
});

describe("placePills", () => {
  it("shows pills that have room and hides one that would overlap a pill placed before it", () => {
    const shown = placePills([pill("a", 100, 100), pill("b", 130, 110), pill("c", 300, 100)], view);
    expect([...shown]).toEqual(["a", "c"]);
  });

  it("keeps the gap clear between two targets, so touching boxes count as overlapping", () => {
    // 64px wide pills whose centres are 65px apart leave a 1px gap, under the 2px kept clear.
    expect([...placePills([pill("a", 100, 100), pill("b", 165, 100)], view)]).toEqual(["a"]);
    expect([...placePills([pill("a", 100, 100), pill("b", 166, 100)], view)]).toEqual(["a", "b"]);
  });

  it("stacks vertically only when the 44px targets clear each other", () => {
    expect([...placePills([pill("a", 100, 100), pill("b", 100, 140)], view)]).toEqual(["a"]);
    expect([...placePills([pill("a", 100, 100), pill("b", 100, 146)], view)]).toEqual(["a", "b"]);
  });

  it("lets a pill outside the view neither show nor block one inside it", () => {
    expect([...placePills([pill("off", -200, 100), pill("in", 40, 100)], view)]).toEqual(["in"]);
  });

  it("finds clashes across grid cells, for wide pills on a cell edge", () => {
    expect([...placePills([pill("a", 60, 60, 100), pill("b", 140, 70, 100)], view)]).toEqual(["a"]);
  });
});
