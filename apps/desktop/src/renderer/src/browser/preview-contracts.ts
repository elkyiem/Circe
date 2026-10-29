import {
  PreviewNeighborRequestSchema,
  PreviewWindowConfigureSchema,
  PreviewWindowStateSchema,
} from "@shared/preview-window-contracts";
import { z } from "zod";

export const BrowserPreviewMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready") }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("state"), state: PreviewWindowStateSchema }),
  z.object({
    type: z.literal("configure"),
    patch: PreviewWindowConfigureSchema,
  }),
  z.object({
    type: z.literal("neighbor"),
    request: PreviewNeighborRequestSchema,
  }),
  z.object({ type: z.literal("export") }),
  z.object({ type: z.literal("error"), message: z.string().max(1000) }),
]);

export const BrowserPreviewAddress = z.object({
  channel: z.uuid(),
  windowId: z.coerce.number().int().positive(),
});
