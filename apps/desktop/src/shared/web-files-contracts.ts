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
export const WebUploadSchema = z.object({
  token: WebUploadTokenSchema,
  name: z.string(),
  size: z.number().int().nonnegative(),
});
