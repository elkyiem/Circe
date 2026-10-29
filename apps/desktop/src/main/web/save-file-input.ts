import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { QueryResult } from "../../shared/query-contracts";
import {
  type WebSaveFileInputNameSchema,
  WebUploadTokenSchema,
} from "../../shared/web-files-contracts";
import { persistSave } from "../core/persist-save";
import { replaceSaveFile } from "../core/replace-file";
import { persistSaveThumbnail, renderThumbnail } from "../core/save-thumbnail";
import { srtToVtt } from "../core/subtitles";
import { consumeWebUpload } from "./upload-input";
import type { createWebUploads } from "./uploads";

/** Visiting-device uploads replace dialog/clipboard acquisition; native persistence stays shared. */
export async function applyWebSaveFileInput(
  name: z.infer<typeof WebSaveFileInputNameSchema>,
  params: Record<string, z.infer<ReturnType<typeof z.json>>>,
  uploads: ReturnType<typeof createWebUploads>,
  expected: string,
): Promise<QueryResult<z.infer<typeof WebSaveFileInputNameSchema>>> {
  const { id, paths } = z
    .strictObject({
      id: z.string().min(1).max(200),
      paths: z.array(WebUploadTokenSchema).length(1),
    })
    .parse(params);
  const token = paths[0] ?? "";
  return consumeWebUpload({
    uploads,
    token,
    library: expected,
    apply: async (file) => {
      if (name === "saves.replaceFile")
        return await replaceSaveFile({ id, sourcePath: file.path });
      if (name === "saves.loadSubtitles") {
        const vtt = srtToVtt(await readFile(file.path, "utf8"));
        const updated = await persistSave(
          id,
          {},
          {
            actorReason: "user:load-subtitles",
            replaceFilesWithKind: "subtitle",
            newFiles: [
              {
                kind: "subtitle",
                filename: "subtitles.vtt",
                mimeType: "text/vtt",
                bytes: Buffer.from(vtt, "utf8"),
              },
            ],
          },
        );
        return updated ? { ok: true } : { ok: false, error: "not_found" };
      }
      const bytes = await renderThumbnail(await readFile(file.path));
      if (!bytes) return { ok: false, error: "not_an_image" };
      const updated = await persistSaveThumbnail(
        id,
        bytes,
        name === "saves.setThumbnailFromClipboard"
          ? "user:set-thumbnail-from-clipboard"
          : "user:set-thumbnail",
      );
      return updated ? { ok: true } : { ok: false, error: "not_found" };
    },
  });
}
