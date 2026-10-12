import { describe, expect, it } from "vitest";

import { matchesSearch, searchTerms } from "@/lib/store-search";

const story = {
  address: "2410 North Story Road, Irving, TX 75062-7068",
  locality: "Irving, TX 75062-7068",
  restaurantNumber: "1844",
};
const macarthur = {
  address: "5220 North Mac Arthur Drive, Irving, TX 75039",
  locality: "Irving, TX 75039",
  restaurantNumber: "15926",
};
const terminal = { address: "Terminal A, Dfw Airport, TX 75261", locality: null, restaurantNumber: null };
const noStreet = { address: null, locality: "Euless, TX 76039", restaurantNumber: null };

const find = (store: Parameters<typeof matchesSearch>[0], query: string) => matchesSearch(store, searchTerms(query));

describe("store search", () => {
  it("matches nothing-typed as everything", () => {
    expect(searchTerms("   ")).toEqual([]);
    expect(find(story, "")).toBe(true);
  });

  it("finds a city, a street and a ZIP, case aside", () => {
    expect(find(story, "irving")).toBe(true);
    expect(find(story, "Story")).toBe(true);
    expect(find(story, "75062")).toBe(true);
    expect(find(story, "coppell")).toBe(false);
  });

  it("matches the start of words, so typing can stop early", () => {
    expect(find(story, "irv")).toBe(true);
    expect(find(story, "750")).toBe(true);
    expect(find(story, "rving")).toBe(false);
  });

  it("reads abbreviations the way addresses spell them out", () => {
    expect(find(story, "N Story Rd")).toBe(true);
    expect(find(story, "2410 n story")).toBe(true);
    expect(find(macarthur, "5220 N MacArthur Dr")).toBe(true);
  });

  it("ignores spaces inside a long word", () => {
    expect(find(macarthur, "macarthur")).toBe(true);
    expect(find(macarthur, "mac arthur")).toBe(true);
  });

  it("needs every word to match", () => {
    expect(find(story, "story irving")).toBe(true);
    expect(find(story, "story dallas")).toBe(false);
  });

  it("finds a store by the restaurant number on a receipt", () => {
    expect(find(macarthur, "#15926")).toBe(true);
    expect(find(macarthur, "15926")).toBe(true);
    expect(find(story, "15926")).toBe(false);
  });

  it("keeps one-letter terms anchored", () => {
    expect(find(terminal, "a")).toBe(true);
    expect(find(story, "x")).toBe(false);
  });

  it("searches a store with no street by its locality", () => {
    expect(find(noStreet, "euless")).toBe(true);
    expect(find(terminal, "dfw airport")).toBe(true);
  });
});
