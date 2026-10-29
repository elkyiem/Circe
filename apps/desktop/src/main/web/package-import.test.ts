import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import { afterEach, expect, it } from "vitest";
import type { TransferRequest } from "../../shared/transfer-contracts";
import { createTransferJobStore } from "../core/transfer-jobs";
import { createTransferRetry } from "../core/transfer-retry";
import { createWebPackageImports } from "./package-import";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "circe-package-staging-")),
  );
  roots.push(root);
  const library = join(root, "Library.pond");
  await mkdir(library);
  const source = join(root, "uploaded.zip");
  const archive = new JSZip();
  archive.file("original.txt", "portable source bytes");
  await writeFile(source, await archive.generateAsync({ type: "nodebuffer" }));
  let jobs = createTransferJobStore(join(root, "jobs"));
  const state = { fail: false, cancel: false, imported: 0 };
  const warnings: Error[] = [];
  const importPackage = async (directory: string) => {
    expect((await jobs.list())[0]?.status).toBe("running");
    if (state.fail) throw new Error("Fixture import failure");
    await copyFile(
      join(directory, "original.txt"),
      join(library, "copied.txt"),
    );
    state.imported++;
    return { imported: 1, skipped: 0 };
  };
  const run = <T>(
    request: TransferRequest,
    operation: () => Promise<T>,
    id?: string,
  ) =>
    jobs.run(
      { ...request, originLibraryId: "library" },
      async () => {
        if (state.cancel) {
          const job = (await jobs.list())[0];
          if (!job) throw new Error("No active job");
          await jobs.cancel(job.id);
        }
        return operation();
      },
      id,
    );
  const packages = createWebPackageImports({
    root: join(root, "web"),
    libraryRoot: () => library,
    run,
    importPackage,
    warn: (error) => warnings.push(error),
  });
  const retry = createTransferRetry({
    list: () => jobs.list(),
    libraryRoot: () => library,
    libraryId: () => "library",
    run,
    execute: (request) => {
      if (!request.source) throw new Error("Missing source");
      return importPackage(request.source);
    },
    warn: (error) => warnings.push(error),
  });
  async function retryJob() {
    const job = (await jobs.list())[0];
    if (!job) throw new Error("Missing retained job");
    const result = await retry(job.id, {
      wait: true,
      requireLibraryIdentity: true,
      prepare: async (request) => {
        await packages.prepare(request, "library");
      },
    });
    if (result.ok) await packages.complete(job.request, "library");
    return result;
  }
  return {
    root,
    source,
    library,
    state,
    warnings,
    packages,
    retryJob,
    jobs: () => jobs,
    reopen: () => {
      jobs = createTransferJobStore(join(root, "jobs"));
    },
  };
}
it("keeps its raw archive and complete unpacked source through failure/restart, then retires them after Completed", async () => {
  const test = await fixture();
  test.state.fail = true;
  await expect(test.packages.start(test.source, "library")).rejects.toThrow(
    "import failure",
  );
  const job = (await test.jobs().list())[0];
  if (!job?.request.source) throw new Error("Missing job source");
  const work = dirname(job.request.source);
  expect(await readFile(join(work, "expanded", "original.txt"), "utf8")).toBe(
    "portable source bytes",
  );
  await rm(test.source);
  test.reopen();
  test.state.fail = false;
  expect(await test.retryJob()).toEqual({ ok: true });
  expect(await readFile(join(test.library, "copied.txt"), "utf8")).toBe(
    "portable source bytes",
  );
  expect((await test.jobs().list())[0]?.status).toBe("completed");
  await expect(readFile(join(work, "archive.zip"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(test.warnings).toEqual([]);
});
it("retains a cancelled pre-unpack job's archive and reconstructs its source on retry", async () => {
  const test = await fixture();
  test.state.cancel = true;
  await expect(test.packages.start(test.source, "library")).rejects.toThrow(
    "canceled",
  );
  expect((await test.jobs().list())[0]?.status).toBe("cancelled");
  expect(test.state.imported).toBe(0);
  await rm(test.source);
  test.state.cancel = false;
  expect(await test.retryJob()).toEqual({ ok: true });
  expect(test.state.imported).toBe(1);
});
it("rebuilds a crash's unready partial extraction and rejects another Library", async () => {
  const test = await fixture();
  test.state.cancel = true;
  await expect(test.packages.start(test.source, "library")).rejects.toThrow();
  const job = (await test.jobs().list())[0];
  if (!job?.request.source) throw new Error("Missing source");
  await mkdir(job.request.source);
  await writeFile(join(job.request.source, "partial-only.txt"), "incomplete");
  await expect(
    test.packages.prepare(job.request, "other-library"),
  ).rejects.toThrow("another Library");
  test.state.cancel = false;
  await test.retryJob();
  expect(await readFile(join(test.library, "copied.txt"), "utf8")).toBe(
    "portable source bytes",
  );
});
it("refuses a replaced work folder and preserves the replacement's files", async () => {
  const test = await fixture();
  test.state.fail = true;
  await expect(test.packages.start(test.source, "library")).rejects.toThrow();
  const job = (await test.jobs().list())[0];
  if (!job?.request.source) throw new Error("Missing source");
  const work = dirname(job.request.source);
  await rename(work, `${work}.owned`);
  await mkdir(work);
  await writeFile(join(work, "personal.txt"), "untouched");
  await expect(test.packages.prepare(job.request, "library")).rejects.toThrow();
  await test.packages.complete(job.request, "library");
  expect(await readFile(join(work, "personal.txt"), "utf8")).toBe("untouched");
  expect(test.warnings).toHaveLength(1);
});
