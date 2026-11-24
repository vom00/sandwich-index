/**
 * Firestore security rules, tested directly against the emulator.
 *
 * These deliberately bypass the UI. Client-side validation is a courtesy to
 * honest contributors; the rules are what stop everyone else, and the only way
 * to know they hold is to attack them with a raw SDK the way an abuser would.
 *
 * Requires the emulator: npm run test:rules
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

describe("submissions and the rate-limit ledger are server-only", () => {
  // Reports go through POST /api/stores/[id]/submissions, which verifies the
  // sign-in token, App Check and Turnstile and writes with the Admin SDK. The
  // range, the 24-hour limit and the hold on big moves are enforced there and
  // tested in tests/integration/submit.test.ts. What the rules must guarantee
  // is that nothing gets around that route.

  it("refuses the exact write that browsers used to make", async () => {
    // A well-formed submission plus its ledger stamp in one batch: the shape
    // the old rules accepted. Refused now, signed in or not.
    await assertFails(submissionBatch(authedDb(UID), UID).commit());
    await assertFails(submissionBatch(anonDb(), UID).commit());
  });

  it("refuses a lone submission and a lone ledger write", async () => {
    await assertFails(submissionBatch(authedDb(UID), UID, { includeLedger: false }).commit());
    await assertFails(
      setDoc(doc(authedDb(UID), "rateLimits", `${UID}_${STORE_ID}`), {
        storeId: STORE_ID,
        lastSubmittedAt: serverTimestamp(),
      }),
    );
  });

  it("refuses reads, because each submission carries its reporter code", async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      const db = asModular(admin);
      await setDoc(doc(db, "submissions", "seeded"), {
        storeId: STORE_ID,
        priceCents: 319,
        submittedAt: Timestamp.now(),
        source: "in_store",
        status: "accepted",
        flagCount: 0,
        reporter: "0123456789abcdef0123456789abcdef",
      });
      await setDoc(doc(db, "rateLimits", `0123456789abcdef0123456789abcdef_${STORE_ID}`), {
        storeId: STORE_ID,
        lastSubmittedAt: Timestamp.now(),
      });
    });

    for (const db of [anonDb(), authedDb(UID), authedDb(OTHER_UID)]) {
      await assertFails(getDoc(doc(db, "submissions", "seeded")));
      await assertFails(getDoc(doc(db, "rateLimits", `0123456789abcdef0123456789abcdef_${STORE_ID}`)));
    }
  });

  it("refuses edits and deletes of an existing submission", async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(asModular(admin), "submissions", "fixed-id"), { storeId: STORE_ID, priceCents: 319 });
    });
    const db = authedDb(UID);
    await assertFails(setDoc(doc(db, "submissions", "fixed-id"), { priceCents: 999 }, { merge: true }));
    await assertFails(setDoc(doc(db, "submissions", "fixed-id"), { status: "accepted" }, { merge: true }));
  });

  it("still lets anyone read a store's price", async () => {
    const snapshot = await assertSucceeds(getDoc(doc(anonDb(), "stores", ESTABLISHED_STORE_ID)));
    expect(snapshot.get("priceCents")).toBe(319);
  });
});

describe("server-only bookkeeping", () => {
  // Neither collection is named in firestore.rules, so both fall through to
  // Firestore's default deny. That is the intended protection, and it is
  // invisible in the rules file, so it is pinned here. A client that could
  // write `syncLog` could mark any area as synced and freeze its store list; one
  // that could write `syncBudget` could zero the Overpass ceiling and switch the
  // abuse limit off.
  for (const path of ["syncLog/9vfs", "syncBudget/overpass"]) {
    it(`refuses client reads and writes to ${path}`, async () => {
      const db = authedDb(UID);
      const [collection, id] = path.split("/") as [string, string];

      await assertFails(getDoc(doc(db, collection, id)));
      await assertFails(setDoc(doc(db, collection, id), { used: 0 }));
      await assertFails(getDoc(doc(anonDb(), collection, id)));
    });
  }
});

describe("feed observations", () => {
  const sample = {
    storeId: STORE_ID,
    priceCents: 249,
    observedAt: Timestamp.now(),
    feed: "menupricetracker",
    sourceUrl: null,
    importedAt: Timestamp.now(),
  };

  it("are public to read, so a store page can say where its price came from", async () => {
    await testEnv.withSecurityRulesDisabled(async (admin) => {
      await setDoc(doc(asModular(admin), "observations", "seeded"), sample);
    });

    await assertSucceeds(getDoc(doc(anonDb(), "observations", "seeded")));
  });

  it("cannot be written by a client, signed in or not", async () => {
    // An observation can set a store's price. A client that could write one
    // could set any price it liked and skip the move gate on the way.
    await assertFails(setDoc(doc(authedDb(UID), "observations", "forged"), sample));
    await assertFails(setDoc(doc(anonDb(), "observations", "forged"), sample));
  });
});
