// Renders the monthly price-map video: `node render.mjs [yyyy-mm]`.
// With no month it takes the newest file in ../src/data/monthly. Writes
// out/<month>.mp4 and prints which scenes were left out for lack of data.
//
// Browser: REMOTION_BROWSER if set; on Windows the installed Microsoft Edge,
// so a local render needs no Chrome download; otherwise Remotion's own
// headless Chrome (fetched on first use, as in CI).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const here = path.dirname(fileURLToPath(import.meta.url));
const monthly = path.join(here, "..", "src", "data", "monthly");

const month =
  process.argv[2] ??
  fs
    .readdirSync(monthly)
    .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
    .sort()
    .at(-1)
    ?.slice(0, 7);
if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
  console.error(`No month to render (got ${month ?? "nothing"}).`);
  process.exit(1);
}
if (!fs.existsSync(path.join(monthly, `${month}.json`))) {
  console.error(`src/data/monthly/${month}.json does not exist; run scripts/build-monthly-story.ts first.`);
  process.exit(1);
}

function browser() {
  if (process.env.REMOTION_BROWSER) return process.env.REMOTION_BROWSER;
  if (process.platform !== "win32") return null;
  const edge = ["PROGRAMFILES(X86)", "PROGRAMFILES"]
    .map((key) => process.env[key] && path.join(process.env[key], "Microsoft", "Edge", "Application", "msedge.exe"))
    .find((candidate) => candidate && fs.existsSync(candidate));
  return edge ?? null;
}

const browserExecutable = browser();
const inputProps = { month };
const serveUrl = await bundle({
  entryPoint: path.join(here, "src", "index.ts"),
  publicDir: path.join(here, "public"),
  webpackOverride: (config) => ({
    ...config,
    resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.join(here, "..", "src") } },
  }),
});
const composition = await selectComposition({ serveUrl, id: "MonthlyPriceMap", inputProps, browserExecutable });

const { plan } = composition.props;
console.log(`${month}: ${plan.scenes.map((scene) => `${scene.id} ${scene.frames}f`).join(", ")}`);
for (const { id, reason } of plan.dropped) console.log(`  left out: ${id} (${reason})`);
console.log(`  ${(composition.durationInFrames / composition.fps).toFixed(1)} s at ${composition.width}×${composition.height}`);

const outputLocation = path.join(here, "out", `${month}.mp4`);
await renderMedia({
  serveUrl,
  composition,
  codec: "h264",
  inputProps,
  outputLocation,
  browserExecutable,
  imageFormat: "jpeg",
  jpegQuality: 92,
  muted: true,
  onProgress: ({ progress }) => {
    if (Math.round(progress * 100) % 25 === 0) process.stdout.write(`\r  ${Math.round(progress * 100)}%`);
  },
});
console.log(`\n  wrote ${path.relative(process.cwd(), outputLocation)} (${(fs.statSync(outputLocation).size / 1e6).toFixed(1)} MB)`);
