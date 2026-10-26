import { expect, it } from "vitest";
import {
  formatListDimension,
  formatListRating,
  LIST_COLUMN_DEFAULTS,
} from "./list-columns";

it("defaults the everyday columns on and the rest off", () => {
  expect(LIST_COLUMN_DEFAULTS).toEqual({
    name: true,
    type: true,
    source: true,
    creator: false,
    tags: false,
    dimensions: false,
    duration: false,
    rating: false,
    extension: false,
    fileSize: true,
    dateAdded: true,
    datePublished: false,
    annotation: false,
  });
});

it("formats list cells", () => {
  expect(formatListDimension(1920, 1080)).toBe("1920 × 1080");
  expect(formatListDimension(null, null)).toBe("—");
  expect(formatListRating(5)).toBe("5");
  expect(formatListRating(null)).toBe("—");
});
