import log from "electron-log/main.js";
import type { createWebUploads } from "./uploads";

type UploadStore = Pick<ReturnType<typeof createWebUploads>, "get" | "remove">;
type UploadedFile = Awaited<ReturnType<UploadStore["get"]>>;

/** A committed Library edit must keep its outcome even when staging cleanup needs a later retry. */
export async function consumeWebUpload<T>(input: {
  uploads: UploadStore;
  token: string;
  library: string;
  apply(file: UploadedFile): Promise<T>;
}): Promise<T> {
  const file = await input.uploads.get(input.token, input.library);
  try {
    return await input.apply(file);
  } finally {
    await input.uploads
      .remove(input.token, input.library)
      .catch((error: Error) =>
        log.warn("[circe web] staged upload cleanup deferred", error),
      );
  }
}
