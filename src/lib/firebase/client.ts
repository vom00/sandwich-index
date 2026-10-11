"use client";

/**
 * Browser Firebase SDK.
 *
 * Anonymous auth gives every device a stable UID without asking anyone to make
 * an account — a contributor should be able to log a price in fifteen seconds,
 * and a signup form is the fastest way to lose them. The UID is what the 24h
 * rate limit keys on.
 *
 * Worth being honest about: clearing site data mints a fresh UID and resets the
 * limit. App Check raises the cost of scripted abuse but does not close that
 * hole. The rate limit is friction, not security.
 *
 * Nor is there arithmetic robustness behind it any more. Under the old median
 * model a lone false report barely moved the number; under set-price the
 * newest report that clears the move gate becomes the price outright. What
 * keeps the numbers honest is that a wrong one is visible, dated, and
 * correctable by the next person through the door — not that it is hard to
 * write. See the README's "What this does not solve".
 */

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

let emulatorsConnected = false;

export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  connectEmulatorsOnce();
  return auth;
}

export function getDb(): Firestore {
  const db = getFirestore(getFirebaseApp());
  connectEmulatorsOnce();
  return db;
}

/**
 * The emulator connect calls throw if invoked twice on the same instance, and
 * React strict mode will absolutely invoke them twice, so this is guarded.
 */
function connectEmulatorsOnce(): void {
  if (!useEmulator || emulatorsConnected) return;
  emulatorsConnected = true;

  connectAuthEmulator(getAuth(getFirebaseApp()), "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(getFirestore(getFirebaseApp()), "127.0.0.1", 8080);
}

/**
 * Resolve to a signed-in anonymous user, reusing the existing session when one
 * is present. Every write path must await this — the rules require
 * `request.auth != null` and an unauthenticated write fails with a permission
 * error that looks nothing like the actual cause.
 */
export async function ensureAnonymousUser(): Promise<User> {
  const auth = getFirebaseAuth();
  if (auth.currentUser !== null) return auth.currentUser;

  const credential = await signInAnonymously(auth);
  return credential.user;
}

/**
 * App Check is wired but intentionally inert until a site key exists.
 *
 * Enabling enforcement before Phase 6 would block every Playwright run, since
 * a headless browser cannot solve reCAPTCHA. When the key is set, local runs
 * still need a debug token — see README.
 */
export async function initAppCheck(): Promise<void> {
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  if (siteKey === undefined || siteKey === "") return;

  const { initializeAppCheck, ReCaptchaV3Provider } = await import("firebase/app-check");
  initializeAppCheck(getFirebaseApp(), {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}
