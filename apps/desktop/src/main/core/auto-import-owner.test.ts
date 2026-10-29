import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAutoImportOwner } from "./auto-import-owner";
import { LibraryTransitionError, libraryAccess } from "./library-access";

const owners: Array<ReturnType<typeof createAutoImportOwner>> = [];
const releases: Array<() => void> = [];
const transitions: Promise<void>[] = [];

function gate() {
  const deferred = Promise.withResolvers<void>();
  releases.push(deferred.resolve);
  return deferred;
}

/** A stopped worker admits no new scan and waits for its already admitted scan. */
function watchedWorker(work: (scan: number) => Promise<void> = async () => {}) {
  let stopped = false;
  let active = Promise.resolve();
  const calls = { scans: 0, stops: 0, drained: false };
  return {
    calls,
    scan() {
      active = active
        .catch(() => {})
        .then(async () => {
          if (stopped) return;
          calls.scans++;
          await work(calls.scans);
        });
      return active;
    },
    async stop() {
      calls.stops++;
      stopped = true;
      await active;
      calls.drained = true;
    },
  };
}

function own(create: () => Promise<ReturnType<typeof watchedWorker> | null>) {
  const warnings: Error[] = [];
  const owner = createAutoImportOwner({
    create,
    warn: (error) => warnings.push(error),
  });
  owners.push(owner);
  return { owner, warnings };
}

beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await Promise.all(owners.splice(0).map((owner) => owner.stop()));
  await Promise.allSettled(transitions.splice(0));
  vi.useRealTimers();
});

it("drains an initial scan on stop and leaves no overlapping scans or timer", async () => {
  const entered = gate();
  const finish = gate();
  const worker = watchedWorker(async () => {
    entered.resolve();
    await finish.promise;
  });
  const { owner, warnings } = own(async () => worker);
  const starting = owner.start();
  await entered.promise;
  await vi.advanceTimersByTimeAsync(3000);
  expect(worker.calls.scans).toBe(1);
  let stopped = false;
  const stopping = owner.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  expect(worker.calls.drained).toBe(false);
  finish.resolve();
  await Promise.all([starting, stopping]);
  expect(worker.calls.drained).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await vi.advanceTimersByTimeAsync(5000);
  expect(worker.calls.scans).toBe(1);
  expect(warnings).toEqual([]);
});

it("invalidates both pending replacements when stop interrupts a draining old scan", async () => {
  const entered = gate();
  const finish = gate();
  const previous = watchedWorker(async (scan) => {
    if (scan === 2) {
      entered.resolve();
      await finish.promise;
    }
  });
  const replacement = watchedWorker();
  let creates = 0;
  const { owner } = own(async () => (++creates === 1 ? previous : replacement));
  await owner.start();
  await vi.advanceTimersByTimeAsync(1000);
  await entered.promise;
  const firstReplacement = owner.start();
  const secondReplacement = owner.start();
  let stopped = false;
  const stopping = owner.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  expect(creates).toBe(1);
  finish.resolve();
  await Promise.all([firstReplacement, secondReplacement, stopping]);
  expect(creates).toBe(1);
  expect(previous.calls.drained).toBe(true);
  expect(replacement.calls.scans).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  await owner.start();
  expect(creates).toBe(2);
  expect(replacement.calls.scans).toBe(1);
});

it("lets only the latest replacement create and poll after the previous worker drains", async () => {
  const entered = gate();
  const finish = gate();
  const previous = watchedWorker(async (scan) => {
    if (scan === 2) {
      entered.resolve();
      await finish.promise;
    }
  });
  const replacement = watchedWorker();
  let creates = 0;
  const { owner } = own(async () => (++creates === 1 ? previous : replacement));
  await owner.start();
  await vi.advanceTimersByTimeAsync(1000);
  await entered.promise;
  const firstReplacement = owner.start();
  const secondReplacement = owner.start();
  finish.resolve();
  await Promise.all([firstReplacement, secondReplacement]);
  expect(creates).toBe(2);
  expect(previous.calls.drained).toBe(true);
  expect(replacement.calls.scans).toBe(1);
  expect(vi.getTimerCount()).toBe(1);
  await vi.advanceTimersByTimeAsync(1000);
  expect(previous.calls.scans).toBe(2);
  expect(replacement.calls.scans).toBe(2);
  await owner.stop();
  expect(vi.getTimerCount()).toBe(0);
});

