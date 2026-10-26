import { z } from "zod";
import {
  type WebFileQuerySchema,
  WebUploadTokenSchema,
} from "../../shared/web-files-contracts";
import {
  CreateManualParamsSchema,
  normalizeManualSaveInput,
} from "../ipc/queries/saves-import-input";

const Input = CreateManualParamsSchema.omit({
  filePaths: true,
  sourceId: true,
}).extend({
  filePaths: z.array(WebUploadTokenSchema).max(10000).default([]),
});

/** Keep the native Save fields; only the host resolves files and assigns upload identity. */
export async function prepareWebManualSave(
  params: z.infer<typeof WebFileQuerySchema>["params"],
  resolveUpload: (token: string) => Promise<{ id: string; path: string }>,
) {
  const input = Input.parse(params);
  const staged = await Promise.all(
    input.filePaths.map((token) => resolveUpload(token)),
  );
  return normalizeManualSaveInput({
    ...input,
    filePaths: staged.map((file) => file.path),
    sourceId: staged[0] ? `web-upload:${staged[0].id}` : null,
  });
}
