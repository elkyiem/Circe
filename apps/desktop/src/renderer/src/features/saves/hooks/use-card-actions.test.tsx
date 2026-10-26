import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import "@/app/effects/save-library-bridge";
import { primarySelection } from "@/features/saves/state/selection";
import { ToastHost } from "@/shared/components/toast-host";
import { toastManager } from "@/shared/lib/toast";
import { useCardActions } from "./use-card-actions";

afterEach(() => {
  toastManager.close();
  vi.unstubAllGlobals();
});

function toastText(): string {
  return document.body.querySelector("[data-slot='toasts']")?.textContent ?? "";
}

it.each(["native file", "file URI"])(
  "imports a dropped %s and confirms the save",
  async (kind) => {
    const query = vi.fn(async (operation: string) =>
      operation === "saves.reviewImportDuplicates"
        ? { candidates: [] }
        : { ok: true, ids: ["new-save"] },
    );
    vi.stubGlobal("pond", { query, pathForFile: () => "/tmp/drop image.png" });
    const host = document.createElement("div");
    const root = createRoot(host);
    function Harness() {
      const actions = useCardActions([], "library", "");
      return (
        <button type="button" onDrop={actions.onDrop}>
          Drop
        </button>
      );
    }
    try {
      await act(async () =>
        root.render(
          <>
            <Harness />
            <ToastHost />
          </>,
        ),
      );
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: {
          files:
            kind === "native file"
              ? [new File(["image"], "drop image.png")]
              : [],
          getData: (type: string) =>
            type === "text/uri-list" ? "file:///tmp/drop%20image.png" : "",
        },
      });
      await act(async () => {
        host.firstElementChild?.dispatchEvent(event);
      });
      expect(query).toHaveBeenCalledWith("saves.importFiles", {
        paths: ["/tmp/drop image.png"],
      });
      expect(toastText()).toContain("Saved to Pond");
    } finally {
      await act(async () => root.unmount());
    }
  },
);

it("starts a dropped link immediately and does not claim it is saved", async () => {
  const query = vi.fn().mockResolvedValue({ ok: true, id: "pasted-save" });
  vi.stubGlobal("pond", { query });
  const host = document.createElement("div");
  const root = createRoot(host);
  function Harness() {
    const actions = useCardActions([], "library", "");
    return (
      <button type="button" onDrop={actions.onDrop}>
        Drop
      </button>
    );
  }
  try {
    await act(async () =>
      root.render(
        <>
          <Harness />
          <ToastHost />
        </>,
      ),
    );
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        files: [],
        getData: (type: string) =>
          type === "text/uri-list" ? "https://example.com/clip" : "",
      },
    });
    await act(async () => {
      host.firstElementChild?.dispatchEvent(event);
    });
    expect(query).toHaveBeenCalledWith("saves.quickAdd", {
      url: "https://example.com/clip",
    });
    expect(toastText()).toContain("Downloading");
    expect(toastText()).not.toContain("Saved to Pond");
  } finally {
    await act(async () => root.unmount());
  }
});

it("starts a pasted link without selecting it", async () => {
  const query = vi.fn(async (operation: string) =>
    operation === "saves.quickAdd" ? { ok: true, id: "pasted-save" } : {},
  );
  vi.stubGlobal("pond", { query });
  const host = document.createElement("div");
  const root = createRoot(host);
  function Harness() {
    useCardActions([], "library", "");
    return null;
  }
  try {
    await act(async () =>
      root.render(
        <>
          <Harness />
          <ToastHost />
        </>,
      ),
    );
    const event = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", {
      value: {
        files: [],
        types: ["text/plain"],
        getData: (type: string) =>
          type === "text/plain" ? "https://example.com/clip" : "",
      },
    });
    await act(async () => {
      document.dispatchEvent(event);
    });
    expect(query).toHaveBeenCalledWith("saves.quickAdd", {
      url: "https://example.com/clip",
    });
    expect(toastText()).toContain("Downloading");
    expect(primarySelection.get()).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
