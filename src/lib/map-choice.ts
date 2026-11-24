import { VECTOR_TILES, type VectorTileSource } from "@/lib/map-style";

/**
 * Which map the map page draws: the vector map (MapLibre) or the Leaflet one.
 *
 * The flag is the approved tile source itself (`VECTOR_TILES`): set, every
 * visitor gets the vector map; null, every visitor gets the Leaflet map.
 *
 * In development only:
 *   - `?map=leaflet` draws the Leaflet map, kept until it is removed;
 *   - `?map=vector` draws the vector map, and `&tiles=<TileJSON URL>` points
 *     it at another host without committing to it.
 * A production build ignores all three.
 *
 * Browser only: called from the map's client-side loader.
 */
export function chooseVectorMap(search = window.location.search): { tiles: VectorTileSource | null } | null {
  if (process.env.NODE_ENV !== "production") {
    const params = new URLSearchParams(search);
    if (params.get("map") === "leaflet") return null;
    if (params.get("map") === "vector") {
      const tiles = params.get("tiles");
      return { tiles: tiles ? { url: tiles } : VECTOR_TILES };
    }
  }
  return VECTOR_TILES === null ? null : { tiles: VECTOR_TILES };
}
