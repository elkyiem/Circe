import type { QueryName } from "@shared/query-contracts";
import { isThumbnailKind } from "@shared/save-file-names";
import {
  WebFileQuerySchema,
  WebUploadSchema,
  WebUploadTokenSchema,
} from "@shared/web-files-contracts";
import type { WebValue } from "@shared/web-serialization";
import pLimit from "p-limit";
import { z } from "zod";

type Json = z.infer<ReturnType<typeof z.json>>;
interface FileTransport {
  request(path: string, body?: string): Promise<WebValue>;
  headers(): Record<string, string>;
}
const DEVICE_QUERIES = new Set<string>([
  "library.identity.pickIcon",
  "saves.pickImportPaths",
  "saves.importFiles",
  "saves.reviewImportDuplicates",
  "saves.createManual",
  "saves.importPackage",
  "saves.importEaglePackage",
  "saves.importBookmarks",
  "saves.importMymind",
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
  const files = new Map<string, { file: File; upload?: Promise<string> }>();
  const downloaded = new Set<string>();
  function pathForFile(file: File) {
    const token = `iris-device:${crypto.randomUUID()}`;
    files.set(token, { file });
    return token;
  }
  async function upload(token: string) {
    if (WebUploadTokenSchema.safeParse(token).success) return token;
    const selected = files.get(token);
    if (!selected) throw new Error("Choose this file again on your device.");
    selected.upload ??= uploadLimit(async () => {
      const response = await fetch("/web/upload", {
        method: "PUT",
        headers: {
          ...transport.headers(),
          "content-type": "application/octet-stream",
          "x-iris-filename": encodeURIComponent(selected.file.name),
        },
        body: selected.file,
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
      return WebUploadSchema.parse(await response.json()).token;
    }).catch((error) => {
      selected.upload = undefined;
      throw error;
    });
    return selected.upload;
  }
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
            const relative = files.get(path)?.file.webkitRelativePath;
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
    if (downloadable.success && !downloaded.has(downloadable.data.download)) {
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
        ].includes(name)
      ) {
        const picked = await pickDeviceFiles(false, false);
        if (!picked.length) return { ok: false, reason: "cancelled" };
        return importSelected(name, { paths: picked.map(pathForFile) });
      }
      if (name === "saves.importClipboard") {
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
        if (selected.length)
          return importSelected("saves.importFiles", { paths: selected });
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
          return { ok: result.ok, ids: result.id ? [result.id] : [] };
        }
        const added = z
          .object({ ok: z.boolean(), id: z.string().optional() })
          .parse(
            await transport.request(
              "query",
              JSON.stringify({
                name: "saves.quickAdd",
                params: { url: text.trim() },
              }),
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
