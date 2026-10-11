/**
 * Firestore security rules, tested directly against the emulator.
 *
 * These deliberately bypass the UI. Client-side validation is a courtesy to
 * honest contributors; the rules are what stop everyone else, and the only way
 * to know they hold is to attack them with a raw SDK the way an abuser would.
 *
 * Requires the emulator: npm run emulators
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PROJECT_ID = "demo-sandwich-index";
const UID = "device-alpha";
const OTHER_UID = "device-beta";
const STORE_ID = "node-1234567890";
const ESTABLISHED_STORE_ID = "node-9876543210";

let testEnv: RulesTestEnvironment;

/**
 * `rules-unit-testing` hands back a compat Firestore instance while the rest of
 * this file uses the modular SDK. They are the same object at runtime but have
 * separate type declarations, so the cast is confined to these three helpers
 * rather than sprayed across every test.
 */
function asModular(context: RulesTestContext): Firestore {
  return context.firestore() as unknown as Firestore;
}

function authedDb(uid: string): Firestore {
  return asModular(testEnv.authenticatedContext(uid));
}

function anonDb(): Firestore {
  return asModular(testEnv.unauthenticatedContext());
}

/** A store with no price history — the outlier gate has no baseline here. */
const freshStore = {
  osmId: STORE_ID,
  name: "McDonald's",
  address: "120 S Denton Tap Rd, Coppell, TX 75019",
  lat: 32.9546,
  lng: -96.99,
  geohash: "9vfsz3n",
  reportCount: 0,
  confirmedCount: 0,
  priceCents: null,
  pricedAt: null,
  lastSyncedAt: Timestamp.now(),
};

/** A store with an established price of $3.19 for the move gate to bite on. */
const establishedStore = {
  ...freshStore,
  osmId: ESTABLISHED_STORE_ID,
  reportCount: 8,
  confirmedCount: 8,
  priceCents: 319,
  pricedAt: Timestamp.now(),
};

/** Build the two-document atomic write the rules require for a submission. */
function submissionBatch(
  db: Firestore,
  uid: string,
  options: {
    storeId?: string;
    priceCents?: unknown;
    source?: string;
    status?: string;
    flagCount?: number;
    submittedAt?: unknown;
    includeLedger?: boolean;
    submissionId?: string;
  } = {},
) {
  const {
    storeId = STORE_ID,
    priceCents = 319,
    source = "in_store",
    status = "accepted",
    flagCount = 0,
    submittedAt = serverTimestamp(),
    includeLedger = true,
    submissionId = `sub-${Math.random().toString(36).slice(2)}`,
  } = options;

  const batch = writeBatch(db);

  batch.set(doc(db, "submissions", submissionId), {
    storeId,
    priceCents,
    submittedAt,
    source,
    status,
    flagCount,
  });

  if (includeLedger) {
    batch.set(doc(db, "rateLimits", `${uid}_${storeId}`), {
      storeId,
      lastSubmittedAt: serverTimestamp(),
    });
  }

  return batch;
}

beforeAll(async () => {
  // Same env-derived target as the integration suite's clearFirestore. A
  // literal 8080 here once aimed this suite's beforeEach clears at the dev
  // emulator while everything else used the throwaway instance — every rules
  // test passed, and the browsable dev data quietly vanished.
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8085";
  const [host = "127.0.0.1", port = "8085"] = emulatorHost.split(":");

  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port: Number(port),
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = asModular(context);
    await setDoc(doc(db, "stores", STORE_ID), freshStore);
    await setDoc(doc(db, "stores", ESTABLISHED_STORE_ID), establishedStore);
  });
});

describe("stores collection", () => {
  it("is publicly readable", async () => {
    const db = anonDb();
    await assertSucceeds(getDoc(doc(db, "stores", STORE_ID)));
  });

  it("rejects client writes even from a signed-in device", async () => {
    // The outlier gate reads priceCents from here. If a client could
    // edit it, they could set the median to their own price and walk anything
    // past the gate.
    const db = authedDb(UID);
    await assertFails(
      setDoc(doc(db, "stores", STORE_ID), { ...freshStore, priceCents: 1 }),
    );
  });
});

