import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import { afterEach, expect, it } from "vitest";
import type { TransferRequest } from "../../shared/transfer-contracts";
import { libraryAccess } from "../core/library-access";
import { runLibraryTransfer } from "../core/library-transfers";
import { createTransferJobStore } from "../core/transfer-jobs";
import { createTransferRetry } from "../core/transfer-retry";
import { createWebTransfers } from "./transfers";

const state = { root: "", finishFailure: false, fail: false };
let fixtureStore: ReturnType<typeof createTransferJobStore> | undefined;
function store() {
  if (!fixtureStore) throw new Error("No fixture store");
  return fixtureStore;
}
const exportFiles = async (_ids: readonly string[], destination: string) => {
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "original # é.txt"), "exact fixture bytes");
  if (state.fail) throw new Error("Fixture disk failure");
  return { exported: 1 };
};
const exportEagle = async (_ids: readonly string[], destination: string) => {
  if (state.fail) throw new Error("Fixture disk failure");
  await writeFile(destination, "eagle fixture bytes", { flag: "wx" });
  return { exported: 1 };
};
const exportPackage = async (_ids: readonly string[], destination: string) => {
  await mkdir(destination);
  await writeFile(join(destination, "original.txt"), "package fixture bytes");
  return { exported: 1 };
};
const nativeOwner = {
  list: () => store().list(),
  libraryRoot: () => state.root,
  libraryId: () => "library",
  run: <T>(
    request: TransferRequest,
    operation: () => Promise<T>,
    retryId?: string,
  ) =>
    libraryAccess.run(() =>
      runLibraryTransfer(() => {
        if (
          request.origin !== state.root ||
          (request.originLibraryId && request.originLibraryId !== "library")
        )
          throw new Error("The library changed before this transfer started.");
        return store().run(
          { ...request, originLibraryId: request.originLibraryId ?? "library" },
          operation,
          retryId,
        );
      }),
    ),
  execute: (request: TransferRequest) =>
    request.kind === "export_package"
      ? exportPackage(request.ids ?? [], request.destination)
      : request.kind === "export_eagle_package"
        ? exportEagle(request.ids ?? [], request.destination)
        : exportFiles(request.ids ?? [], request.destination),
  warn: (error: Error) => {
    throw error;
  },
};
const operations = {
  ...nativeOwner,
  retry: createTransferRetry(nativeOwner),
  exportFiles,
  exportPackage,
  exportEagle,
};

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
  fixtureStore = undefined;
  state.fail = false;
  state.finishFailure = false;
});
async function setup() {
  state.root = await realpath(
    await mkdtemp(join(tmpdir(), "circe-transfer-retry-")),
  );
  roots.push(state.root);
  fixtureStore = createTransferJobStore(join(state.root, "jobs"));
  const root = join(state.root, "web");
  const transfers = createWebTransfers({
    operations,
    root,
    finish: async (directory, filename, file, count, expected) => {
      if (state.finishFailure) throw new Error("Fixture receipt failure");
      await writeFile(
        join(directory.path, "download.json"),
        JSON.stringify({ libraryId: expected, filename, file, count }),
        { flag: "wx" },
      );
      return {
        ok: true,
        download: `/web/download/${directory.id}`,
        filename,
        exported: count,
        count,
        path: filename,
        dir: filename,
      };
    },
  });
  return { transfers, store: fixtureStore, root };
}
it("preserves native legacy retries without allowing identity-free browser retries", async () => {
  const { transfers, store, root } = await setup();
  await expect(
    store.run(
      {
        kind: "export_files",
        origin: state.root,
        destination: join(state.root, "native-export"),
        ids: ["fixture"],
      },
      async () => {
        throw new Error("Native legacy failure");
      },
    ),
  ).rejects.toThrow("Native legacy failure");
  const [job] = await store.list();
  if (!job) throw new Error("Missing legacy native job");
  await expect(transfers.retry(job.id, "library")).rejects.toThrow(
    "older Library",
  );
  expect((await store.list())[0]?.status).toBe("failed");
  expect(
    await transfers.retry(job.id, "library", {
      requireLibraryIdentity: false,
    }),
  ).toEqual({ ok: true });
  expect((await store.list())[0]?.status).toBe("completed");
  expect(
    await readFile(
      join(state.root, "native-export", "original # é.txt"),
      "utf8",
    ),
  ).toBe("exact fixture bytes");
  await expect(
    store.run(
      {
        kind: "export_files",
        origin: state.root,
        destination: join(root, "downloads", "legacy-web", "package"),
        ids: ["fixture"],
      },
      async () => {
        throw new Error("Web legacy failure");
      },
    ),
  ).rejects.toThrow("Web legacy failure");
  const webJob = (await store.list()).find(
    (entry) => entry.status === "failed",
  );
  if (!webJob) throw new Error("Missing legacy web job");
  await expect(
    transfers.retry(webJob.id, "library", {
      requireLibraryIdentity: false,
    }),
  ).rejects.toThrow("older Library");
});

