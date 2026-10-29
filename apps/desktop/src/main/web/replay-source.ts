import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { byteRange } from "../lib/byte-range";
import type { PreparedReplayArchive } from "./replay-archive";

/** Only a prepared private derivative can be streamed through this adapter. */
export function replaySourceResponse(input: {
  request: Request;
  archive: Pick<PreparedReplayArchive, "file" | "size" | "revision">;
  signal: AbortSignal;
  authorized(): boolean;
  track(settled: Promise<void>): void;
}): Response {
  const { request, archive } = input;
  const headers = new Headers({
    "content-type": "application/gzip",
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "content-disposition": 'inline; filename="source.warc.gz"',
    etag: `"${archive.revision}"`,
  });
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? byteRange(rangeHeader, archive.size) : null;
  if (rangeHeader && !range) {
    headers.set("content-range", `bytes */${archive.size}`);
    return new Response(null, { status: 416, headers });
  }
  const selected = range ?? { start: 0, end: archive.size - 1 };
  headers.set("content-length", String(selected.end - selected.start + 1));
  if (range)
    headers.set(
      "content-range",
      `bytes ${range.start}-${range.end}/${archive.size}`,
    );
  if (request.method === "HEAD")
    return new Response(null, { status: range ? 206 : 200, headers });
  const reader = createReadStream(archive.file, {
    start: selected.start,
    end: selected.end,
    signal: input.signal,
  });
  const settled = new Promise<void>((resolve) => reader.once("close", resolve));
  input.track(settled);
  async function* bytes() {
    try {
      for await (const chunk of reader) {
        input.signal.throwIfAborted();
        if (!input.authorized())
          throw new Error("The archive session has ended.");
        yield Buffer.from(chunk);
      }
    } finally {
      reader.destroy();
    }
  }
  const byteStream = Readable.from(bytes(), { objectMode: false });
  // Cancellation may arrive before the generator's first pull/finally block.
  byteStream.once("close", () => reader.destroy());
  reader.on("error", (error) => byteStream.destroy(error));
  /** SAFETY: the generator yields only byte buffers; toWeb omits that specialization. */
  const body = Readable.toWeb(byteStream) as ReadableStream<Uint8Array>;
  return new Response(body, { status: range ? 206 : 200, headers });
}
