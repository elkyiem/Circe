import { afterEach, expect, it, vi } from "vitest";
import { onQuickPreviewRequest } from "@/features/saves/state/quick-preview";
import { selection } from "@/features/saves/state/selection";
import { runViewerAction } from "./viewer-actions";

afterEach(() => {
  selection.clear();
  delete document.documentElement.dataset.runtime;
  vi.unstubAllGlobals();
});

it("uses the shared browser preview for a Quick Look preference inherited from the Mac", () => {
  document.documentElement.dataset.runtime = "browser";
  const query = vi.fn();
  vi.stubGlobal("pond", { query });
  const requested: string[] = [];
  const off = onQuickPreviewRequest((id) => requested.push(id));
  try {
    runViewerAction("owned-save", "quick-look");
    expect(requested).toEqual(["owned-save"]);
    expect(query).not.toHaveBeenCalled();
    expect(selection.has("owned-save")).toBe(true);
  } finally {
    off();
  }
});

it("retains native Quick Look on the desktop", async () => {
  const query = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("pond", { query });
  runViewerAction("owned-save", "quick-look");
  await Promise.resolve();
  expect(query).toHaveBeenCalledWith("saves.quickLook", { id: "owned-save" });
});
