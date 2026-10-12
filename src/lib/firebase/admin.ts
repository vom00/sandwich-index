import "server-only";

/**
 * Server-side Firebase Admin SDK.
 *
 * The Admin SDK bypasses security rules, which is exactly why the surface it is
 * used from is narrow and deliberate:
 *   - Overpass store upserts (clients cannot write `stores`)
 *   - Price recomputation after a submission
 *   - Seeding, against the emulator only
 *
 * Nothing here should ever be reachable from a client component. The
 * `server-only` import above turns an accidental client import into a build
 * error rather than a leaked service account.
 */

import { applicationDefault, cert, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

import { describeKey, normalizeCredentials } from "@/lib/firebase/private-key";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-sandwich-index";
const useEmulator = process.env.FIRESTORE_EMULATOR_HOST !== undefined;

function createApp(): App {
  if (getApps().length > 0) return getApp();

  // Against the emulator the SDK reads FIRESTORE_EMULATOR_HOST and needs no
  // credentials at all. A `demo-` prefixed project id additionally guarantees
  // the SDK refuses to reach production even if the host var is unset.
  if (useEmulator) {
    return initializeApp({ projectId });
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const hasKey = clientEmail !== undefined && privateKey !== undefined;

  // On Google's own hosting (App Hosting, which runs on Cloud Run) the server
  // already has an identity, so no key is stored anywhere. App Hosting sets
  // FIREBASE_CONFIG during both the build and the run; Cloud Run sets K_SERVICE.
  const onGoogleCloud =
    process.env.FIREBASE_CONFIG !== undefined || process.env.K_SERVICE !== undefined;

  if (!hasKey && !onGoogleCloud) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_CLIENT_EMAIL and " +
        "FIREBASE_PRIVATE_KEY, deploy to Firebase App Hosting, or set " +
        "FIRESTORE_EMULATOR_HOST to run against the emulator.",
    );
  }

  // The demo project id is a *development* fallback and must not survive into
  // a real deployment. Reaching here means a real project is the target, so
  // an unset FIREBASE_PROJECT_ID is a misconfigured deploy rather than a local
  // run — and it would otherwise present as an opaque authentication failure
  // against a project that does not exist.
  if (process.env.FIREBASE_PROJECT_ID === undefined) {
    throw new Error(
      "FIREBASE_PROJECT_ID is not set, but a real project is the target. " +
        "Set it to the real project id — the demo- fallback only applies when " +
        "running against the emulator.",
    );
  }

  if (!hasKey) {
    return initializeApp({ credential: applicationDefault(), projectId });
  }

  // Pasting the key into a dashboard mangles it in predictable ways (quotes,
  // escaped newlines, the whole JSON file); see lib/firebase/private-key.
  const repaired = normalizeCredentials(clientEmail, privateKey);
  try {
    return initializeApp({ credential: cert({ projectId, ...repaired }) });
  } catch (error) {
    // Say what shape the value had, never what it contained, so a bad paste
    // can be diagnosed from the logs without the key appearing in them.
    console.error("[firebase-admin] FIREBASE_PRIVATE_KEY could not be parsed", describeKey(privateKey));
    throw error;
  }
}

export function getAdminDb(): Firestore {
  return getFirestore(createApp());
}

export const STORES_COLLECTION = "stores";
export const SUBMISSIONS_COLLECTION = "submissions";
export const RATE_LIMITS_COLLECTION = "rateLimits";
export const OBSERVATIONS_COLLECTION = "observations";
