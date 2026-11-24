import { describe, expect, it } from "vitest";

import {
  FLIP_MS,
  STAGGER_MS,
  columnAt,
  flapsBetween,
  flipAt,
  planFlip,
  stillColumns,
  textAt,
} from "@/components/landing/world/splitflap";

describe("split-flap timing", () => {
  it("turns each flap inside 60-90ms and staggers columns 20-40ms apart", () => {
    expect(FLIP_MS).toBeGreaterThanOrEqual(60);
    expect(FLIP_MS).toBeLessThanOrEqual(90);
    expect(STAGGER_MS).toBeGreaterThanOrEqual(20);
    expect(STAGGER_MS).toBeLessThanOrEqual(40);
  });

  it("counts flaps forward only, digits on their own wheel", () => {
    expect(flapsBetween("4", "4")).toBe(0);
    expect(flapsBetween("1", "4")).toBe(3);
    expect(flapsBetween("9", "0")).toBe(1);
    expect(flapsBetween("4", "3")).toBe(9);
    // A blank column turns through the full drum to its first digit.
    expect(flapsBetween(" ", "1")).toBe(4);
    // The dash for no price is not on the drum: one flap either way.
    expect(flapsBetween("—", "1")).toBe(1);
  });

  it("right-aligns, leaves unchanged columns still and staggers only the ones that turn", () => {
    const flip = planFlip("$1.49", "$1.59", 1000);
    expect(flip.columns.map((column) => column.flips)).toEqual([0, 0, 0, 1, 0]);
    expect(flip.columns[3]!.delay).toBe(0);
    expect(flip.duration).toBe(FLIP_MS);

    const wide = planFlip("$9.99", "$10.09", 0);
    expect(wide.columns.map((column) => column.from).join("")).toBe(" $9.99");
    expect(wide.columns.map((column) => column.to).join("")).toBe("$10.09");
    const turning = wide.columns.filter((column) => column.flips > 0);
    expect(turning.map((column) => column.delay)).toEqual(turning.map((_, i) => i * STAGGER_MS));
  });

  it("steps one character per flap and lands on the target", () => {
    const column = planFlip("1", "4", 0).columns[0]!;
    expect(columnAt(column, 0)).toEqual({ current: "1", next: "1", progress: 0 });
    expect(columnAt(column, FLIP_MS * 0.5)).toEqual({ current: "1", next: "2", progress: 0.5 });
    expect(columnAt(column, FLIP_MS * 1.5).current).toBe("2");
    expect(columnAt(column, FLIP_MS * 2.5)).toMatchObject({ current: "3", next: "4" });
    expect(columnAt(column, FLIP_MS * 3)).toEqual({ current: "4", next: "4", progress: 0 });
  });

  it("settles once: after its duration every column is still and stays still", () => {
    const flip = planFlip("$1.49", "$4.30", 500);
    for (const later of [flip.duration, flip.duration + 1, flip.duration + 10_000]) {
      const frame = flipAt(flip, 500 + later);
      expect(frame.done).toBe(true);
      expect(frame.columns).toEqual(stillColumns("$4.30"));
    }
    expect(flipAt(flip, 500 + flip.duration - 1).done).toBe(false);
  });

  it("reads what a viewer sees mid-flip, so a new price can turn from there", () => {
    const flip = planFlip("$1.49", "$2.19", 0);
    expect(textAt(flip, 0)).toBe("$1.49");
    expect(textAt(flip, flip.duration)).toBe("$2.19");
    const midway = textAt(flip, FLIP_MS * 0.6);
    expect(midway).toHaveLength(5);
    expect(midway.startsWith("$2.")).toBe(true);
  });
});
