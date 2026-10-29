import type { Prefs } from "@pond/schema/db";
import { expect, it } from "vitest";
import { createAutoImportConfiguration } from "./auto-import-configuration";

type WatchConfig = Prefs["autoImport"];
const initial: WatchConfig = { enabled: true, path: "/Incoming", mode: "copy" };

it("serializes durable writes and setup before admitting the next configuration", async () => {
  const writing = Promise.withResolvers<void>();
  const finishWrite = Promise.withResolvers<void>();
  const starting = Promise.withResolvers<void>();
  const finishStart = Promise.withResolvers<void>();
  let stored = { ...initial };
  let reads = 0;
  const starts: WatchConfig[] = [];
  const writes: WatchConfig[] = [];
  const { configure } = createAutoImportConfiguration({
    read: async () => {
      reads++;
      return { ...stored };
    },
    normalize: async (next) => next,
    write: async (next) => {
      if (writes.length === 0) {
        writing.resolve();
        await finishWrite.promise;
      }
      stored = { ...next };
      writes.push({ ...next });
    },
    start: async () => {
      starts.push({ ...stored });
      if (starts.length === 1) {
        starting.resolve();
        await finishStart.promise;
      }
    },
  });
  const first = configure({ path: "/New Incoming" });
  await writing.promise;
  const second = configure({ mode: "move" });
  await Promise.resolve();
  expect(stored).toEqual(initial);
  expect(reads).toBe(1);
  expect(starts).toEqual([]);
  finishWrite.resolve();
  await starting.promise;
  expect(reads).toBe(1);
  expect(starts).toEqual([{ ...initial, path: "/New Incoming" }]);
  finishStart.resolve();
  await expect(first).resolves.toEqual({ ok: true, path: "/New Incoming" });
  await expect(second).resolves.toEqual({ ok: true, path: "/New Incoming" });
  expect(stored).toEqual({
    enabled: true,
    path: "/New Incoming",
    mode: "move",
  });
  expect(starts).toEqual(writes);
  expect(starts).toEqual([
    { ...initial, path: "/New Incoming" },
    { enabled: true, path: "/New Incoming", mode: "move" },
  ]);
});

it("rejects invalid locations without changing preferences or restarting the current worker", async () => {
  let stored = { ...initial };
  let writes = 0;
  let starts = 0;
  const { configure } = createAutoImportConfiguration({
    read: async () => ({ ...stored }),
    normalize: async (next) => {
      if (next.path === "/Library.pond")
        throw new Error("Watched folder overlaps the Library.");
      return next;
    },
    write: async (next) => {
      writes++;
      stored = { ...next };
    },
    start: async () => {
      starts++;
    },
  });
  await expect(configure({ path: "/Library.pond" })).rejects.toThrow(
    "overlaps",
  );
  expect(stored).toEqual(initial);
  expect(writes).toBe(0);
  expect(starts).toBe(0);
  await expect(configure({ mode: "move" })).resolves.toEqual({
    ok: true,
    path: initial.path,
  });
  expect(stored).toEqual({ ...initial, mode: "move" });
});

it("restores the prior durable preferences and worker when new setup fails, then admits later changes", async () => {
  const failure = new Error("Corrupt watched-folder checkpoints");
  let stored = { ...initial };
  let running: string | null = initial.path;
  const writes: WatchConfig[] = [];
  const starts: string[] = [];
  const { configure } = createAutoImportConfiguration({
    read: async () => ({ ...stored }),
    normalize: async (next) => next,
    write: async (next) => {
      stored = { ...next };
      writes.push({ ...next });
    },
    start: async () => {
      running = null;
      starts.push(stored.path);
      if (stored.path === "/Broken") throw failure;
      if (stored.enabled) running = stored.path;
    },
  });
  await expect(configure({ path: "/Broken", mode: "move" })).rejects.toBe(
    failure,
  );
  expect(stored).toEqual(initial);
  expect(running).toBe(initial.path);
  expect(starts).toEqual(["/Broken", initial.path]);
  expect(writes).toEqual([
    { ...initial, path: "/Broken", mode: "move" },
    initial,
  ]);
  await expect(configure({ enabled: false })).resolves.toEqual({
    ok: true,
    path: initial.path,
  });
  expect(stored).toEqual({ ...initial, enabled: false });
  expect(running).toBe(null);
});

