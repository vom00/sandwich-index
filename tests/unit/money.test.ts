import { describe, expect, it } from "vitest";

import { formatCents, formatCount } from "@/lib/money";

describe("formatCents", () => {
  it("renders whole cents as dollars", () => {
    expect(formatCents(219)).toBe("$2.19");
    expect(formatCents(100)).toBe("$1.00");
  });
});

describe("formatCount", () => {
  it("groups thousands, as a nationwide store count needs", () => {
    expect(formatCount(13649)).toBe("13,649");
    expect(formatCount(987)).toBe("987");
    expect(formatCount(0)).toBe("0");
  });
});
