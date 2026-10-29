import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ReplayPageUrlSchema } from "../../shared/web-replay-contracts";
import { readSave } from "../core/pipeline/workers/apply";
import { indexedMediaPath } from "./media";

const Manifest = z.object({
  pages: z
    .array(z.object({ url: ReplayPageUrlSchema }))
    .min(1)
    .max(100000),
});

function pageKey(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.href;
}
async function fileIdentity(path: string) {
  const canonical = await realpath(path);
  const info = await stat(canonical);
  if (!info.isFile()) throw new Error("The archive file is unavailable.");
  return {
    canonical,
    size: info.size,
    identity: JSON.stringify([
      canonical,
      info.dev,
      info.ino,
      info.size,
      info.mtimeMs,
      info.ctimeMs,
    ]),
  };
}

/** Indexed native files and their revision are authoritative; only a private sanitized derivative is served. */
export async function prepareReplayArchive(input: {
  saveId: string;
  pageUrl: string;
  directory: string;
  signal?: AbortSignal;
}) {
  const save = await readSave(input.saveId);
  const warc = save?.files.find(
    (file) => file.kind === "archive" && file.path.endsWith(".warc.gz"),
  );
  const manifest = save?.files.find((file) => file.kind === "archive_manifest");
  if (!save || !warc || !manifest)
    throw new Error("This Save has no complete web archive.");
  const [sourcePath, manifestPath] = await Promise.all([
    indexedMediaPath(input.saveId, warc.path),
    indexedMediaPath(input.saveId, manifest.path),
  ]);
  if (!sourcePath || !manifestPath)
    throw new Error("This Save's archived files are unavailable.");
  const [source, manifestFile] = await Promise.all([
    fileIdentity(sourcePath),
    fileIdentity(manifestPath),
  ]);
  if (manifestFile.size > 4 * 1024 * 1024)
    throw new Error("This archive's page list is too large.");
  const pages = [
    ...new Set(
      Manifest.parse(
        JSON.parse(await readFile(manifestFile.canonical, "utf8")),
      ).pages.map((page) => page.url),
    ),
  ];
  if (!pages.some((page) => pageKey(page) === pageKey(input.pageUrl)))
    throw new Error("This page is not part of the saved archive.");
  const revision = createHash("sha256")
    .update(
      JSON.stringify([
        input.saveId,
        warc.path,
        warc.sha256,
        source.identity,
        manifest.path,
        manifest.sha256,
        manifestFile.identity,
      ]),
    )
    .digest("hex");
  async function current(): Promise<boolean> {
    try {
      const latest = await readSave(input.saveId);
      const sameWarc = latest?.files.some(
        (file) =>
          file.kind === "archive" &&
          file.path === warc?.path &&
          file.sha256 === warc.sha256,
      );
      const sameManifest = latest?.files.some(
        (file) =>
          file.kind === "archive_manifest" &&
          file.path === manifest?.path &&
          file.sha256 === manifest.sha256,
      );
      if (!sameWarc || !sameManifest) return false;
      const [nextSource, nextManifest] = await Promise.all([
        fileIdentity(source.canonical),
        fileIdentity(manifestFile.canonical),
      ]);
      return (
        nextSource.identity === source.identity &&
        nextManifest.identity === manifestFile.identity
      );
    } catch {
      return false;
    }
  }
  const file = join(input.directory, "source.warc.gz");
  const { sanitizeReplayArchive } = await import("./replay-sanitize");
  await sanitizeReplayArchive({
    source: source.canonical,
    destination: file,
    signal: input.signal,
  });
  if (!(await current()))
    throw new Error(
      "The archive changed while opening. Reopen it to use the new version.",
    );
  const size = (await stat(file)).size;
  return { file, size, revision, pages, pageUrl: input.pageUrl, current };
}
export type PreparedReplayArchive = Awaited<
  ReturnType<typeof prepareReplayArchive>
>;
