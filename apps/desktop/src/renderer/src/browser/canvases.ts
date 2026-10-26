import { CanvasContentSchema, CanvasSchema } from "@shared/canvas-contracts";
import type { WebValue } from "@shared/web-serialization";
import { z } from "zod";

export function createBrowserCanvases(
  request: (path: string, body: string) => Promise<WebValue>,
) {
  const versions = new Map<string, string>();
  const pending = new Map<string, Promise<WebValue>>();
  async function version(content: z.infer<typeof CanvasContentSchema>) {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(content)),
    );
    return Array.from(new Uint8Array(bytes), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }
  return {
    handles: (name: string) =>
      [
        "canvases.get",
        "canvases.create",
        "canvases.addSaves",
        "canvases.update",
      ].includes(name),
    async query(
      name: string,
      params: Record<string, z.infer<ReturnType<typeof z.json>>>,
    ) {
      if (name !== "canvases.update") {
        const result = await request("query", JSON.stringify({ name, params }));
        if (result !== null) {
          const canvas = CanvasSchema.parse(result);
          versions.set(
            canvas.id,
            await version(CanvasContentSchema.parse(canvas)),
          );
        }
        return result;
      }
      const { id, content } = z
        .object({ id: z.string(), content: CanvasContentSchema })
        .parse(params);
      const previous = pending.get(id) ?? Promise.resolve(null);
      const next = previous.then(async () => {
        const expectedContent = versions.get(id);
        if (!expectedContent)
          throw new Error("Reload this Canvas before editing.");
        const result = await request(
          "query",
          JSON.stringify({ name, params: { id, content, expectedContent } }),
        );
        versions.set(id, await version(content));
        return result;
      });
      pending.set(id, next);
      try {
        return await next;
      } finally {
        if (pending.get(id) === next) pending.delete(id);
      }
    },
  };
}
