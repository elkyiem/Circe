import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { renderThumbnail, thumbnailToRender } from "./save-thumbnail-file";

const poster = { kind: "poster", path: "clip.mp4_poster.jpg" };
const generated = { kind: "thumbnail", path: "clip.mp4_thumbnail.webp" };

describe("thumbnailToRender", () => {
  it("keeps an existing thumbnail unless forced", () => {
    expect(thumbnailToRender([poster, generated], false)).toBeUndefined();
    expect(thumbnailToRender([poster, generated], true)).toEqual(poster);
  });

  it("never replaces a thumbnail you picked", () => {
    expect(
      thumbnailToRender([poster, { ...generated, custom: true }], true),
    ).toBeUndefined();
    expect(
      thumbnailToRender(
        [poster, { kind: "thumbnail_dark", path: "d.webp", custom: true }],
        true,
      ),
    ).toBeUndefined();
  });
});

describe("renderThumbnail", () => {
  it("encodes a resized thumbnail as WebP", async () => {
    const source = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: "#336699",
      },
    })
      .jpeg()
      .toBuffer();
    const thumbnail = await renderThumbnail(source);
    expect(thumbnail).not.toBeNull();
    if (!thumbnail) return;
    const meta = await sharp(thumbnail).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBeLessThanOrEqual(1024);
    expect(meta.height).toBeLessThanOrEqual(1024);
  });
});
