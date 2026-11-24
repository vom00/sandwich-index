import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MAP_COLORS, paperInkStyle } from "@/lib/map-style";

const ROOT = path.resolve(__dirname, "../..");
const CSS = readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");

/** `paperSunken` → `--color-paper-sunken`. */
const tokenName = (key: string) => `--color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

const style = paperInkStyle({ url: "https://tiles.example/planet" });

/** Every string value in a layer's paint and layout, however deep. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("the base map's colours", () => {
  it("are the design tokens of the same name, value for value", () => {
    for (const [key, hex] of Object.entries(MAP_COLORS)) {
      const match = CSS.match(new RegExp(`${tokenName(key)}:\\s*(#[0-9a-f]{6})`, "i"));
      expect(match?.[1]?.toLowerCase(), tokenName(key)).toBe(hex);
    }
  });

  it("are the only colours the style uses", () => {
    const allowed = new Set<string>(Object.values(MAP_COLORS));
    for (const layer of style.layers) {
      const hexes = strings("paint" in layer ? layer.paint : undefined).filter((s) => s.startsWith("#"));
      for (const hex of hexes) expect(allowed.has(hex), `${layer.id}: ${hex}`).toBe(true);
    }
  });
});

describe("paperInkStyle", () => {
  it("is the paper ground alone when no tile source is approved", () => {
    const bare = paperInkStyle(null);
    expect(bare.sources).toEqual({});
    expect(bare.layers.map((layer) => layer.id)).toEqual(["paper"]);
  });

  it("draws water in the accent and nothing else in colour", () => {
    const filled = style.layers.filter((layer) => layer.type === "fill" || layer.type === "line");
    const coloured = filled.filter((layer) => strings("paint" in layer ? layer.paint : undefined).includes(MAP_COLORS.accent));
    expect(coloured.map((layer) => layer.id).sort()).toEqual(["water", "waterway"]);
  });

  it("sets every label in a Plex Mono stack the site ships glyphs for", () => {
    const shipped = new Set(readdirSync(path.join(ROOT, "public/map/glyphs")));
    const symbols = style.layers.filter((layer) => layer.type === "symbol");
    expect(symbols.length).toBeGreaterThan(0);
    for (const layer of symbols) {
      const fonts = (layer.layout?.["text-font"] ?? []) as string[];
      expect(fonts.length, layer.id).toBeGreaterThan(0);
      for (const font of fonts) expect(shipped.has(font), `${layer.id}: ${font}`).toBe(true);
    }
    expect(style.glyphs).toBe("/map/glyphs/{fontstack}/{range}.pbf");
  });
});
