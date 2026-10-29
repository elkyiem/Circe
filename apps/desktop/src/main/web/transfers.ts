import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { mapConcurrent } from "../../shared/map-concurrent";
import type { OkResult } from "../../shared/query-contracts-shared";
import type {
  TransferJob,
  TransferRequest,
} from "../../shared/transfer-contracts";
import { checkTransferCancellation } from "../core/transfer-jobs";
import type { TransferRetryOptions } from "../core/transfer-retry";
import { isPathInside } from "../lib/path-identity";
import { zipWebDirectory } from "./archives";
import { WebRequestError } from "./errors";
import type { createWebPackageImports } from "./package-import";

const ExportKind = z.enum([
  "export_files",
  "export_package",
  "export_eagle_package",
]);
const Ownership = z.strictObject({
  libraryId: z.string(),
  kind: ExportKind,
  device: z.number(),
  inode: z.number(),
});
const layouts = {
  export_files: {
    destination: "package",
    file: "download.zip",
    filename: "Saves.zip",
  },
  export_package: {
    destination: "package",
    file: "download.zip",
    filename: "Saves.pondpack.zip",
  },
  export_eagle_package: {
    destination: "download.eaglepack",
    file: "download.eaglepack",
    filename: "Saves.eaglepack",
  },
} as const;

