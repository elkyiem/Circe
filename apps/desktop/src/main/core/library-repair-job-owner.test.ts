import { expect, it } from "vitest";
import type { LibraryRepairPreview } from "../../shared/library-repair-contracts";
import { libraryAccess } from "./library-access";
import { createLibraryRepairJobs } from "./library-repair-job-owner";

function fixture() {
  let scope = "first-library";
  const started = Promise.withResolvers<void>();
  const finish = Promise.withResolvers<void>();
  const discarded: string[] = [];
  const signals: AbortSignal[] = [];
  const preview: LibraryRepairPreview = {
    token: "confirmed-preview",
    expiresAt: Date.now() + 60_000,
    issues: [],
    confirmation: {
      affectedSaves: 0,
      createsBackups: false,
      canUndo: true,
      movesToTrash: false,
      rewritesMetadata: false,
      renamesFiles: false,
      regeneratesThumbnails: true,
    },
  };
  const jobs = createLibraryRepairJobs({
    scope: () => scope,
    service: {
      async preview(input) {
        if (input.signal) signals.push(input.signal);
        started.resolve();
        await finish.promise;
        return preview;
      },
      async apply(input) {
        if (input.token !== preview.token) throw new Error("Expired preview");
        if (input.signal) signals.push(input.signal);
        started.resolve();
        await finish.promise;
        return {
          kind: "thumbnails",
          result: { repaired: 1, skipped: 0, undoRecorded: true },
        };
      },
      discard(token) {
        discarded.push(token);
      },
      kindForToken: (token) => (token === preview.token ? "thumbnails" : null),
    },
  });
  return {
    jobs,
    started,
    finish,
    discarded,
    signals,
    preview,
    changeLibrary() {
      scope = "second-library";
    },
  };
}

it("drains the complete detached repair after its initiating request has returned", async () => {
  const test = fixture();
  const job = await libraryAccess.run(async () =>
    test.jobs.preview("thumbnails"),
  );
  await test.started.promise;
  const prepared = Promise.withResolvers<void>();
  let pathsChanged = false;
  const transition = libraryAccess.transition({
    prepare: async () => {
      prepared.resolve();
      await test.jobs.cancelAll();
    },
    operation: async () => {
      pathsChanged = true;
    },
    keepClosed: () => false,
  });
  try {
    await prepared.promise;
    expect(test.signals[0]?.aborted).toBe(true);
    expect(test.jobs.get(job.id)?.status).toBe("running");
    expect(pathsChanged).toBe(false);
    expect(() => test.jobs.preview("thumbnails")).toThrow("reopening");
  } finally {
    test.finish.resolve();
    await transition;
  }
  expect(pathsChanged).toBe(true);
  expect(test.jobs.get(job.id)?.status).toBe("cancelled");
  expect(test.discarded).toEqual([test.preview.token]);
  test.changeLibrary();
  expect(test.jobs.get(job.id)).toBeNull();
  expect(test.jobs.cancel(job.id)).toBeNull();
});

it("does not report apply cancellation as settled before its recoverable unit finishes", async () => {
  const test = fixture();
  const job = test.jobs.apply(test.preview.token);
  await test.started.promise;
  expect(test.jobs.cancel(job.id)?.status).toBe("running");
  expect(test.signals[0]?.aborted).toBe(true);
  test.finish.resolve();
  await test.jobs.cancelAll();
  expect(test.jobs.get(job.id)).toMatchObject({
    status: "cancelled",
    result: { repaired: 1, undoRecorded: true },
  });
});

it("retains completed preview results and rejects unconfirmed application", async () => {
  const test = fixture();
  expect(() => test.jobs.apply("unconfirmed")).toThrow("expired");
  const job = test.jobs.preview("thumbnails");
  test.finish.resolve();
  await test.started.promise;
  // A Library boundary waits for the owner lease, independently of job status polling.
  await libraryAccess.transition({
    prepare: async () => {},
    operation: async () => {},
    keepClosed: () => false,
  });
  expect(test.jobs.get(job.id)).toMatchObject({
    status: "completed",
    preview: test.preview,
  });
  expect(test.discarded).toEqual([]);
});

it("drains on quit and refuses new repairs after the owner stops", async () => {
  const test = fixture();
  const job = test.jobs.preview("thumbnails");
  await test.started.promise;
  const stopped = test.jobs.stop();
  expect(test.signals[0]?.aborted).toBe(true);
  expect(() => test.jobs.preview("thumbnails")).toThrow("stopping");
  expect(() => test.jobs.apply(test.preview.token)).toThrow("stopping");
  test.finish.resolve();
  await stopped;
  expect(test.jobs.get(job.id)?.status).toBe("cancelled");
});
