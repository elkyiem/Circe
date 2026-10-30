import { z } from "zod";

export const WebSaveFileInputNameSchema = z.enum([
  "saves.setCustomThumbnail",
  "saves.setThumbnailFromClipboard",
  "saves.replaceFile",
  "saves.loadSubtitles",
]);

export const WebFileQuerySchema = z.strictObject({
  name: z.enum([
    "library.identity.pickIcon",
    "library.exportDebugReport",
    ...WebSaveFileInputNameSchema.options,
    "saves.exportWebp",
    "saves.exportDotLottie",
    "saves.importFiles",
    "saves.reviewImportDuplicates",
    "saves.createManual",
    "saves.importPackage",
    "saves.importEaglePackage",
    "saves.importEagleLibrary",
    "saves.importBookmarks",
    "saves.importMymind",
    "saves.importDataExport",
    "saves.exportPackage",
    "saves.exportEaglePackage",
    "saves.exportFiles",
    "saves.exportCsv",
    "saves.copyFiles",
    "saves.combineImages",
    "canvases.render",
    "agent.pickAttachments",
    "agent.exportChat",
    "conversion.start",
    "conversion.status",
    "transferJobs.retry",
    "transferJobs.download",
    "transferJobs.list",
  ]),
  params: z.record(z.string(), z.json()).default({}),
});
export const WebUploadTokenSchema = z
  .string()
  .regex(/^iris-upload:[0-9a-f-]{36}$/);
/** Visiting-device names describe Library folders; they are never host paths. */
export const WebRelativePathSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((path) => {
    const parts = path.split("/");
    return (
      parts.length <= 32 &&
      !/[\\:\p{Cc}]/u.test(path) &&
      parts.every(
        (part) =>
          part.trim().length > 0 &&
          part.length <= 240 &&
          part.trim() !== "." &&
          part.trim() !== "..",
      )
    );
  }, "Choose a folder containing valid relative file names.");
export const WebImportRelativePathsSchema = z.record(
  WebUploadTokenSchema,
  WebRelativePathSchema,
);
export const WebEagleImportSchema = z.strictObject({
  files: z
    .array(
      z.strictObject({
        token: WebUploadTokenSchema,
        path: WebRelativePathSchema,
      }),
    )
    .min(1)
    .max(1000000),
  dryRun: z.boolean().optional(),
  importShortcuts: z.boolean().optional(),
  progressId: z.string().min(1).max(200).optional(),
});
export const WebFileImportSchema = z.object({
  origin: z.enum(["files", "clipboard"]).default("files"),
  paths: z.array(WebUploadTokenSchema).min(1).max(10000),
  tags: z.array(z.string()).default([]),
  folderIds: z.array(z.string()).default([]),
  relativePaths: WebImportRelativePathsSchema.default({}),
  duplicatePolicy: z.enum(["use-existing", "keep-both"]).default("keep-both"),
  duplicateDecisions: z
    .record(z.string(), z.enum(["use-existing", "keep-both"]))
    .default({}),
});
export const WebUploadSchema = z.object({
  token: WebUploadTokenSchema,
  name: z.string(),
  size: z.number().int().nonnegative(),
});
