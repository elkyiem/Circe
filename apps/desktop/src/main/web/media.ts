import { realpath } from "node:fs/promises";
import { readSave } from "../core/pipeline/workers/apply";
import { isPathInside } from "../lib/path-identity";
import { saveDir, saveFile } from "../paths";
import { servePondMedia } from "../protocol";

export async function indexedMediaPath(
  saveId: string,
  filename: string,
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]+$/.test(saveId)) return null;
  const save = await readSave(saveId);
  if (!save?.files?.some((file) => file.path === filename)) return null;
  try {
    const [root, target] = await Promise.all([
      realpath(saveDir(saveId)),
      realpath(saveFile(saveId, filename)),
    ]);
    return isPathInside(root, target) ? target : null;
  } catch {
    return null;
  }
}

/** Only indexed media of this Save is reachable; metadata and host paths are excluded. */
export async function serveWebMedia(
  request: Request,
  saveId: string,
  filename: string,
): Promise<Response> {
  if (!(await indexedMediaPath(saveId, filename))) {
    return new Response(null, { status: 404 });
  }
  try {
    const url = new URL(request.url);
    const response = await servePondMedia(
      new Request(
        `pond://${saveId}/${filename.split("/").map(encodeURIComponent).join("/")}${url.search}`,
        {
          method: request.method,
          headers: request.headers,
        },
      ),
    );
    response.headers.set("cache-control", "private, no-store");
    response.headers.delete("access-control-allow-origin");
    response.headers.set("x-content-type-options", "nosniff");
    response.headers.set(
      "content-security-policy",
      "default-src 'none'; sandbox",
    );
    return response;
  } catch {
    return new Response(null, { status: 404 });
  }
}
