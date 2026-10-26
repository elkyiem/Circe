import { encode } from "gpt-tokenizer";
import { expect, it } from "vitest";
import { APPLE_SYSTEM, APPLE_TOOL_NAMES, compactTools } from "./apple-profile";

it("keeps only the allowlisted tools, in order", () => {
  const specs = ["proposeChanges", "searchLibrary", "readSave"].map((name) => ({
    name,
  }));
  expect(compactTools(specs).map((spec) => spec.name)).toEqual([
    "searchLibrary",
    "readSave",
  ]);
  expect(APPLE_TOOL_NAMES).toContain("citeSaves");
});

it("keeps the system prompt small", () => {
  expect(encode(APPLE_SYSTEM).length).toBeLessThan(220);
});
