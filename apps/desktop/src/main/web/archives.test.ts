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

it("removes only its new extraction after low disk space and keeps a pre-existing destination", async () => {
  const directory = await root();
  const zip = new JSZip();
  zip.file("nested/original.txt", "owned bytes");
  const source = join(directory, "input.zip");
  await writeFile(source, await zip.generateAsync({ type: "nodebuffer" }));
  const out = join(directory, "new-output");
  await expect(
    unzipWebDirectory(source, out, Number.MAX_SAFE_INTEGER, async () => 0),
  ).rejects.toThrow("free disk space");
  await expect(
    readFile(join(out, "nested", "original.txt")),
  ).rejects.toMatchObject({ code: "ENOENT" });
  const existing = join(directory, "existing");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(existing);
  await writeFile(join(existing, "personal.txt"), "leave untouched");
  await expect(unzipWebDirectory(source, existing)).rejects.toMatchObject({
    code: "EEXIST",
  });
  expect(await readFile(join(existing, "personal.txt"), "utf8")).toBe(
    "leave untouched",
  );
});
it("checks available storage again while a single large entry is streaming and cleans partial bytes", async () => {
  const directory = await root();
  const zip = new JSZip();
  zip.file("large.bin", Buffer.alloc(9 * 1024 * 1024));
  const source = join(directory, "input.zip");
  await writeFile(
    source,
    await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
  );
  let checks = 0;
  const out = join(directory, "new-output");
  await expect(
    unzipWebDirectory(source, out, Number.MAX_SAFE_INTEGER, async () =>
      ++checks === 1 ? 64 * 1024 * 1024 : 0,
    ),
  ).rejects.toThrow("ran low on disk space");
  expect(checks).toBeGreaterThan(1);
  await expect(readFile(join(out, "large.bin"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("rejects archived symlinks before unpacking their targets", async () => {
  const directory = await root();
  const zip = new JSZip();
  zip.file("link", "../foreign", { unixPermissions: 0o120777 });
  const source = join(directory, "input.zip");
  await writeFile(
    source,
    await zip.generateAsync({ type: "nodebuffer", platform: "UNIX" }),
  );
  await expect(
    unzipWebDirectory(source, join(directory, "out")),
  ).rejects.toThrow("unsafe path");
});

it("reads a ZIP64 envelope without buffering it and preserves empty and Unicode files", async () => {
  const directory = await root();
  const { ZipFile } = await import("yazl");
  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const archive = new ZipFile();
  archive.addBuffer(Buffer.from("ZIP64 bytes"), "nested/é #.txt", {
    forceZip64Format: true,
  });
  archive.addBuffer(Buffer.alloc(0), "empty.txt", { forceZip64Format: true });
  const source = join(directory, "zip64.zip");
  archive.end({ forceZip64Format: true, comment: "" });
  await pipeline(archive.outputStream, createWriteStream(source));
  expect(
    (await readFile(source)).includes(Buffer.from("504b0606", "hex")),
  ).toBe(true);
  const out = join(directory, "out");
  await unzipWebDirectory(source, out);
  expect(await readFile(join(out, "nested", "é #.txt"), "utf8")).toBe(
    "ZIP64 bytes",
  );
  expect((await readFile(join(out, "empty.txt"))).length).toBe(0);
});
it("preserves an existing output and removes only its partial archive when a source is unsafe", async () => {
  const directory = await root();
  const { symlink } = await import("node:fs/promises");
  await writeFile(join(directory, "original.txt"), "original bytes");
  const output = join(await root(), "output.zip");
  await writeFile(output, "existing personal output");
  await expect(zipWebDirectory(directory, output)).rejects.toMatchObject({
    code: "EEXIST",
  });
  expect(await readFile(output, "utf8")).toBe("existing personal output");
  await rm(output);
  await symlink(join(directory, "original.txt"), join(directory, "link.txt"));
  await expect(zipWebDirectory(directory, output)).rejects.toThrow("symlinks");
  await expect(readFile(output)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(directory, "original.txt"), "utf8")).toBe(
    "original bytes",
  );
});
