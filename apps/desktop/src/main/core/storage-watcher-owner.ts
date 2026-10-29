import type { Prefs } from "@pond/schema/db";
import type { StorageGuardStatus } from "../../shared/storage-contracts";
import { libraryAccess } from "./library-access";

type StorageConfig = Prefs["storage"];

/** A tick owns its Library lease until its snapshot and guard decisions settle. */
export function createStorageWatcher(dependencies: {
  preferences(): Promise<StorageConfig>;
  snapshot(): Promise<{ pondBytes: number }>;
  publish(status: StorageGuardStatus): void;
  pauseSync(): void;
  warn(error: Error): void;
}) {
  const empty = (): StorageGuardStatus => ({
    state: "ok",
    pondBytes: 0,
    capBytes: null,
    warnBytes: null,
    action: "warn",
    appliedAt: new Date(0).toISOString(),
  });
  let status = empty();
  let generation = 0;
  let closed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let tail = Promise.resolve();
  let ticking = false;

  function invalidate() {
    generation++;
    if (timer) clearInterval(timer);
    timer = null;
  }

  function enqueue(current: number, operation: () => Promise<void>) {
    const run = tail.then(async () => {
      if (closed || current !== generation) return;
      libraryAccess.assertNewWorkAllowed();
      await libraryAccess.run(operation);
    });
    tail = run.catch(() => {});
    return run;
  }

  async function measure(config: StorageConfig, current: number) {
    const snapshot = config.guardsEnabled
      ? await dependencies.snapshot()
      : { pondBytes: status.pondBytes };
    if (closed || current !== generation) return;
    const cap =
      !config.guardsEnabled || config.maxLibraryGb === null
        ? null
        : Math.max(0, config.maxLibraryGb) * 1024 ** 3;
    const warnBytes =
      cap === null
        ? null
        : (cap * Math.max(50, Math.min(100, config.warnAtPercent || 80))) / 100;
    const state =
      cap !== null && snapshot.pondBytes >= cap
        ? "exceeded"
        : warnBytes !== null && snapshot.pondBytes >= warnBytes
          ? "warn"
          : "ok";
    if (
      state === "exceeded" &&
      config.action === "pauseSync" &&
      !(status.state === "exceeded" && status.action === "pauseSync")
    )
      dependencies.pauseSync();
    status = {
      state,
      pondBytes: snapshot.pondBytes,
      capBytes: cap,
      warnBytes,
      action: config.action,
      appliedAt: new Date().toISOString(),
    };
    dependencies.publish(status);
  }

  return {
    state: () => status,
    syncBlocked: () =>
      status.state === "exceeded" && status.action === "pauseSync",
    videoBlocked: () =>
      status.state === "exceeded" && status.action === "pauseVideo",
    apply(): Promise<void> {
      if (closed) return Promise.resolve();
      invalidate();
      const current = generation;
      return enqueue(current, async () => {
        const config = await dependencies.preferences();
        if (closed || current !== generation) return;
        if (config.guardsEnabled) {
          const minutes = Number.isFinite(config.watchIntervalMinutes)
            ? Math.max(1, Math.min(60, Math.floor(config.watchIntervalMinutes)))
            : 5;
          timer = setInterval(() => {
            if (ticking || current !== generation || !libraryAccess.isOpen())
              return;
            ticking = true;
            void enqueue(current, async () => {
              const latest = await dependencies.preferences();
              await measure(latest, current);
            })
              .catch((error: Error) => dependencies.warn(error))
              .finally(() => {
                ticking = false;
              });
          }, minutes * 60_000);
        }
        await measure(config, current);
      });
    },
    async stop(permanent = false): Promise<void> {
      if (permanent) closed = true;
      invalidate();
      const current = generation;
      await tail;
      if (current === generation) status = empty();
    },
  };
}
