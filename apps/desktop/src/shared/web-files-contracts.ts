import { z } from "zod";

export const WebFileQuerySchema = z
  .object({
    name: z.enum([
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
      "saves.copyFiles",
      "saves.combineImages",
      "canvases.render",
      "agent.pickAttachments",
      "agent.exportChat",
      "conversion.start",
      "conversion.status",
    ]),
    params: z.record(z.string(), z.json()).default({}),
  })
  .strict();
export const WebUploadTokenSchema = z
  .string()
  .regex(/^iris-upload:[0-9a-f-]{36}$/);
/** Visiting-device names describe Library folders; they are never host paths. */
const WebRelativePathSchema = z
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
export const WebFileImportSchema = z.object({
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
