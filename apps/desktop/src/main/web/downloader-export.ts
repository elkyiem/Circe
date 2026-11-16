import { basename } from "node:path";
import type { z } from "zod";
import type {
  DownloadExportFilesInputSchema,
  DownloadExportInputSchema,
} from "../../shared/downloader-contracts";

export type WebDownloadExport =
  | { ok: false; message: string }
  | { ok: true; text: string }
  | { ok: true; file: string };

export type WebDownloadFilesExport =
  | { ok: false; message: string }
  | { ok: true; saved: true }
  | { ok: true; files: string[] };

async function browserExports(
  directory: string,
  copied: (text: string) => void,
) {
  const [{ createDownloadExports }, transcode, ytdlp, captions, files, manual] =
    await Promise.all([
      import("../core/download-export"),
      import("../core/refresh/download-transcode"),
      import("../core/refresh/yt-dlp"),
      import("../core/refresh/yt-dlp-captions"),
      import("../core/download-file"),
      import("../core/manual-import"),
    ]);
  return createDownloadExports({
    downloadVideo: ytdlp.downloadVideo,
    downloadCaptions: captions.downloadCaptions,
    transcodeItems: transcode.transcodeItems,
    defaultFolder: () => directory,
    clipboardFolder: () => directory,
    writeClipboardText: copied,
    writeClipboardFiles: async () => {},
    fetchFile: files.fetchFile,
    saveFiles: ({ url, title, files: fetched, sourceUrls }) =>
      manual.createManualSave({
        url,
        title,
        memoryFiles: fetched,
        fileSourceUrls: sourceUrls,
      }),
  });
}

/**
 * A visiting browser cannot use the host's Downloads folder or clipboard.
 * The export lands in the request's private directory; transcripts copied as
 * text return to the browser, which writes its own clipboard.
 */
export async function exportDownloadForBrowser(
  input: z.output<typeof DownloadExportInputSchema>,
  directory: string,
): Promise<WebDownloadExport> {
  let text: string | null = null;
  const exports = await browserExports(directory, (value) => {
    text = value;
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

/**
 * Page files saved to the Library stay on the host. File and clipboard
 * exports arrive as a browser download, since browsers cannot copy files.
 */
export async function exportDownloadFilesForBrowser(
  input: z.output<typeof DownloadExportFilesInputSchema>,
  directory: string,
): Promise<WebDownloadFilesExport> {
  const exports = await browserExports(directory, () => {});
  const result = await exports.files({
    ...input,
    destination: input.destination === "library" ? "library" : "file",
  });
  if (!result.ok) return result;
  if (input.destination === "library") return { ok: true, saved: true };
  return { ok: true, files: result.paths.map((path) => basename(path)) };
}
