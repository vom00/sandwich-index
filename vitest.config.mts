import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws by default outside a React Server context, which
      // is exactly what makes it a useful guard in app code — and exactly what
      // stops a test runner importing the modules it guards. Resolve it to the
      // package's own empty build, which is what Next does via the
      // "react-server" export condition.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Emulator wiring. Presence of FIRESTORE_EMULATOR_HOST is what puts the
    // Admin SDK into emulator mode, and the `demo-` project id guarantees the
    // SDK cannot reach production even if that were misconfigured.
    //
    // These are the *test* emulator ports from firebase.itest.json, not the
    // dev emulator on 8080. The integration suite clears the whole database
    // between tests; pointing it at 8080 once deleted every synced store and
    // price in the browsable dev data. With nothing listening on 8085 the
    // suite fails loudly instead — run it via `npm run test:emulated`, which
    // boots the throwaway instance.
    env: {
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199",
      FIREBASE_PROJECT_ID: "demo-sandwich-index",
    },
    // The Firestore emulator is slower to answer than an in-process fake,
    // especially on the first request while it JITs the rules.
    testTimeout: 30_000,
    hookTimeout: 40_000,
    // Emulator-backed suites share one instance and one project namespace.
    fileParallelism: false,
  },
});
