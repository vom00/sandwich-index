import type { PriceMap } from "@/lib/landing-map";
import type { MonthlyStory, StoryField } from "@/lib/monthly-story";

/**
 * Which scenes a month's video has, and how long each runs. Pure, so the
 * "never invent a figure" rule is tested on its own
 * (tests/unit/monthly-video.test.ts): a scene whose figure is null in the
 * month's file is left out, with the file's own reason, and the video is
 * shorter by that much.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1350;

export type SceneId = "title" | "country" | "states" | "movers" | "confirmed" | "end";

/** Frames per scene at 30 fps (docs/plans/monthly-video.md, "Scenes"). */
export const SCENE_FRAMES: Readonly<Record<SceneId, number>> = {
  title: 60,
  country: 210,
  states: 180,
  movers: 180,
  confirmed: 90,
  end: 120,
};

export interface PlannedScene {
  id: SceneId;
  from: number;
  frames: number;
}

export interface ScenePlan {
  scenes: PlannedScene[];
  dropped: { id: SceneId; reason: string }[];
  durationInFrames: number;
}

function reason(story: MonthlyStory, field: StoryField): string {
  return story.missing.find((entry) => entry.field === field)?.reason ?? `no ${field} in the month's file`;
}

export function planScenes(story: MonthlyStory, map: PriceMap): ScenePlan {
  const wanted: SceneId[] = ["title"];
  const dropped: ScenePlan["dropped"] = [];

  if (map.generatedFrom.priced > 0) wanted.push("country");
  else dropped.push({ id: "country", reason: "the price map has no priced stores" });

  if (story.states !== null) wanted.push("states");
  else dropped.push({ id: "states", reason: reason(story, "states") });

  if (story.movers !== null && story.movers.top.length > 0) wanted.push("movers");
  else dropped.push({ id: "movers", reason: story.movers === null ? reason(story, "movers") : "no store changed price" });

  if (story.confirmed !== null) wanted.push("confirmed");
  else dropped.push({ id: "confirmed", reason: reason(story, "confirmed") });

  wanted.push("end");

  let from = 0;
  const scenes = wanted.map((id) => {
    const scene = { id, from, frames: SCENE_FRAMES[id] };
    from += scene.frames;
    return scene;
  });
  return { scenes, dropped, durationInFrames: from };
}
