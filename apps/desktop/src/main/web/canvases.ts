import { createHash } from "node:crypto";
import { z } from "zod";
import {
  CanvasContentSchema,
  CanvasIdSchema,
} from "../../shared/canvas-contracts";
import { readCanvas, updateCanvas } from "../core/canvases";
import { WebRequestError } from "./errors";

const Update = z
  .object({
    id: CanvasIdSchema,
    content: CanvasContentSchema,
    expectedContent: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

/** Compare content, so a concurrent rename never makes an autosave overwrite another board edit. */
export function updateWebCanvas(raw: z.infer<ReturnType<typeof z.json>>) {
  const input = Update.parse(raw);
  const current = readCanvas(input.id);
  if (!current) throw new WebRequestError("This Canvas no longer exists.", 404);
  const version = createHash("sha256")
    .update(JSON.stringify(CanvasContentSchema.parse(current)))
    .digest("hex");
  if (version !== input.expectedContent)
    throw new WebRequestError(
      "This Canvas changed in another window. Reload before saving your changes.",
    );
  return {
    ok: true as const,
    updatedAt: updateCanvas(input.id, input.content),
  };
}
