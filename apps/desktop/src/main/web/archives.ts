import { constants, type ReadStream } from "node:fs";
import { lstat, open, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  checkTransferCancellation,
  transferPhase,
} from "../core/transfer-jobs";
import { WebRequestError } from "./errors";

/** Stream the browser envelope with automatic ZIP64; the native package stays unchanged. */
export async function zipWebDirectory(directory: string, destination: string) {
  const { ZipFile } = await import("yazl");
  const zip = new ZipFile();
  const controller = new AbortController();
  const inputs = new Map<ReadStream, Promise<void>>();
  const opening = new Set<Promise<void>>();
  const file = await open(destination, "wx", 0o600);
  const identity = await file.stat().catch(async (cause) => {
    await file.close();
    throw cause;
  });
  let succeeded = false;
  function stopInputs() {
    for (const input of inputs.keys()) input.destroy();
  }
  controller.signal.addEventListener("abort", stopInputs, { once: true });
  zip.on("error", (cause) => controller.abort(cause));
  const cancellation = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        checkTransferCancellation();
        callback(null, chunk);
      } catch (cause) {
        callback(cause instanceof Error ? cause : new Error(String(cause)));
      }
    },
  });
  // Attach before adding entries: yazl can start the first lazy reader immediately.
  const output = pipeline(
    zip.outputStream,
    cancellation,
    file.createWriteStream(),
    { signal: controller.signal },
  );
  void output.catch((cause) => controller.abort(cause));
  async function visit(path: string, prefix: string) {
    checkTransferCancellation();
    controller.signal.throwIfAborted();
    const folder = await lstat(path);
    if (!folder.isDirectory() || folder.isSymbolicLink())
      throw new WebRequestError(
        "Package exports cannot contain symlinks.",
        422,
      );
    for (const entry of await readdir(path, { withFileTypes: true })) {
      checkTransferCancellation();
      controller.signal.throwIfAborted();
      const name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) await visit(join(path, entry.name), `${name}/`);
      else if (entry.isFile()) {
        const source = join(path, entry.name);
        const metadata = await lstat(source);
        if (!metadata.isFile() || metadata.isSymbolicLink())
          throw new WebRequestError(
            "Package exports cannot contain symlinks.",
            422,
          );
        zip.addReadStreamLazy(
          name,
          {
            size: metadata.size,
            mtime: metadata.mtime,
            mode: metadata.mode,
            compress: false,
          },
          (callback) => {
            if (controller.signal.aborted) {
              zip.emit("error", controller.signal.reason);
              return;
            }
            const pending = (async () => {
              try {
                const handle = await open(
                  source,
                  constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
                );
                if (controller.signal.aborted) {
                  await handle.close();
                  zip.emit("error", controller.signal.reason);
                  return;
                }
                const input = handle.createReadStream();
                inputs.set(
                  input,
                  new Promise<void>((resolveClosed) =>
                    input.once("close", () => {
                      inputs.delete(input);
                      resolveClosed();
                    }),
                  ),
                );
                input.once("error", (cause) => zip.emit("error", cause));
                callback(null, input);
              } catch (cause) {
                zip.emit(
                  "error",
                  cause instanceof Error ? cause : new Error(String(cause)),
                );
              }
            })();
            opening.add(pending);
            void pending.then(() => opening.delete(pending));
          },
        );
      } else
        throw new WebRequestError(
          "Package exports cannot contain symlinks.",
          422,
        );
    }
  }
  try {
    await transferPhase("Packaging download", 0);
    await visit(directory, "");
    zip.end();
    await output;
    succeeded = true;
  } catch (cause) {
    const failure = controller.signal.aborted
      ? controller.signal.reason
      : cause;
    controller.abort(failure);
    await output.catch(() => {});
    throw failure;
  } finally {
    await Promise.all(opening);
    const closing = [...inputs.values()];
    stopInputs();
    await Promise.all(closing);
    await file.close();
    controller.signal.removeEventListener("abort", stopInputs);
    if (!succeeded) {
      const current = await lstat(destination).catch(
        (cause: NodeJS.ErrnoException) => {
          if (cause.code === "ENOENT") return null;
          throw cause;
        },
      );
      if (
        current?.isFile() &&
        current.dev === identity.dev &&
        current.ino === identity.ino
      )
        await rm(destination);
    }
  }
}

export { unzipWebDirectory } from "./unzip";
