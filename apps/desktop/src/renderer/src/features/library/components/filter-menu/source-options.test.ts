import { expect, it } from "vitest";
import { sourceOptions } from "./source-options";

it("presents source identities as recognizable services without changing values", () => {
  const options = sourceOptions([
    "x.com",
    "instagram.com",
    "pinterest.com",
    "youtube.com",
    "cosmos.so",
    "are.na",
    "local",
    "tiktok.com",
  ]);

  expect(options.map((option) => option.label)).toEqual([
    "Twitter",
    "Instagram",
    "Pinterest",
    "YouTube",
    "Cosmos",
    "Are.na",
    "Local Files",
    "TikTok",
  ]);
  expect(options[0]?.predicate).toEqual({
    field: "source",
    operator: "eq",
    value: "x.com",
  });
});

it("keeps unknown domains unchanged", () => {
  const [option] = sourceOptions(["kottke.org"]);

  expect(option?.label).toBe("kottke.org");
});
