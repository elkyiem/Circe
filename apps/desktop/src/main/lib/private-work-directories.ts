import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      error instanceof Error &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}

/** Cache ownership is explicit; cleanup never traverses a Library or another live host's directory. */
export function createPrivateWorkDirectories(
  root: string,
  purpose: "replay" | "eagle-import",
) {
  const prefix = purpose === "replay" ? "replay-" : "eagle-";
  const kind = purpose === "replay" ? "circe-replay" : "circe-eagle-import";
  const Owner = z.strictObject({
    kind: z.literal(kind),
    version: z.literal(1),
    pid: z.number().int().positive(),
  });
  const owned = new Set<string>();
  let initialized: Promise<void> | null = null;
  async function removeOwned(directory: string) {
    // Retain the ownership marker until payload cleanup finishes, including after a crash.
    for (const name of await readdir(directory)) {
      if (name !== "owner.json")
        await rm(join(directory, name), { recursive: true, force: true });
    }
    await rm(join(directory, "owner.json"), { force: true });
    await rmdir(directory);
  }
  async function initialize() {
    await mkdir(root, { recursive: true, mode: 0o700 });
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (
        !entry.isDirectory() ||
        !new RegExp(`^${prefix}[A-Za-z0-9]{6}$`).test(entry.name)
      )
        continue;
      const path = join(root, entry.name);
      const marker = join(path, "owner.json");
      let owner: z.infer<typeof Owner>;
      try {
        const stat = await lstat(marker);
        if (!stat.isFile() || stat.size > 4096) continue;
        owner = Owner.parse(JSON.parse(await readFile(marker, "utf8")));
      } catch {
        continue;
      }
      if (!processAlive(owner.pid)) await removeOwned(path);
    }
  }
  return {
    async create() {
      initialized ??= initialize().catch((error: Error) => {
        initialized = null;
        throw error;
      });
      await initialized;
      const directory = await mkdtemp(join(root, prefix));
      owned.add(directory);
      try {
        await writeFile(
          join(directory, "owner.json"),
          JSON.stringify({
            kind,
            version: 1,
            pid: process.pid,
          }),
          { mode: 0o600, flag: "wx" },
        );
        return directory;
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        owned.delete(directory);
        throw error;
      }
    },
    async remove(directory: string) {
      if (!owned.has(directory)) return;
      await removeOwned(directory);
      owned.delete(directory);
    },
  };
}
