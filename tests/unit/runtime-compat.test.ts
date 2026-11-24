import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

/**
 * Vercel's Node runtime doesn't let CommonJS require() an ES module. On
 * 2026-11-24 that took production down: firebase-admin's JWT verifier loads
 * jwks-rsa, and jwks-rsa 4 requires jose 6, which ships only as an ES module.
 * package.json pins jwks-rsa to 3.x (jose 4, which has a CommonJS build) in
 * `overrides`. This loads the two modules the submission route uses the way
 * that runtime would.
 */
describe("firebase-admin on a runtime without require(esm)", () => {
  it.each(["firebase-admin/auth", "firebase-admin/app-check"])("%s loads", (id) => {
    const run = () =>
      execFileSync(process.execPath, ["--no-experimental-require-module", "-e", `require(${JSON.stringify(id)})`], {
        stdio: "pipe",
      });
    expect(run).not.toThrow();
  });
});
