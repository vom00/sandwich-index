import { loadFont } from "@remotion/fonts";
import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";

import type { MonthlyStory } from "@/lib/monthly-story";

import { MonthlyPriceMap, PRICE_MAP, type VideoProps } from "./MonthlyPriceMap";
import { FPS, HEIGHT, planScenes, WIDTH } from "./plan";

// The site's own font files (public/fonts, OFL): Fraunces for headings, Plex Mono for every figure.
void loadFont({ family: "Fraunces", url: staticFile("fonts/Fraunces-latin.woff2"), weight: "100 900" });
void loadFont({ family: "IBM Plex Mono", url: staticFile("fonts/IBMPlexMono-Regular.ttf"), weight: "400" });
void loadFont({ family: "IBM Plex Mono", url: staticFile("fonts/IBMPlexMono-Medium.ttf"), weight: "500" });

/**
 * Reads the month's file, the same one the story page renders
 * (src/data/monthly/<yyyy-mm>.json), and sizes the video to the scenes it
 * has data for. The plan, with what was dropped and why, goes back out in
 * the props so render.mjs can print it.
 */
const calculateMetadata: CalculateMetadataFunction<VideoProps> = async ({ props }) => {
  const story = (await import(`@/data/monthly/${props.month}.json`)).default as MonthlyStory;
  const plan = planScenes(story, PRICE_MAP);
  return { durationInFrames: plan.durationInFrames, props: { ...props, story, plan } };
};

export function Root() {
  return (
    <Composition
      id="MonthlyPriceMap"
      component={MonthlyPriceMap}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={1}
      defaultProps={{ month: "2026-11" } satisfies VideoProps}
      calculateMetadata={calculateMetadata}
    />
  );
}
