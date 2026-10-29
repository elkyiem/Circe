import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ulid } from "ulid";
import { afterEach, expect, it } from "vitest";
import type { TransferRequest } from "../../shared/transfer-contracts";
import { type ExportItem, exportFiles } from "./export-files";
import {
  checkTransferCancellation,
  createTransferJobStore,
  transferPhase,
} from "./transfer-jobs";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pond-transfer-jobs-"));
  roots.push(root);
  const destination = join(root, "output");
  await mkdir(destination);
  const directory = join(root, "jobs");
  const request: TransferRequest = {
    kind: "export_files",
    origin: root,
    destination,
    ids: ["first", "second"],
  };
  const items: ExportItem[] = [];
  for (const id of request.ids ?? []) {
    const source = join(root, id);
    await mkdir(source);
    await writeFile(join(source, "original.txt"), id);
    items.push({
      directory: source,
      folderIds: [],
      save: {
        id,
        title: id,
        url: "",
        tags: [],
        notes: null,
        files: [
          {
            path: "original.txt",
            kind: "file",
            size: id.length,
            sha256: createHash("sha256").update(id).digest("hex"),
          },
        ],
      },
    });
  }
  return {
    root,
    destination,
    directory,
    request,
    items,
    store: createTransferJobStore(directory),
  };
}
function deferred() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
it("persists cancellation and reuses verified completed originals on retry after store reload", async () => {
  const { store, request, items, destination, directory } = await fixture();
  const first = items[0];
  if (!first) throw new Error("Missing first original");
  const ready = deferred();
  const resume = deferred();
  const run = store.run(request, async () => {
    await exportFiles({ directory: destination, items: [first] });
    ready.release();
    await resume.promise;
    checkTransferCancellation();
  });
  await ready.promise;
  const [job] = await store.list();
  if (!job) throw new Error("Missing transfer");
  await store.cancel(job.id);
  resume.release();
  await expect(run).rejects.toThrow("canceled");
  expect((await store.list())[0]?.status).toBe("cancelled");
  const reopened = createTransferJobStore(directory);
  await reopened.run(
    request,
    () => exportFiles({ directory: destination, items }),
    job.id,
  );
  expect(
    (await readdir(destination)).filter((name) => name.endsWith(".txt")).sort(),
  ).toEqual(["first.txt", "second.txt"]);
  expect((await reopened.list())[0]?.status).toBe("completed");
});
it("keeps user changes to a checkpointed output and copies to a fresh name", async () => {
  const { store, request, items, destination } = await fixture();
  const first = items[0];
  if (!first) throw new Error("Missing first original");
  await expect(
    store.run(request, async () => {
      await exportFiles({ directory: destination, items: [first] });
      throw new Error("Interrupted fixture");
    }),
  ).rejects.toThrow("Interrupted fixture");
  const [job] = await store.list();
  if (!job) throw new Error("Missing job");
  await writeFile(join(destination, "first.txt"), "other");
  await store.run(
    request,
    () => exportFiles({ directory: destination, items }),
    job.id,
  );
  expect(await readFile(join(destination, "first.txt"), "utf8")).toBe("other");
  expect(await readFile(join(destination, "first-1.txt"), "utf8")).toBe(
    "first",
  );
});
it("recovers unfinished jobs as interrupted without starting work automatically", async () => {
  const { request, directory } = await fixture();
  await mkdir(directory);
  await writeFile(
    join(directory, "jobs.json"),
    JSON.stringify([
      {
        id: ulid(),
        request,
        status: "running",
        phase: "Copying",
        completed: 1,
        total: 2,
        bytes: 5,
        currentFile: null,
        error: null,
        startedAt: 1,
        updatedAt: 1,
      },
    ]),
  );
  const reopened = createTransferJobStore(directory);
  const [job] = await reopened.list();
  expect(job?.status).toBe("interrupted");
  expect(job?.completed).toBe(1);
  expect(
    JSON.parse(await readFile(join(directory, "jobs.json"), "utf8"))[0].status,
  ).toBe("interrupted");
});
it("isolates cancellation between parallel transfers", async () => {
  const { store, request } = await fixture();
  const ready = deferred();
  const resume = deferred();
  const stopped = store.run(request, async () => {
    await transferPhase("Waiting", 1);
    ready.release();
    await resume.promise;
    checkTransferCancellation();
  });
  await ready.promise;
  const [job] = await store.list();
  if (!job) throw new Error("Missing job");
  await store.cancel(job.id);
  await expect(
    store.run(
      { ...request, destination: `${request.destination}-another` },
      async () => "done",
    ),
  ).resolves.toBe("done");
  resume.release();
  await expect(stopped).rejects.toThrow("canceled");
});

it("reserves a retry before asynchronous checkpoint loading and admits it only once", async () => {
  const { store, request } = await fixture();
  await expect(
    store.run(request, async () => {
      throw new Error("First failure");
    }),
  ).rejects.toThrow("First failure");
  const [job] = await store.list();
  if (!job) throw new Error("Missing failed transfer");
  const ready = deferred();
  const resume = deferred();
  let started = 0;
  const operation = async () => {
    started++;
    ready.release();
    await resume.promise;
    return "done";
  };
  const first = store.run(request, operation, job.id);
  const second = store.run(request, operation, job.id);
  await expect(second).rejects.toThrow("cannot be retried");
  await ready.promise;
  expect(started).toBe(1);
  expect((await store.list())[0]?.status).toBe("running");
  resume.release();
  await expect(first).resolves.toBe("done");
  expect((await store.list())[0]?.status).toBe("completed");
});
