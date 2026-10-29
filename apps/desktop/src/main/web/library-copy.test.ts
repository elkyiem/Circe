import {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createHostLocations } from "./host-locations";
import { createWebLibraryCopy } from "./library-copy";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function setup() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "circe-copy-library-")),
  );
  roots.push(root);
  const target = join(root, "Target.pond");
  await mkdir(join(target, "items"), { recursive: true });
  await writeFile(
    join(target, "metadata.json"),
    JSON.stringify({ id: "c".repeat(32), name: "Target" }),
  );
  const scope = { library: "source", session: "session" };
  const locations = createHostLocations({
    roots: async () => [{ name: "Libraries", path: root }],
  });
  const destination = (await locations.known(target, "copy", scope)).handle;
  const calls: Array<{ ids: string[]; target: string }> = [];
  const copy = createWebLibraryCopy({
    locations,
    libraryId: () => "source",
    copy: async (ids, path) => {
      calls.push({ ids, target: path });
      return { ok: true, copied: ids.length, skipped: 0 };
    },
  });
  return { target, scope, locations, destination, calls, copy };
}

it("copies through the native owner with only a validated host Library selection", async () => {
  const test = await setup();
  expect(
    await test.copy(
      { ids: ["save-a", "save-b"], destination: test.destination },
      "source",
      "session",
    ),
  ).toEqual({ ok: true, copied: 2, skipped: 0 });
  expect(test.calls).toEqual([
    { ids: ["save-a", "save-b"], target: test.target },
  ]);
});

it("rejects raw paths, another session, another role and a stale active Library", async () => {
  const test = await setup();
  const open = await test.locations.known(test.target, "open", test.scope);
  for (const input of [
    { destination: test.target, library: "source", session: "session" },
    { destination: test.destination, library: "source", session: "other" },
    { destination: open.handle, library: "source", session: "session" },
    { destination: test.destination, library: "stale", session: "session" },
  ])
    await expect(
      test.copy(
        { ids: ["save-a"], destination: input.destination },
        input.library,
        input.session,
      ),
    ).rejects.toThrow();
  expect(test.calls).toEqual([]);
});

it("never writes into a snapshot marked after selection or a replaced folder", async () => {
  const test = await setup();
  const marker = join(test.target, "pond-backup-manifest.json");
  await writeFile(marker, "broken snapshot marker");
  await expect(
    test.copy(
      { ids: ["save-a"], destination: test.destination },
      "source",
      "session",
    ),
  ).rejects.toThrow("backup snapshot");
  await rm(marker);
  await rename(test.target, `${test.target}.old`);
  await mkdir(test.target);
  await expect(
    test.copy(
      { ids: ["save-a"], destination: test.destination },
      "source",
      "session",
    ),
  ).rejects.toThrow("Library changed");
  expect(test.calls).toEqual([]);
});
