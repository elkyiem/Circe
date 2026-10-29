import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { saves } from "@pond/schema/db";
import { desc, inArray, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { z } from "zod";
import { CombineImagesOptionsSchema } from "../../shared/combine-images-contracts";
import { IPC } from "../../shared/constants";
import { conversationMarkdown } from "../../shared/conversation-markdown";
import { ConversionRequestSchema } from "../../shared/conversion-contracts";
import type { QueryName, QueryResult } from "../../shared/query-contracts";
import { WebCanvasRenderSchema } from "../../shared/web-canvas-contracts";
import {
  WebEagleImportSchema,
  WebFileImportSchema,
  WebFileQuerySchema,
  WebSaveFileInputNameSchema,
} from "../../shared/web-files-contracts";
import { stringifyWebValue } from "../../shared/web-serialization";
import { registerLocalAttachments } from "../core/agent/local-attachments";
import { listChats, listMessages } from "../core/agent/persist";
import { importBookmarkFile, parseBookmarkFile } from "../core/bookmarks";
import { canvasPdf } from "../core/canvas-pdf";
import { combineImages } from "../core/combine-images";
import { conversionJobs } from "../core/conversion-jobs";
import { reviewImportDuplicates } from "../core/duplicate-import";
import { importEaglePackage } from "../core/eagle-package";
import { copyExportFile } from "../core/export-files";
import {
  exportSavesToDirectory,
  exportSavesToEaglePackage,
} from "../core/export-saves";
import { readLibraryLogo } from "../core/library-logo";
import { createManualSave } from "../core/manual-import";
import { importMymindExport } from "../core/mymind-import";
import { readSave } from "../core/pipeline/workers/apply";
import { exportPondPackage, importPondPackage } from "../core/pond-package";
import { runTransferJob, transferJobStore } from "../core/transfer-jobs";
import { retryTransferJob } from "../core/transfer-operations";
import { getDb } from "../db";
import { broadcast } from "../lib/broadcast";
import { byteRange } from "../lib/byte-range";
import { toCsv } from "../lib/csv";
import { isPathInside } from "../lib/path-identity";
import { libraryId, libraryRoot } from "../paths";
import { unzipWebDirectory, zipWebDirectory } from "./archives";
import { renderWebCanvas } from "./canvas-render";
import { createWebEagleImport } from "./eagle-import";
import { WebRequestError } from "./errors";
import { importUploadedFiles } from "./import-files";
import { createWebInference } from "./inference";
import { prepareWebManualSave } from "./manual-save-input";
import { indexedMediaPath } from "./media";
import { createWebPackageImports } from "./package-import";
import { createWebTransfers } from "./transfers";
import { createWebUploads } from "./uploads";

const Token = z.string().regex(/^iris-upload:[0-9a-f-]{36}$/);
const Selection = z.object({
  ids: z.array(z.string().min(1).max(200)).max(100000),
});
const Download = z.strictObject({
  libraryId: z.string(),
  filename: z.string(),
  file: z.string(),
  count: z.number().int().nonnegative(),
});

export function createWebFiles(root: string) {
  const uploads = createWebUploads(join(root, "uploads"));
  const eagle = createWebEagleImport({
    root: join(root, "eagle-imports"),
    uploads,
    importLibrary: async (params, progress) =>
      (await import("../core/eagle-library-import")).importEagleWithOptions(
        params,
        progress,
      ),
    progress: (value) => broadcast(IPC.eagleImportProgress, value),
  });
  const conversions = new Map<
    string,
    {
      directory: { id: string; path: string };
      libraryId: string;
      download?: Promise<Awaited<ReturnType<typeof finish>>>;
    }
  >();
  async function workDirectory() {
    const id = randomUUID();
    const path = join(root, "downloads", id);
    await mkdir(join(root, "downloads"), { recursive: true, mode: 0o700 });
    await mkdir(path, { mode: 0o700 });
    return { id, path };
  }
  async function finish(
    directory: { id: string; path: string },
    filename: string,
    file: string,
    count: number,
    expected: string,
  ) {
    await writeFile(
      join(directory.path, "download.json"),
      JSON.stringify({ libraryId: expected, filename, file, count }),
      { flag: "wx", mode: 0o600 },
    );
    return {
      ok: true,
      download: `/web/download/${directory.id}`,
      filename,
      exported: count,
      count,
      path: filename,
      dir: filename,
    };
  }
  const packageImports = createWebPackageImports({
    root,
    libraryRoot,
    run: runTransferJob,
    importPackage: importPondPackage,
    warn: (error) =>
      log.warn("[circe] completed import staging cleanup failed", error),
  });
  const transfers = createWebTransfers({
    root,
    finish,
    imports: packageImports,
    operations: {
      libraryRoot,
      list: () => transferJobStore().list(),
      run: runTransferJob,
      retry: retryTransferJob,
      exportFiles: exportSavesToDirectory,
      exportEagle: exportSavesToEaglePackage,
      exportPackage: exportPondPackage,
    },
  });
  return {
    transferJobs: {
      list: () => transfers.list(libraryId()),
      retry: (id: string) =>
        transfers.retry(id, libraryId(), { requireLibraryIdentity: false }),
      artifact: (id: string) => transfers.artifact(id, libraryId()),
    },
    infer: createWebInference(uploads),
    removeUpload: (token: string, expected: string) =>
      uploads.remove(token, expected),
    upload: (request: Request, filename: string, expected: string) =>
      uploads.put(request, filename, expected),
    async query(raw: z.infer<typeof WebFileQuerySchema>, expected: string) {
      if (expected !== libraryId())
        throw new WebRequestError(
          "The active Library changed. Reload before editing.",
        );
      const { name, params } = WebFileQuerySchema.parse(raw);
      let result:
        | QueryResult<
            Extract<z.infer<typeof WebFileQuerySchema>["name"], QueryName>
          >
        | Awaited<ReturnType<typeof finish>>;
      const uploadedAction = WebSaveFileInputNameSchema.safeParse(name);
      if (uploadedAction.success) {
        const { applyWebSaveFileInput } = await import("./save-file-input");
        result = await applyWebSaveFileInput(
          uploadedAction.data,
          params,
          uploads,
          expected,
        );
      } else if (name === "transferJobs.list") {
        z.strictObject({}).parse(params);
        result = await transfers.list(expected);
      } else if (
        name === "transferJobs.retry" ||
        name === "transferJobs.download"
      ) {
        const { id } = z
          .strictObject({ id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/) })
          .parse(params);
        result =
          name === "transferJobs.retry"
            ? await transfers.retry(id, expected)
            : await transfers.download(id, expected);
      } else if (name === "saves.importEagleLibrary") {
        result = await eagle(WebEagleImportSchema.parse(params), expected);
      } else if (name === "library.exportDebugReport") {
        z.strictObject({}).parse(params);
        const { createDebugReport } = await import("../core/debug-report");
        const directory = await workDirectory();
        const file = "debug-report.zip";
        await writeFile(join(directory.path, file), await createDebugReport(), {
          flag: "wx",
          mode: 0o600,
        });
        result = await finish(
          directory,
          `Pond Debug Report ${new Date().toISOString().slice(0, 10)}.zip`,
          file,
          1,
          expected,
        );
      } else if (name === "saves.exportDotLottie") {
        const { id, fileIndex } = z
          .strictObject({
            id: z.string().min(1).max(200),
            fileIndex: z.number().int().nonnegative(),
          })
          .parse(params);
        const save = await readSave(id);
        const file = save?.files[fileIndex];
        const path =
          file && /\.json$/i.test(file.path)
            ? await indexedMediaPath(id, file.path)
            : null;
        if (!save || !file || !path)
          return Response.json({
            ok: false,
            error: "Choose a Lottie JSON file.",
          });
        const { createDotLottie } = await import("../core/dot-lottie");
        let bytes: Buffer;
        try {
          bytes = await createDotLottie(await readFile(path));
        } catch (error) {
          return Response.json({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not export this animation.",
          });
        }
        const directory = await workDirectory();
        const filename = `${(save.title?.trim() || file.path).replace(/\.[^.]*$/, "").replace(/[/\\:*?"<>|\p{Cc}]/gu, "-") || "Animation"}.lottie`;
        await writeFile(join(directory.path, "animation.lottie"), bytes, {
          flag: "wx",
          mode: 0o600,
        });
        result = await finish(
          directory,
          filename,
          "animation.lottie",
          1,
          expected,
        );
      } else if (name === "saves.exportWebp") {
        const { ids } = Selection.parse(params);
        if (!ids.length)
          throw new WebRequestError("Choose Saves to export.", 422);
        const { default: sharp } = await import("sharp");
        const directory = await workDirectory();
        const output = join(directory.path, "images");
        await mkdir(output, { mode: 0o700 });
        let count = 0;
        for (const id of new Set(ids)) {
          const file = (await readSave(id))?.files[0];
          const path = file ? await indexedMediaPath(id, file.path) : null;
          if (!path) continue;
          const bytes = await sharp(path)
            .webp({ quality: 80 })
            .toBuffer()
            .catch(() => null);
          if (!bytes) continue;
          await writeFile(join(output, `${id}.webp`), bytes, {
            flag: "wx",
            mode: 0o600,
          });
          count++;
        }
        await zipWebDirectory(output, join(directory.path, "download.zip"));
        result = await finish(
          directory,
          "WebP images.zip",
          "download.zip",
          count,
          expected,
        );
      } else if (name === "library.identity.pickIcon") {
        const { paths } = z
          .strictObject({ paths: z.array(Token).length(1) })
          .parse(params);
        const file = await uploads.get(paths[0] ?? "", expected);
        if (file.size > 8 * 1024 * 1024)
          throw new WebRequestError("Choose a logo smaller than 8 MB.", 422);
        result = readLibraryLogo(file.path);
      } else if (name === "canvases.render") {
        const input = WebCanvasRenderSchema.parse(params);
        const image = await renderWebCanvas(input, expected);
        const directory = await workDirectory();
        const filename = `${input.canvas.name.replace(/[/\\:*?"<>|]/g, "-").trim() || "Canvas"}.${input.format}`;
        const file = `canvas.${input.format}`;
        await writeFile(
          join(directory.path, file),
          input.format === "png"
            ? image.png
            : await canvasPdf(image.png, image.width, image.height),
          { flag: "wx", mode: 0o600 },
        );
        result = await finish(directory, filename, file, 1, expected);
      } else if (name === "conversion.start" || name === "conversion.status") {
        const job =
          name === "conversion.start"
            ? await (async () => {
                const directory = await workDirectory();
                const output = join(directory.path, "converted");
                await mkdir(output, { mode: 0o700 });
                const job = conversionJobs.start({
                  ...ConversionRequestSchema.parse(params),
                  directory: output,
                });
                conversions.set(job.id, { directory, libraryId: expected });
                return job;
              })()
            : conversionJobs.status(
                z.object({ id: z.uuid() }).parse(params).id,
              );
        const registered = job ? conversions.get(job.id) : undefined;
        if (!job || !registered) result = job;
        else {
          if (registered.libraryId !== expected)
            throw new WebRequestError(
              "This conversion belongs to another Library.",
            );
          if (job.status === "complete")
            registered.download ??= (async () => {
              await zipWebDirectory(
                job.directory,
                join(registered.directory.path, "download.zip"),
              );
              return finish(
                registered.directory,
                "Converted files.zip",
                "download.zip",
                job.outputs.length,
                expected,
              );
            })();
          result = {
            ...job,
            directory: "Download to this device",
            outputs: [],
          };
          if (registered.download)
            result = { ...result, ...(await registered.download) };
        }
      } else if (name === "agent.pickAttachments") {
        const input = z
          .strictObject({ paths: z.array(Token).max(20) })
          .parse(params);
        const staged = await Promise.all(
          input.paths.map((token) => uploads.get(token, expected)),
        );
        result = await registerLocalAttachments(
          staged.map((file) => file.path),
        );
      } else if (name === "agent.exportChat") {
        const { chatId } = z
          .strictObject({ chatId: z.string().min(1).max(200) })
          .parse(params);
        const chat = (await listChats()).find((chat) => chat.id === chatId);
        if (!chat)
          throw new WebRequestError("This chat no longer exists.", 404);
        const directory = await workDirectory();
        await writeFile(
          join(directory.path, "conversation.md"),
          conversationMarkdown(chat.title, await listMessages(chatId)),
          { flag: "wx", mode: 0o600 },
        );
        result = await finish(
          directory,
          "Conversation.md",
          "conversation.md",
          1,
          expected,
        );
      } else if (name === "saves.combineImages") {
        const input = z
          .strictObject({
            ids: z.array(z.string().min(1).max(200)).min(2).max(1000),
            folderId: z.string().min(1).max(200).nullable().optional(),
            options: CombineImagesOptionsSchema.partial()
              .extend({ outputPath: z.null().optional() })
              .strict()
              .optional(),
          })
          .parse(params);
        const options = CombineImagesOptionsSchema.parse(input.options ?? {});
        if (options.output === "export") {
          const directory = await workDirectory();
          const filename = `Combined Images.${options.format === "jpeg" ? "jpg" : options.format}`;
          const combined = await combineImages({
            ...input,
            options: { ...options, outputPath: join(directory.path, filename) },
          });
          result = combined.ok
            ? {
                ...(await finish(directory, filename, filename, 1, expected)),
                skipped: combined.skipped,
              }
            : combined;
        } else result = await combineImages({ ...input, options });
      } else if (name === "saves.copyFiles") {
        const { files } = z
          .object({
            files: z
              .array(
                z.object({
                  id: z.string().min(1),
                  fileIndex: z.number().int().nonnegative().default(0),
                }),
              )
              .min(1)
              .max(10000),
          })
          .parse(params);
        const directory = await workDirectory();
        const output = join(directory.path, "files");
        await mkdir(output, { mode: 0o700 });
        for (const selected of files) {
          const save = await readSave(selected.id);
          const file = save?.files[selected.fileIndex];
          const path = file
            ? await indexedMediaPath(selected.id, file.path)
            : null;
          if (!file || !path)
            throw new WebRequestError("One selected file is unavailable.", 404);
          await copyExportFile(path, output, file.path);
        }
        await zipWebDirectory(output, join(directory.path, "download.zip"));
        result = {
          ...(await finish(
            directory,
            "Selected files.zip",
            "download.zip",
            files.length,
            expected,
          )),
          copied: files.length,
        };
      } else if (name.startsWith("saves.export")) {
        const { ids } = Selection.parse(params);
        if (name === "saves.exportCsv") {
          const directory = await workDirectory();
          const db = await getDb();
          const rows = await db
            .select()
            .from(saves)
            .where(
              ids.length ? inArray(saves.id, ids) : isNull(saves.deletedAt),
            )
            .orderBy(desc(saves.savedAt));
          const columns = [
            "id",
            "source",
            "url",
            "title",
            "author",
            "description",
            "notes",
            "tags",
            "mediaType",
            "width",
            "height",
            "fileSize",
            "status",
            "savedAt",
          ];
          const records = rows.map((row) => [
            row.id,
            row.source,
            row.url,
            row.title,
            row.author,
            row.description,
            row.notes,
            row.tags,
            row.mediaType,
            row.width,
            row.height,
            row.fileSize,
            row.status,
            row.savedAt.toISOString(),
          ]);
          await writeFile(
            join(directory.path, "download.csv"),
            toCsv(records, columns),
            { mode: 0o600 },
          );
          result = await finish(
            directory,
            "pond-export.csv",
            "download.csv",
            rows.length,
            expected,
          );
        } else {
          result = await transfers.export(
            name === "saves.exportEaglePackage"
              ? "export_eagle_package"
              : name === "saves.exportPackage"
                ? "export_package"
                : "export_files",
            ids,
            expected,
          );
        }
      } else if (name === "saves.createManual") {
        const manual = await prepareWebManualSave(params, (token) =>
          uploads.get(token, expected),
        );
        result = await createManualSave(manual);
      } else {
        const input = WebFileImportSchema.parse(params);
        const staged = await Promise.all(
          input.paths.map((token) => uploads.get(token, expected)),
        );
        const toToken = new Map(
          staged.map((file, index) => [file.path, input.paths[index] ?? ""]),
        );
        if (name === "saves.reviewImportDuplicates") {
          result = {
            candidates: (
              await reviewImportDuplicates(staged.map((file) => file.path))
            ).map((candidate) => ({
              ...candidate,
              path: toToken.get(candidate.path) ?? candidate.filename,
            })),
          };
        } else if (name === "saves.importFiles") {
          result = await importUploadedFiles(input, staged, expected);
        } else {
          const file = staged[0];
          if (!file || staged.length !== 1)
            throw new WebRequestError("Choose one export package.", 422);
          if (name === "saves.importDataExport") {
            const { importDataExport } = await import("../core/data-export");
            result = await importDataExport(file.path);
          } else if (name === "saves.importEaglePackage")
            result = {
              ok: true,
              ...(await runTransferJob(
                {
                  kind: "import_eagle_package",
                  origin: libraryRoot(),
                  source: file.path,
                  destination: libraryRoot(),
                },
                () => importEaglePackage(file.path),
              )),
            };
          else if (name === "saves.importBookmarks") {
            const bookmarks = parseBookmarkFile(
              await readFile(file.path, "utf8"),
            );
            if (!bookmarks?.bookmarks.length)
              throw new WebRequestError(
                "That file has no web bookmarks. Export bookmarks as HTML from your browser and try again.",
                422,
              );
            result = await importBookmarkFile(bookmarks);
          } else if (name === "saves.importPackage") {
            result = await packageImports.start(file.path, expected);
          } else {
            const directory = await workDirectory();
            try {
              const expanded = await unzipWebDirectory(
                file.path,
                join(directory.path, "expanded"),
              );
              result = await importMymindExport(expanded);
            } finally {
              await rm(directory.path, { recursive: true, force: true });
            }
          }
        }
      }
      return new Response(stringifyWebValue(result), {
        headers: { "content-type": "application/json" },
      });
    },
    async download(request: Request, id: string, expected: string) {
      const directory = join(root, "downloads", z.uuid().parse(id));
      const metadata = Download.parse(
        JSON.parse(await readFile(join(directory, "download.json"), "utf8")),
      );
      if (metadata.libraryId !== expected)
        throw new WebRequestError("This download belongs to another Library.");
      const path = await realpath(join(directory, metadata.file));
      if (!isPathInside(await realpath(directory), path))
        throw new WebRequestError("This download is unavailable.", 404);
      const { size } = await stat(path);
      const headers = new Headers({
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(metadata.filename)}`,
        "accept-ranges": "bytes",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      });
      const rangeHeader = request.headers.get("range");
      const range = rangeHeader ? byteRange(rangeHeader, size) : undefined;
      if (rangeHeader && !range) {
        headers.set("content-range", `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      headers.set(
        "content-length",
        String(range ? range.end - range.start + 1 : size),
      );
      if (range)
        headers.set(
          "content-range",
          `bytes ${range.start}-${range.end}/${size}`,
        );
      /** SAFETY: Node's web stream carries Uint8Array chunks accepted by the Fetch Response body. */
      const body =
        request.method === "HEAD"
          ? null
          : (Readable.toWeb(
              createReadStream(path, range ?? {}),
            ) as ReadableStream<Uint8Array>);
      return new Response(body, { status: range ? 206 : 200, headers });
    },
  };
}
