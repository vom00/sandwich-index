import { describe, expect, it } from "vitest";

import { distanceMeters } from "@/lib/geohash";
import {
  LISTED_DUPLICATE_METERS,
  dropListedDuplicates,
  listedStoresNear,
  toListedStore,
  type ListedRow,
} from "@/lib/store-list";

/** Rows as `build-store-list` writes them, from the 2026-09-26 file. */
const STORY_RD: ListedRow = ["1844", 32.83976, -96.97601, "2410 N Story Rd", "Irving", "TX", "75062"];
const OCONNOR: ListedRow = ["33735", 32.86682, -96.94642, "4959 N O'Connor Rd", "Irving", "TX", "75038"];
/** A two-digit store number: real, but outside what a receipt search accepts. */
const FRESNO: ListedRow = ["37", 36.78012, -119.79042, "3115 N Blackstone Ave", "Fresno", "CA", "93703"];
const ROWS = [STORY_RD, OCONNOR, FRESNO];

const IRVING = { lat: 32.85, lng: -96.96 };

describe("toListedStore", () => {
  it("names the store by its restaurant number and composes its address", () => {
    expect(toListedStore(STORY_RD)).toMatchObject({
      osmId: "atp-1844",
      name: "McDonald's",
      address: "2410 N Story Rd, Irving, TX 75062",
      locality: "Irving, TX 75062",
      lat: 32.83976,
      lng: -96.97601,
      restaurantNumber: "1844",
    });
  });

  it("keeps a store whose number is too short to search by, without the number", () => {
    const store = toListedStore(FRESNO);
    expect(store.osmId).toBe("atp-37");
    expect(store.restaurantNumber).toBeNull();
  });

  it("gives a geohash fine enough for the proximity queries", () => {
    expect(toListedStore(STORY_RD).geohash).toHaveLength(9);
  });

  it("falls back to a locality when the row has no street", () => {
    const store = toListedStore(["1234", 32.9, -97.04, null, "Dfw Airport", "TX", "75261"]);
    expect(store.address).toBeNull();
    expect(store.locality).toBe("Dfw Airport, TX 75261");
  });
});

describe("listedStoresNear", () => {
  it("returns the listed stores inside the circle", () => {
    const found = listedStoresNear(ROWS, IRVING, 5_000);
    expect(found?.map((store) => store.osmId).sort()).toEqual(["atp-1844", "atp-33735"]);
  });

  it("returns an empty list, not null, for a gap inside the list's reach", () => {
    // Twenty miles out in the country: no store in the circle, but the list
    // still knows the area, so Overpass has nothing to add.
    const found = listedStoresNear(ROWS, { lat: 33.1, lng: -96.6 }, 1_000);
    expect(found).toEqual([]);
  });

  it("returns null outside the list, so the caller asks Overpass", () => {
    const toronto = { lat: 43.65, lng: -79.38 };
    expect(listedStoresNear(ROWS, toronto, 20_000)).toBeNull();
  });
});

describe("dropListedDuplicates", () => {
  const listed = [toListedStore(STORY_RD), toListedStore(OCONNOR)];

  it("drops a listed store whose number is already on file under another id", () => {
    const known = [{ id: "node-6953221768", lat: 32.8397384, lng: -96.9760314, restaurantNumber: "1844" }];
    const { kept, droppedIds } = dropListedDuplicates(listed, known);
    expect(droppedIds).toEqual(["atp-1844"]);
    expect(kept.map((store) => store.osmId)).toEqual(["atp-33735"]);
  });

  it("drops a listed store sitting on an unnumbered store already on file", () => {
    // OSM's pin is on the building; the locator's is out by the road.
    const nearby = { id: "way-1", lat: 32.8671, lng: -96.9468, restaurantNumber: null };
    expect(distanceMeters(nearby, toListedStore(OCONNOR))).toBeLessThan(LISTED_DUPLICATE_METERS);
    const { droppedIds } = dropListedDuplicates(listed, [nearby]);
    expect(droppedIds).toEqual(["atp-33735"]);
  });

  it("keeps a listed store that is already on file under its own id", () => {
    const own = { id: "atp-1844", lat: 32.83976, lng: -96.97601, restaurantNumber: "1844" };
    const { kept } = dropListedDuplicates(listed, [own]);
    expect(kept.map((store) => store.osmId)).toEqual(["atp-1844", "atp-33735"]);
  });

  it("keeps a listed store with a different number a few hundred metres away", () => {
    const neighbour = { id: "node-2", lat: 32.8425, lng: -96.9760, restaurantNumber: "9999" };
    expect(distanceMeters(neighbour, toListedStore(STORY_RD))).toBeGreaterThan(LISTED_DUPLICATE_METERS);
    const { kept } = dropListedDuplicates(listed, [neighbour]);
    expect(kept).toHaveLength(2);
  });
});
