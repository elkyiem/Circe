import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { nativeImage } from "electron";
import { stringifyWebValue } from "../../shared/web-serialization";
import { WebVideoRequestSchema } from "../../shared/web-video-contracts";
import { withMutationScope } from "../core/executor";
import { videoQueries } from "../ipc/queries/video";
import { extractFrameAt } from "../lib/ffmpeg-frame";
import { isPathInside } from "../lib/path-identity";
import { libraryId, libraryRoot } from "../paths";
import { servePondMedia } from "../protocol";
import { WebRequestError } from "./errors";
import { indexedMediaPath } from "./media";

/** Compatible previews remain bound to the indexed original, never a public cache directory. */
export function createWebVideo() {
  const previews = new Map<
    string,
    { libraryId: string; saveId: string; source: string }
  >();
  return {
    async query(
      raw: ReturnType<typeof WebVideoRequestSchema.parse>,
      expected: string,
    ) {
      const { name, params } = WebVideoRequestSchema.parse(raw);
      const url = new URL(params.src, "http://iris.invalid");
      const parts = url.pathname.split("/");
      if (parts[1] !== "web" || parts[2] !== "media" || parts.length < 5)
        throw new WebRequestError(
          "Choose an indexed video in this Library.",
          422,
        );
      const saveId = decodeURIComponent(parts[3] ?? "");
      const filename = decodeURIComponent(parts.slice(4).join("/"));
      const source = await indexedMediaPath(saveId, filename);
      if (!source) throw new WebRequestError("The video is unavailable.", 404);
      const input = {
        ...params,
        src: `pond://${saveId}/${filename.split("/").map(encodeURIComponent).join("/")}`,
      };
      if (expected !== libraryId())
        throw new WebRequestError(
          "The active Library changed. Reload before continuing.",
        );
      if (name === "video.frame") {
        const frame = await extractFrameAt(source, params.timeSec ?? 0);
        if (!frame)
          throw new WebRequestError("Could not decode this video frame.", 422);
        try {
          const image = nativeImage.createFromBuffer(
            await readFile(frame.path),
          );
          if (image.isEmpty())
            throw new WebRequestError(
              "Could not decode this video frame.",
              422,
            );
          return new Response(
            stringifyWebValue({
              ok: true,
              bytes: Uint8Array.from(image.toPNG()),
              mimeType: "image/png",
            }),
          );
        } finally {
          await frame.cleanup();
        }
      }
      if (name === "video.setThumbnail") {
        if (params.saveId !== saveId)
          throw new WebRequestError("This frame belongs to another Save.", 422);
        const result = await withMutationScope(async () => {
          if (expected !== libraryId())
            throw new WebRequestError(
              "The active Library changed. Reload before continuing.",
            );
          return videoQueries[name](input);
        });
        return new Response(stringifyWebValue(result));
      }
      if (name === "video.sampleFrames")
        return new Response(stringifyWebValue(await videoQueries[name](input)));
      const preview = await videoQueries[name](input);
      if (!preview.ok) return Response.json(preview);
      if (expected !== libraryId())
        throw new WebRequestError(
          "The active Library changed. Reload before continuing.",
        );
      const cacheName = new URL(preview.url).pathname.slice(1);
      if (!/^[0-9a-f]{64}\.mp4$/.test(cacheName))
        throw new Error("Invalid preview filename.");
      previews.set(cacheName, {
        libraryId: expected,
        saveId,
        source: filename,
      });
      return Response.json({
        ok: true,
        url: `/web/preview/${saveId}/${cacheName}`,
      });
    },
    async media(request: Request, saveId: string, filename: string) {
      const preview = previews.get(filename);
      if (
        !preview ||
        preview.saveId !== saveId ||
        preview.libraryId !== libraryId() ||
        !(await indexedMediaPath(saveId, preview.source))
      )
        return new Response(null, { status: 404 });
      const root = await realpath(join(libraryRoot(), "_video_cache"));
      const path = await realpath(join(root, filename));
      if (!isPathInside(root, path)) return new Response(null, { status: 404 });
      const response = await servePondMedia(
        new Request(`pond://_video_cache/${filename}`, {
          method: request.method,
          headers: request.headers,
        }),
      );
      response.headers.delete("access-control-allow-origin");
      response.headers.set("cache-control", "private, no-store");
      response.headers.set(
        "content-security-policy",
        "default-src 'none'; sandbox",
      );
      return response;
    },
  };
}