it("retries the persisted job after reload and publishes a complete browser ZIP before Completed", async () => {
  const { transfers, store } = await setup();
  state.fail = true;
  await expect(
    transfers.export("export_files", ["fixture"], "library"),
  ).rejects.toThrow("Fixture disk failure");
  const [job] = await store.list();
  if (!job) throw new Error("Missing job");
  fixtureStore = createTransferJobStore(join(state.root, "jobs"));
  state.fail = false;
  const result = await transfers.retry(job.id, "library");
  expect(result).toMatchObject({
    ok: true,
    filename: "Saves.zip",
    exported: 1,
  });
  const zip = await JSZip.loadAsync(
    await readFile(join(dirname(job.request.destination), "download.zip")),
  );
  expect(await zip.file("original # é.txt")?.async("string")).toBe(
    "exact fixture bytes",
  );
  expect(
    JSON.parse(
      await readFile(
        join(dirname(job.request.destination), "download.json"),
        "utf8",
      ),
    ),
  ).toMatchObject({ libraryId: "library", file: "download.zip" });
  expect((await fixtureStore.list())[0]?.status).toBe("completed");
});
it("rejects a different Library and a replaced export directory without writing outside it", async () => {
  const { transfers, store, root } = await setup();
  state.fail = true;
  await expect(
    transfers.export("export_files", ["fixture"], "library"),
  ).rejects.toThrow();
  const [job] = await store.list();
  if (!job) throw new Error("Missing job");
  state.fail = false;
  await expect(transfers.retry(job.id, "other-library")).rejects.toThrow(
    "another Library",
  );
  const directory = dirname(job.request.destination);
  const foreign = join(root, "foreign");
  await mkdir(foreign);
  await rename(directory, `${directory}.owned`);
  await symlink(foreign, directory);
  await expect(transfers.retry(job.id, "library")).rejects.toThrow(
    "folder changed",
  );
  await expect(
    readFile(join(foreign, "package", "original # é.txt")),
  ).rejects.toMatchObject({ code: "ENOENT" });
});
it("returns the native retry rejection for an unknown job without accepting a host path", async () => {
  const { transfers } = await setup();
  expect(
    await transfers.retry("01M00000000000000000000000", "library"),
  ).toEqual({ ok: false, error: "This transfer can't be retried." });
});

it.each(["export_eagle_package", "export_package"] as const)(
  "retries %s after native output succeeded and receipt failed",
  async (kind) => {
    const { transfers, store } = await setup();
    state.finishFailure = true;
    await expect(
      transfers.export(kind, ["fixture"], "library"),
    ).rejects.toThrow("receipt failure");
    const [job] = await store.list();
    if (!job) throw new Error("Missing job");
    state.finishFailure = false;
    await expect(transfers.retry(job.id, "library")).resolves.toMatchObject({
      ok: true,
      exported: 1,
    });
    const recovered = createWebTransfers({
      operations,
      root: join(state.root, "web"),
      finish: async () => {
        throw new Error("A recovered download must not re-export");
      },
    });
    await expect(recovered.download(job.id, "library")).resolves.toMatchObject({
      ok: true,
      download: expect.stringMatching(/^\/web\/download\//),
    });
    expect((await recovered.list("library"))[0]?.browserDownload).toBe(true);
    await expect(recovered.download(job.id, "another-library")).rejects.toThrow(
      "no completed browser download",
    );
  },
);

it("rejects unbound legacy jobs and a different Library identity at the same root before native work", async () => {
  const { transfers, store } = await setup();
  for (const originLibraryId of [undefined, "replaced-library"]) {
    await expect(
      store.run(
        {
          kind: "export_files",
          origin: state.root,
          originLibraryId,
          destination: join(state.root, "legacy-output"),
          ids: ["fixture"],
        },
        async () => {
          throw new Error("Old interrupted job");
        },
      ),
    ).rejects.toThrow();
    const job = (await store.list()).find(
      (entry) => entry.request.originLibraryId === originLibraryId,
    );
    if (!job) throw new Error("Missing legacy fixture job");
    await expect(transfers.retry(job.id, "library")).rejects.toThrow(
      "older Library",
    );
    await expect(
      readFile(join(state.root, "legacy-output", "original # é.txt")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }
});
