import { mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createWebUploads, visitingFilename } from "./uploads";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function root() {
  const directory = await mkdtemp(join(tmpdir(), "iris-upload-test-"));
  directories.push(directory);
  return directory;
}
it("retains staged bytes across a store restart without trusting a client path", async () => {
  const directory = await root();
  const ticket = await createWebUploads(directory).put(
    new Request("http://host", { method: "PUT", body: "actual file bytes" }),
    "../../phone.txt",
    "library",
  );
  const restored = await createWebUploads(directory).get(
    ticket.token,
    "library",
  );
  expect(restored.filename).toBe("phone.txt");
  expect(restored.size).toBe(17);
  expect(restored.path.startsWith(await realpath(directory))).toBe(true);
  await expect(
    createWebUploads(directory).get(ticket.token, "another-library"),
  ).rejects.toThrow("another Library");
  await expect(
    createWebUploads(directory).get("../../outside", "library"),
  ).rejects.toThrow();
});
it("rejects streamed overflow and releases the allowance for a later upload", async () => {
  const store = createWebUploads(await root(), 4, 5);
  await expect(
    store.put(
      new Request("http://host", { method: "PUT", body: "too large" }),
      "file.txt",
      "library",
    ),
  ).rejects.toThrow("allowance");
  const ticket = await store.put(
    new Request("http://host", { method: "PUT", body: "okay" }),
    "file.txt",
    "library",
  );
  expect((await store.get(ticket.token, "library")).size).toBe(4);
  await expect(
    store.put(
      new Request("http://host", { method: "PUT", body: "xx" }),
      "more.txt",
      "library",
    ),
  ).rejects.toThrow("allowance");
});
it("normalizes cross-platform filenames and rejects empty names", () => {
  expect(visitingFilename("C:\\private\\photo.png")).toBe("photo.png");
  expect(visitingFilename(".hidden")).toBe("_.hidden");
  expect(visitingFilename("line\nfeed.txt")).toBe("line_feed.txt");
  expect(() => visitingFilename("..")).toThrow();
});

it("retains valid empty originals and their zero-byte metadata across a restart", async () => {
  const directory = await root();
  const store = createWebUploads(directory);
  const ticket = await store.put(
    new Request("http://host", { method: "PUT", body: "" }),
    "empty.txt",
    "library",
  );
  expect(ticket.size).toBe(0);
  const file = await createWebUploads(directory).get(ticket.token, "library");
  expect(file.size).toBe(0);
  await store.remove(ticket.token, "library");
  await expect(store.get(ticket.token, "library")).rejects.toThrow();
});

it("rejects insufficient disk headroom and removes a partial stream when available space drops", async () => {
  const directory = await root();
  let available = 4;
  const store = createWebUploads(
    directory,
    undefined,
    undefined,
    async () => available,
  );
  await expect(
    store.put(
      new Request("http://host", {
        method: "PUT",
        headers: { "content-length": "5" },
        body: "12345",
      }),
      "large.txt",
      "library",
    ),
  ).rejects.toThrow("free disk space");
  expect(await readdir(directory)).toEqual([]);
  let checks = 0;
  const streamed = createWebUploads(
    directory,
    undefined,
    undefined,
    async () => (++checks === 1 ? 4 : 0),
  );
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("123"));
      controller.enqueue(new TextEncoder().encode("456"));
      controller.close();
    },
  });
  const streaming: RequestInit & { duplex: "half" } = {
    method: "PUT",
    body,
    duplex: "half",
  };
  await expect(
    streamed.put(
      new Request("http://host", streaming),
      "partial.txt",
      "library",
    ),
  ).rejects.toThrow("ran low on disk space");
  expect(await readdir(directory)).toEqual([]);
  available = 8;
  const next = await store.put(
    new Request("http://host", { method: "PUT", body: "ok" }),
    "small.txt",
    "library",
  );
  expect((await store.get(next.token, "library")).size).toBe(2);
});
