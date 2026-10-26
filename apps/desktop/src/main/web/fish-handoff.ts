import type { CaptureReceipt } from "@pond/schema/capture";
import type { FishOpen } from "../../shared/fish-contracts";

interface WebFishHandoffDependencies {
  libraryId(): string;
  fishExists(id: string): Promise<boolean>;
  open(payload: FishOpen): void;
  now(): number;
}

/** Remote captures open Fish in authenticated browsers, without focusing a host window. */
export function createWebFishHandoff(deps: WebFishHandoffDependencies) {
  const pending = new Map<
    string,
    { fishId: string; library: string; until: number }
  >();
  function prune() {
    for (const [id, capture] of pending)
      if (capture.until <= deps.now() || capture.library !== deps.libraryId())
        pending.delete(id);
  }
  return {
    remember(id: string, fishId: string) {
      prune();
      pending.set(id, {
        fishId,
        library: deps.libraryId(),
        until: deps.now() + 30 * 60_000,
      });
    },
    async complete(receipt: CaptureReceipt) {
      prune();
      const capture = pending.get(receipt.id);
      if (!capture) return;
      pending.delete(receipt.id);
      if (!receipt.saveIds.length || !(await deps.fishExists(capture.fishId)))
        return;
      if (capture.library !== deps.libraryId()) return;
      deps.open({ fishId: capture.fishId, saveIds: receipt.saveIds });
    },
    clear() {
      pending.clear();
    },
  };
}
