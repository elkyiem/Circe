import { BrowserWindow } from "electron";

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
  for (const listener of listeners) listener(channel, payload);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}
