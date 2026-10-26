import { describe, expect, it } from "vitest";
import { isFishIntroDue } from "./eligibility";

describe("isFishIntroDue", () => {
  it("introduces Fish after an update from a release with Assistant", () => {
    expect(isFishIntroDue("1.6.3")).toBe(true);
  });

  it("introduces Fish to Libraries that updated to 2.0.0 before this dialog", () => {
    expect(isFishIntroDue("2.0.0")).toBe(true);
  });

  it("skips a first run, which gets setup instead", () => {
    expect(isFishIntroDue(null)).toBe(false);
  });

  it("skips Libraries that already ran a release with this dialog", () => {
    expect(isFishIntroDue("2.0.1")).toBe(false);
    expect(isFishIntroDue("2.1.0")).toBe(false);
  });
});
