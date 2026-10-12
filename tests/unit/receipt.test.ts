import { describe, expect, it } from "vitest";

import {
  checkStore,
  isPlainMcChicken,
  readPictureText,
  receiptAgeDays,
} from "@/lib/receipt";

// Verbatim tesseract.js output from the 2026-10-12 spike (see
// research/price-sources.md, "Third sweep"), misreadings included: "TEL$",
// "Sidel", "2:99", "Tax 22".
const COPPELL_RECEIPT = `McDonald's Restaurant #4412
813 S MACARTHUR BLVD
COPPELL, TX 75019
TEL$ 972 555 0142
KS# 2 10/11/2026 12:41 PM
Sidel Order 37
1 McChicken 2.49
1 Spicy McChicken 2:99
1 M Coke 1.39
1 McChicken Meal 7.89
Subtotal 14.76
Tax 22
Take-Out Total 15.98
Cashless 15.98
Change 0.00`;

const IRVING_RECEIPT = `McDonald's Restaurant #31206
2410 N STORY RD
IRVING, TX 75062
KS# 6 10/09/2026 08:02 PM
Order 12
2 McChicken 5.98
1 Lg Fries 4.19
Subtotal 10.17
Tax 0.84
Eat-In Total 11.01`;

const APP_SCREEN = `Pickup at
813 S MacArthur Blvd, Coppell
McChicken®
$2.49 | 400 Cal.
A crispy chicken fillet topped with mayonnaise and
shredded iceberg lettuce, served on a toasted bun.`;

describe("isPlainMcChicken", () => {
  it("takes the sandwich however it is printed", () => {
    for (const name of ["McChicken", "MCCHICKEN", "Mc Chicken", "McChicken®", "McChlcken", "MeChicken"]) {
      expect(isPlainMcChicken(name), name).toBe(true);
    }
  });

  it("refuses every other item with the word in it", () => {
    for (const name of ["Spicy McChicken", "McChicken Meal", "McChicken Biscuit", "Deluxe McChicken", "McCrispy", "McNuggets", "Chicken"]) {
      expect(isPlainMcChicken(name), name).toBe(false);
    }
  });
});

describe("readPictureText: receipts", () => {
  it("reads the store, the date and the plain McChicken, past the decoys", () => {
    const read = readPictureText(COPPELL_RECEIPT);
    expect(read.kind).toBe("receipt");
    expect(read.restaurantNumber).toBe("4412");
    expect(read.street).toBe("813 S MACARTHUR BLVD");
    expect(read.locality).toBe("COPPELL, TX 75019");
    expect(read.date).toBe("2026-10-11");
    expect(read.mcchicken).toEqual({ unitCents: 249, quantity: 1, line: "1 McChicken 2.49" });
    expect(read.missing).toBeNull();
  });

  it("divides by the quantity", () => {
    const read = readPictureText(IRVING_RECEIPT);
    expect(read.restaurantNumber).toBe("31206");
    expect(read.mcchicken?.unitCents).toBe(299);
    expect(read.mcchicken?.quantity).toBe(2);
  });

  it("accepts a decimal point OCR read as a colon", () => {
    const read = readPictureText(COPPELL_RECEIPT.replace("1 McChicken 2.49", "1 McChicken 2:49"));
    expect(read.mcchicken?.unitCents).toBe(249);
  });

  it("says when only a meal or a Spicy McChicken is on it", () => {
    const read = readPictureText(COPPELL_RECEIPT.replace("1 McChicken 2.49\n", ""));
    expect(read.mcchicken).toBeNull();
    expect(read.missing).toBe("only-variants");
  });

  it("says when there is no McChicken at all", () => {
    const read = readPictureText(IRVING_RECEIPT.replace("2 McChicken 5.98\n", ""));
    expect(read.missing).toBe("no-mcchicken");
  });

  it("says when there is next to no text", () => {
    expect(readPictureText("  \n|| ~ \n").missing).toBe("no-text");
  });
});

describe("readPictureText: app screenshots", () => {
  it("reads the price under the name, and the pickup address", () => {
    const read = readPictureText(APP_SCREEN);
    expect(read.kind).toBe("app");
    expect(read.mcchicken?.unitCents).toBe(249);
    expect(read.street).toBe("813 S MacArthur Blvd, Coppell");
    expect(read.restaurantNumber).toBeNull();
    expect(read.date).toBeNull();
  });

  it("doesn't take a Spicy McChicken's page for the McChicken's", () => {
    const read = readPictureText(APP_SCREEN.replace("McChicken®", "Spicy McChicken®"));
    expect(read.mcchicken).toBeNull();
    expect(read.missing).toBe("only-variants");
  });
});

describe("checkStore", () => {
  const coppell = readPictureText(COPPELL_RECEIPT);

  it("trusts the restaurant number when both sides have one", () => {
    expect(checkStore(coppell, { restaurantNumber: "4412", address: null })).toEqual({ verdict: "match", by: "number" });
    expect(checkStore(coppell, { restaurantNumber: "31206", address: "813 South MacArthur Boulevard" })).toEqual({
      verdict: "mismatch",
      by: "number",
    });
  });

  it("falls back to the street number", () => {
    const ours = { restaurantNumber: null, address: "813 South MacArthur Boulevard, Coppell, TX 75019" };
    expect(checkStore(coppell, ours)).toEqual({ verdict: "match", by: "street" });
    expect(checkStore(readPictureText(IRVING_RECEIPT), ours)).toEqual({ verdict: "mismatch", by: "street" });
    expect(checkStore(readPictureText(APP_SCREEN), ours)).toEqual({ verdict: "match", by: "street" });
  });

  it("leaves it to the person when neither is known", () => {
    expect(checkStore(coppell, { restaurantNumber: null, address: "Terminal A, Dfw Airport, TX 75261" })).toEqual({
      verdict: "unknown",
    });
  });
});

describe("receiptAgeDays", () => {
  const now = new Date(2026, 9, 12, 15, 0);

  it("counts whole days in local time", () => {
    expect(receiptAgeDays("2026-10-12", now)).toBe(0);
    expect(receiptAgeDays("2026-10-11", now)).toBe(1);
    expect(receiptAgeDays("2026-09-03", now)).toBe(39);
  });

  it("treats a future date as a misread", () => {
    expect(receiptAgeDays("2026-10-20", now)).toBeNull();
  });
});
