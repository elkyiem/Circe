import { describe, expect, it } from "vitest";
import { xParser } from "./x";

const LIKE_JS = `window.YTD.like.part0 = [
  { "like": { "tweetId": "1790000000000000001", "fullText": "hi", "expandedUrl": "https://twitter.com/i/web/status/1790000000000000001" } },
  { "like": { "tweetId": "1790000000000000002" } },
  { "like": { "fullText": "no id" } }
]`;

describe("xParser", () => {
  it("matches like.js and its parts only", () => {
    expect(xParser.matches("twitter-2026/data/like.js")).toBe(true);
    expect(xParser.matches("data/like-part2.js")).toBe(true);
    expect(xParser.matches("data/tweets.js")).toBe(false);
  });

  it("reads tweet ids as liked x.com status links", () => {
    expect(xParser.parse("data/like.js", LIKE_JS)).toEqual([
      {
        url: "https://x.com/i/web/status/1790000000000000001",
        listKind: "liked",
        savedAt: null,
      },
      {
        url: "https://x.com/i/web/status/1790000000000000002",
        listKind: "liked",
        savedAt: null,
      },
    ]);
  });

  it("returns nothing for text that isn't a YTD file", () => {
    expect(xParser.parse("data/like.js", "garbage")).toEqual([]);
  });
});
