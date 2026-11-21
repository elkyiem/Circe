import { extractLinks } from "@shared/downloader-contracts";
import type { QueryName } from "@shared/query-contracts";
import { isThumbnailKind } from "@shared/save-file-names";
import type { EagleImportProgress } from "@shared/saves-import-contracts";
import {
  WebFileQuerySchema,
  WebUploadSchema,
  WebUploadTokenSchema,
} from "@shared/web-files-contracts";
import type { WebValue } from "@shared/web-serialization";
import pLimit from "p-limit";
import { z } from "zod";
import { createBrowserEagleImport } from "./eagle-import";

type Json = z.infer<ReturnType<typeof z.json>>;
/** Clipboard imports file into the folder on screen, matching the native handler. */
type ClipboardFilesInput = {
  paths: string[];
  origin: "clipboard";
  folderIds?: string[];
};
type ClipboardLinkInput = { url: string; folderId?: string };
interface FileTransport {
  request(path: string, body?: string): Promise<WebValue>;
  headers(): Record<string, string>;
  eagleProgress?(value: EagleImportProgress): void;
}
/** Download dialog exports arrive in this device's browser downloads. */
const DEVICE_EXPORT_FOLDER = { path: "", name: "this device's Downloads" };
const DEVICE_QUERIES = new Set<string>([
  "downloader.clipboardLinks",
  "downloader.export",
  "downloader.exportFiles",
  "downloader.exportFolder",
  "downloader.pickExportFolder",
  "downloader.reveal",
  "saves.setImageThumbnail",
  "library.identity.pickIcon",
  "library.exportDebugReport",
  "saves.setCustomThumbnail",
  "saves.setThumbnailFromClipboard",
  "saves.setGifThumbnail",
  "saves.replaceFile",
  "saves.loadSubtitles",
  "saves.exportWebp",
  "saves.exportDotLottie",
  "saves.pickImportPaths",
  "saves.importFiles",
  "saves.reviewImportDuplicates",
  "saves.createManual",
  "saves.importPackage",
  "saves.importEaglePackage",
  "saves.pickEagleLibrary",
  "saves.importEagleLibrary",
  "saves.importBookmarks",
  "saves.importMymind",
  "saves.importDataExport",
  "saves.exportPackage",
  "saves.exportEaglePackage",
  "saves.exportFiles",
  "saves.exportCsv",
  "saves.exportFile",
  "clipboard.writeText",
  "saves.copyImage",
  "saves.copyThumbnail",
  "saves.copyBase64",
  "saves.copyFile",
  "saves.copyFiles",
  "saves.combineImages",
  "saves.copyInternalLinks",
  "saves.share",
  "saves.importClipboard",
  "saves.filePath",
  "video.copyFilePath",
  "saves.listOpenWith",
  "video.sampleFrames",
  "video.preparePreview",
  "video.setThumbnail",
  "video.copyFrame",
  "video.saveFrame",
  "agent.pickAttachments",
  "agent.exportChat",
  "conversion.start",
  "conversion.status",
  "transferJobs.retry",
  "transferJobs.download",
  "transferJobs.list",
]);
const StringList = z.array(z.string());
const Id = z.string().min(1);
const FileSelection = z.object({
  id: Id,
  fileIndex: z.number().int().nonnegative().optional(),
});
const SaveMedia = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      mimeType: z.string().nullable().optional(),
      kind: z.string().nullable().optional(),
    }),
  ),
});

export function downloadInBrowser(url: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function pickDeviceFiles(
  directory = false,
  multiple = true,
  accept?: string,
): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    if (accept) input.accept = accept;
    input.setAttribute(
      "aria-label",
      directory
        ? "Upload folder from this device"
        : "Upload files from this device",
    );
    if (directory) input.setAttribute("webkitdirectory", "");
    input.style.position = "fixed";
    input.style.inset = "-10000px";
    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener(
      "change",
      () => finish(Array.from(input.files ?? [])),
      { once: true },
    );
    input.addEventListener("cancel", () => finish([]), { once: true });
    document.body.append(input);
    input.click();
  });
}

