import { expect, it } from "vitest";
import { ConversionPresetSchema } from "../../shared/conversion-contracts";
import { createConversionJobs } from "./conversion-jobs";

it("cancels and drains export and compression work before returning from shutdown", async () => {
  const began = Promise.withResolvers<void>();
  const cleanup = Promise.withResolvers<void>();
  let count = 0;
  const stop = async (signal: AbortSignal) => {
    if (++count === 2) began.resolve();
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    await cleanup.promise;
    throw new Error("cancelled");
  };
  const jobs = createConversionJobs({
    scope: () => "fixture",
    resolve: async (id) => id,
    async convert({ signal }) {
      await stop(signal);
      return "unused";
    },
    async compress({ signal }) {
      if (!signal) throw new Error("Missing cancellation signal");
      await stop(signal);
      return { changed: 0, skipped: 0, bytesBefore: 0, bytesAfter: 0 };
    },
  });
  const exporting = jobs.start({
    ids: ["a"],
    fileIndex: 0,
    preset,
    directory: "/output",
  });
  const compressing = jobs.startCompression({
    ids: ["b"],
    fileIndex: 0,
    mode: "quality",
    quality: 75,
  });
  await began.promise;
  let drained = false;
  const draining = jobs.cancelAll().then(() => {
    drained = true;
  });
  await Promise.resolve();
  expect(drained).toBe(false);
  cleanup.resolve();
  await draining;
  expect(jobs.status(exporting.id)?.status).toBe("cancelled");
  expect(jobs.status(compressing.id)?.status).toBe("cancelled");
});

const preset = ConversionPresetSchema.parse({
  id: "web",
  name: "Web",
  format: "webp",
});
it("cancels a running conversion and never starts the remaining selection", async () => {
  const began = Promise.withResolvers<void>();
  const finished = Promise.withResolvers<void>();
  const resolved: string[] = [];
  const jobs = createConversionJobs({
    scope: () => "fixture",
    async resolve(id) {
      resolved.push(id);
      return id;
    },
    async convert({ signal }) {
      began.resolve();
      await new Promise<void>((_, reject) =>
        signal.addEventListener(
          "abort",
          () => {
            finished.resolve();
            reject(new Error("Cancelled"));
          },
          { once: true },
        ),
      );
      return "unused";
    },
    async compress() {
      return { changed: 0, skipped: 0, bytesBefore: 0, bytesAfter: 0 };
    },
  });
  const job = jobs.start({
    ids: ["a", "b"],
    fileIndex: 0,
    preset,
    directory: "/output",
  });
  await began.promise;
  jobs.cancel(job.id);
  await finished.promise;
  await Promise.resolve();
  await Promise.resolve();
  expect(jobs.status(job.id)?.status).toBe("cancelled");
  expect(resolved).toEqual(["a"]);
  expect(jobs.status(job.id)?.outputs).toEqual([]);
});
it("reports completed outputs separately from a failed file", async () => {
  const done = Promise.withResolvers<void>();
  const jobs = createConversionJobs({
    scope: () => "fixture",
    async resolve(id) {
      return id;
    },
    async convert({ source }) {
      if (source === "bad") {
        done.resolve();
        throw new Error("Unsupported file");
      }
      return `${source}.webp`;
    },
    async compress() {
      return { changed: 0, skipped: 0, bytesBefore: 0, bytesAfter: 0 };
    },
  });
  const job = jobs.start({
    ids: ["good", "bad", "never"],
    fileIndex: 0,
    preset,
    directory: "/output",
  });
  await done.promise;
  await expect.poll(() => jobs.status(job.id)?.status).toBe("failed");
  expect(jobs.status(job.id)).toMatchObject({
    status: "failed",
    completed: 1,
    outputs: ["good.webp"],
    error: "Unsupported file",
  });
});

it("reports transactional compression progress and byte savings", async () => {
  const finished = Promise.withResolvers<void>();
  const jobs = createConversionJobs({
    scope: () => "fixture",
    async resolve(id) {
      return id;
    },
    async convert({ source }) {
      return source;
    },
    async compress({ onProgress }) {
      onProgress?.(1, 2);
      onProgress?.(2, 2);
      finished.resolve();
      return {
        changed: 2,
        skipped: 0,
        bytesBefore: 1_000,
        bytesAfter: 600,
      };
    },
  });
  const job = jobs.startCompression({
    ids: ["a", "b"],
    fileIndex: 0,
    mode: "quality",
    quality: 75,
  });
  await finished.promise;
  await Promise.resolve();
  expect(jobs.status(job.id)).toMatchObject({
    kind: "compression",
    status: "complete",
    completed: 2,
    total: 2,
    progress: 1,
    bytesBefore: 1_000,
    bytesAfter: 600,
  });
});
