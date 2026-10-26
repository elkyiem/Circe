import { storedAsRawJson } from "@pond/schema/raw-schema";
import { expect, it } from "vitest";
import { TerminalError } from "../extractors/errors";
import { collectMediaUrls, requireFetchedMedia } from "./fetch-blobs";

it("fails the task when every captured media URL is permanently unavailable", () => {
  const mediaUrl =
    "https://i.pinimg.com/originals/96/1a/da/961adaf7db83e6d449a67674731c29d5.jpg";

  expect(() =>
    requireFetchedMedia([{ url: mediaUrl, file: null, miss: "permanent" }], 1),
  ).toThrow(TerminalError);
});

it("keeps oversized media distinct from unavailable media", () => {
  expect(() =>
    requireFetchedMedia(
      [
        {
          url: "https://example.com/video.mp4",
          file: null,
          miss: "size_limit",
        },
      ],
      1,
    ),
  ).toThrow("1/1 media exceed the download size limit");
});

const tweetWithVideo = storedAsRawJson({
  capture: {
    media: [
      { type: "image", url: "https://pbs.twimg.com/media/a.jpg" },
      {
        type: "video",
        url: "https://video.twimg.com/ext_tw_video/1/vid/720x1280/b.mp4",
      },
    ],
  },
});

it("leaves direct videos out when auto-download is off", () => {
  expect(collectMediaUrls(tweetWithVideo, { includeVideo: false })).toEqual([
    "https://pbs.twimg.com/media/a.jpg",
  ]);
});

it("collects nothing from a video-only capture when auto-download is off", () => {
  const videoOnly = storedAsRawJson({
    capture: {
      media: [
        {
          type: "video",
          url: "https://video.twimg.com/ext_tw_video/1/vid/720x1280/b.mp4",
        },
      ],
    },
  });

  expect(collectMediaUrls(videoOnly, { includeVideo: false })).toEqual([]);
});

it("includes direct videos when auto-download is on", () => {
  expect(collectMediaUrls(tweetWithVideo, { includeVideo: true })).toHaveLength(
    2,
  );
});
