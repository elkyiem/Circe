import { libraryAccess } from "./library-access";

interface WatchedFolderWorker {
  scan(): Promise<void>;
  stop(): Promise<void>;
}

/** Starts and stops own setup and scan settlement, including a worker created after cancellation. */
export function createAutoImportOwner(dependencies: {
  create(): Promise<WatchedFolderWorker | null>;
  warn(error: Error): void;
}) {
  let worker: WatchedFolderWorker | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let generation = 0;
  const setups = new Set<Promise<void>>();
  const ticks = new Set<Promise<void>>();

  async function drain(work: Array<Promise<void> | undefined>) {
    const results = await Promise.allSettled(work);
    const errors = results.flatMap((result) =>
      result.status === "rejected"
        ? [
            result.reason instanceof Error
              ? result.reason
              : new Error("The watched folder could not finish stopping."),
          ]
        : [],
    );
    if (errors.length)
      throw new AggregateError(
        errors,
        "The watched folder could not finish stopping.",
      );
  }

  function detach() {
    generation++;
    if (timer) clearInterval(timer);
    timer = null;
    const previous = worker;
    worker = null;
    return previous;
  }

  return {
    start(): Promise<void> {
      const previousSetups = [...setups];
      const settled = Promise.withResolvers<void>();
      setups.add(settled.promise);
      return libraryAccess
        .run(async () => {
          const previous = detach();
          const current = generation;
          await drain([previous?.stop(), ...previousSetups, ...ticks]);
          if (current !== generation) return;
          const next = await dependencies.create();
          if (current !== generation) {
            await next?.stop();
            return;
          }
          if (!next) return;
          worker = next;
          let scanning = false;
          const tick = () => {
            if (scanning || current !== generation || !libraryAccess.isOpen())
              return Promise.resolve();
            scanning = true;
            const run = libraryAccess.run(async () => {
              if (current === generation) await next.scan();
            });
            const settledTick = run
              .then(
                () => {},
                () => {},
              )
              .finally(() => {
                scanning = false;
                ticks.delete(settledTick);
              });
            ticks.add(settledTick);
            return run;
          };
          timer = setInterval(
            () => void tick().catch((error: Error) => dependencies.warn(error)),
            1000,
          );
          try {
            await tick();
          } catch (error) {
            if (worker === next) detach();
            await next.stop();
            throw error;
          }
        })
        .finally(() => {
          setups.delete(settled.promise);
          settled.resolve();
        });
    },
    async stop(): Promise<void> {
      const previous = detach();
      await drain([previous?.stop(), ...setups, ...ticks]);
    },
  };
}
