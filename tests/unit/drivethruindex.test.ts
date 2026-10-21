import { describe, expect, it } from "vitest";

import { parseDtiStorePage, restaurantNumberFromPath } from "@/lib/drivethruindex";

/** The parts of a store page the parser reads, in the page's own markup (2026-10-21). */
function page({ rows, checked = "2026-10-21" }: { rows: string; checked?: string }): string {
  return [
    '<script type="application/ld+json">{"@type": "Dataset", "dateModified": "2026-10-21"}</script>',
    '<script type="application/ld+json">{"@type": "FastFoodRestaurant", "name": "McDonald\'s", "address": {"@type": "PostalAddress", "streetAddress": "478 S Barre Rd", "addressLocality": "Barre", "addressRegion": "VT", "postalCode": "05641"}}</script>',
    `<p>Pickup prices from the McDonald&#x27;s app, checked ${checked}. Items linked to their own page.</p>`,
    "<table><thead><tr><th>Item</th><th class=num>Pickup</th><th class=num>Delivery</th></tr></thead><tbody>",
    rows,
    "</tbody></table>",
  ].join("");
}

const row = (name: string, pickup: string, delivery: string) =>
  `<tr><td>${name}</td><td class="num">${pickup}</td><td class="num">${delivery}</td></tr>`;

describe("restaurantNumberFromPath", () => {
  it("reads the restaurant number from a US McDonald's page", () => {
    expect(restaurantNumberFromPath("/restaurants/us/vt/barre/mcdonalds-12751")).toBe("12751");
  });

  it("ignores language copies, other brands and other countries", () => {
    expect(restaurantNumberFromPath("/restaurants/us/vt/barre/mcdonalds-12751?lang=de")).toBeNull();
    expect(restaurantNumberFromPath("/restaurants/us/nv/sparks/taco-bell-036244")).toBeNull();
    expect(restaurantNumberFromPath("/restaurants/au/nsw/sydney/mcdonalds-123")).toBeNull();
  });
});

describe("parseDtiStorePage", () => {
  it("takes the plain McChicken's pickup price and the day it was checked", () => {
    const html = page({
      rows: [
        row("Hot &#x27;N Spicy McChicken", "$2.59", "$3.99"),
        row("$5 McChicken Meal Deal", "$5.00", "—"),
        row("McChicken", "$2.39", "$3.99"),
        row("McChicken Patty", "$1.49", "$1.49"),
      ].join(""),
    });
    expect(parseDtiStorePage(html)).toEqual({
      address: "478 S Barre Rd",
      city: "Barre",
      priceCents: 239,
      checkedOn: "2026-10-21",
    });
  });

  it("reads a McChicken row whose name is a link", () => {
    const html = page({ rows: row('<a href="/items/mcdonalds/mcchicken">McChicken</a>', "$1.99", "$2.89") });
    expect(parseDtiStorePage(html)?.priceCents).toBe(199);
  });

  it("gives no price when the menu has no plain McChicken, or no pickup price for it", () => {
    expect(parseDtiStorePage(page({ rows: row("Big Mac", "$6.49", "$7.99") }))?.priceCents).toBeNull();
    expect(parseDtiStorePage(page({ rows: row("McChicken", "—", "$3.99") }))?.priceCents).toBeNull();
  });

  it("refuses a page without a checked date", () => {
    const html = page({ rows: row("McChicken", "$2.39", "$3.99") }).replace(/, checked [\d-]+/, "");
    expect(parseDtiStorePage(html)).toBeNull();
  });

  it("refuses a table whose first price column isn't pickup", () => {
    const html = page({ rows: row("McChicken", "$3.99", "$2.39") }).replace(
      "<th class=num>Pickup</th><th class=num>Delivery</th>",
      "<th class=num>Delivery</th><th class=num>Pickup</th>",
    );
    expect(parseDtiStorePage(html)).toBeNull();
  });
});
