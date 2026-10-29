import { z } from "zod";
import {
  CanvasContentSchema,
  CanvasContentVersionSchema,
  CanvasIdSchema,
  CanvasSnapshotSchema,
  CanvasWriteResultSchema,
} from "./canvas-contracts";

export const CanvasClientParamsSchema = z.object({
  id: CanvasIdSchema.optional(),
  name: z.string().optional(),
  saveIds: z.array(z.string()).optional(),
  content: CanvasContentSchema.optional(),
  expectedContent: CanvasContentVersionSchema.optional(),
});
export type CanvasClientParams = z.infer<typeof CanvasClientParamsSchema>;
const WriteInput = z.object({
  id: CanvasIdSchema,
  content: CanvasContentSchema,
  expectedContent: CanvasContentVersionSchema.optional(),
});

/** Both UI transports save against the last host acknowledgement, never an optimistic draft. */
export function createCanvasClient<Result>(
  request: (name: string, params: CanvasClientParams) => Promise<Result>,
) {
  const versions = new Map<string, string>();
  const pending = new Map<string, Promise<Result>>();
  const handles = (name: string) =>
    [
      "canvases.get",
      "canvases.create",
      "canvases.addSaves",
      "canvases.update",
    ].includes(name);

  async function perform(name: string, params: CanvasClientParams) {
    const id =
      name === "canvases.create" ? null : CanvasIdSchema.parse(params.id);
    try {
      if (name === "canvases.update") {
        const input = WriteInput.parse(params);
        const expectedContent = input.expectedContent ?? versions.get(input.id);
        if (!expectedContent)
          throw new Error("Reload this Canvas before editing.");
        const result = await request(name, { ...input, expectedContent });
        versions.set(
          input.id,
          CanvasWriteResultSchema.parse(result).contentVersion,
        );
        return result;
      }
      const result = await request(name, params);
      if (result === null) {
        if (id) versions.delete(id);
      } else {
        const canvas = CanvasSnapshotSchema.parse(result);
        versions.set(canvas.id, canvas.contentVersion);
      }
      return result;
    } catch (error) {
      // A failed transport can have committed on the host. Require a fresh read either way.
      if (id) versions.delete(id);
      throw error;
    }
  }

  return {
    handles,
    async query(name: string, raw: CanvasClientParams): Promise<Result> {
      if (!handles(name)) throw new Error("Unknown Canvas operation.");
      const params = CanvasClientParamsSchema.parse(raw);
      if (name === "canvases.create") return perform(name, params);
      const id = CanvasIdSchema.parse(params.id);
      const previous = pending.get(id) ?? Promise.resolve();
      const next = previous.catch(() => {}).then(() => perform(name, params));
      pending.set(id, next);
      try {
        return await next;
      } finally {
        if (pending.get(id) === next) pending.delete(id);
      }
    },
  };
}