export function createBrowserFiles(transport: FileTransport) {
  const uploadLimit = pLimit(4);
  const files = new Map<
    string,
    { file?: File; relativePath: string; upload?: Promise<string> }
  >();
  const downloaded = new Set<string>();
  function pathForFile(file: File) {
    const token = `iris-device:${crypto.randomUUID()}`;
    files.set(token, { file, relativePath: file.webkitRelativePath });
    return token;
  }
  async function upload(token: string) {
    if (WebUploadTokenSchema.safeParse(token).success) return token;
    const selected = files.get(token);
    if (!selected) throw new Error("Choose this file again on your device.");
    selected.upload ??= uploadLimit(async () => {
      const file = selected.file;
      if (!file) throw new Error("Choose this file again on your device.");
      const response = await fetch("/web/upload", {
        method: "PUT",
        headers: {
          ...transport.headers(),
          "content-type": "application/octet-stream",
          "x-iris-filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!response.ok) {
        const failure = z
          .object({ error: z.string() })
          .safeParse(await response.json());
        throw new Error(
          failure.success
            ? failure.data.error
            : "The upload failed. Choose the file and try again.",
        );
      }
      const uploaded = WebUploadSchema.parse(await response.json()).token;
      selected.file = undefined;
      return uploaded;
    }).catch((error) => {
      selected.upload = undefined;
      throw error;
    });
    return selected.upload;
  }
  const eagleUploads = new Map<string, string>();
  const eagle = createBrowserEagleImport({
    pick: () => pickDeviceFiles(true),
    upload: async (file) => {
      const selected = pathForFile(file);
      try {
        const token = await upload(selected);
        eagleUploads.set(token, selected);
        return token;
      } catch (error) {
        files.delete(selected);
        throw error;
      }
    },
    request: transport.request,
    progress: (value) => transport.eagleProgress?.(value),
    remove: async (token, keepalive) => {
      try {
        const response = await fetch(
          `/web/upload/${encodeURIComponent(token)}`,
          {
            method: "DELETE",
            headers: transport.headers(),
            keepalive,
          },
        );
        if (!response.ok)
          throw new Error("The host could not remove a temporary upload.");
      } finally {
        const selected = eagleUploads.get(token);
        if (selected) files.delete(selected);
        eagleUploads.delete(token);
      }
    },
  });
  async function media(
    input: { id: string; fileIndex?: number },
    kind: "selected" | "thumbnail" | "video" = "selected",
  ) {
    const save = SaveMedia.parse(
      await transport.request(
        "query",
        JSON.stringify({ name: "saves.get", params: { id: input.id } }),
      ),
    );
    const file =
      kind === "thumbnail"
        ? save.files.find((file) => isThumbnailKind(file.kind ?? ""))
        : kind === "video"
          ? save.files.find(
              (file) =>
                file.kind === "video" || file.mimeType?.startsWith("video/"),
            )
          : save.files[input.fileIndex ?? 0];
    if (!file) throw new Error("This Save has no selected file.");
    return {
      ...file,
      url: `/web/media/${encodeURIComponent(input.id)}/${file.path.split("/").map(encodeURIComponent).join("/")}`,
    };
  }
  async function importSelected(name: string, params: Record<string, Json>) {
    const prepared = { ...params };
    if (name === "saves.importFiles") {
      prepared.relativePaths = Object.fromEntries(
        await Promise.all(
          StringList.parse(prepared.paths).flatMap((path) => {
            const relative = files.get(path)?.relativePath;
            return relative
              ? [upload(path).then((token) => [token, relative])]
              : [];
          }),
        ),
      );
    }
    for (const key of ["paths", "filePaths"]) {
      if (prepared[key] !== undefined)
        prepared[key] = await Promise.all(
          StringList.parse(prepared[key]).map(upload),
        );
    }
    if (prepared.duplicateDecisions !== undefined) {
      const choices = z
        .record(z.string(), z.enum(["use-existing", "keep-both"]))
        .parse(prepared.duplicateDecisions);
      prepared.duplicateDecisions = Object.fromEntries(
        await Promise.all(
          Object.entries(choices).map(async ([path, choice]) => [
            await upload(path),
            choice,
          ]),
        ),
      );
    }
    const input = WebFileQuerySchema.parse({ name, params: prepared });
    const result = await transport.request("files", JSON.stringify(input));
    const downloadable = z
      .object({ download: z.string(), filename: z.string() })
      .safeParse(result);
    if (
      downloadable.success &&
      (name === "transferJobs.download" ||
        !downloaded.has(downloadable.data.download))
    ) {
      downloaded.add(downloadable.data.download);
      downloadInBrowser(downloadable.data.download, downloadable.data.filename);
    }
    return result;
  }
  return {
    pathForFile,
    handles: (name: string) => DEVICE_QUERIES.has(name),
    async query(
      name: QueryName,
      params: Record<string, Json>,
    ): Promise<WebValue> {
      if (name === "saves.pickEagleLibrary") return eagle.pick();
      if (name === "saves.importEagleLibrary") return eagle.import(params);
      if (
        [
          "saves.setCustomThumbnail",
          "saves.replaceFile",
          "saves.loadSubtitles",
        ].includes(name)
      ) {
        const id = Id.parse(params.id);
        const [file] = await pickDeviceFiles(
          false,
          false,
          name === "saves.setCustomThumbnail"
            ? "image/*,.heic,.heif,.jxl,.tif,.tiff"
            : name === "saves.loadSubtitles"
              ? ".vtt,.srt"
              : undefined,
        );
        if (!file) return { ok: false, reason: "cancelled" };
        return importSelected(name, { id, paths: [pathForFile(file)] });
      }
      if (name === "saves.setThumbnailFromClipboard") {
        const id = Id.parse(params.id);
        if (!navigator.clipboard?.read)
          return {
            ok: false,
            error:
              "Clipboard images are unavailable in this browser. Choose an image with Set Thumbnail from File.",
          };
        let items: ClipboardItems;
        try {
          items = await navigator.clipboard.read();
        } catch {
          return {
            ok: false,
            error:
              "Allow clipboard access in your browser and try again, or choose Set Thumbnail from File.",
          };
        }
        for (const item of items) {
          const type = item.types.find((value) => value.startsWith("image/"));
          if (!type) continue;
          const blob = await item.getType(type);
          return importSelected(name, {
            id,
            paths: [pathForFile(new File([blob], "Clipboard image", { type }))],
          });
        }
        return { ok: false, error: "clipboard_empty" };
      }
      if (
        name === "saves.setGifThumbnail" ||
        name === "saves.setImageThumbnail"
      )
        return transport.request("video", JSON.stringify({ name, params }));
      if (name === "downloader.clipboardLinks") {
        const text = await navigator.clipboard.readText().catch(() => "");
        return { urls: extractLinks(text) };
      }
      if (
        name === "downloader.exportFolder" ||
        name === "downloader.pickExportFolder"
      )
        return DEVICE_EXPORT_FOLDER;
      // Browser downloads are revealed by the browser itself.
      if (name === "downloader.reveal") return { ok: false };
      if (name === "downloader.export") {
        const result = z
          .union([
            z.object({ ok: z.literal(false), message: z.string() }),
            z.object({ ok: z.literal(true), text: z.string() }),
            z.object({ ok: z.literal(true), download: z.string() }),
          ])
          .parse(await importSelected(name, params));
        if (!result.ok) return result;
        if ("text" in result) {
          await navigator.clipboard.writeText(result.text);
          return { ok: true, destination: "clipboard", path: null };
        }
        return { ok: true, destination: "file", path: null };
      }
      if (name === "downloader.exportFiles") {
        const result = z
          .union([
            z.object({ ok: z.literal(false), message: z.string() }),
            z.object({ ok: z.literal(true), saved: z.literal(true) }),
            z.object({ ok: z.literal(true), download: z.string() }),
          ])
          .parse(await importSelected(name, params));
        return result.ok ? { ok: true, paths: [] } : result;
      }
      if (name === "library.identity.pickIcon") {
        const [file] = await pickDeviceFiles(
          false,
          false,
          ".png,.jpg,.jpeg,.webp,.gif,.tiff,.bmp",
        );
        if (!file) return { ok: false, reason: "cancelled" };
        if (file.size > 8 * 1024 * 1024)
          throw new Error("Choose a logo smaller than 8 MB.");
        return importSelected(name, { paths: [pathForFile(file)] });
      }
      if (
        [
          "video.sampleFrames",
          "video.preparePreview",
          "video.setThumbnail",
        ].includes(name)
      )
        return transport.request("video", JSON.stringify({ name, params }));
      if (name === "video.copyFrame" || name === "video.saveFrame") {
        const result = z
          .object({ bytes: z.instanceof(Uint8Array) })
          .parse(
            await transport.request(
              "video",
              JSON.stringify({ name: "video.frame", params }),
            ),
          );
        const blob = new Blob([Uint8Array.from(result.bytes)], {
          type: "image/png",
        });
        if (name === "video.copyFrame")
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
        else {
          const url = URL.createObjectURL(blob);
          downloadInBrowser(url, "Video frame.png");
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        return { ok: true };
      }
      if (name === "clipboard.writeText") {
        await navigator.clipboard.writeText(z.string().parse(params.text));
        return { ok: true };
      }
      if (name === "saves.listOpenWith") return { apps: [] };
      if (name === "agent.pickAttachments") {
        const picked = await pickDeviceFiles();
        if (!picked.length) return { ok: true, files: [] };
        return importSelected(name, { paths: picked.map(pathForFile) });
      }
      if (name === "saves.filePath" || name === "video.copyFilePath") {
        const selected = await media(
          name === "video.copyFilePath"
            ? { id: Id.parse(params.saveId) }
            : FileSelection.parse(params),
          name === "video.copyFilePath" ? "video" : "selected",
        );
        const path = new URL(selected.url, location.origin).href;
        if (name === "video.copyFilePath")
          await navigator.clipboard.writeText(path);
        return { ok: true, path };
      }
      if (name === "saves.pickImportPaths") {
        const picked = await pickDeviceFiles(params.kind === "folders");
        return { paths: picked.map(pathForFile) };
      }
      if (
        [
          "saves.importPackage",
          "saves.importEaglePackage",
          "saves.importBookmarks",
          "saves.importMymind",
          "saves.importDataExport",
        ].includes(name)
      ) {
        const picked = await pickDeviceFiles(
          false,
          false,
          name === "saves.importDataExport"
            ? ".zip,application/zip"
            : undefined,
        );
        if (!picked.length) return { ok: false, reason: "cancelled" };
        return importSelected(name, { paths: picked.map(pathForFile) });
      }
      if (name === "saves.importClipboard") {
        /** Match the native handler: a paste inside a folder view files every result into that folder. */
        const folderId = z.string().min(1).nullish().parse(params.folderId);
        const items = await navigator.clipboard.read();
        const selected: string[] = [];
        for (const item of items) {
          const mime = item.types.find((type) => type.startsWith("image/"));
          if (mime)
            selected.push(
              pathForFile(
                new File(
                  [await item.getType(mime)],
                  `Pasted image.${mime.split("/")[1] ?? "png"}`,
                  { type: mime },
                ),
              ),
            );
        }
        if (selected.length) {
          const input: ClipboardFilesInput = {
            paths: selected,
            origin: "clipboard",
          };
          if (folderId) input.folderIds = [folderId];
          return importSelected("saves.importFiles", input);
        }
        const text = await navigator.clipboard.readText();
        if (!text.trim())
          return { ok: false, error: "The clipboard is empty." };
        const url = z.url().safeParse(text.trim());
        if (
          !url.success ||
          !["http:", "https:"].includes(new URL(url.data).protocol)
        ) {
          const result = z
            .object({ ok: z.boolean(), id: z.string().optional() })
            .parse(await importSelected("saves.createManual", { note: text }));
          if (result.ok && result.id && folderId)
            await transport.request(
              "query",
              JSON.stringify({
                name: "folders.addSaves",
                params: { folderId, saveIds: [result.id] },
              }),
            );
          return { ok: result.ok, ids: result.id ? [result.id] : [] };
        }
        const quickAdd: ClipboardLinkInput = { url: text.trim() };
        if (folderId) quickAdd.folderId = folderId;
        const added = z
          .object({ ok: z.boolean(), id: z.string().optional() })
          .parse(
            await transport.request(
              "query",
              JSON.stringify({ name: "saves.quickAdd", params: quickAdd }),
            ),
          );
        return { ok: added.ok, ids: added.id ? [added.id] : [] };
      }
      if (name === "saves.copyInternalLinks") {
        const ids = StringList.parse(params.ids);
        await navigator.clipboard.writeText(
          ids
            .map((id) => `${location.origin}/save/${encodeURIComponent(id)}`)
            .join("\n"),
        );
        return { ok: true };
      }
      if (
        ["saves.exportFile", "saves.copyFile", "saves.share"].includes(name)
      ) {
        const selected = await media(FileSelection.parse(params));
        if (name === "saves.share" && navigator.share) {
          const response = await fetch(selected.url);
          if (!response.ok)
            throw new Error("The selected file is unavailable.");
          const file = new File([await response.blob()], selected.path, {
            type: selected.mimeType ?? "application/octet-stream",
          });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file] });
            return { ok: true };
          }
        }
        downloadInBrowser(selected.url, selected.path);
        return { ok: true, path: selected.path };
      }
      if (name === "saves.copyFiles") {
        const selected = z.array(FileSelection).parse(params.files);
        await importSelected("saves.copyFiles", { files: selected });
        return { ok: true, copied: selected.length };
      }
      if (
        ["saves.copyImage", "saves.copyThumbnail", "saves.copyBase64"].includes(
          name,
        )
      ) {
        const file = await media(
          FileSelection.parse(params),
          name === "saves.copyThumbnail" ? "thumbnail" : "selected",
        );
        const response = await fetch(file.url);
        if (!response.ok) throw new Error("The selected image is unavailable.");
        const blob = await response.blob();
        if (name === "saves.copyBase64") {
          const data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(z.string().parse(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          await navigator.clipboard.writeText(
            data.slice(data.indexOf(",") + 1),
          );
        } else {
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");
          if (!context)
            throw new Error("Image copying is unavailable on this device.");
          context.drawImage(bitmap, 0, 0);
          bitmap.close();
          const png = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (value) =>
                value
                  ? resolve(value)
                  : reject(new Error("Could not prepare this image.")),
              "image/png",
            ),
          );
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": png }),
          ]);
        }
        return { ok: true };
      }
      return importSelected(name, params);
    },
  };
}
