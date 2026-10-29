import type { Prefs } from "@pond/schema";
import { contextBridge, ipcRenderer } from "electron";
import type {
  EnrichmentOwnerCommand,
  EnrichmentOwnerReply,
  EnrichmentStatus,
} from "../shared/enrichment-contracts";
import type { MachinePaceWire } from "../shared/machine-pace";
import type { QueryInput, QueryName } from "../shared/query-contracts";
import type { WireSyncAction } from "../shared/wire";

// Sandboxed auxiliary preloads cannot require sibling chunks. These match the shared contracts.
const ENRICHMENT_IPC = {
  query: "enrichment-owner:query",
  ready: "enrichment-owner:ready",
  command: "enrichment-owner:command",
  reply: "enrichment-owner:reply",
  status: "enrichment-owner:status",
  title: "enrichment-owner:title",
};
const IPC = {
  libraryId: "pond:library-id",
  syncAction: "pond:sync-action",
  prefsChanged: "pond:prefs-changed",
  machinePace: "pond:machine-pace",
  machinePaceChanged: "pond:machine-pace-changed",
};

const subscribe = <Value>(
  channel: string,
  callback: (value: Value) => void,
) => {
  const listener = (_event: Electron.IpcRendererEvent, value: Value) =>
    callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
};
contextBridge.exposeInMainWorld("pond", {
  libraryId: () => ipcRenderer.sendSync(IPC.libraryId),
  query: (name: QueryName, params: QueryInput<QueryName>) =>
    ipcRenderer.invoke(ENRICHMENT_IPC.query, name, params),
  rendererReady: () => {},
  onSyncAction: (callback: (value: WireSyncAction) => void) =>
    subscribe(IPC.syncAction, callback),
  onPrefsChanged: (callback: (value: Prefs) => void) =>
    subscribe(IPC.prefsChanged, callback),
  machinePace: () => ipcRenderer.invoke(IPC.machinePace),
  onMachinePace: (callback: (value: MachinePaceWire) => void) =>
    subscribe(IPC.machinePaceChanged, callback),
  tx: (tx: {
    kind: string;
    model: string;
    id: string;
    patch: { title?: string };
    before: { title?: string | null };
  }) => {
    const title = tx.patch.title;
    if (tx.kind !== "update" || tx.model !== "save" || title === undefined)
      throw new Error("Only derived titles can be saved by this owner.");
    return ipcRenderer.invoke(ENRICHMENT_IPC.title, {
      id: tx.id,
      title,
      before: tx.before.title ?? null,
    });
  },
});
contextBridge.exposeInMainWorld("enrichmentOwner", {
  ready: (error?: string) => ipcRenderer.invoke(ENRICHMENT_IPC.ready, error),
  status: (status: EnrichmentStatus) =>
    ipcRenderer.invoke(ENRICHMENT_IPC.status, status),
  reply: (reply: EnrichmentOwnerReply) =>
    ipcRenderer.invoke(ENRICHMENT_IPC.reply, reply),
  onCommand: (callback: (value: EnrichmentOwnerCommand) => void) =>
    subscribe(ENRICHMENT_IPC.command, callback),
});
