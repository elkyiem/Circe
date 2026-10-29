import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Prefs } from "@pond/schema/db";
import { afterEach, expect, it } from "vitest";
import { HostLocationListRequestSchema } from "../../shared/web-host-locations";
import { WebWatchedFolderRequestSchema } from "../../shared/web-watched-folder-contracts";
import { createHostLocations } from "./host-locations";
import { createWebWatchedFolder } from "./watched-folder";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "circe-web-watch-")),
  );
  roots.push(root);
  await mkdir(join(root, "Incoming"));
  const scope = { library: "library", session: "session" };
  const locations = createHostLocations({
    roots: async () => [{ name: "Mac host", path: root }],
  });
  const rootEntry = (
    await locations.list(
      HostLocationListRequestSchema.parse({ action: "list", purpose: "watch" }),
      scope,
    )
  ).entries[0];
  if (!rootEntry) throw new Error("Missing host root");
  const folder = (
    await locations.list(
      HostLocationListRequestSchema.parse({
        action: "list",
        purpose: "watch",
        handle: rootEntry.handle,
      }),
      scope,
    )
  ).entries[0];
  if (!folder) throw new Error("Missing watch folder");
  let prefs: Prefs["autoImport"] = { enabled: false, path: "", mode: "copy" };
  const changes: Array<{
    enabled?: boolean;
    path?: string;
    mode?: "copy" | "move";
  }> = [];
  const controller = createWebWatchedFolder({
    locations,
    libraryId: () => scope.library,
    read: async () => prefs,
    async configure(patch) {
      changes.push(patch);
      prefs = { ...prefs, ...patch };
      return { ok: true, path: prefs.path };
    },
  });
  return {
    root,
    scope,
    locations,
    folder,
    controller,
    changes,
    prefs: () => prefs,
  };
}

it("activates only the scoped selected host folder and preserves pause/resume/stop semantics", async () => {
  const test = await fixture();
  await expect(
    test.controller(
      { name: "autoImport.pickFolder", params: { folder: test.folder.handle } },
      "library",
      "session",
    ),
  ).resolves.toEqual({ ok: true, path: join(test.root, "Incoming") });
  expect(test.prefs()).toMatchObject({
    enabled: true,
    path: join(test.root, "Incoming"),
  });
  await test.controller(
    { name: "autoImport.set", params: { enabled: false } },
    "library",
    "session",
  );
  expect(test.prefs()).toMatchObject({
    enabled: false,
    path: join(test.root, "Incoming"),
  });
  await test.controller(
    { name: "autoImport.set", params: { enabled: true } },
    "library",
    "session",
  );
  await test.controller(
    { name: "autoImport.set", params: { enabled: false, path: "" } },
    "library",
    "session",
  );
  expect(test.prefs()).toMatchObject({ enabled: false, path: "" });
});

it("rejects arbitrary paths, expired/foreign selections and stale Libraries before configuring", async () => {
  const test = await fixture();
  expect(
    WebWatchedFolderRequestSchema.safeParse({
      name: "autoImport.set",
      params: { path: test.folder.path, enabled: true },
    }).success,
  ).toBe(false);
  for (const [library, session] of [
    ["other-library", "session"],
    ["library", "other-session"],
  ])
    await expect(
      test.controller(
        {
          name: "autoImport.pickFolder",
          params: { folder: test.folder.handle },
        },
        library ?? "",
        session ?? "",
      ),
    ).rejects.toThrow();
  await expect(
    test.controller(
      {
        name: "autoImport.pickFolder",
        params: { folder: crypto.randomUUID() },
      },
      "library",
      "session",
    ),
  ).rejects.toThrow("expired");
  const other = await test.locations.known(
    test.folder.path,
    "parent",
    test.scope,
  );
  await expect(
    test.controller(
      { name: "autoImport.pickFolder", params: { folder: other.handle } },
      "library",
      "session",
    ),
  ).rejects.toThrow("expired");
  expect(test.changes).toEqual([]);
});

it("reveal returns an inspect-only location instead of opening Finder on the Mac", async () => {
  const test = await fixture();
  await expect(
    test.controller(
      { name: "autoImport.reveal", params: {} },
      "library",
      "session",
    ),
  ).resolves.toMatchObject({ ok: false, reason: "missing" });
  await test.controller(
    { name: "autoImport.pickFolder", params: { folder: test.folder.handle } },
    "library",
    "session",
  );
  const result = await test.controller(
    { name: "autoImport.reveal", params: {} },
    "library",
    "session",
  );
  expect(result).toMatchObject({
    ok: true,
    location: { path: test.folder.path },
  });
  if (!("location" in result) || !result.location)
    throw new Error("Missing inspect grant");
  await expect(
    test.locations.parent(result.location.handle, "watch", test.scope),
  ).rejects.toThrow("expired");
  expect(test.changes).toHaveLength(1);
});
