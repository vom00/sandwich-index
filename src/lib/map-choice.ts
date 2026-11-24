import { VECTOR_TILES, type VectorTileSource } from "@/lib/map-style";

/**
 * Which map the map page draws: the vector map (MapLibre) or the Leaflet one.
 *
 * The flag is the approved tile source itself (`VECTOR_TILES`): while it is
 * null, visitors get the Leaflet map, exactly as before. Setting it, once the
 * owner has chosen a host (docs/plans/vector-map.md), switches everyone over.
 *
 * In development only, `?map=vector` previews the vector map without one, and
 * `&tiles=<TileJSON URL>` previews it against any host without committing to
 * it. A production build ignores both.
 *
 * Browser only: called from the map's client-side loader.
 */
export function chooseVectorMap(search = window.location.search): { tiles: VectorTileSource | null } | null {
  if (process.env.NODE_ENV !== "production") {
    const params = new URLSearchParams(search);
    if (params.get("map") === "vector") {
      const tiles = params.get("tiles");
      return { tiles: tiles ? { url: tiles } : VECTOR_TILES };
    }
  }
  return VECTOR_TILES === null ? null : { tiles: VECTOR_TILES };
}
