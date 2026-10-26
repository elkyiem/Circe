import { mkdtemp, realpath, rm } from "node:fs/promises";
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
