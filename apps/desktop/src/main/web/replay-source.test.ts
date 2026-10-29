import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import { afterEach, expect, it } from "vitest";
import { replaySourceResponse } from "./replay-source";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(size = 256 * 1024) {
  const root = await mkdtemp(join(tmpdir(), "circe-replay-source-"));
  const file = join(root, "PRIVATE-source.warc.gz");
  const bytes = Buffer.alloc(size, 71);
  await writeFile(file, bytes, { mode: 0o600 });
  const tracked: Promise<void>[] = [];
  const responses: Response[] = [];
  const controller = new AbortController();
  let authorized = true;
  const response = (method = "GET", range?: string) => {
    const headers = new Headers();
    if (range) headers.set("range", range);
    const result = replaySourceResponse({
      request: new Request("https://archive.test/archive/source.warc.gz", {
        method,
        headers,
      }),
      archive: { file, size: bytes.length, revision: "fixture-revision" },
      signal: controller.signal,
      authorized: () => authorized,
      track: (settled) => tracked.push(settled),
    });
    responses.push(result);
    return result;
  };
  cleanups.push(async () => {
    controller.abort();
    for (const result of responses)
      if (result.body && !result.body.locked)
        await result.body.cancel().catch(() => {});
    await Promise.all(tracked);
    await rm(root, { recursive: true, force: true });
  });
  return {
    file,
    bytes,
    tracked,
    controller,
    response,
    revoke() {
      authorized = false;
    },
  };
}

it("serves original selected bytes and releases its tracked read after completion", async () => {
  const test = await fixture();
  const response = test.response();
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer()).equals(test.bytes)).toBe(
    true,
  );
  await Promise.all(test.tracked);
  expect(test.tracked).toHaveLength(1);
});

it("returns HEAD and invalid-range metadata without opening a tracked file stream", async () => {
  const test = await fixture();
  const head = test.response("HEAD");
  expect(head.status).toBe(200);
  expect(head.body).toBeNull();
  expect(Number(head.headers.get("content-length"))).toBe(test.bytes.length);
  const invalid = test.response("GET", `bytes=${test.bytes.length}-`);
  expect(invalid.status).toBe(416);
  expect(invalid.body).toBeNull();
  expect(invalid.headers.get("content-range")).toBe(
    `bytes */${test.bytes.length}`,
  );
  expect(test.tracked).toHaveLength(0);
});

it("streams only the requested range and marks its complete length", async () => {
  const test = await fixture();
  const response = test.response("GET", "bytes=11-29");
  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe(
    `bytes 11-29/${test.bytes.length}`,
  );
  expect(Number(response.headers.get("content-length"))).toBe(19);
  expect(
    Buffer.from(await response.arrayBuffer()).equals(
      test.bytes.subarray(11, 30),
    ),
  ).toBe(true);
  await Promise.all(test.tracked);
});

it("cancels before the consumer's first pull and settles the actual file close event", async () => {
  const test = await fixture();
  const response = test.response();
  expect(test.tracked).toHaveLength(1);
  await response.body?.cancel();
  await Promise.all(test.tracked);
  // The tracked promise resolves from the real fs.ReadStream close event.
  // Removing the file also exercises Windows' open-file cleanup constraints.
  await rm(test.file);
  await expect(stat(test.file)).rejects.toMatchObject({ code: "ENOENT" });
  await setImmediate();
});

it("handles abort before the first consumer pull without an unhandled AbortError", async () => {
  const test = await fixture();
  const response = test.response();
  test.controller.abort();
  await expect(response.arrayBuffer()).rejects.toMatchObject({
    name: "AbortError",
  });
  await Promise.all(test.tracked);
  await setImmediate();
});

it("settles an already-aborted request without leaving an opened derivative stream", async () => {
  const test = await fixture();
  test.controller.abort();
  await expect(test.response().arrayBuffer()).rejects.toMatchObject({
    name: "AbortError",
  });
  await Promise.all(test.tracked);
  await setImmediate();
});

it("settles both consumer cancellation and a concurrent abort before first pull", async () => {
  const test = await fixture();
  const response = test.response();
  const cancelled = response.body?.cancel();
  test.controller.abort();
  await cancelled;
  await Promise.all(test.tracked);
  await setImmediate();
});

it("stops subsequent chunks when its source capability is revoked", async () => {
  const test = await fixture(4 * 1024 * 1024);
  const response = test.response();
  if (!response.body) throw new Error("Expected a source stream.");
  const reader = response.body.getReader();
  try {
    expect((await reader.read()).done).toBe(false);
    test.revoke();
    const drained = (async () => {
      while (!(await reader.read()).done) {}
    })();
    await expect(drained).rejects.toThrow("archive session has ended");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  await Promise.all(test.tracked);
});

it("propagates a missing derivative failure while settling its tracked stream", async () => {
  const test = await fixture();
  await rm(test.file);
  await expect(test.response().arrayBuffer()).rejects.toMatchObject({
    code: "ENOENT",
  });
  await Promise.all(test.tracked);
});
