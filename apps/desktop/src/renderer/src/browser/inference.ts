import {
  type HostInference,
  HostInferenceSchema,
  WebInferenceSchema,
} from "@shared/enrichment-contracts";
import { WebUploadSchema } from "@shared/web-files-contracts";
import type { WebValue } from "@shared/web-serialization";
import pLimit from "p-limit";

export function createBrowserInference(transport: {
  headers(): Record<string, string>;
  request(path: string, body: string): Promise<WebValue>;
}) {
  const limit = pLimit(4);
  return async (raw: HostInference) => {
    const staged = new Set<string>();
    const pendingUploads: Promise<{ token: string }>[] = [];
    function upload(bytes: Uint8ClampedArray | Float32Array) {
      const pending = limit(async () => {
        const response = await fetch("/web/upload", {
          method: "PUT",
          headers: {
            ...transport.headers(),
            "content-type": "application/octet-stream",
            "x-iris-filename": "inference.bin",
          },
          body: new Blob([bytes.slice().buffer]),
        });
        if (!response.ok)
          throw new Error(
            "The inference input could not be uploaded. Retry this action.",
          );
        const token = WebUploadSchema.parse(await response.json()).token;
        staged.add(token);
        return { token };
      });
      pendingUploads.push(pending);
      return pending;
    }
    async function image(
      input: Extract<HostInference, { op: "clipImage" }>["image"],
    ) {
      return {
        ...(await upload(input.data)),
        width: input.width,
        height: input.height,
        channels: input.channels,
      };
    }
    try {
      const input = HostInferenceSchema.parse(raw);
      const wire =
        "image" in input
          ? { ...input, image: await image(input.image) }
          : "images" in input
            ? { ...input, images: await Promise.all(input.images.map(image)) }
            : "frames" in input
              ? {
                  ...input,
                  frames: await Promise.all(
                    input.frames.map(async (frame) => ({
                      ...frame,
                      image: await image(frame.image),
                    })),
                  ),
                }
              : "audio" in input
                ? { ...input, audio: await upload(input.audio) }
                : input;
      return await transport.request(
        "inference",
        JSON.stringify(WebInferenceSchema.parse(wire)),
      );
    } catch (error) {
      await Promise.allSettled(pendingUploads);
      await Promise.allSettled(
        [...staged].map((token) =>
          fetch(`/web/upload/${encodeURIComponent(token)}`, {
            method: "DELETE",
            headers: transport.headers(),
          }),
        ),
      );
      throw error;
    }
  };
}
