import { z } from "zod";

export const ENRICHMENT_IPC = {
  query: "enrichment-owner:query",
  ready: "enrichment-owner:ready",
  command: "enrichment-owner:command",
  reply: "enrichment-owner:reply",
  status: "enrichment-owner:status",
  title: "enrichment-owner:title",
} as const;
export const EnrichmentTaskSchema = z
  .object({
    kind: z.enum([
      "scan",
      "caption",
      "ocr",
      "transcribe",
      "reembed",
      "clip",
      "sensitiveContent",
    ]),
    ids: z.array(z.string().min(1).max(200)).max(10000).optional(),
  })
  .strict();
export type EnrichmentTask = z.infer<typeof EnrichmentTaskSchema>;
export const EnrichmentStatusSchema = z
  .object({
    state: z.enum(["starting", "ready", "paused", "failed"]),
    inflight: z.number().int().nonnegative(),
    activeKeys: z.array(z.string().max(500)).max(100000),
    failedKeys: z.array(z.string().max(500)).max(100000),
    error: z.string().max(1000).optional(),
  })
  .strict();
export type EnrichmentStatus = z.infer<typeof EnrichmentStatusSchema>;
const ImageDimensions = z.object({
  width: z.number().int().min(1).max(16384),
  height: z.number().int().min(1).max(16384),
  channels: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});
const Image = ImageDimensions.extend({ data: z.instanceof(Uint8ClampedArray) })
  .strict()
  .refine(
    (v) =>
      v.data.byteLength <= 256 * 1024 * 1024 &&
      v.data.length === v.width * v.height * v.channels,
    "Image dimensions must match its bounded bytes.",
  );
const Audio = z
  .instanceof(Float32Array)
  .refine(
    (v) =>
      v.length > 0 && v.length <= 16000 * 60 * 30 && v.every(Number.isFinite),
    "Choose finite mono audio of at most30minutes.",
  );
const Ticket = z.string().regex(/^iris-upload:[0-9a-f-]{36}$/);
const UploadedImage = ImageDimensions.extend({ token: Ticket }).strict();
const UploadedAudio = z.object({ token: Ticket }).strict();
function inferenceSchema<
  ImageSchema extends z.ZodType,
  AudioSchema extends z.ZodType,
>(image: ImageSchema, audio: AudioSchema) {
  return z.discriminatedUnion("op", [
    z
      .object({
        op: z.literal("florence"),
        image,
        task: z.enum(["<CAPTION>", "<DETAILED_CAPTION>", "<OCR>"]),
      })
      .strict(),
    z.object({ op: z.literal("clipImage"), image }).strict(),
    z
      .object({
        op: z.literal("clipAesthetic"),
        image,
        labels: z.array(z.string().max(1000)).max(1000),
      })
      .strict(),
    z
      .object({
        op: z.literal("sensitiveContent"),
        images: z.array(image).min(1).max(32),
      })
      .strict(),
    z
      .object({ op: z.literal("embedText"), text: z.string().max(100000) })
      .strict(),
    z
      .object({
        op: z.literal("embedTexts"),
        texts: z.array(z.string().max(100000)).max(64),
      })
      .strict(),
    z.object({ op: z.literal("embedAudio"), audio }).strict(),
    z.object({ op: z.literal("transcribe"), audio }).strict(),
    z
      .object({
        op: z.literal("embedVideoFrames"),
        frames: z
          .array(
            z.object({ image, timestamp: z.number().min(0).max(32) }).strict(),
          )
          .min(1)
          .max(32),
        duration: z.number().positive().max(32),
      })
      .strict(),
  ]);
}
export const WebInferenceSchema = inferenceSchema(UploadedImage, UploadedAudio);
export type WebInference = z.infer<typeof WebInferenceSchema>;
export const HostInferenceSchema = inferenceSchema(Image, Audio).superRefine(
  (input, context) => {
    let bytes = 0;
    if ("image" in input) bytes += input.image.data.byteLength;
    if ("images" in input)
      bytes += input.images.reduce(
        (sum, image) => sum + image.data.byteLength,
        0,
      );
    if ("frames" in input)
      bytes += input.frames.reduce(
        (sum, frame) => sum + frame.image.data.byteLength,
        0,
      );
    if ("audio" in input) {
      bytes += input.audio.byteLength;
      if (input.op === "embedAudio" && input.audio.length > 480000)
        context.addIssue({
          code: "custom",
          message: "Embedding audio must be at most30seconds.",
        });
    }
    if (bytes > 256 * 1024 * 1024)
      context.addIssue({
        code: "custom",
        message: "This inference request exceeds256MB.",
      });
  },
);
export type HostInference = z.infer<typeof HostInferenceSchema>;
export const HostInferenceResultSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.array(z.number().finite()),
  z.array(z.array(z.number().finite())),
]);
export type HostInferenceResult = z.infer<typeof HostInferenceResultSchema>;
export interface EnrichmentQueryInputs {
  "enrichment.status": Record<string, never>;
  "enrichment.run": EnrichmentTask;
  "enrichment.infer": HostInference;
}
export interface EnrichmentQueryResults {
  "enrichment.status": EnrichmentStatus;
  "enrichment.run": { ok: boolean; message: string };
  "enrichment.infer": HostInferenceResult;
}

const EnrichmentTaskResultSchema = z
  .object({ ok: z.boolean(), message: z.string() })
  .strict();
export const EnrichmentCommandValueSchema = z.union([
  EnrichmentTaskResultSchema,
  HostInferenceResultSchema,
]);
export type EnrichmentCommandValue = z.infer<
  typeof EnrichmentCommandValueSchema
>;
export const EnrichmentOwnerCommandSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: z.number().int(),
      kind: z.literal("task"),
      input: EnrichmentTaskSchema,
    })
    .strict(),
  z
    .object({
      id: z.number().int(),
      kind: z.literal("infer"),
      input: HostInferenceSchema,
    })
    .strict(),
]);
export type EnrichmentOwnerCommand = z.infer<
  typeof EnrichmentOwnerCommandSchema
>;
export const EnrichmentOwnerReplySchema = z.union([
  z
    .object({ id: z.number().int(), value: EnrichmentCommandValueSchema })
    .strict(),
  z
    .object({ id: z.number().int(), error: z.string().min(1).max(1000) })
    .strict(),
]);
export type EnrichmentOwnerReply = z.infer<typeof EnrichmentOwnerReplySchema>;
