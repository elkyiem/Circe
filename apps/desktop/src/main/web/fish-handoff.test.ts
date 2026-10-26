import type { CaptureReceipt } from "@pond/schema/capture";
import { expect, it, vi } from "vitest";
import { createWebFishHandoff } from "./fish-handoff";

const receipt: CaptureReceipt = {
  id: "capture",
  library: "a",
  state: "complete",
  completed: 1,
  total: 1,
  saveIds: ["save"],
  duplicateCount: 0,
};

it("opens captured Saves in the browser Fish once and isolates Library changes and expiry", async () => {
  let library = "a";
  let now = 0;
  const open = vi.fn();
  const handoff = createWebFishHandoff({
    libraryId: () => library,
    now: () => now,
    fishExists: async () => true,
    open,
  });
  handoff.remember("capture", "koi");
  await handoff.complete(receipt);
  await handoff.complete(receipt);
  expect(open).toHaveBeenCalledExactlyOnceWith({
    fishId: "koi",
    saveIds: ["save"],
  });
  handoff.remember("capture", "koi");
  library = "b";
  await handoff.complete(receipt);
  handoff.remember("capture", "koi");
  now = 30 * 60_000;
  await handoff.complete(receipt);
  expect(open).toHaveBeenCalledOnce();
});
