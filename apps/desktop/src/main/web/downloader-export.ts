import { basename } from "node:path";
import type { z } from "zod";
import type { DownloadExportInputSchema } from "../../shared/downloader-contracts";

export type WebDownloadExport =
  | { ok: false; message: string }
  | { ok: true; text: string }
  | { ok: true; file: string };

/**
 * A visiting browser cannot use the host's Downloads folder or clipboard.
 * The export lands in the request's private directory; transcripts copied as
 * text return to the browser, which writes its own clipboard.
 */
export async function exportDownloadForBrowser(
  input: z.output<typeof DownloadExportInputSchema>,
  directory: string,
): Promise<WebDownloadExport> {
  const [{ createDownloadExports }, transcode, ytdlp, captions] =
    await Promise.all([
      import("../core/download-export"),
      import("../core/refresh/download-transcode"),
      import("../core/refresh/yt-dlp"),
      import("../core/refresh/yt-dlp-captions"),
    ]);
  let text: string | null = null;
  const exports = createDownloadExports({
    downloadVideo: ytdlp.downloadVideo,
    downloadCaptions: captions.downloadCaptions,
    transcodeItems: transcode.transcodeItems,
    defaultFolder: () => directory,
    clipboardFolder: () => directory,
    writeClipboardText: (value) => {
      text = value;
    },
    writeClipboardFiles: async () => {},
  });
  const copiesText =
    input.destination === "clipboard" && input.request.mode === "transcript";
  const result = await exports.run({
    ...input,
    destination: copiesText ? "clipboard" : "file",
  });
  if (!result.ok) return result;
  if (result.path === null)
    return text === null
      ? { ok: false, message: "Pond couldn't export this link. Try again." }
      : { ok: true, text };
  return { ok: true, file: basename(result.path) };
}
