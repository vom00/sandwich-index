/**
 * The dev stack on alternate ports, for when another project on this machine
 * already holds 3000 (its dev server) or 8080 (its Firestore emulator).
 *
 *   npm run emulators:alt     Firestore 8180, Auth 9198 (firebase.alt.json)
 *   npm run dev:alt           next dev on 3100 (or start, with --start)
 *
 * A production build beside a running dev server, for measuring:
 *
 *   node scripts/dev-alt.mjs --build --dist .next-build
 *   node scripts/dev-alt.mjs --start --dist .next-build --port 3200
 *
 * Values set here win over .env.local, because Next never overrides a variable
 * that is already in the environment. Browser suites follow with
 * TARGET_URL=http://localhost:3100, and seed scripts with the same two
 * *_EMULATOR_HOST variables.
 */
import { spawn, spawnSync } from "node:child_process";

export const ALT_ENV = {
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8180",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9198",
  NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: "8180",
  NEXT_PUBLIC_AUTH_EMULATOR_PORT: "9198",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
};

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const command = args.includes("--start") ? "start" : args.includes("--build") ? "build" : "dev";
const port = option("--port") ?? "3100";
const dist = option("--dist");

const env = { ...process.env, ...ALT_ENV, ...(dist === undefined ? {} : { NEXT_DIST_DIR: dist }) };

spawnSync(process.execPath, ["scripts/copy-ocr-assets.mjs"], { stdio: "inherit", env });

const next = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", command, ...(command === "build" ? [] : ["-p", port])],
  { stdio: "inherit", env },
);
next.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => next.kill(signal));
