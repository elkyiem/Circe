import { expect, it } from "vitest";
import { byteRange } from "./byte-range";

it("handles bounded, open, suffix and clamped byte ranges", () => {
  expect(byteRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
  expect(byteRange("bytes=2-", 10)).toEqual({ start: 2, end: 9 });
  expect(byteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
  expect(byteRange("bytes=2-100", 10)).toEqual({ start: 2, end: 9 });
});
it("rejects unsatisfiable, invalid and multipart ranges", () => {
  for (const input of [
    "bytes=10-",
    "bytes=5-2",
    "bytes=-0",
    "bytes=-",
    "bytes=1-2,4-5",
    "bytes=NaN-",
    "bytes=999999999999999999-",
  ])
    expect(byteRange(input, 10)).toBeNull();
  expect(byteRange("bytes=0-", 0)).toBeNull();
});
