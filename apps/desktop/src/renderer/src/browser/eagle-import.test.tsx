import { WebEagleImportSchema } from "@shared/web-files-contracts";
import { afterEach, expect, it } from "vitest";
import { createBrowserEagleImport } from "./eagle-import";

afterEach(() => window.dispatchEvent(new Event("pagehide")));
function selected(name: string) {
  const file = new File(["owned fixture"], name.split("/").at(-1) ?? "file");
  Object.defineProperty(file, "webkitRelativePath", { value: name });
  return file;
}
const ticket = (index: number) =>
  `iris-upload:00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
function fixture(
  files = [
    selected("Eagle.library/metadata.json"),
    selected("Eagle.library/images/a.info/original.txt"),
  ],
) {
  const removed: Array<{ token: string; keepalive?: boolean }> = [];
  const calls: Array<ReturnType<typeof WebEagleImportSchema.parse>> = [];
  const progress: number[] = [];
  let uploads = 0;
  const input = {
    pick: async () => files,
    upload: async () => ticket(++uploads),
    remove: async (token: string, keepalive?: boolean) => {
      removed.push({ token, keepalive });
    },
    request: async (_path: string, body: string) => {
      const value = JSON.parse(body);
      calls.push(WebEagleImportSchema.parse(value.params));
      return { ok: true, imported: 1 };
    },
    progress: (value: { processed: number }) => {
      progress.push(value.processed);
    },
  };
  return { input, removed, calls, progress, uploads: () => uploads };
}

it("keeps picker cancellation local and sends a complete relative tree with upload progress before cleaning tickets", async () => {
  const canceled = fixture([]);
  await expect(
    createBrowserEagleImport(canceled.input).pick(),
  ).resolves.toEqual({ ok: false, reason: "cancelled" });
  expect(canceled.uploads()).toBe(0);
  const test = fixture();
  const client = createBrowserEagleImport(test.input);
  const picked = await client.pick();
  if (!picked.path) throw new Error("Missing selected folder.");
  await expect(
    client.import({ path: picked.path, progressId: "progress" }),
  ).resolves.toEqual({ ok: true, imported: 1 });
  expect(test.calls[0]?.files.map((file) => file.path)).toEqual([
    "Eagle.library/metadata.json",
    "Eagle.library/images/a.info/original.txt",
  ]);
  expect(test.progress).toEqual([0, 1, 2]);
  expect(test.removed.map((file) => file.token)).toEqual([
    ticket(1),
    ticket(2),
  ]);
  await expect(client.import({ path: picked.path })).rejects.toThrow(
    "Choose the Eagle Library folder again",
  );
});

it("reuses successfully uploaded files between preview and actual import, then releases both tickets", async () => {
  const test = fixture();
  const client = createBrowserEagleImport(test.input);
  const picked = await client.pick();
  if (!picked.path) throw new Error("Missing selected folder.");
  await client.import({ path: picked.path, dryRun: true });
  expect(test.removed).toEqual([]);
  await client.import({ path: picked.path });
  expect(test.uploads()).toBe(2);
  expect(test.calls[1]?.files).toEqual(test.calls[0]?.files);
  expect(test.removed).toHaveLength(2);
});

it("waits for other uploads after one fails, then cleans the late success without invoking native import", async () => {
  const test = fixture();
  const waiting = Promise.withResolvers<string>();
  let started = 0;
  const client = createBrowserEagleImport({
    ...test.input,
    upload: async () => {
      if (++started === 1) throw new Error("upload failed");
      return waiting.promise;
    },
  });
  const picked = await client.pick();
  if (!picked.path) throw new Error("Missing selected folder.");
  const result = client
    .import({ path: picked.path })
    .catch((error: Error) => error.message);
  await Promise.resolve();
  expect(test.removed).toEqual([]);
  waiting.resolve(ticket(2));
  expect(await result).toBe("upload failed");
  expect(test.calls).toEqual([]);
  expect(test.removed.map((file) => file.token)).toEqual([ticket(2)]);
});

it("cleans an upload that completes after pagehide and prevents a late native import", async () => {
  const test = fixture([selected("Eagle.library/metadata.json")]);
  const waiting = Promise.withResolvers<string>();
  const client = createBrowserEagleImport({
    ...test.input,
    upload: () => waiting.promise,
  });
  const picked = await client.pick();
  if (!picked.path) throw new Error("Missing selected folder.");
  const result = client
    .import({ path: picked.path })
    .catch((error: Error) => error.message);
  window.dispatchEvent(new Event("pagehide"));
  waiting.resolve(ticket(1));
  expect(await result).toContain("interrupted");
  expect(test.calls).toEqual([]);
  expect(test.removed).toEqual([{ token: ticket(1), keepalive: true }]);
});

it("continues to retire late uploads after a page is restored and hidden again", async () => {
  const test = fixture([selected("Eagle.library/metadata.json")]);
  const waiting = Promise.withResolvers<string>();
  const client = createBrowserEagleImport({
    ...test.input,
    upload: () => waiting.promise,
  });
  window.dispatchEvent(new Event("pagehide"));
  const picked = await client.pick();
  if (!picked.path) throw new Error("Missing selected folder.");
  const result = client
    .import({ path: picked.path })
    .catch((error: Error) => error.message);
  window.dispatchEvent(new Event("pagehide"));
  waiting.resolve(ticket(1));
  expect(await result).toContain("interrupted");
  expect(test.calls).toEqual([]);
  expect(test.removed).toEqual([{ token: ticket(1), keepalive: true }]);
});
