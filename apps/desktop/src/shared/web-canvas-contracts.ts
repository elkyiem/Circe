import { PrefsPatchSchema } from "@pond/schema";
import { z } from "zod";
import { CanvasSchema } from "./canvas-contracts";

export const WebCanvasRenderSchema = PrefsPatchSchema.pick({
  preferences: true,
  viewer: true,
})
  .required()
  .extend({
    canvas: CanvasSchema.refine(
      (canvas) => canvas.items.length > 0,
      "This Canvas has nothing to export.",
    ),
    format: z.enum(["png", "pdf"]),
  })
  .strict();
export type WebCanvasRenderInput = z.infer<typeof WebCanvasRenderSchema>;
export const CanvasRenderImageSchema = z
  .object({
    png: z
      .instanceof(Uint8Array)
      .refine(
        (bytes) =>
          bytes.byteLength >= 8 &&
          bytes.byteLength <= 100 * 1024 * 1024 &&
          [137, 80, 78, 71, 13, 10, 26, 10].every(
            (byte, index) => bytes[index] === byte,
          ),
      ),
    width: z.number().positive().max(6000),
    height: z.number().positive().max(6000),
  })
  .strict();
export const CANVAS_RENDER_IPC = {
  ready: "iris:canvas-render-ready",
  query: "iris:canvas-render-query",
  libraryId: "iris:canvas-render-library-id",
  finish: "iris:canvas-render-finish",
} as const;
