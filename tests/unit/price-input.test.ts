import { describe, expect, it } from "vitest";

import { PRICE_MAX_CENTS, PRICE_MIN_CENTS } from "@/lib/money";
import { isBlank, readPriceInput } from "@/lib/price-input";

describe("isBlank", () => {
  it("treats whitespace as blank", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("   ")).toBe(true);
    expect(isBlank("\t")).toBe(true);
  });

  it("does not treat a zero as blank", () => {
    expect(isBlank("0")).toBe(false);
  });
});

describe("readPriceInput", () => {
  it("reads plain dollars and cents", () => {
    expect(readPriceInput("3.19")).toEqual({ ok: true, cents: 319 });
  });

  it("reads a whole number of dollars", () => {
    expect(readPriceInput("4")).toEqual({ ok: true, cents: 400 });
  });

  it("pads a single decimal place to the right", () => {
    // "3.1" is three dollars ten, not three dollars one.
    expect(readPriceInput("3.1")).toEqual({ ok: true, cents: 310 });
  });

  it("tolerates a leading dollar sign and surrounding space", () => {
    expect(readPriceInput("  $3.19 ")).toEqual({ ok: true, cents: 319 });
  });

  it("never produces a float, even for the classic case", () => {
    // parseFloat("3.19") * 100 is 318.99999999999994.
    const result = readPriceInput("3.19");
    expect(result.ok && Number.isInteger(result.cents)).toBe(true);
  });

  describe("rejections", () => {
    it("rejects an empty field", () => {
      expect(readPriceInput("")).toEqual({
        ok: false,
        message: "Enter the price you saw.",
      });
    });

    it("rejects words", () => {
      const result = readPriceInput("cheap");
      expect(result.ok).toBe(false);
    });

    it("rejects three decimal places", () => {
      const result = readPriceInput("3.199");
      expect(result.ok).toBe(false);
    });

    it("rejects a negative", () => {
      const result = readPriceInput("-3.19");
      expect(result.ok).toBe(false);
    });

    it("rejects below the floor", () => {
      const result = readPriceInput("0.99");
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toContain("under");
    });

    it("rejects above the ceiling", () => {
      const result = readPriceInput("15.01");
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.message).toContain("over");
    });
  });

  describe("boundaries", () => {
    it("accepts exactly the floor", () => {
      expect(readPriceInput("1.00")).toEqual({ ok: true, cents: PRICE_MIN_CENTS });
    });

    it("accepts exactly the ceiling", () => {
      expect(readPriceInput("15.00")).toEqual({ ok: true, cents: PRICE_MAX_CENTS });
    });
  });
});
