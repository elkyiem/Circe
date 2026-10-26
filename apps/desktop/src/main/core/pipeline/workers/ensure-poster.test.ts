import type { SaveFile } from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { ensureRemotePoster, type RemotePosterSave } from "./ensure-poster";

const POSTER_URL = "https://cdn.test/poster.jpg";

const videoCapture = storedAsRawJson({
  capture: {
    media: [
      { type: "video", url: "https://cdn.test/v.mp4", posterUrl: POSTER_URL },
    ],
  },
});

const existingPoster: SaveFile = {
  kind: "poster",
  path: "poster-1.jpg",
  sha256: "",
  size: 1,
  mimeType: "image/jpeg",
};

async function setup() {
  const bytes = await sharp({
    create: { width: 4, height: 3, channels: 3, background: "#000" },
  })
    .jpeg()
    .toBuffer();
  const fetchAvatarToTxFile = vi.fn(async () => ({
    file: { filename: "poster.jpg", bytes, mimeType: "image/jpeg" },
  }));
  const persistSave = vi.fn(async () => null);
  const ensureSaveThumbnail = vi.fn(async () => {});
  return {
    runtime: { fetchAvatarToTxFile, persistSave, ensureSaveThumbnail },
    fetchAvatarToTxFile,
    persistSave,
    ensureSaveThumbnail,
  };
}

function save(overrides: Partial<RemotePosterSave> = {}): RemotePosterSave {
  return { files: [], rawJson: videoCapture, mediaUrl: null, ...overrides };
}

describe("ensureRemotePoster", () => {
  it("writes the captured poster when the save has no video file", async () => {
    const { runtime, fetchAvatarToTxFile, persistSave, ensureSaveThumbnail } =
      await setup();

    await ensureRemotePoster("s1", save(), false, runtime);

    expect(fetchAvatarToTxFile).toHaveBeenCalledWith(POSTER_URL);
    expect(persistSave).toHaveBeenCalledWith(
      "s1",
      {},
      expect.objectContaining({
        replaceFilesWithKind: "poster",
        newFiles: [
          expect.objectContaining({
            kind: "poster",
            filename: "poster-1.jpg",
            mimeType: "image/jpeg",
            width: 4,
            height: 3,
          }),
        ],
      }),
    );
    expect(ensureSaveThumbnail).toHaveBeenCalledWith("s1", null, {
      force: true,
    });
  });

  it("does nothing when no poster URL is known", async () => {
    const { runtime, fetchAvatarToTxFile, persistSave } = await setup();

    await ensureRemotePoster(
      "s1",
      save({
        rawJson: storedAsRawJson({
          capture: {
            media: [{ type: "video", url: "https://cdn.test/v.mp4" }],
          },
        }),
      }),
      false,
      runtime,
    );

    expect(fetchAvatarToTxFile).not.toHaveBeenCalled();
    expect(persistSave).not.toHaveBeenCalled();
  });

  it("keeps an existing poster unless forced", async () => {
    const { runtime, fetchAvatarToTxFile, persistSave } = await setup();

    await ensureRemotePoster(
      "s1",
      save({ files: [existingPoster] }),
      false,
      runtime,
    );
    expect(fetchAvatarToTxFile).not.toHaveBeenCalled();

    await ensureRemotePoster(
      "s1",
      save({ files: [existingPoster] }),
      true,
      runtime,
    );
    expect(persistSave).toHaveBeenCalledOnce();
  });
});
