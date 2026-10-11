import { describe, expect, it } from "vitest";

import { dropTwinStores } from "@/lib/store-twins";

/**
 * Real coordinates from the pair this module exists for: the Irving
 * McDonald's at 5220 N MacArthur, mapped in OSM as a node and, one metre
 * away, as the building way.
 */
const NODE = {
  osmId: "node-6953201130",
  lat: 32.9218,
  lng: -96.9585,
  address: "5220 North Mac Arthur Drive, Irving, TX 75039",
};
const WAY_TWIN = {
  osmId: "way-643448986",
  lat: 32.92181,
  lng: -96.95851,
  address: null,
};
/** ~2.5 km north — unambiguously a different restaurant. */
const FAR_STORE = {
  osmId: "node-999",
  lat: 32.9443,
  lng: -96.9585,
  address: "8435 North Belt Line Road, Irving, TX 75063",
};

describe("dropTwinStores", () => {
  it("keeps distinct stores untouched, in input order", () => {
    const { kept, droppedIds } = dropTwinStores([WAY_TWIN, FAR_STORE], []);
    expect(kept.map((s) => s.osmId)).toEqual(["way-643448986", "node-999"]);
    expect(droppedIds).toEqual([]);
  });

  it("drops the way when a node and its building arrive together", () => {
    const { kept, droppedIds } = dropTwinStores([WAY_TWIN, NODE], []);
    expect(kept.map((s) => s.osmId)).toEqual(["node-6953201130"]);
    expect(droppedIds).toEqual(["way-643448986"]);
  });

  it("prefers an address over node-ness", () => {
    const namedWay = { ...WAY_TWIN, address: "5220 N MacArthur Dr" };
    const bareNode = { ...NODE, address: null };
    const { kept } = dropTwinStores([bareNode, namedWay], []);
    expect(kept.map((s) => s.osmId)).toEqual(["way-643448986"]);
  });

  it("drops a new id that lands on top of an existing store", () => {
    const { kept, droppedIds } = dropTwinStores([WAY_TWIN], [NODE]);
    expect(kept).toEqual([]);
    expect(droppedIds).toEqual(["way-643448986"]);
  });

  it("never drops the update for an id that already exists", () => {
    // Both twins are already in the database: each must keep flowing
    // updates — dropping them would only starve the surviving docs.
    const { kept, droppedIds } = dropTwinStores([NODE, WAY_TWIN], [NODE, WAY_TWIN]);
    expect(kept.map((s) => s.osmId)).toEqual(["node-6953201130", "way-643448986"]);
    expect(droppedIds).toEqual([]);
  });

  it("an existing store beats a preferable incoming twin", () => {
    // The way is already the store on file; the node arriving later loses,
    // address and node-ness notwithstanding — merging is a human decision.
    const { kept, droppedIds } = dropTwinStores([NODE], [WAY_TWIN]);
    expect(kept).toEqual([]);
    expect(droppedIds).toEqual(["node-6953201130"]);
  });
});