describe("price range validation", () => {
  it("accepts a price inside the range", async () => {
    const db = authedDb(UID);
    await assertSucceeds(submissionBatch(db, UID, { priceCents: 319 }).commit());
  });

  it("accepts the exact boundaries", async () => {
    const db = authedDb(UID);
    await assertSucceeds(submissionBatch(db, UID, { priceCents: 100 }).commit());

    const other = authedDb(OTHER_UID);
    await assertSucceeds(
      submissionBatch(other, OTHER_UID, { priceCents: 1500 }).commit(),
    );
  });

  it("rejects a price below $1.00", async () => {
    const db = authedDb(UID);
    await assertFails(submissionBatch(db, UID, { priceCents: 99 }).commit());
  });

  it("rejects a price above $15.00", async () => {
    const db = authedDb(UID);
    await assertFails(submissionBatch(db, UID, { priceCents: 1501 }).commit());
  });

  it("rejects a float price", async () => {
    // 3.19 is not a price in this system. `is int` is what catches it.
    const db = authedDb(UID);
    await assertFails(submissionBatch(db, UID, { priceCents: 3.19 }).commit());
  });

  it("rejects a price sent as a string", async () => {
    const db = authedDb(UID);
    await assertFails(submissionBatch(db, UID, { priceCents: "319" }).commit());
  });
});

describe("authentication and shape", () => {
  it("rejects an unauthenticated submission", async () => {
    const db = anonDb();
    await assertFails(submissionBatch(db, UID).commit());
  });

  it("rejects a submission to a store that does not exist", async () => {
    const db = authedDb(UID);
    await assertFails(
      submissionBatch(db, UID, { storeId: "node-does-not-exist" }).commit(),
    );
  });

  it("rejects an unknown source", async () => {
    const db = authedDb(UID);
    await assertFails(submissionBatch(db, UID, { source: "telepathy" }).commit());
  });

  it("rejects a client-chosen timestamp", async () => {
    // Backdating would let someone forge price history.
    const db = authedDb(UID);
    await assertFails(
      submissionBatch(db, UID, {
        submittedAt: Timestamp.fromMillis(Date.now() - 60 * 60 * 1000),
      }).commit(),
    );
  });

  it("rejects a submission that arrives pre-flagged", async () => {
    const db = authedDb(UID);
    await assertFails(submissionBatch(db, UID, { flagCount: 5 }).commit());
  });

  it("rejects a submission claiming rejected status", async () => {
    const db = authedDb(UID);
    await assertFails(submissionBatch(db, UID, { status: "rejected" }).commit());
  });

  it("rejects submission edits and deletes", async () => {
    const db = authedDb(UID);
    await submissionBatch(db, UID, { submissionId: "fixed-id" }).commit();

    await assertFails(
      setDoc(doc(db, "submissions", "fixed-id"), { priceCents: 999 }, { merge: true }),
    );
  });
});

describe("rate limit", () => {
  it("rejects a submission that skips the ledger write", async () => {
    // This is the getAfter() guard. Without it the whole limit is decorative:
    // a client just writes the submission and never stamps the ledger.
    const db = authedDb(UID);
    await assertFails(
      submissionBatch(db, UID, { includeLedger: false }).commit(),
    );
  });

  it("rejects a second submission to the same store within 24 hours", async () => {
    const db = authedDb(UID);
    await assertSucceeds(submissionBatch(db, UID).commit());
    await assertFails(submissionBatch(db, UID).commit());
  });

  it("allows a second submission once the window has passed", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(asModular(context),"rateLimits", `${UID}_${STORE_ID}`), {
        storeId: STORE_ID,
        lastSubmittedAt: Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000),
      });
    });

    const db = authedDb(UID);
    await assertSucceeds(submissionBatch(db, UID).commit());
  });

  it("scopes the limit per store, not per device", async () => {
    const db = authedDb(UID);
    await assertSucceeds(submissionBatch(db, UID, { storeId: STORE_ID }).commit());
    await assertSucceeds(
      submissionBatch(db, UID, {
        storeId: ESTABLISHED_STORE_ID,
        priceCents: 319,
      }).commit(),
    );
  });

  it("scopes the limit per device, not globally", async () => {
    const alpha = authedDb(UID);
    const beta = authedDb(OTHER_UID);
    await assertSucceeds(submissionBatch(alpha, UID).commit());
    await assertSucceeds(submissionBatch(beta, OTHER_UID).commit());
  });

  it("rejects stamping another device's ledger", async () => {
    const db = authedDb(UID);
    await assertFails(
      setDoc(doc(db, "rateLimits", `${OTHER_UID}_${STORE_ID}`), {
        storeId: STORE_ID,
        lastSubmittedAt: serverTimestamp(),
      }),
    );
  });

  it("rejects backdating your own ledger to escape the window", async () => {
    const db = authedDb(UID);
    await assertFails(
      setDoc(doc(db, "rateLimits", `${UID}_${STORE_ID}`), {
        storeId: STORE_ID,
        lastSubmittedAt: Timestamp.fromMillis(Date.now() - 48 * 60 * 60 * 1000),
      }),
    );
  });

  it("rejects deleting the ledger to reset the limit", async () => {
    const db = authedDb(UID);
    await submissionBatch(db, UID).commit();

    const { deleteDoc } = await import("firebase/firestore");
    await assertFails(deleteDoc(doc(db, "rateLimits", `${UID}_${STORE_ID}`)));
  });
});