it("leaves watching explicitly paused if both setup and recovery fail", async () => {
  const startup = new Error("New folder disappeared");
  const recovery = new Error("Previous folder unavailable");
  let stored = { ...initial };
  let running: string | null = initial.path;
  const writes: WatchConfig[] = [];
  const { configure } = createAutoImportConfiguration({
    read: async () => ({ ...stored }),
    normalize: async (next) => next,
    write: async (next) => {
      stored = { ...next };
      writes.push({ ...next });
    },
    start: async () => {
      running = null;
      if (stored.path === "/Broken") throw startup;
      if (stored.path === initial.path && stored.enabled) throw recovery;
      if (stored.enabled) running = stored.path;
    },
  });
  const operation = configure({ path: "/Broken" });
  await expect(operation).rejects.toMatchObject({
    name: "AggregateError",
    errors: [startup, recovery],
    message: expect.stringContaining("Watching is paused"),
  });
  expect(writes).toEqual([
    { ...initial, path: "/Broken" },
    initial,
    { ...initial, enabled: false },
  ]);
  expect(stored).toEqual({ ...initial, enabled: false });
  expect(running).toBe(null);
  await expect(
    configure({ enabled: true, path: "/Recovered" }),
  ).resolves.toEqual({ ok: true, path: "/Recovered" });
  expect(running).toBe("/Recovered");
});

it("does not stop the running watcher when the new preference write fails", async () => {
  const failure = new Error("Settings could not be written");
  let stored = { ...initial };
  let starts = 0;
  const { configure } = createAutoImportConfiguration({
    read: async () => ({ ...stored }),
    normalize: async (next) => next,
    write: async (next) => {
      if (next.path === "/Unwritable") throw failure;
      stored = { ...next };
    },
    start: async () => {
      starts++;
    },
  });
  await expect(configure({ path: "/Unwritable" })).rejects.toBe(failure);
  expect(stored).toEqual(initial);
  expect(starts).toBe(0);
  await expect(configure({ enabled: false })).resolves.toEqual({
    ok: true,
    path: initial.path,
  });
  expect(starts).toBe(1);
});

it("persists a paused prior configuration when rollback itself cannot be written", async () => {
  const startup = new Error("New worker failed");
  const recovery = new Error("Rollback write failed");
  let stored = { ...initial };
  const attempted: WatchConfig[] = [];
  const starts: string[] = [];
  const { configure } = createAutoImportConfiguration({
    read: async () => ({ ...stored }),
    normalize: async (next) => next,
    write: async (next) => {
      attempted.push({ ...next });
      if (next.path === initial.path && next.enabled) throw recovery;
      stored = { ...next };
    },
    start: async () => {
      starts.push(stored.path);
      throw startup;
    },
  });
  await expect(configure({ path: "/Broken" })).rejects.toMatchObject({
    name: "AggregateError",
    errors: [startup, recovery],
  });
  expect(attempted).toEqual([
    { ...initial, path: "/Broken" },
    initial,
    { ...initial, enabled: false },
  ]);
  expect(stored).toEqual({ ...initial, enabled: false });
  expect(starts).toEqual(["/Broken"]);
});

it("preserves all failure causes when the paused fallback cannot be persisted", async () => {
  const startup = new Error("New worker failed");
  const recovery = new Error("Previous worker failed");
  const pause = new Error("Paused preferences could not be written");
  let stored = { ...initial };
  const { configure } = createAutoImportConfiguration({
    read: async () => ({ ...stored }),
    normalize: async (next) => next,
    write: async (next) => {
      if (!next.enabled) throw pause;
      stored = { ...next };
    },
    start: async () => {
      throw stored.path === "/Broken" ? startup : recovery;
    },
  });
  await expect(configure({ path: "/Broken" })).rejects.toMatchObject({
    name: "AggregateError",
    errors: [startup, recovery, pause],
    message: expect.stringContaining("could not save its paused state"),
  });
});

it("seals configuration admission synchronously and keeps repeated close calls harmless", async () => {
  const calls: string[] = [];
  const manager = createAutoImportConfiguration({
    read: async () => {
      calls.push("read");
      return { ...initial };
    },
    normalize: async (next) => {
      calls.push("normalize");
      return next;
    },
    write: async () => {
      calls.push("write");
    },
    start: async () => {
      calls.push("start");
    },
  });
  const closing = manager.close();
  await expect(manager.configure({ enabled: false })).rejects.toThrow(
    "shutting down",
  );
  await closing;
  await manager.close();
  await expect(manager.configure({ path: "/Later" })).rejects.toThrow(
    "shutting down",
  );
  expect(calls).toEqual([]);
});

