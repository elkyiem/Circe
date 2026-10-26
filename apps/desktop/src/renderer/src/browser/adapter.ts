import { DEFAULT_PREFS, PrefsSchema } from "@pond/schema";
import type { QueryClient, QueryResult } from "@shared/query-contracts";
import { WebQueryNameSchema } from "@shared/web-contracts";
import { parseWebValue, type WebValue } from "@shared/web-serialization";
import type { WireSyncAction } from "@shared/wire";
import { z } from "zod";
import type { PondApi } from "../../../preload";

export async function webRequest(path: string, body?: string, method = "POST") {
  const response = await fetch(
    `/web/${path}`,
    body === undefined
      ? {}
      : {
          method,
          headers: { "content-type": "application/json" },
          body,
        },
  );
  const result = parseWebValue(await response.text());
  if (!response.ok) {
    const failure = z.object({ error: z.string() }).safeParse(result);
    const message =
      response.status === 401 && path !== "session"
        ? "Your host session has expired. Reload to reconnect."
        : failure.success
          ? failure.data.error
          : "The host could not complete this action.";
    window.dispatchEvent(new CustomEvent("iris-error", { detail: message }));
    throw new Error(message);
  }
  return result;
}

function unsupported(): never {
  const message =
    "This action requires the Electron host. Open Pond on the host to use it.";
  window.dispatchEvent(new CustomEvent("iris-error", { detail: message }));
  throw new Error(message);
}

/** Native menu and window events have no producers on the visiting device. */
const noNativeEvents = () => () => {};

