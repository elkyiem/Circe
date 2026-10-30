import { describe, expect, it } from "vitest";
import { mergeWrittenFiles } from "./library";
import {
  applyPatchToInfo,
  type InfoFile,
  infoFilesFromSave,
  StoredInfoDocSchema,
} from "./library-format";

const original: InfoFile = {
  kind: "video",
  path: "clip.mp4",
  sha256: "original",
  size: 100,
  mimeType: "video/mp4",
  width: 1920,
  height: 1080,
  sourceUrl: "https://example.com/original.mp4",
};
describe("portable original manifest", () => {
  it.each([24, null, undefined])(
    "retains video frame rate %s in portable metadata and later edits",
    (frameRate) => {
      const files = infoFilesFromSave([{ ...original, frameRate }]);
      const stored = StoredInfoDocSchema.parse({
        id: "save",
        files: JSON.parse(JSON.stringify(files)),
      });
      expect(stored.files[0]?.frameRate).toBe(frameRate);
      const edited = StoredInfoDocSchema.parse(
        applyPatchToInfo(stored, { notes: "Edited" }),
      );
      expect(edited.files[0]?.frameRate).toBe(frameRate);
    },
  );
  it("retains all originals when a new thumbnail is written", () => {
    const manifest = mergeWrittenFiles(
      [original],
      [{ filename: "cover.png", buf: Buffer.from("thumbnail") }],
    );
    expect(manifest[0]).toEqual(original);
    expect(manifest[1]).toMatchObject({
      kind: "image",
      path: "cover.png",
      size: 9,
    });
  });
  it("updates written bytes while retaining the supplied file role and metadata", () => {
    const manifest = mergeWrittenFiles(
      [original],
      [{ filename: "clip.mp4", buf: Buffer.from("replacement") }],
    );
    expect(manifest).toHaveLength(1);
    expect(manifest[0]).toMatchObject({
      ...original,
      size: 11,
      sha256: expect.not.stringMatching(/^original$/),
    });
  });
  it("persists explicit file changes and source URLs for index reconstruction", () => {
    const info = StoredInfoDocSchema.parse({
      id: "save",
      source: "local",
      sourceId: "save",
      url: "pond:save",
      files: [original],
    });
    const next = applyPatchToInfo(info, {
      files: [
        original,
        {
          kind: "media",
          path: "image.png",
          sha256: "image",
          size: 10,
          width: 30,
          height: 20,
          mimeType: "image/png",
        },
      ],
    });
    expect(StoredInfoDocSchema.parse(next).files).toEqual(next.files);
    expect(next.files[0]?.sourceUrl).toBe(original.sourceUrl);
    expect(applyPatchToInfo(next, { files: [] }).files).toEqual([]);
  });
});
