import type { SyncAction } from "@pond/schema/db";
import { schedule } from "../../lib/scheduler";

const CHECK_EVERY_MS = 5 * 60 * 1000;
/** Sources import in bursts and tag Saves after insert, so routines wait for a batch to settle. */
const NEW_SAVE_SETTLE_MS = 90_000;

export function startFishRoutines(runtime: {
  onSyncAction(listener: (action: SyncAction) => void): () => void;
}): void {
  schedule({
    name: "fish-routines",
    every: CHECK_EVERY_MS,
    initialDelay: 60_000,
    fn: async () => (await import("./routines")).runDueRoutines(),
  });
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  runtime.onSyncAction((action) => {
    if (action.modelName !== "save" || action.action !== "I") return;
    if (action.actor === "agent") return;
    pending.add(action.modelId);
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      const saveIds = [...pending];
      pending.clear();
      void import("./routines").then((routines) =>
        routines.runNewSaveRoutines(saveIds),
      );
    }, NEW_SAVE_SETTLE_MS);
    timer.unref();
  });
}
