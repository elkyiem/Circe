import { z } from "zod";

export const WebVideoRequestSchema = z
  .object({
    name: z.enum([
      "video.sampleFrames",
      "video.preparePreview",
      "video.setThumbnail",
      "video.frame",
    ]),
    params: z
      .object({
        src: z.string().max(20000),
        saveId: z.string().max(200).optional(),
        timeSec: z.number().min(0).max(86400).optional(),
        maxFrames: z.number().int().min(3).max(32).optional(),
        strategy: z.enum(["spread", "embedding"]).optional(),
      })
      .strict(),
  })
  .strict();
