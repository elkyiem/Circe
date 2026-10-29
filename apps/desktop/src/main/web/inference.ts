import { readFile } from "node:fs/promises";
import pLimit from "p-limit";
import {
  HostInferenceSchema,
  type WebInference,
} from "../../shared/enrichment-contracts";
import { enrichmentOwner } from "../core/enrichment-owner";
import { WebRequestError } from "./errors";
import type { createWebUploads } from "./uploads";

/** Raw tensors use Library-scoped binary uploads, not expanding JSON arrays or caller-supplied paths. */
export function createWebInference(
  uploads: ReturnType<typeof createWebUploads>,
) {
  const limit = pLimit(1);
  let queued = 0;
  return async (input: WebInference, library: string) => {
    if (queued >= 16)
      throw new WebRequestError(
        "Wait for the current inference requests to finish.",
      );
    const consumed = new Set<string>();
    queued++;
    try {
      return await limit(async () => {
        let bytes = 0;
        async function read(token: string) {
          const file = await uploads.get(token, library);
          consumed.add(token);
          bytes += file.size;
          if (bytes > 256 * 1024 * 1024)
            throw new WebRequestError(
              "This inference input exceeds256MB.",
              422,
            );
          return readFile(file.path);
        }
        async function image(
          image: Extract<WebInference, { op: "clipImage" }>["image"],
        ) {
          const { token, ...dimensions } = image;
          const data = await read(token);
          return {
            ...dimensions,
            data: new Uint8ClampedArray(
              data.buffer,
              data.byteOffset,
              data.byteLength,
            ),
          };
        }
        const resolved =
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
                  ? {
                      ...input,
                      audio: await (async () => {
                        const data = await read(input.audio.token);
                        if (data.byteLength % 4)
                          throw new WebRequestError(
                            "The audio input is incomplete.",
                            422,
                          );
                        return new Float32Array(Uint8Array.from(data).buffer);
                      })(),
                    }
                  : input;
        return enrichmentOwner.infer(HostInferenceSchema.parse(resolved));
      });
    } finally {
      queued--;
      await Promise.all(
        [...consumed].map((token) =>
          uploads.remove(token, library).catch(() => {}),
        ),
      );
    }
  };
}
