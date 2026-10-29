import log from "electron-log/main.js";
import { IPC } from "../../shared/constants";
import { broadcast } from "../lib/broadcast";
import { getPrefs } from "./prefs";
import { getStorageSnapshot } from "./storage-stats";
import { createStorageWatcher } from "./storage-watcher-owner";
import { cancelAllSyncs } from "./sync/sync-status";

const owner = createStorageWatcher({
  preferences: async () => (await getPrefs()).storage,
  snapshot: getStorageSnapshot,
  publish: (status) => broadcast(IPC.storageStatus, status),
  pauseSync: cancelAllSyncs,
  warn: (error) => log.warn("[pond storage-watcher] tick failed", error),
});

export const isSyncBlockedByStorageGuard = owner.syncBlocked;
export const isAutoVideoBlockedByStorageGuard = owner.videoBlocked;
export const getStorageGuardState = owner.state;
export const startStorageWatcher = owner.apply;
export const applyStorageWatcherPrefs = owner.apply;
export const stopStorageWatcher = owner.stop;
