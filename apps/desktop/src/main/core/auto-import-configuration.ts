import type { Prefs } from "@pond/schema/db";

type WatchConfig = Prefs["autoImport"];

/** Failed setup restores the previous folder; a failed recovery leaves watching explicitly paused. */
export function createAutoImportConfiguration(dependencies: {
  read(): Promise<WatchConfig>;
  normalize(config: WatchConfig): Promise<WatchConfig>;
  write(config: WatchConfig): Promise<void>;
  start(): Promise<void>;
}) {
  let tail: Promise<void> = Promise.resolve();
  let closed = false;
  function assertOpen() {
    if (closed) throw new Error("The watched folder is shutting down.");
  }
  function configure(patch: Partial<WatchConfig>) {
    if (closed)
      return Promise.reject(new Error("The watched folder is shutting down."));
    const operation = tail.then(async () => {
      assertOpen();
      const previous = await dependencies.read();
      const next = await dependencies.normalize({ ...previous, ...patch });
      assertOpen();
      await dependencies.write(next);
      // A preference committed before quit remains useful at the next launch.
      if (closed) return { ok: true as const, path: next.path };
      try {
        await dependencies.start();
      } catch (startupError) {
        try {
          await dependencies.write(previous);
          if (!closed) await dependencies.start();
        } catch (recoveryError) {
          try {
            await dependencies.write({ ...previous, enabled: false });
          } catch (pauseError) {
            throw new AggregateError(
              [startupError, recoveryError, pauseError],
              "Could not start or restore the watched folder, and could not save its paused state.",
            );
          }
          throw new AggregateError(
            [startupError, recoveryError],
            "Could not start or restore the watched folder. Watching is paused; choose the folder again.",
          );
        }
        throw startupError;
      }
      return { ok: true as const, path: next.path };
    });
    tail = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  return {
    configure,
    close() {
      closed = true;
      return tail;
    },
  };
}