type Directory = { id: string; path: string };
export interface WebTransferOperations<Result> {
  libraryRoot(): string;
  list(): Promise<TransferJob[]>;
  run<T>(
    request: TransferRequest,
    operation: () => Promise<T>,
    retryId?: string,
  ): Promise<T>;
  retry(id: string, options?: TransferRetryOptions<Result>): Promise<OkResult>;
  exportFiles(
    ids: readonly string[],
    destination: string,
  ): Promise<{ exported: number }>;
  exportEagle(
    ids: readonly string[],
    destination: string,
  ): Promise<{ exported: number }>;
  exportPackage(
    ids: readonly string[],
    destination: string,
  ): Promise<{ exported: number }>;
}
export function createWebTransfers<Result>(options: {
  operations: WebTransferOperations<Result>;
  imports?: Pick<
    ReturnType<typeof createWebPackageImports>,
    "prepare" | "complete"
  >;
  root: string;
  finish: (
    directory: Directory,
    filename: string,
    file: string,
    count: number,
    expected: string,
  ) => Promise<{
    ok: boolean;
    download: string;
    filename: string;
    exported: number;
    count: number;
    path: string;
    dir: string;
  }>;
}) {
  const downloads = resolve(options.root, "downloads");
  async function owned(request: TransferRequest, expected: string) {
    const path = dirname(resolve(request.destination));
    if (!isPathInside(downloads, path)) return null;
    const kind = ExportKind.parse(request.kind);
    const id = z.uuid().parse(basename(path));
    if (
      path !== join(downloads, id) ||
      basename(request.destination) !== layouts[kind].destination
    )
      throw new WebRequestError("This export destination is unavailable.", 409);
    const directory = await lstat(path);
    if (
      !directory.isDirectory() ||
      directory.isSymbolicLink() ||
      (await realpath(path)) !== join(await realpath(downloads), id)
    )
      throw new WebRequestError(
        "This export folder changed. Start a new export.",
        409,
      );
    const marker = Ownership.parse(
      JSON.parse(await readFile(join(path, "web-export.json"), "utf8")),
    );
    if (
      marker.libraryId !== expected ||
      marker.kind !== kind ||
      marker.device !== directory.dev ||
      marker.inode !== directory.ino
    )
      throw new WebRequestError(
        "This export belongs to another Library or folder. Start a new export.",
        409,
      );
    const target = await lstat(request.destination).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (target?.isSymbolicLink())
      throw new WebRequestError("This export destination changed.", 409);
    return { id, path, kind };
  }
  async function removeOutput(path: string) {
    const file = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!file) return;
    if (!file.isFile() || file.isSymbolicLink())
      throw new WebRequestError("This export destination changed.", 409);
    await rm(path);
  }
  async function complete(
    request: TransferRequest,
    exported: number,
    expected: string,
  ) {
    const directory = await owned(request, expected);
    if (!directory) return null;
    const layout = layouts[directory.kind];
    checkTransferCancellation();
    if (directory.kind !== "export_eagle_package")
      await zipWebDirectory(
        request.destination,
        join(directory.path, layout.file),
      );
    checkTransferCancellation();
    await owned(request, expected);
    return options.finish(
      directory,
      layout.filename,
      layout.file,
      exported,
      expected,
    );
  }
  async function artifactFor(job: TransferJob | undefined, expected: string) {
    if (job?.status !== "completed" || job.request.originLibraryId !== expected)
      throw new WebRequestError(
        "This transfer has no completed browser download.",
        409,
      );
    const directory = await owned(job.request, expected);
    if (!directory)
      throw new WebRequestError(
        "Download this export from its host destination.",
        409,
      );
    const metadata = z
      .strictObject({
        libraryId: z.string(),
        filename: z.string(),
        file: z.string(),
        count: z.number().int().nonnegative(),
      })
      .parse(
        JSON.parse(
          await readFile(join(directory.path, "download.json"), "utf8"),
        ),
      );
    const layout = layouts[directory.kind];
    const artifact = await lstat(join(directory.path, layout.file));
    if (
      metadata.libraryId !== expected ||
      metadata.filename !== layout.filename ||
      metadata.file !== layout.file ||
      !artifact.isFile() ||
      artifact.isSymbolicLink()
    )
      throw new WebRequestError(
        "This download is unavailable. Start a new export.",
        409,
      );
    return {
      path: join(directory.path, layout.file),
      filename: layout.filename,
      id: directory.id,
    };
  }
  async function downloadFor(job: TransferJob | undefined, expected: string) {
    const artifact = await artifactFor(job, expected);
    return {
      ok: true as const,
      download: `/web/download/${artifact.id}`,
      filename: artifact.filename,
    };
  }
  return {
    async artifact(id: string, expected: string) {
      return artifactFor(
        (await options.operations.list()).find((job) => job.id === id),
        expected,
      );
    },
    async download(id: string, expected: string) {
      return downloadFor(
        (await options.operations.list()).find((job) => job.id === id),
        expected,
      );
    },
    async list(expected: string) {
      const jobs = await options.operations.list();
      return mapConcurrent(jobs, 8, async (job) => {
        if (
          job.status !== "completed" ||
          !ExportKind.safeParse(job.request.kind).success
        )
          return job;
        try {
          await downloadFor(job, expected);
          return { ...job, browserDownload: true };
        } catch {
          return job;
        }
      });
    },
    async export(
      kind: z.infer<typeof ExportKind>,
      ids: string[],
      expected: string,
    ) {
      const directory = { id: randomUUID(), path: "" };
      directory.path = join(downloads, directory.id);
      await mkdir(downloads, { recursive: true, mode: 0o700 });
      await mkdir(directory.path, { mode: 0o700 });
      const identity = await lstat(directory.path);
      await writeFile(
        join(directory.path, "web-export.json"),
        JSON.stringify({
          libraryId: expected,
          kind,
          device: identity.dev,
          inode: identity.ino,
        }),
        { flag: "wx", mode: 0o600 },
      );
      const request: TransferRequest = {
        kind,
        origin: options.operations.libraryRoot(),
        destination: join(directory.path, layouts[kind].destination),
        ids,
      };
      return options.operations.run(request, async () => {
        await owned(request, expected);
        let result: { exported: number };
        if (kind === "export_eagle_package")
          result = await options.operations.exportEagle(
            ids,
            request.destination,
          );
        else if (kind === "export_package")
          result = await options.operations.exportPackage(
            ids,
            request.destination,
          );
        else {
          await mkdir(request.destination, { mode: 0o700 });
          result = await options.operations.exportFiles(
            ids,
            request.destination,
          );
        }
        return complete(request, result.exported, expected);
      });
    },
    async retry(
      id: string,
      expected: string,
      retryOptions: { requireLibraryIdentity?: boolean } = {},
    ) {
      let download: Awaited<ReturnType<typeof complete>> = null;
      let importRequest: TransferRequest | null = null;
      let requireLibraryIdentity = true;
      if (retryOptions.requireLibraryIdentity === false) {
        const job = (await options.operations.list()).find(
          (entry) => entry.id === id,
        );
        // Native legacy jobs retain their original path-based retry policy.
        // Browser staging always requires an explicit Library identity.
        requireLibraryIdentity =
          !job ||
          isPathInside(downloads, resolve(job.request.destination)) ||
          (!!job.request.source &&
            isPathInside(downloads, resolve(job.request.source)));
      }
      const result = await options.operations.retry(id, {
        wait: true,
        requireLibraryIdentity,
        prepare: async (request) => {
          if (await options.imports?.prepare(request, expected))
            importRequest = request;
          const directory = await owned(request, expected);
          if (!directory) return;
          await removeOutput(join(directory.path, "download.json"));
          if (directory.kind === "export_eagle_package")
            await removeOutput(request.destination);
          else if (directory.kind === "export_package")
            await rm(request.destination, { recursive: true, force: true });
          if (directory.kind !== "export_eagle_package")
            await removeOutput(join(directory.path, "download.zip"));
        },
        complete: async (request, result) => {
          if (!(await owned(request, expected))) return;
          const outcome = z
            .object({ exported: z.number().int().nonnegative() })
            .parse(result);
          download = await complete(request, outcome.exported, expected);
        },
      });
      if (result.ok && importRequest)
        await options.imports?.complete(importRequest, expected);
      return download ?? result;
    },
  };
}
