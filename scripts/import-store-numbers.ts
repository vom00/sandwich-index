/**
 * Give each store its McDonald's restaurant number, from All The Places.
 *
 *   npm run import:store-numbers -- --file feeds/alltheplaces/mcdonalds-2026-09-26.geojson
 *   npm run import:store-numbers -- --file <file> --write
 *
 * A dry run by default. The number is what every receipt prints as
 * "McDonald's Restaurant #4412", so a receipt read on a store's page can be
 * checked against the right store (`lib/receipt.ts`, `checkStore`).
 *
 * The file is All The Places' McDonald's spider output: every location from
 * the company's own store locator, with that number as `ref`, published under
 * CC0. Download the latest complete run's `output/mcdonalds.geojson` from
 * https://data.alltheplaces.xyz (check the size: a run cut short is about half
 * of the usual ~21 MB). Its features are one per line, and a truncated file
 * has no closing bracket, so it is read line by line rather than as one JSON
 * document.
 *
 * A store gets a number only when the match is unambiguous:
 *   - exactly one McDonald's within 150 m whose street number agrees with
 *     ours, or, when either side has no street number (airport terminals, OSM
 *     entries without an address), exactly one within 60 m; and
 *   - no other store claims the same number.
 * Anything else is left without one. A missing number only means the form
 * falls back to the street number; a wrong one would send someone's receipt
 * to the wrong store.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAdminDb } from "../src/lib/firebase/admin";

const NEAR_METERS = 150;
const NEAR_WITHOUT_STREET_METERS = 60;

interface Location {
  ref: string;
  street: string | null;
  city: string | null;
  lat: number;
  lng: number;
}

function parseArgs(argv: readonly string[]): { file: string; write: boolean } {
  const at = argv.indexOf("--file");
  const file = at === -1 ? undefined : argv[at + 1];
  if (file === undefined) {
    console.error("Usage: npm run import:store-numbers -- --file <mcdonalds.geojson> [--write]");
    process.exit(1);
  }
  return { file, write: argv.includes("--write") };
}

function readLocations(path: string): Location[] {
  const locations: Location[] = [];
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim().replace(/,$/, "");
    if (!line.startsWith('{"type": "Feature"')) continue;
    const feature = JSON.parse(line) as {
      properties: Record<string, string | undefined>;
      geometry: { coordinates: [number, number] } | null;
    };
    const p = feature.properties;
    if (p["addr:country"] !== "US" || p["brand"] !== "McDonald's") continue;
    if (!/^\d{3,5}$/.test(p["ref"] ?? "") || feature.geometry === null) continue;
    const [lng, lat] = feature.geometry.coordinates;
    locations.push({
      ref: p["ref"]!,
      street: p["addr:street_address"] ?? null,
      city: p["addr:city"] ?? null,
      lat,
      lng,
    });
  }
  return locations;
}

function meters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(h));
}

function streetNumber(value: string | null): string | null {
  return value?.trim().match(/^(\d{1,6})\b/)?.[1] ?? null;
}

async function main(): Promise<void> {
  const { file, write } = parseArgs(process.argv.slice(2));
  const locations = readLocations(resolve(file));
  console.log(`${locations.length} US McDonald's with a restaurant number in ${file}`);

  const db = getAdminDb();
  const snapshot = await db.collection("stores").get();

  const chosen = new Map<string, { ref: string; how: string }>();
  let none = 0;
  let ambiguous = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const here = { lat: Number(data["lat"]), lng: Number(data["lng"]) };
    const ours = streetNumber(typeof data["address"] === "string" ? data["address"] : null);
    const near = locations
      .map((location) => ({ location, distance: meters(here, location) }))
      .filter(({ distance }) => distance <= NEAR_METERS);

    const agreeing = near.filter(({ location }) => {
      const theirs = streetNumber(location.street);
      return ours !== null && theirs !== null && theirs === ours;
    });
    const unnumbered = near.filter(
      ({ location, distance }) =>
        (ours === null || streetNumber(location.street) === null) && distance <= NEAR_WITHOUT_STREET_METERS,
    );

    if (agreeing.length === 1) {
      chosen.set(doc.id, { ref: agreeing[0]!.location.ref, how: `street ${ours}, ${Math.round(agreeing[0]!.distance)} m` });
    } else if (agreeing.length === 0 && unnumbered.length === 1) {
      chosen.set(doc.id, { ref: unnumbered[0]!.location.ref, how: `${Math.round(unnumbered[0]!.distance)} m, no street number to compare` });
    } else if (near.length === 0) {
      none += 1;
    } else {
      ambiguous += 1;
    }
  }

  // One number, one store.
  const claims = new Map<string, string[]>();
  for (const [storeId, { ref }] of chosen) claims.set(ref, [...(claims.get(ref) ?? []), storeId]);
  let shared = 0;
  for (const [ref, storeIds] of claims) {
    if (storeIds.length > 1) {
      shared += storeIds.length;
      for (const storeId of storeIds) chosen.delete(storeId);
      console.log(`SHARED  #${ref} would go to ${storeIds.join(", ")}; none of them get it`);
    }
  }

  let changed = 0;
  for (const doc of snapshot.docs) {
    const pick = chosen.get(doc.id);
    if (pick === undefined) continue;
    const current = doc.data()["restaurantNumber"];
    if (current !== pick.ref) changed += 1;
    console.log(`MATCH   ${String(doc.data()["address"] ?? doc.id).padEnd(52)} #${pick.ref}  (${pick.how})`);
  }

  console.log(
    `\n${chosen.size} matched, ${ambiguous} ambiguous, ${shared} dropped for sharing a number, ` +
      `${none} with no McDonald's within ${NEAR_METERS} m (against ${snapshot.size} stores). ${changed} would change.`,
  );

  if (!write) {
    console.log("Dry run. Add --write to record them.");
    return;
  }

  let batch = db.batch();
  let pending = 0;
  for (const [storeId, { ref }] of chosen) {
    batch.update(db.collection("stores").doc(storeId), { restaurantNumber: ref });
    pending += 1;
    if (pending === 450) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  console.log(`Recorded ${chosen.size} restaurant numbers.`);
}

main().catch((error: unknown) => {
  console.error("\nimport:store-numbers failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
