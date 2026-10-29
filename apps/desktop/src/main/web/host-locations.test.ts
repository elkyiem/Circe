import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { HostLocationListRequestSchema } from "../../shared/web-host-locations";
import { createHostLocations } from "./host-locations";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const temporary = await mkdtemp(join(tmpdir(), "circe-host-locations-"));
  roots.push(temporary);
  const root = await realpath(temporary);
  await mkdir(join(root, "safe"));
  const service = createHostLocations({
    roots: async () => [{ name: "Mac host", path: root }],
  });
  const scope = { library: "library", session: "session" };
  const list = (handle?: string) =>
    service.list(
      HostLocationListRequestSchema.parse({
        action: "list",
        purpose: "parent",
        handle,
      }),
      scope,
    );
  const initial = await list();
  const first = initial.entries[0];
  if (!first) throw new Error("Missing host root");
  return { root, service, scope, list, first };
}
it("uses scoped selections and rejects foreign sessions, Libraries and purposes", async () => {
  const { service, scope, first } = await fixture();
  await expect(service.parent(first.handle, "parent", scope)).resolves.toBe(
    first.path,
  );
  for (const other of [
    { ...scope, session: "other" },
    { ...scope, library: "other" },
  ])
    await expect(service.parent(first.handle, "parent", other)).rejects.toThrow(
      "expired",
    );
  await expect(service.parent(first.handle, "backup", scope)).rejects.toThrow(
    "expired",
  );
  await expect(service.parent(first.path, "parent", scope)).rejects.toThrow(
    "expired",
  );
});
it("denies traversal and symlink escapes without creating destination files", async () => {
  const { root, service, scope, list, first } = await fixture();
  const outside = await mkdtemp(join(tmpdir(), "circe-host-outside-"));
  roots.push(outside);
  await symlink(outside, join(root, "escape"));
  const listing = await list(first.handle);
  expect(listing.entries.map((entry) => entry.name)).toEqual(["safe"]);
  await expect(
    service.destination(
      { parent: first.handle, name: "../escape" },
      "parent",
      scope,
    ),
  ).rejects.toThrow();
  await expect(
    service.destination(
      { parent: first.handle, name: "Fresh" },
      "parent",
      scope,
    ),
  ).resolves.toBe(join(root, "Fresh.pond"));
  expect(await readdir(root)).toEqual(
    expect.arrayContaining(["safe", "escape"]),
  );
  expect(await readdir(root)).not.toContain("Fresh.pond");
});
it("rejects folder replacement and refreshes its selection on a new browse", async () => {
  const { root, service, scope, list, first } = await fixture();
  const old = (await list(first.handle)).entries[0];
  if (!old) throw new Error("Missing folder");
  await rename(join(root, "safe"), join(root, "retired"));
  await mkdir(join(root, "safe"));
  await expect(service.parent(old.handle, "parent", scope)).rejects.toThrow(
    "replaced",
  );
  const fresh = (await list(first.handle)).entries.find(
    (entry) => entry.name === "safe",
  );
  if (!fresh) throw new Error("Missing replacement");
  expect(fresh.handle).not.toBe(old.handle);
  await expect(service.parent(fresh.handle, "parent", scope)).resolves.toBe(
    join(root, "safe"),
  );
});
it("keeps Library bundles atomic and binds their metadata identity", async () => {
  const { root, service, scope, list, first } = await fixture();
  const bundle = join(root, "Archive.pond");
  await mkdir(bundle);
  await writeFile(
    join(bundle, "metadata.json"),
    JSON.stringify({ id: "first" }),
  );
  const entry = (await list(first.handle)).entries.find(
    (entry) => entry.name === "Archive.pond",
  );
  if (!entry) throw new Error("Missing Library");
  expect(entry.kind).toBe("library");
  await expect(list(entry.handle)).rejects.toThrow("whole");
  await expect(service.parent(entry.handle, "parent", scope)).rejects.toThrow(
    "outside a Library",
  );
  await writeFile(
    join(bundle, "metadata.json"),
    JSON.stringify({ id: "second" }),
  );
  await expect(service.source(entry.handle, "parent", scope)).rejects.toThrow(
    "changed",
  );
});
it("expires selections and creates folders only on an explicit request", async () => {
  const { root } = await fixture();
  let now = 0;
  const service = createHostLocations({
    roots: async () => [{ name: "Mac", path: root }],
    now: () => now,
  });
  const scope = { library: "library", session: "session" };
  const first = (
    await service.list(
      HostLocationListRequestSchema.parse({
        action: "list",
        purpose: "parent",
      }),
      scope,
    )
  ).entries[0];
  if (!first) throw new Error("Missing host root");
  const folder = await service.mkdir(
    {
      action: "mkdir",
      purpose: "parent",
      parent: first.handle,
      name: "New folder",
    },
    scope,
  );
  expect(folder.path).toBe(join(root, "New folder"));
  await expect(
    service.mkdir(
      {
        action: "mkdir",
        purpose: "parent",
        parent: first.handle,
        name: "New folder",
      },
      scope,
    ),
  ).rejects.toThrow("already exists");
  now = 600001;
  await expect(service.parent(folder.handle, "parent", scope)).rejects.toThrow(
    "expired",
  );
});

it("rejects ordinary folders before a native Library inventory can read them", async () => {
  const { service, scope, first } = await fixture();
  await expect(service.source(first.handle, "parent", scope)).rejects.toThrow(
    "Choose a Pond Library",
  );
});
