import path from "node:path";

import { Config } from "@remotion/cli/config";

/**
 * The composition imports the site's pure modules (the monthly story type,
 * the split-flap timing, money formatting, the map tiers) and its data files
 * straight from ../src, so the video and the site read the same numbers. The
 * site's "@/..." paths resolve the same way here.
 */
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias ?? {}),
      "@": path.resolve(process.cwd(), "..", "src"),
    },
  },
}));

Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