export function installBrowserAdapter(libraryId: string) {
  const key = `iris:device-prefs:${libraryId}`;
  const readPrefs = () =>
    PrefsSchema.parse(
      JSON.parse(
        localStorage.getItem(key) ??
          JSON.stringify({ ...DEFAULT_PREFS, setup: { version: 1 } }),
      ),
    );
  const prefsListeners = new Set<Parameters<PondApi["onPrefsChanged"]>[0]>();
  const syncListeners = new Set<(event: WireSyncAction) => void>();
  const query: QueryClient = async (name, ...args) => {
    let result:
      | WebValue
      | QueryResult<"settings.getPrefs">
      | QueryResult<"settings.setPrefs"> = null;
    if (name === "settings.getPrefs") result = readPrefs();
    else if (name === "library.recent") {
      const info = z
        .object({
          path: z.string(),
          name: z.string(),
          icon: z.string().nullable(),
          accent: z.string().nullable(),
        })
        .parse(
          await webRequest(
            "query",
            JSON.stringify({ name: "library.info", params: {} }),
          ),
        );
      result = [
        { ...info, active: true, available: true, lastOpened: Date.now() },
      ];
    } else if (name === "settings.setPrefs") {
      const current = readPrefs();
      const patch = z
        .record(z.string(), z.record(z.string(), z.json()))
        .parse(args[0]);
      const deviceSections = new Set([
        "preferences",
        "viewer",
        "sidebar",
        "folderViews",
        "savedViewViews",
        "tagPicker",
        "allTags",
        "sourcesView",
        "saveRecents",
        "search",
        "shortcuts",
      ]);
      if (Object.keys(patch).some((section) => !deviceSections.has(section)))
        return unsupported();
      const next = Object.fromEntries(
        Object.entries(current).map(([section, value]) => [
          section,
          { ...value, ...patch[section] },
        ]),
      );
      const prefs = PrefsSchema.parse(next);
      localStorage.setItem(key, JSON.stringify(prefs));
      for (const listener of prefsListeners) listener(prefs);
      result = { ok: true, prefs };
    } else {
      if (!WebQueryNameSchema.safeParse(name).success) return unsupported();
      result = await webRequest(
        "query",
        JSON.stringify({ name, params: args[0] ?? {} }),
      );
    }
    /** SAFETY: the name is checked against the shared allowlist; host handlers validate inputs and retain QueryResults. Local prefs use PrefsSchema. */
    return result as QueryResult<typeof name>;
  };
  const api: PondApi = {
    query,
    libraryId: () => libraryId,
    onSyncAction: (callback) => {
      syncListeners.add(callback);
      return () => syncListeners.delete(callback);
    },
    onPrefsChanged: (callback) => {
      prefsListeners.add(callback);
      return () => prefsListeners.delete(callback);
    },
    rendererReady: () => {},
    sendMenuRecents: () => {},
    openExternal: async (url) => {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return unsupported();
      return {
        ok: window.open(parsed.href, "_blank", "noopener,noreferrer") !== null,
      };
    },
    appInfo: async () => ({
      name: "Iris",
      version: "1.6.3-web",
      platform: "browser",
      arch: "browser",
      username: "",
      isPackaged: false,
    }),
    openCombineImagesWindow: unsupported,
    tx: unsupported,
    batch: unsupported,
    undo: unsupported,
    redo: unsupported,
    openPreviewWindow: unsupported,
    configurePreviewWindow: unsupported,
    navigatePreviewWindow: unsupported,
    closePreviewWindow: unsupported,
    pathForFile: unsupported,
    revealSave: unsupported,
    openSaveFile: unsupported,
    refreshSave: unsupported,
    refreshBackfillStart: unsupported,
    refreshBackfillCancel: unsupported,
    pipelinePause: unsupported,
    pipelineCancelSaves: unsupported,
    pipelineCancelAll: unsupported,
    connectSource: unsupported,
    clearPendingSession: unsupported,
    sourceStatus: unsupported,
    syncRunNow: unsupported,
    syncStatus: unsupported,
    syncRunAll: unsupported,
    syncCancel: unsupported,
    governorSetPaused: unsupported,
    governorResumeSource: unsupported,
    archiveBackfillStart: unsupported,
    archiveSite: unsupported,
    agentStream: unsupported,
    onPreviewNeighborRequested: noNativeEvents,
    onNavigate: noNativeEvents,
    onOpenFiles: noNativeEvents,
    onEditUndoRequested: noNativeEvents,
    onEditRedoRequested: noNativeEvents,
    onMenuAction: noNativeEvents,
    onShortcutAction: noNativeEvents,
    onMenuOpenSave: noNativeEvents,
    onEagleImportProgress: noNativeEvents,
    onSessionImported: noNativeEvents,
    onSessionImportFailed: noNativeEvents,
    onSyncStatus: noNativeEvents,
    onStorageStatus: noNativeEvents,
    onUpdateNotice: noNativeEvents,
    onArchiveNavigate: noNativeEvents,
    onAgentChunk: noNativeEvents,
    onAgentFilter: noNativeEvents,
    onAgentCite: noNativeEvents,
    onAgentOverlay: noNativeEvents,
  };
  window.pond = api;
  document.documentElement.dataset.runtime = "browser";
  const events = new EventSource("/web/events");
  let connected = false;
  events.addEventListener("ready", () => {
    // Refresh the pool after a gap rather than silently losing host mutations.
    if (connected) location.reload();
    connected = true;
    window.dispatchEvent(
      new CustomEvent("iris-connection", {
        detail: "Connected to Electron host",
      }),
    );
  });
  events.addEventListener("sync", (event) => {
    /** SAFETY: this same-origin authenticated event is emitted by toWireSyncAction on the host. */
    const action = parseWebValue(event.data) as WireSyncAction;
    for (const listener of syncListeners) listener(action);
  });
  events.onerror = () => {
    window.dispatchEvent(
      new CustomEvent("iris-connection", {
        detail: "Host disconnected · reconnecting…",
      }),
    );
    void fetch("/web/session")
      .then((response) => {
        if (response.status === 401)
          window.dispatchEvent(
            new CustomEvent("iris-error", {
              detail: "Your host session has expired. Reload to reconnect.",
            }),
          );
      })
      .catch(() => {});
  };
  window.addEventListener("pagehide", () => events.close(), { once: true });
}
