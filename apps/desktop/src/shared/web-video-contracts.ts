import { z } from "zod";

const VideoRequestSchema = z.strictObject({
  name: z.enum([
    "video.sampleFrames",
    "video.preparePreview",
    "video.setThumbnail",
    "video.frame",
  ]),
  params: z.strictObject({
    src: z.string().max(20000),
    saveId: z.string().max(200).optional(),
    timeSec: z.number().min(0).max(86400).optional(),
    maxFrames: z.number().int().min(3).max(32).optional(),
    strategy: z.enum(["spread", "embedding"]).optional(),
  }),
});

export const WebVideoRequestSchema = z.union([
  VideoRequestSchema,
  z.strictObject({
    name: z.literal("saves.setGifThumbnail"),
    params: z.strictObject({
      id: z.string().min(1).max(200),
      src: z.string().max(20000),
      frameIndex: z.number().int().nonnegative(),
    }),
  }),
]);
