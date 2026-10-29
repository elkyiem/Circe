import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { afterEach, expect, it } from "vitest";
import { WARCParser, WARCRecord, WARCSerializer } from "warcio";
import { sanitizeReplayArchive } from "./replay-sanitize";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "circe-replay-sanitize-"));
  roots.push(root);
  const body = gzipSync(Buffer.from("<h1>Interactive archived page</h1>"));
  const response = WARCRecord.create(
    {
      type: "response",
      url: "https://fixture.invalid/",
      date: "2026-01-01T00:00:00Z",
      warcVersion: "WARC/1.1",
      warcHeaders: {
        "WARC-Record-ID": "<urn:uuid:11111111-1111-4111-8111-111111111111>",
        "X-Captured-Secret": "PRIVATE_WARC_HEADER",
      },
      httpHeaders: [
        ["Content-Type", "text/html"],
        ["Content-Encoding", "gzip"],
        ["Set-Cookie", "session=PRIVATE_HTTPONLY_COOKIE; HttpOnly; Secure"],
        ["SET-COOKIE2", "legacy=PRIVATE_LEGACY_COOKIE"],
        ["X-Wabac-Preset-Cookie", "PRIVATE_PRESET_COOKIE"],
        ["Authorization", "Bearer PRIVATE_RESPONSE_AUTH"],
      ],
    },
    [body],
  );
  const request = WARCRecord.create(
    {
      type: "request",
      url: "https://fixture.invalid/",
      statusline: "POST / HTTP/1.1",
      httpHeaders: {
        Cookie: "PRIVATE_REQUEST_COOKIE",
        Authorization: "Bearer PRIVATE_REQUEST_AUTH",
      },
    },
    [Buffer.from("password=PRIVATE_FORM_SECRET")],
  );
  const original = Buffer.concat([
    await WARCSerializer.serialize(response, { gzip: true }),
    await WARCSerializer.serialize(request, { gzip: true }),
  ]);
  const source = join(root, "native.warc.gz");
  const destination = join(root, "replay.warc.gz");
  await writeFile(source, original);
  return { source, destination, original, body };
}

it("removes captured credentials and request bodies while preserving replay payloads, identity and the native archive", async () => {
  const test = await fixture();
  expect(await sanitizeReplayArchive(test)).toMatchObject({ records: 1 });
  const derivative = await readFile(test.destination);
  expect(gunzipSync(derivative).toString()).not.toContain("PRIVATE_");
  const parsed = await WARCParser.parse([derivative], {
    keepHeadersCase: true,
  });
  if (!parsed) throw new Error("Missing sanitized response");
  expect(parsed.warcTargetURI).toBe("https://fixture.invalid/");
  expect(parsed.warcDate).toBe("2026-01-01T00:00:00Z");
  expect(parsed.warcHeader("WARC-Record-ID")).toBe(
    "<urn:uuid:11111111-1111-4111-8111-111111111111>",
  );
  expect(parsed.httpHeaders?.headers.get("Content-Encoding")).toBe("gzip");
  expect(Buffer.from(await parsed.readFully())).toEqual(test.body);
  const headers = parsed.httpHeaders?.toString() ?? "";
  const block = Buffer.concat([Buffer.from(`${headers}\r\n`), test.body]);
  expect(parsed.warcBlockDigest).toBe(
    `sha256:${createHash("sha256").update(block).digest("hex")}`,
  );
  expect(await readFile(test.source)).toEqual(test.original);
  if (process.platform !== "win32")
    expect((await stat(test.destination)).mode & 0o777).toBe(0o600);
});

it("never deletes an occupied destination when exclusive creation fails", async () => {
  const test = await fixture();
  await writeFile(test.destination, "existing export");
  await expect(sanitizeReplayArchive(test)).rejects.toThrow();
  expect(await readFile(test.destination, "utf8")).toBe("existing export");
  expect(await readFile(test.source)).toEqual(test.original);
});

it("removes partial derivatives after limits, invalid input and cancellation", async () => {
  for (const reason of ["limit", "invalid", "aborted"]) {
    const test = await fixture();
    const controller = new AbortController();
    if (reason === "invalid") await writeFile(test.source, "not a WARC");
    if (reason === "aborted") controller.abort();
    await expect(
      sanitizeReplayArchive({
        ...test,
        signal: controller.signal,
        maximumRecordBytes: reason === "limit" ? 1 : undefined,
      }),
    ).rejects.toThrow();
    await expect(stat(test.destination)).rejects.toMatchObject({
      code: "ENOENT",
    });
  }
});
