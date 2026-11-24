/**
 * Builds the vector map's label glyphs: IBM Plex Mono, the site's own figure
 * face, as the signed-distance-field PBF files MapLibre draws text from, in
 * public/map/glyphs/<font stack>/<range>.pbf.
 *
 * Map label fonts can't come from CSS: MapLibre renders text on the GPU from
 * these files, and tile hosts only serve their own families (Noto, Open Sans).
 * So this draws each character with the fonts the site already serves (the
 * page's `--font-plex-mono`, from next/font) using TinySDF, the same code
 * MapLibre uses for characters it draws locally, in a headless browser, then
 * writes the files in the glyphs protobuf format with `pbf`. Both are MapLibre's
 * own dependencies; nothing new is installed.
 *
 * Ranges: Basic Latin and Latin-1 (0-255), which is almost every US place name;
 * Latin Extended-A (256-511), drawn in the fallback face where the site's Latin
 * subset of Plex Mono has no glyph; and General Punctuation (8192-8447) for
 * curly quotes and dashes. Sizes follow the glyph server convention MapLibre
 * expects: 24px, a 3px buffer, an 8px radius.
 *
 *   TARGET_URL=http://localhost:3100 node scripts/build-map-glyphs.mjs
 *
 * Needs the dev server running. Rerun only if the fonts change.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PbfWriter } from "pbf";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public/map/glyphs");
const TARGET_URL = process.env.TARGET_URL || "http://localhost:3000";

export const STACKS = [
  { name: "IBM Plex Mono Regular", weight: "400" },
  { name: "IBM Plex Mono Medium", weight: "500" },
];
const RANGES = [0, 256, 8192];

/** MapLibre's adjustments for TinySDF glyphs (GlyphManager), at 24px instead of its 48px. */
const TOP_ADJUSTMENT = 27;

const tinySdfSource = readFileSync(require.resolve("@mapbox/tiny-sdf", { paths: [dirname(require.resolve("maplibre-gl/package.json"))] }), "utf8")
  .replace("export default class TinySDF", "window.TinySDF = class TinySDF");

function encode(stack, start, glyphs) {
  const pbf = new PbfWriter();
  pbf.writeMessage(1, (_, out) => {
    out.writeStringField(1, stack);
    out.writeStringField(2, `${start}-${start + 255}`);
    for (const glyph of glyphs) {
      out.writeMessage(3, (g, field) => {
        field.writeVarintField(1, g.id);
        if (g.bitmap.length > 0) field.writeBytesField(2, g.bitmap);
        field.writeVarintField(3, g.width);
        field.writeVarintField(4, g.height);
        field.writeSVarintField(5, g.left);
        field.writeSVarintField(6, g.top);
        field.writeVarintField(7, g.advance);
      }, glyph);
    }
  }, null);
  return pbf.finish();
}

const browser = await chromium.launch({ channel: "msedge" });
try {
  const page = await browser.newPage();
  await page.goto(`${TARGET_URL}/about`, { waitUntil: "load" });
  await page.addScriptTag({ content: tinySdfSource });
  const family = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--font-plex-mono").trim());
  if (!family) throw new Error("The page has no --font-plex-mono; is this the Sandwich Index dev server?");
  console.log(`Drawing with ${family}`);

  for (const stack of STACKS) {
    for (const start of RANGES) {
      const glyphs = await page.evaluate(
        async ({ family, weight, start, top }) => {
          await document.fonts.load(`${weight} 24px ${family}`);
          const sdf = new window.TinySDF({ fontSize: 24, buffer: 3, radius: 8, cutoff: 0.25, fontFamily: family, fontWeight: weight });
          const out = [];
          for (let id = start; id < start + 256; id += 1) {
            // Control characters, and the punctuation block's unassigned tail.
            if (id < 32 || (id >= 127 && id < 160) || (start === 8192 && id > 8303 && id !== 8364)) continue;
            const g = sdf.draw(String.fromCharCode(id));
            out.push({
              id,
              bitmap: Array.from(g.glyphWidth > 0 && g.glyphHeight > 0 ? g.data : []),
              width: g.glyphWidth,
              height: g.glyphHeight,
              left: Math.round(g.glyphLeft + 0.5),
              top: g.glyphTop - top,
              advance: Math.round(g.glyphAdvance),
            });
          }
          return out;
        },
        { family, weight: stack.weight, start, top: TOP_ADJUSTMENT },
      );
      const dir = join(OUT, stack.name);
      mkdirSync(dir, { recursive: true });
      const bytes = encode(stack.name, start, glyphs.map((g) => ({ ...g, bitmap: Uint8Array.from(g.bitmap) })));
      writeFileSync(join(dir, `${start}-${start + 255}.pbf`), bytes);
      console.log(`${stack.name} ${start}-${start + 255}: ${glyphs.length} glyphs, ${(bytes.length / 1024).toFixed(0)} KB`);
    }
  }
} finally {
  await browser.close();
}
