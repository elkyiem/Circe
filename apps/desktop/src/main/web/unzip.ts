import { createWriteStream } from "node:fs";
import { mkdir, open, rm, statfs } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type yauzl from "yauzl";
import { checkTransferCancellation } from "../core/transfer-jobs";
import { isPathInside } from "../lib/path-identity";
import { WebRequestError } from "./errors";

function nextEntry(zip: yauzl.ZipFile, signal: AbortSignal) {
  return new Promise<yauzl.Entry | null>((resolveEntry, reject) => {
    function cleanup() {
      zip.off("entry", entry);
      zip.off("end", end);
      signal.removeEventListener("abort", abort);
    }
    function entry(value: yauzl.Entry) {
      cleanup();
      resolveEntry(value);
    }
    function end() {
      cleanup();
      resolveEntry(null);
    }
    function abort() {
      cleanup();
      reject(signal.reason);
    }
    if (signal.aborted) {
      abort();
      return;
    }
    zip.once("entry", entry);
    zip.once("end", end);
    signal.addEventListener("abort", abort, { once: true });
    zip.readEntry();
  });
}

/** Unpack a browser envelope incrementally; the native importer still owns its contents. */
export async function unzipWebDirectory(
  source: string,
  directory: string,
  maxBytes = Number.MAX_SAFE_INTEGER,
  availableBytes = async () => {
    const disk = await statfs(directory);
    return Math.max(0, disk.bavail * disk.bsize - 256 * 1024 * 1024);
  },
) {
  const { default: yauzl } = await import("yauzl");
  const file = await open(source, "r");
  class ArchiveReader extends yauzl.RandomAccessReader {
    _readStreamForRange(start: number, end: number) {
      let position = start;
      return new Readable({
        read(size) {
          if (position >= end) {
            this.push(null);
            return;
          }
          const bytes = Buffer.allocUnsafe(
            Math.min(size, 64 * 1024, end - position),
          );
          void file.read(bytes, 0, bytes.length, position).then(
            (result) => {
              if (this.destroyed) return;
              position += result.bytesRead;
              this.push(
                result.bytesRead ? bytes.subarray(0, result.bytesRead) : null,
              );
            },
            (cause) =>
              this.destroy(
                cause instanceof Error ? cause : new Error(String(cause)),
              ),
          );
        },
      });
    }
    close(callback: (error: Error | null) => void) {
      void file.close().then(
        () => callback(null),
        (cause) =>
          callback(cause instanceof Error ? cause : new Error(String(cause))),
      );
    }
  }
  const zip = await (async () => {
    try {
      const metadata = await file.stat();
      return await new Promise<yauzl.ZipFile>((resolveZip, reject) => {
        yauzl.fromRandomAccessReader(
          new ArchiveReader(),
          metadata.size,
          { lazyEntries: true, autoClose: false, validateEntrySizes: true },
          (error, opened) => (error ? reject(error) : resolveZip(opened)),
        );
      });
    } catch (cause) {
      await file.close();
      throw cause;
    }
  })();
  const controller = new AbortController();
  let failure: Error | null = null;
  zip.on("error", (cause) => controller.abort(cause));
  let created = false;
  let written = 0;
  let entries = 0;
  try {
    // Never remove or merge a pre-existing destination when an archive fails.
    await mkdir(directory, { mode: 0o700 });
    created = true;
    let entry = await nextEntry(zip, controller.signal);
    while (entry) {
      checkTransferCancellation();
      controller.signal.throwIfAborted();
      if (++entries > 1000000)
        throw new WebRequestError("This package contains too many files.", 422);
      const name = entry.fileName;
      const target = resolve(directory, name.replaceAll("\\", "/"));
      if (
        isAbsolute(name) ||
        /^[A-Za-z]:/.test(name) ||
        !isPathInside(resolve(directory), target) ||
        ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000
      )
        throw new WebRequestError("This package contains an unsafe path.", 422);
      if (name.endsWith("/"))
        await mkdir(target, { recursive: true, mode: 0o700 });
      else {
        let available = await availableBytes();
        if (entry.uncompressedSize + written > maxBytes)
          throw new WebRequestError(
            "This package expands beyond the import allowance.",
            422,
          );
        if (entry.uncompressedSize > available)
          throw new WebRequestError(
            "The host needs more free disk space to unpack this package.",
            422,
          );
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        const current = entry;
        const stream = await new Promise<import("node:stream").Readable>(
          (resolveStream, reject) => {
            zip.openReadStream(current, (error, opened) =>
              error ? reject(error) : resolveStream(opened),
            );
          },
        );
        let checkedAt = written;
        const limit = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            const accept = async () => {
              checkTransferCancellation();
              controller.signal.throwIfAborted();
              written += chunk.byteLength;
              if (written > maxBytes)
                throw new WebRequestError(
                  "This package expands beyond the import allowance.",
                  422,
                );
              if (
                written - checkedAt >= 8 * 1024 * 1024 ||
                chunk.byteLength > available
              ) {
                available = await availableBytes();
                checkedAt = written;
              }
              controller.signal.throwIfAborted();
              if (chunk.byteLength > available)
                throw new WebRequestError(
                  "The host ran low on disk space. This unfinished import was removed.",
                  422,
                );
              available -= chunk.byteLength;
            };
            void accept().then(
              () => callback(null, chunk),
              (cause) =>
                callback(
                  cause instanceof Error ? cause : new Error(String(cause)),
                ),
            );
          },
        });
        await pipeline(
          stream,
          limit,
          createWriteStream(target, { flags: "wx", mode: 0o600 }),
          { signal: controller.signal },
        );
      }
      entry = await nextEntry(zip, controller.signal);
    }
  } catch (cause) {
    failure = cause instanceof Error ? cause : new Error(String(cause));
    controller.abort(cause);
    if (created) await rm(directory, { recursive: true, force: true });
    if (
      cause instanceof Error &&
      /invalid relative path|absolute path|invalid characters in fileName/i.test(
        cause.message,
      )
    )
      failure = new WebRequestError(
        "This package contains an unsafe path.",
        422,
      );
  } finally {
    zip.close();
    await file.close().catch((cause) => {
      failure ??= cause instanceof Error ? cause : new Error(String(cause));
    });
  }
  if (failure) throw failure;
  return directory;
}
