import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { isWindowsSymlinkPrivilegeError } from "../test/symlink";
import { autoImportLocation } from "./auto-import-location";

it("accepts a disjoint real folder and rejects files and both overlap directions", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "circe-watch-location-"));
  try {
    const library = join(temporary, "Library.pond");
    const watched = join(temporary, "Incoming");
    await mkdir(join(library, "items"), { recursive: true });
    await mkdir(watched);
    await writeFile(join(temporary, "file"), "content");
    expect((await autoImportLocation(watched, library)).path).toBe(
      await realpath(watched),
    );
    for (const overlap of [library, join(library, "items"), temporary])
      await expect(autoImportLocation(overlap, library)).rejects.toThrow(
        "outside the Library",
      );
    await expect(
      autoImportLocation(join(temporary, "file"), library),
    ).rejects.toThrow("Choose a folder");
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

it("resolves a symlink before excluding the active Library", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "circe-watch-symlink-"));
  try {
    const library = join(temporary, "Library.pond");
    await mkdir(library);
    const alias = join(temporary, "Innocent-looking folder");
    try {
      await symlink(library, alias);
    } catch (error) {
      if (error instanceof Error && isWindowsSymlinkPrivilegeError(error)) {
        context.skip("Windows symlink privilege is unavailable");
        return;
      }
      throw error;
    }
    await expect(autoImportLocation(alias, library)).rejects.toThrow(
      "outside the Library",
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
