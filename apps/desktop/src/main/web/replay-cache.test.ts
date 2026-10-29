import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createReplayCache } from "./replay-cache";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function root() {
  const path = await mkdtemp(join(tmpdir(), "circe-replay-cache-"));
  roots.push(path);
  return path;
}
function deadProcess() {
  const child = spawnSync(process.execPath, ["-e", ""], {
    stdio: "ignore",
    timeout: 2000,
  });
  if (child.status !== 0 || !child.pid)
    throw new Error("The finite PID fixture failed.");
  return child.pid;
}
async function marked(directory: string, owner: string) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "owner.json"), owner);
  await writeFile(
    join(directory, "source.warc.gz"),
    "PRIVATE fixture derivative",
  );
}

it("creates a private owned directory and removes it idempotently without touching neighboring files", async () => {
  const directory = await root();
  const unrelated = join(directory, "unrelated.txt");
  await writeFile(unrelated, "another owner");
  const cache = createReplayCache(directory);
  const owned = await cache.create();
  expect(basename(owned)).toMatch(/^replay-[A-Za-z0-9]{6}$/);
  expect(JSON.parse(await readFile(join(owned, "owner.json"), "utf8"))).toEqual(
    { kind: "circe-replay", version: 1, pid: process.pid },
  );
  if (process.platform !== "win32") {
    expect((await stat(owned)).mode & 0o777).toBe(0o700);
    expect((await stat(join(owned, "owner.json"))).mode & 0o777).toBe(0o600);
  }
  await writeFile(join(owned, "source.warc.gz"), "private derivative");
  await cache.remove(owned);
  await cache.remove(owned);
  expect(await readdir(directory)).toEqual(["unrelated.txt"]);
  expect(await readFile(unrelated, "utf8")).toBe("another owner");
});

it("does not remove another live cache instance's directory even when its marker has the same PID", async () => {
  const directory = await root();
  const first = createReplayCache(directory);
  const firstOwned = await first.create();
  await writeFile(join(firstOwned, "source.warc.gz"), "first live derivative");
  const second = createReplayCache(directory);
  const secondOwned = await second.create();
  await second.remove(firstOwned);
  await first.remove(secondOwned);
  expect(await readFile(join(firstOwned, "source.warc.gz"), "utf8")).toBe(
    "first live derivative",
  );
  expect((await stat(secondOwned)).isDirectory()).toBe(true);
  await first.remove(firstOwned);
  await second.remove(secondOwned);
  expect(await readdir(directory)).toEqual([]);
});

it("reaps only a proven dead owner and preserves a live owner and unrelated folders", async () => {
  const directory = await root();
  const stale = join(directory, "replay-Ab12Cd");
  const live = join(directory, "replay-Li12Ve");
  const unrelated = join(directory, "unrelated-library");
  await marked(
    stale,
    JSON.stringify({ kind: "circe-replay", version: 1, pid: deadProcess() }),
  );
  await marked(
    live,
    JSON.stringify({ kind: "circe-replay", version: 1, pid: process.pid }),
  );
  await marked(
    unrelated,
    JSON.stringify({ kind: "circe-replay", version: 1, pid: deadProcess() }),
  );
  const cache = createReplayCache(directory);
  const owned = await cache.create();
  await expect(stat(stale)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(live, "source.warc.gz"), "utf8")).toBe(
    "PRIVATE fixture derivative",
  );
  expect((await stat(unrelated)).isDirectory()).toBe(true);
  await cache.remove(owned);
});

it.each([
  "missing",
  "malformed",
  "foreign-kind",
  "extra-field",
  "oversized",
  "invalid-pid",
])(
  "preserves a cache-shaped directory with an unproven %s marker",
  async (kind) => {
    const directory = await root();
    const unproven = join(directory, "replay-Qu12Et");
    const pid = deadProcess();
    let marker = JSON.stringify({ kind: "circe-replay", version: 1, pid });
    if (kind === "malformed") marker = "not JSON";
    if (kind === "foreign-kind")
      marker = JSON.stringify({ kind: "another-cache", version: 1, pid });
    if (kind === "extra-field")
      marker = JSON.stringify({
        kind: "circe-replay",
        version: 1,
        pid,
        untrusted: true,
      });
    if (kind === "oversized") marker += " ".repeat(4096);
    if (kind === "invalid-pid")
      marker = JSON.stringify({ kind: "circe-replay", version: 1, pid: -1 });
    await marked(unproven, marker);
    if (kind === "missing") await rm(join(unproven, "owner.json"));
    const cache = createReplayCache(directory);
    const owned = await cache.create();
    expect(await readFile(join(unproven, "source.warc.gz"), "utf8")).toBe(
      "PRIVATE fixture derivative",
    );
    await cache.remove(unproven);
    expect((await stat(unproven)).isDirectory()).toBe(true);
    await cache.remove(owned);
  },
);

it.skipIf(process.platform === "win32")(
  "does not follow symlink directories, owner markers or payload links during cleanup",
  async () => {
    const directory = await root();
    const target = join(directory, "outside-owner");
    await marked(
      target,
      JSON.stringify({ kind: "circe-replay", version: 1, pid: deadProcess() }),
    );
    const linkedDirectory = join(directory, "replay-Sy12Ln");
    await symlink(target, linkedDirectory);
    const linkedMarker = join(directory, "replay-Ma12Rk");
    await mkdir(linkedMarker);
    await symlink(join(target, "owner.json"), join(linkedMarker, "owner.json"));
    const stale = join(directory, "replay-St12Al");
    await marked(
      stale,
      JSON.stringify({ kind: "circe-replay", version: 1, pid: deadProcess() }),
    );
    await symlink(target, join(stale, "linked-payload"));
    const cache = createReplayCache(directory);
    const owned = await cache.create();
    await expect(stat(stale)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(target, "source.warc.gz"), "utf8")).toBe(
      "PRIVATE fixture derivative",
    );
    expect((await stat(linkedDirectory)).isDirectory()).toBe(true);
    expect((await stat(linkedMarker)).isDirectory()).toBe(true);
    await cache.remove(owned);
  },
);

it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "retains its valid ownership marker if payload cleanup fails, and permits a real retry",
  async () => {
    const directory = await root();
    const cache = createReplayCache(directory);
    const owned = await cache.create();
    const blocked = join(owned, "unreadable-payload");
    await mkdir(blocked);
    await writeFile(join(blocked, "source.warc.gz"), "private derivative");
    await chmod(blocked, 0);
    try {
      await expect(cache.remove(owned)).rejects.toMatchObject({
        code: "EACCES",
      });
      expect(
        JSON.parse(await readFile(join(owned, "owner.json"), "utf8")),
      ).toEqual({ kind: "circe-replay", version: 1, pid: process.pid });
    } finally {
      await chmod(blocked, 0o700);
    }
    await cache.remove(owned);
    expect(await readdir(directory)).toEqual([]);
  },
);
