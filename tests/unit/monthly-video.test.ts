import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { PriceMap } from "@/lib/landing-map";
import type { MonthlyStory } from "@/lib/monthly-story";

import { planScenes, SCENE_FRAMES } from "../../video/src/plan";

const read = <T>(path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
const november = read<MonthlyStory>("../../src/data/monthly/2026-11.json");
const map = read<PriceMap>("../../src/data/landing/price-map.json");

describe("the monthly video's scenes", () => {
  it("leaves out a scene whose figure is blank, with the file's reason", () => {
    const plan = planScenes(november, map);
    expect(november.confirmed).toBeNull();
    expect(plan.scenes.map((scene) => scene.id)).toEqual(["title", "country", "states", "movers", "end"]);
    expect(plan.dropped).toEqual([
      { id: "confirmed", reason: november.missing.find((entry) => entry.field === "confirmed")!.reason },
    ]);
  });

  it("runs the scenes back to back and sizes the video to them", () => {
    const plan = planScenes(november, map);
    let from = 0;
    for (const scene of plan.scenes) {
      expect(scene.from).toBe(from);
      expect(scene.frames).toBe(SCENE_FRAMES[scene.id]);
      from += scene.frames;
    }
    expect(plan.durationInFrames).toBe(from);
  });

  it("keeps the title and the end card when every figure is blank", () => {
    const empty: MonthlyStory = {
      ...november,
      states: null,
      movers: null,
      confirmed: null,
      missing: [
        { field: "states", reason: "no readings" },
        { field: "movers", reason: "no earlier reading" },
        { field: "confirmed", reason: "not counted" },
      ],
    };
    const plan = planScenes(empty, map);
    expect(plan.scenes.map((scene) => scene.id)).toEqual(["title", "country", "end"]);
    expect(plan.dropped.map((entry) => entry.reason)).toEqual(["no readings", "no earlier reading", "not counted"]);
  });

  it("shows the confirmed count when the file has one", () => {
    const plan = planScenes({ ...november, confirmed: { count: 4 }, missing: [] }, map);
    expect(plan.scenes.map((scene) => scene.id)).toContain("confirmed");
    expect(plan.dropped).toEqual([]);
  });
});
