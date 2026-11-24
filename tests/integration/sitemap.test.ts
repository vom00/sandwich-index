/**
 * The sitemap's store list, against the test emulator: the bundled list, less
 * the stores a sync would drop as twins of an OpenStreetMap store on file,
 * plus those OSM stores. Run via `npm run test:emulated`.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import usStoreRows from "@/data/us-stores.json";
import dtiStoreRows from "@/data/us-stores-dti.json";
import { getAdminDb } from "@/lib/firebase/admin";
import { getStorePageIds } from "@/lib/stores.server";

const PROJECT_ID = "demo-sandwich-index";
const db = getAdminDb();

type Row = [string, number, number, ...unknown[]];
const LISTED = [...(usStoreRows as unknown as Row[]), ...(dtiStoreRows as unknown as Row[])];
const LISTED_IDS = new Set(LISTED.map((row) => `atp-${row[0]}`));

// Two Hawaii stores, far from any other listed store.
const [PAHOA, KEALAKEKUA] = LISTED as [Row, Row];

async function clearFirestore(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: "DELETE",
  });
}

beforeEach(clearFirestore);
afterAll(clearFirestore);

describe("getStorePageIds", () => {
  it("lists every bundled store when no OpenStreetMap store is on file", async () => {
    const ids = await getStorePageIds(db);
    expect(ids).toHaveLength(LISTED_IDS.size);
    expect(new Set(ids)).toEqual(LISTED_IDS);
  });

  it("swaps a listed store for the OSM store a sync kept in its place", async () => {
    // Beside Pahoa's pin: the same restaurant by distance.
    await db.collection("stores").doc("node-111").set({ lat: PAHOA[1] + 0.0003, lng: PAHOA[2], restaurantNumber: null });
    // Far from Kealakekua but holding its restaurant number: the same restaurant by number.
    await db.collection("stores").doc("way-222").set({ lat: 40, lng: -100, restaurantNumber: KEALAKEKUA[0] });
    // An OSM store with no listed twin, as outside the US.
    await db.collection("stores").doc("relation-333").set({ lat: 45.5, lng: -73.6, restaurantNumber: null });
    // Listed stores on file are not read: the bundled list already names them.
    await db.collection("stores").doc("atp-999999").set({ lat: 0, lng: 0, restaurantNumber: null });

    const ids = await getStorePageIds(db);

    expect(ids).toContain("node-111");
    expect(ids).toContain("way-222");
    expect(ids).toContain("relation-333");
    expect(ids).not.toContain(`atp-${PAHOA[0]}`);
    expect(ids).not.toContain(`atp-${KEALAKEKUA[0]}`);
    expect(ids).not.toContain("atp-999999");
    expect(ids).toHaveLength(LISTED_IDS.size - 2 + 3);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
