import type { z } from "zod";
import { CanvasWriteSchema } from "../../shared/canvas-contracts";
import {
  CanvasConflictError,
  readCanvas,
  updateCanvas,
} from "../core/canvases";
import { WebRequestError } from "./errors";

/** Compare content, so a concurrent rename never makes an autosave overwrite another board edit. */
export function updateWebCanvas(raw: z.infer<ReturnType<typeof z.json>>) {
  const input = CanvasWriteSchema.parse(raw);
  const current = readCanvas(input.id);
  if (!current) throw new WebRequestError("This Canvas no longer exists.", 404);
  try {
    return {
      ok: true as const,
      ...updateCanvas(input.id, input.content, input.expectedContent),
    };
  } catch (error) {
    if (error instanceof CanvasConflictError)
      throw new WebRequestError(error.message);
    throw error;
  }
}
