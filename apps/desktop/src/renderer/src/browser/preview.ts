import type { PondPreviewApi } from "../../../preload/preview";
import type { PreviewWindowState } from "../../../shared/preview-window-contracts";
import {
  BrowserPreviewAddress,
  BrowserPreviewMessage,
} from "./preview-contracts";

const address = BrowserPreviewAddress.parse(
  Object.fromEntries(new URLSearchParams(location.hash.slice(1))),
);
const channel = new BroadcastChannel(address.channel);
const listeners = new Set<(state: PreviewWindowState) => void>();
let current: PreviewWindowState | null = null;
document.documentElement.dataset.runtime = "browser";

function showMessage(message: string) {
  const target = document.querySelector<HTMLElement>("#preview-message");
  if (target) {
    target.textContent = message;
    target.hidden = !message;
  }
}

const api: PondPreviewApi = {
  async configure(input) {
    if (input.windowId !== address.windowId) return;
    if (input.fullscreen !== undefined) {
      try {
        if (input.fullscreen)
          await document.documentElement.requestFullscreen();
        else if (document.fullscreenElement) await document.exitFullscreen();
      } catch {
        showMessage(
          "Fullscreen is unavailable here. You can expand this browser window.",
        );
        return;
      }
    }
    channel.postMessage({
      type: "configure",
      patch: { ...input, fullscreen: Boolean(document.fullscreenElement) },
    });
  },
  async close(windowId) {
    if (windowId !== address.windowId) return;
    channel.postMessage({ type: "close" });
    window.close();
  },
  async requestNeighbor(request) {
    channel.postMessage({ type: "neighbor", request });
  },
  async fileAction() {
    channel.postMessage({ type: "export" });
    return { ok: true };
  },
  onState(listener) {
    listeners.add(listener);
    if (current) listener(current);
    return () => {
      listeners.delete(listener);
    };
  },
};
window.pondPreview = api;
channel.onmessage = (event) => {
  const parsed = BrowserPreviewMessage.safeParse(event.data);
  if (!parsed.success) return;
  const message = parsed.data;
  if (message.type === "close") {
    window.close();
    return;
  }
  if (message.type === "error") showMessage(message.message);
  if (message.type !== "state" || message.state.windowId !== address.windowId)
    return;
  current = message.state;
  showMessage("");
  for (const listener of listeners) listener(current);
};
document.addEventListener("fullscreenchange", () => {
  if (current)
    channel.postMessage({
      type: "configure",
      patch: {
        windowId: address.windowId,
        fullscreen: Boolean(document.fullscreenElement),
      },
    });
});
window.addEventListener("pagehide", () => {
  channel.postMessage({ type: "close" });
  channel.close();
});
await import("../preview");
channel.postMessage({ type: "ready" });
