import { expect, it } from "vitest";
import { parseWebValue, stringifyWebValue } from "./web-serialization";

it("preserves binary frame replies and leaves ordinary numeric arrays intact", () => {
  const input = { frame: new Uint8Array([0, 7, 255]), values: [0, 7, 255] };
  const output = parseWebValue(stringifyWebValue(input));
  expect(output).toEqual(input);
});

it("preserves Dates, nullable values, numeric wire timestamps and nested captures", () => {
  const value = {
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    savedAt: 1234,
    nullable: null,
    rawJson: { capture: { id: "parent", quoted: { id: "quote", media: [] } } },
  };
  expect(parseWebValue(stringifyWebValue(value))).toEqual(value);
});
