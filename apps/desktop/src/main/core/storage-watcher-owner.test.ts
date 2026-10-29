import { DEFAULT_PREFS } from "@pond/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StorageGuardStatus } from "../../shared/storage-contracts";
import { libraryAccess } from "./library-access";
import { createStorageWatcher } from "./storage-watcher-owner";

const owners: Array<ReturnType<typeof createStorageWatcher>> = [];
const releases: Array<() => void> = [];

function setup(snapshot = async () => ({ pondBytes: 1024 ** 3 })) {
  let preferences = {
    ...DEFAULT_PREFS.storage,
    guardsEnabled: true,
    maxLibraryGb: 1,
    watchIntervalMinutes: 1,
  };
  const published: StorageGuardStatus[] = [];
  const pauseSync = vi.fn();
  const warn = vi.fn();
  const read = vi.fn(snapshot);
  const owner = createStorageWatcher({
    preferences: async () => preferences,
    snapshot: read,
    publish: (value) => published.push(value),
    pauseSync,
    warn,
  });
  owners.push(owner);
  return {
    owner,
    published,
    pauseSync,
    warn,
    read,
    configure(patch: Partial<typeof preferences>) {
      preferences = { ...preferences, ...patch };
      return owner.apply();
    },
  };
}

function gate() {
  const value = Promise.withResolvers<{ pondBytes: number }>();
  releases.push(() => value.resolve({ pondBytes: 1024 ** 3 }));
  return value;
}

beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  for (const release of releases.splice(0)) release();
  await Promise.all(owners.splice(0).map((owner) => owner.stop(true)));
  vi.useRealTimers();
});

it("publishes without a visible desktop and applies changed limits immediately", async () => {
  const test = setup();
  await test.configure({ action: "pauseSync" });
  expect(test.owner.syncBlocked()).toBe(true);
  expect(test.pauseSync).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(test.pauseSync).toHaveBeenCalledTimes(1);
  expect(test.published.at(-1)?.state).toBe("exceeded");
  await test.configure({ maxLibraryGb: 2 });
  expect(test.owner.syncBlocked()).toBe(false);
  expect(test.published.at(-1)?.state).toBe("ok");
  await test.configure({ maxLibraryGb: 1, action: "pauseVideo" });
  expect(test.owner.videoBlocked()).toBe(true);
  await test.configure({ guardsEnabled: false });
  expect(test.owner.videoBlocked()).toBe(false);
  expect(test.published.at(-1)?.capBytes).toBeNull();
  const reads = test.read.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(test.read).toHaveBeenCalledTimes(reads);
});

it("drains a snapshot before transition and suppresses its stale guard decision", async () => {
  const pending = gate();
  const test = setup(() => pending.promise);
  const applying = test.configure({ action: "pauseSync" });
  await vi.advanceTimersByTimeAsync(0);
  let transitioned = false;
  const transition = libraryAccess.transition({
    prepare: () => test.owner.stop(),
    operation: async () => {
      transitioned = true;
      expect(test.pauseSync).not.toHaveBeenCalled();
      expect(test.published).toEqual([]);
    },
    keepClosed: () => false,
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(transitioned).toBe(false);
  pending.resolve({ pondBytes: 1024 ** 3 });
  await Promise.all([applying, transition]);
  expect(transitioned).toBe(true);
});

it("does not overlap slow ticks or let an older configuration publish after a newer one", async () => {
  const pending = gate();
  let count = 0;
  const test = setup(async () => {
    count++;
    return count === 2 ? pending.promise : { pondBytes: 1024 ** 3 };
  });
  await test.configure({ action: "pauseSync" });
  await vi.advanceTimersByTimeAsync(180_000);
  expect(count).toBe(2);
  const changed = test.configure({ guardsEnabled: false });
  pending.resolve({ pondBytes: 10 * 1024 ** 3 });
  await changed;
  expect(test.published.map((status) => status.state)).toEqual([
    "exceeded",
    "ok",
  ]);
  expect(test.owner.syncBlocked()).toBe(false);
});

it("retains the last committed status on measurement failure and retries later", async () => {
  let fail = false;
  const test = setup(async () => {
    if (fail) throw new Error("disk unavailable");
    return { pondBytes: 0.9 * 1024 ** 3 };
  });
  await test.owner.apply();
  expect(test.owner.state().state).toBe("warn");
  fail = true;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(test.warn).toHaveBeenCalledTimes(1);
  expect(test.owner.state().state).toBe("warn");
  fail = false;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(test.published).toHaveLength(2);
});

it("permanent shutdown drains pending work and prevents a late restart", async () => {
  const pending = gate();
  const test = setup(() => pending.promise);
  const applying = test.owner.apply();
  await vi.advanceTimersByTimeAsync(0);
  const stopping = test.owner.stop(true);
  const late = test.owner.apply();
  pending.resolve({ pondBytes: 1024 ** 3 });
  await Promise.all([applying, stopping, late]);
  expect(test.published).toEqual([]);
  expect(test.owner.syncBlocked()).toBe(false);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(test.read).toHaveBeenCalledTimes(1);
});
