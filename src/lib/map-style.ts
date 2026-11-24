import type { StyleSpecification } from "maplibre-gl";

/**
 * The vector map's look: the street map printed in the site's paper and ink.
 *
 *   - Land is paper; parks and woods are a fold darker, never green.
 *   - Water is the accent navy, the one colour in the base map.
 *   - Roads are quiet hairlines in the rule colours, a little heavier as they
 *     get bigger; no casings, no road colours.
 *   - Labels are ink in IBM Plex Mono, the site's figure face, drawn from the
 *     glyph files in public/map/glyphs (`scripts/build-map-glyphs.mjs`) and
 *     haloed in paper.
 *   - Tier colours appear only on the price pills, which are HTML on top, not
 *     part of this style.
 *
 * Layers follow the OpenMapTiles schema, the one OpenFreeMap serves. Which
 * host serves the tiles is the owner's decision, not this file's
 * (docs/plans/vector-map.md): with no source the style is the paper ground
 * alone, and the pills still work.
 */

export interface VectorTileSource {
  /** A TileJSON URL, which carries the tile URLs, zoom range and attribution. */
  url: string;
}

/**
 * The approved tile source: OpenFreeMap, free and keyless, on the OpenMapTiles
 * schema this style is written for (docs/plans/vector-map.md; approved
 * 2026-11-24). Its host is allowed in the CSP's connect-src (next.config.ts).
 * Setting this to null puts every visitor back on the Leaflet map.
 */
export const VECTOR_TILES: VectorTileSource | null = { url: "https://tiles.openfreemap.org/planet" };

/**
 * The colour tokens the base map uses (DESIGN.md, Tokens: colour), by the
 * same names. A MapLibre style can't read CSS variables, so the values are
 * mirrored here, and `tests/unit/map-style.test.ts` holds them to globals.css.
 */
export const MAP_COLORS = {
  paper: "#fbfaf7",
  paperSunken: "#f2efe8",
  paperMuted: "#c9c4b6",
  ink: "#15140f",
  inkMuted: "#524f45",
  inkSubtle: "#6b675b",
  rule: "#ddd8cc",
  accent: "#12395e",
} as const;

const FONT_REGULAR = ["IBM Plex Mono Regular"];
const FONT_MEDIUM = ["IBM Plex Mono Medium"];

/** English where the map has it, else the local name in Latin script, else the name. */
const NAME = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]] as const;

const zoomed = (...stops: number[]) => ["interpolate", ["linear"], ["zoom"], ...stops] as unknown as number;

