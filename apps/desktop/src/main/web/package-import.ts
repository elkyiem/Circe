import { randomUUID } from "node:crypto";
import {
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { TransferRequest } from "../../shared/transfer-contracts";
import type { runTransferJob } from "../core/transfer-jobs";
import { transferPhase } from "../core/transfer-jobs";
import { isPathInside } from "../lib/path-identity";
import { WebRequestError } from "./errors";
import { unzipWebDirectory } from "./unzip";

const Owner = z.strictObject({
  libraryId: z.string(),
  device: z.number(),
  inode: z.number(),
});
const Ready = z.strictObject({ device: z.number(), inode: z.number() });

export function createWebPackageImports(options: {
  root: string;
  libraryRoot(): string;
  run: typeof runTransferJob;
  importPackage(
    directory: string,
  ): Promise<{ imported: number; skipped: number }>;
  warn(error: Error): void;
}) {
  const downloads = resolve(options.root, "downloads");
  async function owned(request: TransferRequest, expected: string) {
    if (
      request.kind !== "import_package" ||
      !request.source ||
      !isPathInside(downloads, resolve(request.source))
    )
      return null;
    const path = dirname(resolve(request.source));
    const id = z.uuid().parse(basename(path));
    if (
      path !== join(downloads, id) ||
      request.source !== join(path, "expanded")
    )
      throw new WebRequestError(
        "This import source is unavailable. Choose the package again.",
        409,
      );
    const directory = await lstat(path);
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      (await realpath(path)) !== join(await realpath(downloads), id)
    )
      throw new WebRequestError(
        "This import folder changed. Choose the package again.",
        409,
      );
    const marker = Owner.parse(
      JSON.parse(await readFile(join(path, "web-import.json"), "utf8")),
    );
    if (
      marker.libraryId !== expected ||
      marker.device !== directory.dev ||
      marker.inode !== directory.ino
    )
      throw new WebRequestError(
        "This import belongs to another Library or folder.",
        409,
      );
    return { path, expanded: request.source };
  }
  async function prepare(request: TransferRequest, expected: string) {
    const directory = await owned(request, expected);
    if (!directory) return false;
    const expanded = await lstat(directory.expanded).catch(
      (cause: NodeJS.ErrnoException) => {
        if (cause.code === "ENOENT") return null;
        throw cause;
      },
    );
    if (expanded && (!expanded.isDirectory() || expanded.isSymbolicLink()))
      throw new WebRequestError(
        "This import source changed. Choose the package again.",
        409,
      );
    const readyPath = join(directory.path, "expanded-ready.json");
    const ready = await readFile(readyPath, "utf8")
      .then((text) => Ready.parse(JSON.parse(text)))
      .catch((cause: NodeJS.ErrnoException) => {
        if (cause.code === "ENOENT") return null;
        throw cause;
      });
    if (
      expanded &&
      ready?.device === expanded.dev &&
      ready.inode === expanded.ino
    )
      return true;
    if (expanded) await rm(directory.expanded, { recursive: true });
    if (ready) await rm(readyPath);
    const archive = join(directory.path, "archive.zip");
    const source = await lstat(archive);
    if (!source.isFile() || source.isSymbolicLink())
      throw new WebRequestError("Choose the original package again.", 409);
    await transferPhase("Unpacking import", 0);
    await unzipWebDirectory(archive, directory.expanded);
    const result = await lstat(directory.expanded);
    const pending = join(directory.path, `expanded-ready-${randomUUID()}.tmp`);
    try {
      await writeFile(
        pending,
        JSON.stringify({ device: result.dev, inode: result.ino }),
        { flag: "wx", mode: 0o600 },
      );
      await rename(pending, readyPath);
    } finally {
      await rm(pending, { force: true });
    }
    return true;
  }
  async function complete(request: TransferRequest, expected: string) {
    // The native job must be Completed before removing its retry source.
    try {
      const directory = await owned(request, expected);
      if (directory) await rm(directory.path, { recursive: true });
    } catch (cause) {
      options.warn(cause instanceof Error ? cause : new Error(String(cause)));
    }
  }
  return {
    prepare,
    complete,
    async start(source: string, expected: string) {
      const path = join(downloads, randomUUID());
      await mkdir(downloads, { recursive: true, mode: 0o700 });
      await mkdir(path, { mode: 0o700 });
      try {
        const directory = await lstat(path);
        await link(source, join(path, "archive.zip"));
        await writeFile(
          join(path, "web-import.json"),
          JSON.stringify({
            libraryId: expected,
            device: directory.dev,
            inode: directory.ino,
          }),
          { flag: "wx", mode: 0o600 },
        );
      } catch (cause) {
        await rm(path, { recursive: true, force: true });
        throw cause;
      }
      const request: TransferRequest = {
        kind: "import_package",
        origin: options.libraryRoot(),
        destination: options.libraryRoot(),
        source: join(path, "expanded"),
      };
      const result = await options.run(request, async () => {
        await prepare(request, expected);
        return options.importPackage(join(path, "expanded"));
      });
      await complete(request, expected);
      return { ok: true as const, ...result };
    },
  };
}
