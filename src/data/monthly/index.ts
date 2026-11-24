// Written by scripts/build-monthly-story.ts (npm run build:monthly-story). Do not edit by hand.

import type { MonthlyStory } from "@/lib/monthly-story";

import story_2026_11 from "./2026-11.json";

/** Every month with a data story, oldest first. */
export const MONTHLY_STORIES: Readonly<Record<string, MonthlyStory>> = {
  "2026-11": story_2026_11 as MonthlyStory,
};
