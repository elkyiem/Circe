import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { QueryResult } from "../../shared/query-contracts";
import { createWebEagleImport } from "./eagle-import";
import { createWebUploads } from "./uploads";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const success: QueryResult<"saves.importEagleLibrary"> = {
  ok: true,
  imported: 1,
  skipped: 0,
  failed: 0,
  deletedSkipped: 0,
  lockedFolders: [],
  droppedFields: [],
  approximatedRules: [],
  shortcuts: { status: "missing", importable: 0, imported: 0 },
};
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "circe-eagle-upload-"));
  roots.push(root);
  const uploads = createWebUploads(join(root, "uploads"));
  const stage = async (path: string, bytes: string, library = "library") => ({
    path,
    token: (
      await uploads.put(
        new Request("http://fixture", { method: "PUT", body: bytes }),
        path.split("/").at(-1) ?? "file",
        library,
      )
    ).token,
  });
  const files = await Promise.all([
    stage("My Eagle.library/metadata.json", '{"folders":[]}'),
    stage(
      "My Eagle.library/images/item.info/metadata.json",
      '{"id":"item","name":"Native name"}',
    ),
    stage(
      "My Eagle.library/images/item.info/original # é.txt",
      "original bytes",
    ),
    stage("My Eagle.library/owner.json", "unrelated Eagle folder contents"),
  ]);
  return { root: join(root, "work"), uploads, stage, files };
}

it("assembles exact nested names and bytes, reports native progress, and removes only its private tree", async () => {
  const test = await fixture();
  const progressId = randomUUID();
  const progress: string[] = [];
  let directory = "";
  const run = createWebEagleImport({
    ...test,
    progress: (value) => progress.push(value.id),
    importLibrary: async (params, report) => {
      directory = params.path;
      expect(params.progressId).toBe(progressId);
      expect(params.importShortcuts).toBe(false);
      expect(await readFile(join(directory, "owner.json"), "utf8")).toBe(
        "unrelated Eagle folder contents",
      );
      expect(
        await readFile(
          join(directory, "images/item.info/original # é.txt"),
          "utf8",
        ),
      ).toBe("original bytes");
      expect(
        JSON.parse(
          await readFile(
            join(directory, "images/item.info/metadata.json"),
            "utf8",
          ),
        ).id,
      ).toBe("item");
      if (process.platform !== "win32")
        expect((await stat(directory)).mode & 0o777).toBe(0o700);
      report({
        id: progressId,
        processed: 1,
        total: 1,
        imported: 1,
        skipped: 0,
        failed: 0,
      });
      return success;
    },
  });
  await expect(
    run({ files: test.files, progressId, importShortcuts: false }, "library"),
  ).resolves.toEqual(success);
  expect(progress).toEqual([progressId]);
  await expect(stat(directory)).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readdir(test.root)).toEqual([]);
  const original = await test.uploads.get(
    test.files[2]?.token ?? "",
    "library",
  );
  expect(await readFile(original.path, "utf8")).toBe("original bytes");
});

it("rejects traversal, mixed roots, duplicate names and foreign Library tickets before native import", async () => {
  const test = await fixture();
  let imports = 0;
  const run = createWebEagleImport({
    ...test,
    progress() {},
    importLibrary: async () => {
      imports++;
      return success;
    },
  });
  const first = test.files[0];
  if (!first) throw new Error("Missing fixture file.");
  for (const files of [
    [{ ...first, path: "Root/../outside" }],
    [first, { ...first, path: "Other/metadata.json" }],
    [first, { ...first, path: "My Eagle.library/METADATA.JSON" }],
  ])
    await expect(run({ files }, "library")).rejects.toThrow();
  const foreign = await test.stage(
    "My Eagle.library/other.txt",
    "foreign",
    "other-library",
  );
  await expect(run({ files: [foreign] }, "library")).rejects.toThrow(
    "another Library",
  );
  expect(imports).toBe(0);
  await expect(stat(test.root)).rejects.toMatchObject({ code: "ENOENT" });
});

it("drains failed tree assembly before cleanup and never invokes native import on an incomplete tree", async () => {
  const test = await fixture();
  const first = test.files[0];
  if (!first) throw new Error("Missing fixture file.");
  let imports = 0;
  const run = createWebEagleImport({
    ...test,
    progress() {},
    importLibrary: async () => {
      imports++;
      return success;
    },
  });
  await expect(
    run(
      {
        files: [
          { ...first, path: "Root/conflict" },
          ...test.files.map((file, index) => ({
            ...file,
            path: `Root/conflict/child${index}/file.txt`,
          })),
        ],
      },
      "library",
    ),
  ).rejects.toThrow();
  expect(imports).toBe(0);
  expect(await readdir(test.root)).toEqual([]);
});

it("cleans the assembled tree after native import failure and retains uploaded originals for a retry", async () => {
  const test = await fixture();
  const run = createWebEagleImport({
    ...test,
    progress() {},
    importLibrary: async () => {
      throw new Error("native import failed");
    },
  });
  await expect(run({ files: test.files }, "library")).rejects.toThrow(
    "native import failed",
  );
  expect(await readdir(test.root)).toEqual([]);
  expect(
    (await test.uploads.get(test.files[0]?.token ?? "", "library")).size,
  ).toBeGreaterThan(0);
});
