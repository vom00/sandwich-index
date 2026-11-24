/**
 * The server write path for price reports, against the test emulator.
 *
 * These are the checks the Firestore rules made while browsers wrote
 * submissions directly, now made by `recordSubmission`, plus the rule that a
 * big change needs a second reporter. Run via `npm run test:emulated`.
 */

import { Timestamp } from "firebase-admin/firestore";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getAdminDb } from "@/lib/firebase/admin";
import { recomputeStoreRollup } from "@/lib/stores.server";
import { REPORT_WINDOW_MS, recordSubmission } from "@/lib/submit.server";

const PROJECT_ID = "demo-sandwich-index";
const STORE = "node-1234567890";
const PRICED = "node-9876543210";

const db = getAdminDb();

async function clearFirestore(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
    method: "DELETE",
  });
}

const base = {
  name: "McDonald's",
  address: "120 S Denton Tap Rd, Coppell, TX 75019",
  lat: 32.9546,
  lng: -96.99,
  geohash: "9vfsz3n",
  reportCount: 0,
  confirmedCount: 0,
  priceCents: null,
  pricedAt: null,
};

beforeEach(async () => {
  await clearFirestore();
  await db.collection("stores").doc(STORE).set({ ...base, osmId: STORE });
  await db
    .collection("stores")
    .doc(PRICED)
    .set({ ...base, osmId: PRICED, reportCount: 1, confirmedCount: 1, priceCents: 319, pricedAt: Timestamp.now() });
  // The report behind that $3.19, since the recompute rebuilds the price
  // from the history alone.
  await db.collection("submissions").add({
    storeId: PRICED,
    priceCents: 319,
    submittedAt: Timestamp.fromMillis(Date.now() - 7 * REPORT_WINDOW_MS),
    source: "in_store",
    status: "accepted",
    flagCount: 0,
    reporter: "r0",
  });
});

afterAll(async () => {
  await clearFirestore();
});

const submit = (storeId: string, priceCents: number, reporter: string) =>
  recordSubmission({ storeId, priceCents, source: "in_store", reporter });

describe("recordSubmission", () => {
  it("writes the submission with the server's clock and its reporter, and stamps the ledger", async () => {
    const result = await submit(STORE, 249, "r1");
    expect(result).toMatchObject({ ok: true, status: "accepted" });
    if (!result.ok) return;

    const saved = (await db.collection("submissions").doc(result.submissionId).get()).data();
    expect(saved).toMatchObject({ storeId: STORE, priceCents: 249, source: "in_store", status: "accepted", flagCount: 0, reporter: "r1" });
    expect(saved?.["submittedAt"]).toBeInstanceOf(Timestamp);

    const ledger = await db.collection("rateLimits").doc(`r1_${STORE}`).get();
    expect(ledger.exists).toBe(true);
  });

  it("refuses a second report from the same reporter within 24 hours", async () => {
    await submit(STORE, 249, "r1");
    const again = await submit(STORE, 259, "r1");
    expect(again).toMatchObject({ ok: false, reason: "rate_limited" });
    if (again.ok || again.reason !== "rate_limited") return;
    const wait = Date.parse(again.retryAfter) - Date.now();
    expect(wait).toBeGreaterThan(REPORT_WINDOW_MS - 60_000);
  });

  it("allows another report once the 24 hours have passed", async () => {
    await db
      .collection("rateLimits")
      .doc(`r1_${STORE}`)
      .set({ storeId: STORE, lastSubmittedAt: Timestamp.fromMillis(Date.now() - REPORT_WINDOW_MS - 1000) });
    expect(await submit(STORE, 259, "r1")).toMatchObject({ ok: true });
  });

  it("limits per reporter per store, not globally", async () => {
    await submit(STORE, 249, "r1");
    expect(await submit(PRICED, 329, "r1")).toMatchObject({ ok: true });
    expect(await submit(STORE, 249, "r2")).toMatchObject({ ok: true });
  });

  it("refuses a store that does not exist, and writes nothing", async () => {
    expect(await submit("node-1", 249, "r1")).toEqual({ ok: false, reason: "store_not_found" });
    expect((await db.collection("submissions").where("storeId", "==", "node-1").get()).size).toBe(0);
    expect((await db.collection("rateLimits").get()).size).toBe(0);
  });

  it("holds a big move as pending", async () => {
    expect(await submit(PRICED, 899, "r1")).toMatchObject({ ok: true, status: "pending" });
    expect(await submit(PRICED, 329, "r2")).toMatchObject({ ok: true, status: "accepted" });
  });
});

describe("confirming a big move", () => {
  it("needs a different reporter", async () => {
    await submit(PRICED, 899, "r1");
    // The same reporter after the window, as if they cleared their site data
    // and came back the next day from the same network.
    await db
      .collection("rateLimits")
      .doc(`r1_${PRICED}`)
      .set({ storeId: PRICED, lastSubmittedAt: Timestamp.fromMillis(Date.now() - REPORT_WINDOW_MS - 1000) });
    await submit(PRICED, 905, "r1");

    let rollup = await recomputeStoreRollup(PRICED);
    expect(rollup?.priceCents).toBe(319);
    expect(rollup?.heldPriceCents).toBe(905);

    await submit(PRICED, 902, "r2");
    rollup = await recomputeStoreRollup(PRICED);
    expect(rollup?.priceCents).toBe(902);
    expect(rollup?.heldPriceCents).toBeNull();
  });
});