it("rejects queued and prewrite operations when close interrupts normalization", async () => {
  const normalizing = Promise.withResolvers<void>();
  const finishNormalize = Promise.withResolvers<void>();
  let reads = 0;
  let writes = 0;
  let starts = 0;
  const manager = createAutoImportConfiguration({
    read: async () => {
      reads++;
      return { ...initial };
    },
    normalize: async (next) => {
      normalizing.resolve();
      await finishNormalize.promise;
      return next;
    },
    write: async () => {
      writes++;
    },
    start: async () => {
      starts++;
    },
  });
  const first = manager.configure({ path: "/First" });
  await normalizing.promise;
  const second = manager.configure({ path: "/Queued" });
  const firstRejected = expect(first).rejects.toThrow("shutting down");
  const secondRejected = expect(second).rejects.toThrow("shutting down");
  let closed = false;
  const closing = manager.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  finishNormalize.resolve();
  await Promise.all([firstRejected, secondRejected, closing]);
  expect(reads).toBe(1);
  expect(writes).toBe(0);
  expect(starts).toBe(0);
});

it("finishes an admitted preference write for the next launch without starting after close", async () => {
  const writing = Promise.withResolvers<void>();
  const finishWrite = Promise.withResolvers<void>();
  let stored = { ...initial };
  let starts = 0;
  const manager = createAutoImportConfiguration({
    read: async () => ({ ...stored }),
    normalize: async (next) => next,
    write: async (next) => {
      writing.resolve();
      await finishWrite.promise;
      stored = { ...next };
    },
    start: async () => {
      starts++;
    },
  });
  const operation = manager.configure({ path: "/Next Launch", mode: "move" });
  await writing.promise;
  let closed = false;
  const closing = manager.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  expect(stored).toEqual(initial);
  finishWrite.resolve();
  await expect(operation).resolves.toEqual({ ok: true, path: "/Next Launch" });
  await closing;
  expect(stored).toEqual({ ...initial, path: "/Next Launch", mode: "move" });
  expect(starts).toBe(0);
});

it("waits for already admitted setup before close settles", async () => {
  const starting = Promise.withResolvers<void>();
  const finishStart = Promise.withResolvers<void>();
  let stored = { ...initial };
  let starts = 0;
  const manager = createAutoImportConfiguration({
    read: async () => ({ ...stored }),
    normalize: async (next) => next,
    write: async (next) => {
      stored = { ...next };
    },
    start: async () => {
      starts++;
      starting.resolve();
      await finishStart.promise;
    },
  });
  const operation = manager.configure({ path: "/Starting" });
  await starting.promise;
  let closed = false;
  const closing = manager.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  finishStart.resolve();
  await expect(operation).resolves.toEqual({ ok: true, path: "/Starting" });
  await closing;
  expect(starts).toBe(1);
  await expect(manager.configure({ enabled: true })).rejects.toThrow(
    "shutting down",
  );
});

it("drains failed setup and rollback after close without restarting the previous worker", async () => {
  const starting = Promise.withResolvers<void>();
  const finishStart = Promise.withResolvers<void>();
  const restoring = Promise.withResolvers<void>();
  const finishRestore = Promise.withResolvers<void>();
  const failure = new Error("Startup failed during shutdown");
  let stored = { ...initial };
  let starts = 0;
  const manager = createAutoImportConfiguration({
    read: async () => ({ ...stored }),
    normalize: async (next) => next,
    write: async (next) => {
      if (next.path === initial.path) {
        restoring.resolve();
        await finishRestore.promise;
      }
      stored = { ...next };
    },
    start: async () => {
      starts++;
      starting.resolve();
      await finishStart.promise;
      throw failure;
    },
  });
  const operation = manager.configure({ path: "/Broken" });
  const rejected = expect(operation).rejects.toBe(failure);
  await starting.promise;
  let closed = false;
  const closing = manager.close().then(() => {
    closed = true;
  });
  finishStart.resolve();
  await restoring.promise;
  expect(closed).toBe(false);
  finishRestore.resolve();
  await Promise.all([rejected, closing]);
  expect(stored).toEqual(initial);
  expect(starts).toBe(1);
});

it("skips recovery startup when close happens during its rollback preference write", async () => {
  const restoring = Promise.withResolvers<void>();
  const finishRestore = Promise.withResolvers<void>();
  const failure = new Error("New worker could not start");
  let stored = { ...initial };
  let starts = 0;
  const manager = createAutoImportConfiguration({
    read: async () => ({ ...stored }),
    normalize: async (next) => next,
    write: async (next) => {
      if (next.path === initial.path) {
        restoring.resolve();
        await finishRestore.promise;
      }
      stored = { ...next };
    },
    start: async () => {
      starts++;
      throw failure;
    },
  });
  const operation = manager.configure({ path: "/Broken" });
  const rejected = expect(operation).rejects.toBe(failure);
  await restoring.promise;
  const closing = manager.close();
  finishRestore.resolve();
  await Promise.all([rejected, closing]);
  expect(starts).toBe(1);
  expect(stored).toEqual(initial);
});
