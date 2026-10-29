import {
  type PreviewNeighborRequest,
  type PreviewWindowConfigure,
  PreviewWindowConfigureSchema,
  type PreviewWindowNavigate,
  PreviewWindowNavigateSchema,
  type PreviewWindowOpen,
  PreviewWindowOpenSchema,
  type PreviewWindowState,
  previewMediaProfile,
} from "@shared/preview-window-contracts";
import type { QueryClient } from "@shared/query-contracts";
import { buildPondUrl } from "../features/saves/lib/media/url";
import { BrowserPreviewMessage } from "./preview-contracts";

interface PreviewEntry {
  kind: PreviewWindowOpen["kind"];
  channel: BroadcastChannel;
  popup: Window | null;
  dialog: HTMLDialogElement | null;
  state: PreviewWindowState | null;
  generation: number;
}

/** Presentation stays on the visiting device; only original media comes from the host. */
export function createBrowserPreviews(dependencies: {
  query: QueryClient;
  exportFile(saveId: string, fileIndex: number): Promise<void>;
  isCurrent(): boolean;
  reduceMotion(): PreviewWindowState["reduceMotion"];
}) {
  let nextId = 0;
  const entries = new Map<number, PreviewEntry>();
  const neighbors = new Set<(request: PreviewNeighborRequest) => void>();

  function publish(entry: PreviewEntry) {
    if (entry.state)
      entry.channel.postMessage({ type: "state", state: entry.state });
  }
  async function close(windowId: number) {
    const entry = entries.get(windowId);
    if (!entry) return;
    entries.delete(windowId);
    entry.generation++;
    entry.channel.postMessage({ type: "close" });
    entry.channel.close();
    entry.popup?.close();
    entry.dialog?.close();
    entry.dialog?.remove();
  }
  async function navigate(raw: PreviewWindowNavigate) {
    const input = PreviewWindowNavigateSchema.parse(raw);
    const entry = entries.get(input.windowId);
    if (!entry || !dependencies.isCurrent())
      throw new Error("The preview's Library is no longer open.");
    const generation = ++entry.generation;
    const save = await dependencies.query("saves.get", { id: input.saveId });
    const file = save?.files[input.fileIndex];
    const profile = file && previewMediaProfile(file);
    if (!save || !file || !profile)
      throw new Error("This Save has no previewable image or video.");
    if (entry.kind === "presentation" && profile.mediaType !== "image")
      throw new Error("Presentations use images.");
    if (generation !== entry.generation || !dependencies.isCurrent()) return;
    entry.state = {
      kind: entry.kind,
      fullscreen: false,
      opacity: 1,
      alwaysOnTop: false,
      rotation: 0,
      mirrored: false,
      grayscale: false,
      size: "fit",
      zoom: null,
      ...entry.state,
      ...input,
      ...profile,
      title: save.title || file.path,
      originalPath: file.path,
      url: buildPondUrl(input.saveId, file),
      reduceMotion: dependencies.reduceMotion(),
    };
    publish(entry);
  }
  async function configure(raw: PreviewWindowConfigure) {
    const { windowId, ...patch } = PreviewWindowConfigureSchema.parse(raw);
    const entry = entries.get(windowId);
    if (!entry?.state || !dependencies.isCurrent()) return;
    entry.state = { ...entry.state, ...patch, opacity: 1, alwaysOnTop: false };
    publish(entry);
  }

  return {
    async open(raw: PreviewWindowOpen) {
      const input = PreviewWindowOpenSchema.parse(raw);
      const windowId = ++nextId;
      const channelName = crypto.randomUUID();
      const address = `/browser-preview.html#${new URLSearchParams({ channel: channelName, windowId: String(windowId) })}`;
      // Reserve synchronously while the opening click still has browser activation.
      const popup = window.open(
        address,
        "_blank",
        "popup,width=960,height=720",
      );
      if (popup) popup.opener = null;
      const channel = new BroadcastChannel(channelName);
      const entry: PreviewEntry = {
        kind: input.kind,
        channel,
        popup,
        dialog: null,
        state: null,
        generation: 0,
      };
      entries.set(windowId, entry);
      if (!popup) {
        const dialog = document.createElement("dialog");
        dialog.className = "browser-preview-dialog";
        dialog.ariaLabel = "Media preview";
        const frame = document.createElement("iframe");
        frame.title = "Media preview";
        frame.src = address;
        frame.allowFullscreen = true;
        dialog.append(frame);
        document.body.append(dialog);
        dialog.addEventListener("cancel", () => void close(windowId));
        entry.dialog = dialog;
        dialog.showModal();
      }
      channel.onmessage = (event) => {
        const parsed = BrowserPreviewMessage.safeParse(event.data);
        if (!parsed.success || !entries.has(windowId)) return;
        const message = parsed.data;
        if (!dependencies.isCurrent()) {
          void close(windowId);
          return;
        }
        switch (message.type) {
          case "ready":
            publish(entry);
            break;
          case "close":
            void close(windowId);
            break;
          case "configure":
            if (message.patch.windowId === windowId)
              void configure(message.patch);
            break;
          case "neighbor":
            if (
              message.request.windowId === windowId &&
              message.request.saveId === entry.state?.saveId
            )
              for (const listener of neighbors) listener(message.request);
            break;
          case "export":
            if (entry.state)
              void dependencies
                .exportFile(entry.state.saveId, entry.state.fileIndex)
                .catch((error: Error) =>
                  channel.postMessage({
                    type: "error",
                    message: error.message,
                  }),
                );
            break;
        }
      };
      try {
        await navigate({ windowId, ...input });
        publish(entry);
        return { windowId };
      } catch (error) {
        await close(windowId);
        throw error;
      }
    },
    configure,
    navigate,
    close,
    subscribe(listener: (request: PreviewNeighborRequest) => void) {
      neighbors.add(listener);
      return () => {
        neighbors.delete(listener);
      };
    },
    dispose() {
      for (const id of entries.keys()) void close(id);
      neighbors.clear();
    },
  };
}