export function paperInkStyle(source: VectorTileSource | null, glyphsBase = "/map/glyphs"): StyleSpecification {
  const ground = { id: "paper", type: "background", paint: { "background-color": MAP_COLORS.paper } } as const;
  if (source === null) return { version: 8, sources: {}, layers: [ground] };

  const c = MAP_COLORS;
  const src = "openmaptiles";
  const road = (classes: string[]) => ["match", ["get", "class"], classes, true, false] as unknown as boolean;

  return {
    version: 8,
    glyphs: `${glyphsBase}/{fontstack}/{range}.pbf`,
    sources: { [src]: { type: "vector", url: source.url } },
    layers: [
      ground,
      {
        id: "landcover",
        type: "fill",
        source: src,
        "source-layer": "landcover",
        filter: ["match", ["get", "class"], ["wood", "grass", "farmland", "wetland", "scrub"], true, false],
        paint: { "fill-color": c.paperSunken, "fill-opacity": 0.7 },
      },
      {
        id: "park",
        type: "fill",
        source: src,
        "source-layer": "park",
        paint: { "fill-color": c.paperSunken, "fill-opacity": 0.8 },
      },
      {
        id: "landuse",
        type: "fill",
        source: src,
        "source-layer": "landuse",
        filter: ["match", ["get", "class"], ["cemetery", "hospital", "school", "stadium", "pitch"], true, false],
        paint: { "fill-color": c.paperSunken, "fill-opacity": 0.6 },
      },
      {
        id: "water",
        type: "fill",
        source: src,
        "source-layer": "water",
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        paint: { "fill-color": c.accent, "fill-opacity": 0.9 },
      },
      {
        id: "waterway",
        type: "line",
        source: src,
        "source-layer": "waterway",
        filter: ["match", ["get", "class"], ["river", "canal"], true, false],
        paint: { "line-color": c.accent, "line-opacity": 0.7, "line-width": zoomed(8, 0.5, 14, 2) },
      },
      {
        id: "building",
        type: "fill",
        source: src,
        "source-layer": "building",
        minzoom: 14,
        paint: { "fill-color": c.paperMuted, "fill-opacity": zoomed(14, 0, 15, 0.3) },
      },
      {
        id: "road-minor",
        type: "line",
        source: src,
        "source-layer": "transportation",
        minzoom: 12,
        filter: road(["minor", "service", "tertiary"]),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.rule, "line-width": zoomed(12, 0.4, 16, 3) },
      },
      {
        id: "road-major",
        type: "line",
        source: src,
        "source-layer": "transportation",
        filter: road(["primary", "secondary", "trunk"]),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.rule, "line-width": zoomed(8, 0.4, 16, 3.5) },
      },
      {
        id: "road-motorway",
        type: "line",
        source: src,
        "source-layer": "transportation",
        filter: road(["motorway"]),
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": c.paperMuted, "line-width": zoomed(6, 0.5, 16, 4) },
      },
      {
        id: "rail",
        type: "line",
        source: src,
        "source-layer": "transportation",
        minzoom: 11,
        filter: road(["rail"]),
        paint: { "line-color": c.paperMuted, "line-width": 0.8, "line-dasharray": [3, 3] },
      },
      {
        id: "boundary-state",
        type: "line",
        source: src,
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": c.inkSubtle, "line-width": 0.8, "line-dasharray": [4, 3], "line-opacity": 0.6 },
      },
      {
        id: "road-name",
        type: "symbol",
        source: src,
        "source-layer": "transportation_name",
        minzoom: 14,
        filter: road(["primary", "secondary", "tertiary", "trunk"]),
        layout: {
          "symbol-placement": "line",
          "text-field": NAME as unknown as string,
          "text-font": FONT_REGULAR,
          "text-size": 10.5,
          "text-letter-spacing": 0.02,
        },
        paint: { "text-color": c.inkSubtle, "text-halo-color": c.paper, "text-halo-width": 1.5 },
      },
      {
        id: "water-name",
        type: "symbol",
        source: src,
        "source-layer": "water_name",
        layout: {
          "text-field": NAME as unknown as string,
          "text-font": FONT_REGULAR,
          "text-size": 11,
          "text-letter-spacing": 0.08,
          "text-max-width": 8,
        },
        // Paper on the navy water, the way a printed map reverses its lake names.
        paint: { "text-color": c.paper, "text-opacity": 0.85 },
      },
      {
        id: "place-minor",
        type: "symbol",
        source: src,
        "source-layer": "place",
        minzoom: 11,
        filter: ["match", ["get", "class"], ["suburb", "quarter", "neighbourhood", "village"], true, false],
        layout: {
          "text-field": NAME as unknown as string,
          "text-font": FONT_REGULAR,
          "text-size": 11,
          "text-transform": "uppercase",
          "text-letter-spacing": 0.12,
          "text-max-width": 9,
        },
        paint: { "text-color": c.inkSubtle, "text-halo-color": c.paper, "text-halo-width": 1.5 },
      },
      {
        id: "place-town",
        type: "symbol",
        source: src,
        "source-layer": "place",
        filter: ["match", ["get", "class"], ["town"], true, false],
        layout: {
          "text-field": NAME as unknown as string,
          "text-font": FONT_REGULAR,
          "text-size": zoomed(8, 11, 13, 14),
          "text-max-width": 8,
        },
        paint: { "text-color": c.inkMuted, "text-halo-color": c.paper, "text-halo-width": 1.5 },
      },
      {
        id: "place-city",
        type: "symbol",
        source: src,
        "source-layer": "place",
        filter: ["match", ["get", "class"], ["city"], true, false],
        layout: {
          "text-field": NAME as unknown as string,
          "text-font": FONT_MEDIUM,
          "text-size": zoomed(5, 12, 12, 17),
          "text-max-width": 8,
        },
        paint: { "text-color": c.ink, "text-halo-color": c.paper, "text-halo-width": 2 },
      },
    ],
  } as StyleSpecification;
}
