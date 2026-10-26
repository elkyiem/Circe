import type { Prefs } from "@pond/schema";
import { contextBridge, ipcRenderer } from "electron";
import type { QueryClient } from "../shared/query-contracts";
import type {
  CanvasRenderImageSchema,
  WebCanvasRenderInput,
} from "../shared/web-canvas-contracts";

// Sandboxed preloads cannot load sibling chunks; these deliberately match the shared contract.
const channels = {
  ready: "iris:canvas-render-ready",
  query: "iris:canvas-render-query",
  libraryId: "iris:canvas-render-library-id",
  finish: "iris:canvas-render-finish",
};
const query: QueryClient = (name, ...args) =>
  ipcRenderer.invoke(channels.query, name, args[0]);
contextBridge.exposeInMainWorld("pond", {
  query,
  libraryId: () => ipcRenderer.sendSync(channels.libraryId),
  onPrefsChanged: (_listener: (prefs: Prefs) => void) => () => {},
});
const api = {
  ready: (): Promise<WebCanvasRenderInput> =>
    ipcRenderer.invoke(channels.ready),
  finish: (
    result:
      | { image: ReturnType<typeof CanvasRenderImageSchema.parse> }
      | { error: string },
  ): Promise<void> => ipcRenderer.invoke(channels.finish, result),
};
contextBridge.exposeInMainWorld("pondCanvasRender", api);
export type PondCanvasRenderApi = typeof api;