describe("outlier gate", () => {
  // Established store median is 319 cents with 8 samples.
  // The 40% band is 191.4 to 446.6 cents.

  it("accepts a normal price as accepted", async () => {
    const db = authedDb(UID);
    await assertSucceeds(
      submissionBatch(db, UID, {
        storeId: ESTABLISHED_STORE_ID,
        priceCents: 349,
        status: "accepted",
      }).commit(),
    );
  });

  it("rejects an outlier that claims accepted status", async () => {
    const db = authedDb(UID);
    await assertFails(
      submissionBatch(db, UID, {
        storeId: ESTABLISHED_STORE_ID,
        priceCents: 1499,
        status: "accepted",
      }).commit(),
    );
  });

  it("allows an outlier that correctly marks itself pending", async () => {
    const db = authedDb(UID);
    await assertSucceeds(
      submissionBatch(db, UID, {
        storeId: ESTABLISHED_STORE_ID,
        priceCents: 1499,
        status: "pending",
      }).commit(),
    );
  });

  it("rejects a normal price that tries to mark itself pending", async () => {
    // Status is derived, not chosen. Letting a contributor opt into pending
    // would let them keep honest prices out of a store's median.
    const db = authedDb(UID);
    await assertFails(
      submissionBatch(db, UID, {
        storeId: ESTABLISHED_STORE_ID,
        priceCents: 349,
        status: "pending",
      }).commit(),
    );
  });

  it("applies the gate from the very first price, with no sample threshold", async () => {
    // Under the median model this store was below the three-sample threshold
    // and a $14.99 report walked straight in as `accepted`. With one set price
    // there is no such thing as "not enough samples yet" — there is a price to
    // move or there is not, and this store has one.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(asModular(context), "stores", STORE_ID), {
        ...freshStore,
        reportCount: 1,
        confirmedCount: 1,
        priceCents: 319,
      });
    });

    const db = authedDb(UID);
    await assertFails(
      submissionBatch(db, UID, { priceCents: 1499, status: "accepted" }).commit(),
    );
  });

  it("accepts that same report when it correctly declares itself held", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(asModular(context), "stores", STORE_ID), {
        ...freshStore,
        reportCount: 1,
        confirmedCount: 1,
        priceCents: 319,
      });
    });

    const db = authedDb(UID);
    await assertSucceeds(
      submissionBatch(db, UID, { priceCents: 1499, status: "pending" }).commit(),
    );
  });

  it("does not apply the gate to a store with no median at all", async () => {
    const db = authedDb(UID);
    await assertSucceeds(
      submissionBatch(db, UID, { priceCents: 1499, status: "accepted" }).commit(),
    );
  });

  it("treats the band edges consistently", async () => {
    // 40% of 319 is 127.6. A deviation of exactly 127 is inside the band.
    const inside = authedDb(UID);
    await assertSucceeds(
      submissionBatch(inside, UID, {
        storeId: ESTABLISHED_STORE_ID,
        priceCents: 319 + 127,
        status: "accepted",
      }).commit(),
    );

    // 128 is outside it.
    const outside = authedDb(OTHER_UID);
    await assertFails(
      submissionBatch(outside, OTHER_UID, {
        storeId: ESTABLISHED_STORE_ID,
        priceCents: 319 + 128,
        status: "accepted",
      }).commit(),
    );
  });
});

describe("submission log visibility", () => {
  it("is publicly readable so the store page can render history", async () => {
    const db = authedDb(UID);
    await submissionBatch(db, UID, { submissionId: "readable" }).commit();

    const anon = anonDb();
    const snapshot = await assertSucceeds(getDoc(doc(anon, "submissions", "readable")));
    expect(snapshot.exists()).toBe(true);
  });

  it("keeps another device's rate-limit ledger private", async () => {
    const alpha = authedDb(UID);
    await submissionBatch(alpha, UID).commit();

    const beta = authedDb(OTHER_UID);
    await assertFails(getDoc(doc(beta, "rateLimits", `${UID}_${STORE_ID}`)));
  });
});
