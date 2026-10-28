import { describe, expect, it } from "vitest";
import {
  aggregateSensitiveScores,
  sensitiveProbabilitiesFromLogits,
} from "./sensitive-content";

describe("sensitive content scores", () => {
  it("sums hentai, porn, and sexy into one stable probability per image", () => {
    const [suggestive, neutral, even] = sensitiveProbabilitiesFromLogits([
      -1000, -1000, -1000, -1000, 1000, 0, 0, 1000, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(suggestive).toBe(1);
    expect(neutral).toBeCloseTo(0);
    expect(even).toBeCloseTo(0.6);
  });

  it("rejects malformed model output", () => {
    expect(() => sensitiveProbabilitiesFromLogits([1, 2])).toThrow(
      "Expected sensitive-content logits for every label",
    );
    expect(() =>
      sensitiveProbabilitiesFromLogits([Number.NaN, 0, 0, 0, 0]),
    ).toThrow("Sensitive-content logits must be finite");
  });

  it("uses the strongest finite visual result for a Save", () => {
    expect(aggregateSensitiveScores([0.2, 0.91, 0.7])).toBe(0.91);
    expect(aggregateSensitiveScores([])).toBeNull();
    expect(aggregateSensitiveScores([Number.NaN])).toBeNull();
  });
});
