import { BrowserWindow } from "electron";
import log from "electron-log/main.js";

type BroadcastListener = <Value>(channel: string, payload: Value) => void;
const listeners = new Set<BroadcastListener>();

/** Platform adapters subscribe only to the channels they deliberately expose. */
export function subscribeBroadcast(listener: BroadcastListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function broadcast<T>(channel: string, payload: T): void {
  for (const listener of listeners) {
    try {
      listener(channel, payload);
    } catch (error) {
      log.error("[pond] broadcast subscriber failed", { channel, error });
    }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (
      !win.isDestroyed() &&
      !win.webContents.isDestroyed() &&
      !win.webContents.isCrashed() &&
      !win.webContents.mainFrame.detached
    ) {
      win.webContents.send(channel, payload);
    }
  }
}
