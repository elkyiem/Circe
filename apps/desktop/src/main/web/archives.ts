import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isPathInside } from "../lib/path-identity";
import { WebRequestError } from "./errors";

/** A ZIP is only the browser transfer envelope; Pond's package contents stay unchanged. */
export async function zipWebDirectory(directory: string, destination: string) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  async function visit(path: string, prefix: string) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await visit(join(path, entry.name), `${name}/`);
      else if (entry.isFile())
        zip.file(name, createReadStream(join(path, entry.name)));
      else
        throw new WebRequestError(
          "Package exports cannot contain symlinks.",
          422,
        );
    }
  }
  await visit(directory, "");
  await pipeline(
    zip.generateNodeStream({
      type: "nodebuffer",
      streamFiles: true,
      compression: "STORE",
    }),
    createWriteStream(destination, { flags: "wx", mode: 0o600 }),
  );
}

export async function unzipWebDirectory(
  source: string,
  directory: string,
  maxBytes = 1024 * 1024 * 1024,
) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await readFile(source), {
    checkCRC32: false,
  });
  const entries = Object.values(zip.files);
  if (entries.length > 20000)
    throw new WebRequestError("This package contains too many files.", 422);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let written = 0;
  for (const entry of entries) {
    const name = entry.unsafeOriginalName ?? entry.name;
    const target = resolve(directory, name.replaceAll("\\", "/"));
    if (
      isAbsolute(name) ||
      /^[A-Za-z]:/.test(name) ||
      !isPathInside(resolve(directory), target) ||
      (Number(entry.unixPermissions ?? 0) & 0o170000) === 0o120000
    )
      throw new WebRequestError("This package contains an unsafe path.", 422);
    if (entry.dir) await mkdir(target, { recursive: true, mode: 0o700 });
    else {
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          written += chunk.byteLength;
          callback(
            written > maxBytes
              ? new WebRequestError(
                  "This package expands beyond the import allowance.",
                  422,
                )
              : null,
            chunk,
          );
        },
      });
      await pipeline(
        entry.nodeStream("nodebuffer"),
        limit,
        createWriteStream(target, { flags: "wx", mode: 0o600 }),
      );
    }
  }
  return directory;
}
