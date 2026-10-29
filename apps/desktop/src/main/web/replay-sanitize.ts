import { createReadStream, createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { WARCParser, WARCRecord, WARCSerializer } from "warcio";

const REPLAY_WARC_HEADERS = new Set([
  "warc-record-id",
  "warc-payload-digest",
  "warc-refers-to",
  "warc-refers-to-target-uri",
  "warc-refers-to-date",
  "warc-profile",
  "content-type",
]);
const AUTHENTICATION_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "www-authenticate",
  "proxy-authenticate",
  "authentication-info",
  "proxy-authentication-info",
]);

/** Replay receives no captured HTTP credentials. Original archives remain byte-for-byte intact. */
export async function sanitizeReplayArchive(input: {
  source: string;
  destination: string;
  signal?: AbortSignal;
  maximumRecordBytes?: number;
  maximumDecodedBytes?: number;
}) {
  const source = createReadStream(input.source);
  const destination = createWriteStream(input.destination, {
    flags: "wx",
    mode: 0o600,
  });
  let created = false;
  destination.once("open", () => {
    created = true;
  });
  const parser = new WARCParser(source, { keepHeadersCase: true });
  const maximumRecord = input.maximumRecordBytes ?? 64 * 1024 * 1024;
  const maximumDecoded = input.maximumDecodedBytes ?? 2 * 1024 * 1024 * 1024;
  let decoded = 0;
  let records = 0;
  let retained = 0;
  async function* bounded(record: WARCRecord) {
    let recordBytes = 0;
    for await (const bytes of record.reader) {
      input.signal?.throwIfAborted();
      recordBytes += bytes.byteLength;
      decoded += bytes.byteLength;
      if (recordBytes > maximumRecord || decoded > maximumDecoded)
        throw new Error("This archive exceeds the browser replay allowance.");
      yield bytes;
    }
  }
  async function* sanitized() {
    for await (const record of parser) {
      input.signal?.throwIfAborted();
      if (++records > 100000)
        throw new Error("This archive contains too many records.");
      const type = record.warcType;
      if (type !== "response" && type !== "resource" && type !== "revisit") {
        // Request/metadata records may contain cookies, authorization or form secrets.
        for await (const _bytes of bounded(record)) {
          /* Drain under the same limits. */
        }
        continue;
      }
      const target = record.warcTargetURI;
      if (!target) throw new Error("An archived response has no target URL.");
      const url = new URL(target);
      if (
        url.username ||
        url.password ||
        !["http:", "https:"].includes(url.protocol)
      )
        throw new Error("This archived URL cannot be replayed safely.");
      const warcHeaders = [...record.warcHeaders.headers].filter(([name]) =>
        REPLAY_WARC_HEADERS.has(name.toLowerCase()),
      );
      const httpHeaders = [...(record.httpHeaders?.headers ?? [])].filter(
        ([name]) => {
          const lower = name.toLowerCase();
          return (
            !lower.includes("cookie") && !AUTHENTICATION_HEADERS.has(lower)
          );
        },
      );
      const safe = WARCRecord.create(
        {
          type,
          url: target,
          date: record.warcDate ?? undefined,
          warcVersion: "WARC/1.1",
          warcHeaders,
          httpHeaders,
          statusline: record.httpHeaders?.statusline,
        },
        bounded(record),
      );
      // Warcio recomputes block length/digest after headers have been removed.
      yield await WARCSerializer.serialize(safe, { gzip: true });
      retained++;
    }
    if (!retained) throw new Error("This archive has no replayable responses.");
  }
  try {
    await pipeline(
      Readable.from(sanitized(), { objectMode: false }),
      destination,
      { signal: input.signal },
    );
  } catch (error) {
    if (created) {
      try {
        await rm(input.destination, { force: true });
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "Replay preparation failed and its temporary file could not be removed.",
        );
      }
    }
    throw error;
  } finally {
    source.destroy();
  }
  return { records: retained, decodedBytes: decoded };
}
