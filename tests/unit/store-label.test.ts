/**
 * How a store is named when its address is incomplete.
 *
 * Worth pinning down because the failure mode is silent: every rung of the
 * ladder renders as *some* string, so a mistake here does not throw — it just
 * quietly tells somebody a town is a street address.
 */

import { describe, expect, it } from "vitest";

import { composeLocality, composeStreetAddress } from "@/lib/address";
import { storeLabel, storeLabelText } from "@/lib/store-label";

describe("address composition", () => {
  it("assembles a full street address", () => {
    expect(
      composeStreetAddress({
        houseNumber: "105",
        street: "West Airport Freeway",
        city: "Euless",
        state: "TX",
        postcode: "76039",
      }),
    ).toBe("105 West Airport Freeway, Euless, TX 76039");
  });

  it("keeps a street with no house number", () => {
    expect(
      composeStreetAddress({ street: "Broadway", city: "New York", state: "NY" }),
    ).toBe("Broadway, New York, NY");
  });

  it("refuses to call a town and a postcode an address", () => {
    // Airport terminals are the common case. "Irving, TX 75261" is not
    // somewhere you can walk to, and formatting it like an address says it is.
    expect(composeStreetAddress({ city: "Irving", state: "TX", postcode: "75261" })).toBeNull();
  });

  it("treats blank tags as absent", () => {
    expect(composeStreetAddress({ street: "   ", city: "Coppell" })).toBeNull();
    expect(composeLocality({ city: "", state: "" })).toBeNull();
  });

  it("composes a locality from whatever is known", () => {
    expect(composeLocality({ city: "Elizabeth", state: "NJ", postcode: "07208" })).toBe(
      "Elizabeth, NJ 07208",
    );
    expect(composeLocality({ city: "Coppell" })).toBe("Coppell");
  });

  // Two Fort Worth-area stores rendered as "2391 North Collins Street, , TX
  // 76011-2627" because a missing city is undefined, not "".
  it("leaves no empty slot when the city is missing", () => {
    expect(composeLocality({ state: "TX", postcode: "76011-2627" })).toBe("TX 76011-2627");
    expect(
      composeStreetAddress({ houseNumber: "2391", street: "North Collins Street", state: "TX", postcode: "76011-2627" }),
    ).toBe("2391 North Collins Street, TX 76011-2627");
  });
});

describe("store labels", () => {
  const base = { name: "McDonald's", address: null, locality: null };

  it("uses the street address unqualified when there is one", () => {
    const label = storeLabel({ ...base, address: "813 East Main, Grand Prairie, TX 75050" });

    expect(label.text).toBe("813 East Main, Grand Prairie, TX 75050");
    expect(label.qualifier).toBeNull();
  });

  it("falls back to the locality, and says that is what it is", () => {
    const label = storeLabel({ ...base, locality: "Elizabeth, NJ 07208" });

    expect(label.text).toBe("Elizabeth, NJ 07208");
    expect(label.qualifier).toBe("street address unknown");
  });

  it("prefers a street address over a locality", () => {
    const label = storeLabel({
      ...base,
      address: "1 Main St, Coppell, TX",
      locality: "Coppell, TX",
    });

    expect(label.text).toBe("1 Main St, Coppell, TX");
  });

  it("admits to knowing nothing rather than inventing a place", () => {
    expect(storeLabel(base)).toEqual({
      text: "McDonald's",
      qualifier: "no address on file",
    });
  });

  it("flattens to one string for aria labels and titles", () => {
    expect(storeLabelText(base)).toBe("McDonald's (no address on file)");
    expect(storeLabelText({ ...base, address: "1 Main St" })).toBe("1 Main St");
  });
});
