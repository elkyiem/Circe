import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, expect, it } from "vitest";
import { unzipWebDirectory, zipWebDirectory } from "./archives";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function root() {
  const directory = await mkdtemp(join(tmpdir(), "iris-zip-test-"));
  directories.push(directory);
  return directory;
}
it("rejects zip traversal using the original unsanitized name", async () => {
  const directory = await root();
  const zip = new JSZip();
  zip.file("../outside.txt", "bad");
  const source = join(directory, "input.zip");
  await writeFile(source, await zip.generateAsync({ type: "nodebuffer" }));
  await expect(
    unzipWebDirectory(source, join(directory, "out")),
  ).rejects.toThrow("unsafe path");
});
it("bounds actual expanded bytes and preserves an ordinary file round trip", async () => {
  const directory = await root();
  await writeFile(join(directory, "file.txt"), "original");
  const zip = join(await root(), "input.zip");
  await zipWebDirectory(directory, zip);
  const out = join(await root(), "out");
  await unzipWebDirectory(zip, out);
  expect(await readFile(join(out, "file.txt"), "utf8")).toBe("original");
  await expect(
    unzipWebDirectory(zip, join(await root(), "out"), 2),
  ).rejects.toThrow("allowance");
});
