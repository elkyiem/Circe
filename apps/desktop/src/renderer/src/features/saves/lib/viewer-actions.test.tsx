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

it("falls back to the shared preview on the desktop when Quick Look has no Mac file", () => {
  // jsdom is not a Mac and this Save is not loaded, so the host is never asked.
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