it("stops a worker created after cancellation before it can scan or arm a timer", async () => {
  const creating = gate();
  const finishCreate = gate();
  const late = watchedWorker();
  const { owner } = own(async () => {
    creating.resolve();
    await finishCreate.promise;
    return late;
  });
  const starting = owner.start();
  await creating.promise;
  let stopped = false;
  const stopping = owner.stop().then(() => {
    stopped = true;
  });
  await Promise.resolve();
  expect(stopped).toBe(false);
  finishCreate.resolve();
  await Promise.all([starting, stopping]);
  expect(late.calls.scans).toBe(0);
  expect(late.calls.stops).toBe(1);
  expect(late.calls.drained).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("holds a Library lease for the full periodic scan and resumes after a drained transition", async () => {
  const entered = gate();
  const finish = gate();
  const prepared = gate();
  const events: string[] = [];
  const worker = watchedWorker(async (scan) => {
    if (scan === 2) {
      entered.resolve();
      await finish.promise;
      events.push("scan settled");
    }
  });
  const { owner } = own(async () => worker);
  await owner.start();
  await vi.advanceTimersByTimeAsync(1000);
  await entered.promise;
  const transition = libraryAccess.transition({
    prepare: async () => {
      prepared.resolve();
    },
    operation: async () => {
      events.push("Library changed");
    },
    keepClosed: () => false,
  });
  transitions.push(transition);
  await prepared.promise;
  await expect(libraryAccess.run(async () => {})).rejects.toBeInstanceOf(
    LibraryTransitionError,
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(events).toEqual([]);
  expect(worker.calls.scans).toBe(2);
  finish.resolve();
  await transition;
  expect(events).toEqual(["scan settled", "Library changed"]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(worker.calls.scans).toBe(3);
});

it("drains cancelled setup before a Library transition can change paths", async () => {
  const creating = gate();
  const finishCreate = gate();
  const prepared = gate();
  const late = watchedWorker();
  const { owner } = own(async () => {
    creating.resolve();
    await finishCreate.promise;
    return late;
  });
  const starting = owner.start();
  await creating.promise;
  let changed = false;
  const transition = libraryAccess.transition({
    prepare: async () => {
      prepared.resolve();
      await owner.stop();
    },
    operation: async () => {
      changed = true;
    },
    keepClosed: () => false,
  });
  transitions.push(transition);
  await prepared.promise;
  await Promise.resolve();
  expect(changed).toBe(false);
  finishCreate.resolve();
  await Promise.all([starting, transition]);
  expect(changed).toBe(true);
  expect(late.calls.scans).toBe(0);
  expect(late.calls.drained).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans a failed initial scan and permits a later healthy start", async () => {
  const failure = new Error("The watched folder was replaced.");
  const failed = watchedWorker(async () => {
    throw failure;
  });
  const healthy = watchedWorker();
  let creates = 0;
  const { owner } = own(async () => (++creates === 1 ? failed : healthy));
  await expect(owner.start()).rejects.toBe(failure);
  expect(failed.calls.stops).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
  await owner.start();
  expect(healthy.calls.scans).toBe(1);
  expect(vi.getTimerCount()).toBe(1);
});

it("reports a periodic scan failure and continues without overlapping later scans", async () => {
  const failure = new Error("Temporary directory access failure");
  const worker = watchedWorker(async (scan) => {
    if (scan === 2) throw failure;
  });
  const { owner, warnings } = own(async () => worker);
  await owner.start();
  await vi.advanceTimersByTimeAsync(1000);
  expect(warnings).toEqual([failure]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(worker.calls.scans).toBe(3);
  expect(vi.getTimerCount()).toBe(1);
});
