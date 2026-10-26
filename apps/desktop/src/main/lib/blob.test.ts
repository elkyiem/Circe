import { describe, expect, it } from "vitest";
import { fetchMediaBatch } from "./blob";

describe("fetchMediaBatch", () => {
  it("reports the download size ceiling instead of a missing original", async () => {
    const url = "https://example.com/video.mp4";
    const fetcher: typeof fetch = async () =>
      new Response(null, {
        headers: {
          "content-type": "video/mp4",
          "content-length": String(51 * 1024 * 1024),
        },
      });
    expect(await fetchMediaBatch([url], { fetcher })).toEqual([
      { url, file: null, miss: "size_limit" },
    ]);
  });
});
