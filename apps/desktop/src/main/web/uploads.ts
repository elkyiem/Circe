import { randomUUID } from "node:crypto";
import {
  type FileHandle,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { isPathInside } from "../lib/path-identity";
import { WebRequestError } from "./errors";

const Ticket = z.string().uuid();
const Metadata = z
  .object({
    libraryId: z.string(),
    filename: z.string().min(1).max(240),
    size: z.number().int().nonnegative(),
    createdAt: z.number(),
  })
  .strict();

export function visitingFilename(value: string) {
  const filename = basename(value.replaceAll("\\", "/"))
    .replace(/\p{Cc}/gu, "_")
    .slice(0, 200);
  if (!filename || filename === "." || filename === "..")
    throw new WebRequestError("Choose a file with a name.", 422);
  return filename.startsWith(".") ? `_${filename}` : filename;
}

/** Opaque staged files are scoped to one Library; remote callers never provide host paths. */
export function createWebUploads(
  root: string,
  maxBytes = 256 * 1024 * 1024,
  maxTotalBytes = 2 * 1024 * 1024 * 1024,
) {
  let used = 0;
  let active = 0;
  const ready = (async () => {
    await mkdir(root, { recursive: true, mode: 0o700 });
    for (const name of await readdir(root)) {
      if (!Ticket.safeParse(name).success) continue;
      try {
        const metadata = Metadata.parse(
          JSON.parse(await readFile(join(root, name, "upload.json"), "utf8")),
        );
        if (Date.now() - metadata.createdAt > 24 * 60 * 60 * 1000)
          await rm(join(root, name), { recursive: true, force: true });
        else used += metadata.size;
      } catch {
        await rm(join(root, name), { recursive: true, force: true });
      }
    }
  })();
  return {
    async put(request: Request, filename: string, libraryId: string) {
      await ready;
      if (active >= 8)
        throw new WebRequestError(
          "Wait for the current uploads to finish.",
          422,
        );
      const declared = Number(request.headers.get("content-length") ?? 0);
      if (declared > maxBytes || declared + used > maxTotalBytes)
        throw new WebRequestError(
          "This upload exceeds the host's available upload allowance.",
          422,
        );
      if (!request.body)
        throw new WebRequestError("The upload was empty.", 422);
      const id = randomUUID();
      const name = visitingFilename(filename);
      const directory = join(root, id);
      const reader = request.body.getReader();
      let size = 0;
      let file: FileHandle | null = null;
      active++;
      try {
        await mkdir(directory, { mode: 0o700 });
        file = await open(join(directory, name), "wx", 0o600);
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (request.signal.aborted)
            throw new WebRequestError("Upload cancelled.", 422);
          size += chunk.value.byteLength;
          used += chunk.value.byteLength;
          if (size > maxBytes || used > maxTotalBytes)
            throw new WebRequestError(
              "This upload exceeds the host's available upload allowance.",
              422,
            );
          await file.writeFile(chunk.value);
        }
        if (!size) throw new WebRequestError("The upload was empty.", 422);
        await file.sync();
        await writeFile(
          join(directory, "upload.json"),
          JSON.stringify({
            libraryId,
            filename: name,
            size,
            createdAt: Date.now(),
          }),
          { mode: 0o600, flag: "wx" },
        );
        return { token: `iris-upload:${id}`, name, size };
      } catch (error) {
        used -= size;
        await reader.cancel().catch(() => {});
        await rm(directory, { recursive: true, force: true });
        throw error;
      } finally {
        active--;
        reader.releaseLock();
        await file?.close();
      }
    },
    async get(token: string, libraryId: string) {
      await ready;
      const id = Ticket.parse(token.replace(/^iris-upload:/, ""));
      const directory = join(root, id);
      const metadata = Metadata.parse(
        JSON.parse(await readFile(join(directory, "upload.json"), "utf8")),
      );
      if (metadata.libraryId !== libraryId)
        throw new WebRequestError("This upload belongs to another Library.");
      const path = await realpath(join(directory, metadata.filename));
      if (!isPathInside(await realpath(root), path))
        throw new WebRequestError("This upload is unavailable.", 404);
      if ((await stat(path)).size !== metadata.size)
        throw new WebRequestError("This upload is incomplete.", 422);
      return { ...metadata, id, path };
    },
  };
}
