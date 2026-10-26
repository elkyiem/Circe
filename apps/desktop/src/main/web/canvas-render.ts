import { BrowserWindow, ipcMain } from "electron";
import { z } from "zod";
import {
  CANVAS_RENDER_IPC,
  CanvasRenderImageSchema,
  type WebCanvasRenderInput,
  WebCanvasRenderSchema,
} from "../../shared/web-canvas-contracts";
import { getPrefs } from "../core/prefs";
import { safeHandle } from "../ipc/helpers";
import { savesQueries } from "../ipc/queries/saves";
import { resolveMainOut, resolvePreload } from "../lib/resolve-preload";
import { libraryId } from "../paths";
import { WebRequestError } from "./errors";

interface RenderJob {
  window: BrowserWindow;
  libraryId: string;
  input: WebCanvasRenderInput;
  complete(image: ReturnType<typeof CanvasRenderImageSchema.parse>): void;
  fail(error: Error): void;
}
const jobs = new Map<number, RenderJob>();
let registered = false;
function jobFor(sender: number) {
  const job = jobs.get(sender);
  if (!job || job.libraryId !== libraryId())
    throw new Error("This Canvas render is no longer active.");
  return job;
}
function register() {
  if (registered) return;
  registered = true;
  ipcMain.on(CANVAS_RENDER_IPC.libraryId, (event) => {
    try {
      event.returnValue = jobFor(event.sender.id).libraryId;
    } catch {
      event.returnValue = "unbound";
    }
  });
  safeHandle(CANVAS_RENDER_IPC.ready, (event) => jobFor(event.sender.id).input);
  safeHandle(CANVAS_RENDER_IPC.finish, (event, raw) => {
    const job = jobFor(event.sender.id);
    const result = z
      .union([
        z.object({ image: CanvasRenderImageSchema }).strict(),
        z.object({ error: z.string().max(1000) }).strict(),
      ])
      .parse(raw);
    if ("image" in result) job.complete(result.image);
    else job.fail(new Error(result.error));
  });
  safeHandle(CANVAS_RENDER_IPC.query, async (event, name: string, params) => {
    const job = jobFor(event.sender.id);
    if (name === "settings.getPrefs")
      return {
        ...(await getPrefs()),
        preferences: job.input.preferences,
        viewer: job.input.viewer,
      };
    if (name === "saves.getMany") {
      const { ids } = z
        .object({ ids: z.array(z.string()).max(5000) })
        .parse(params);
      const allowed = new Set(
        job.input.canvas.items.flatMap((item) =>
          item.kind === "save" ? [item.saveId] : [],
        ),
      );
      if (ids.some((id) => !allowed.has(id)))
        throw new Error("This Save is outside the Canvas snapshot.");
      return savesQueries[name]({ ids });
    }
    if (name === "canvases.capture") {
      const rect = z
        .object({
          x: z.number().min(0),
          y: z.number().min(0),
          width: z.number().positive().max(1280),
          height: z.number().positive().max(900),
        })
        .strict()
        .parse(params);
      if (rect.x + rect.width > 1280 || rect.y + rect.height > 900)
        throw new Error("The capture rectangle is outside the render window.");
      const image = await job.window.webContents.capturePage({
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      return Uint8Array.from(image.toPNG());
    }
    throw new Error("This operation is unavailable in the Canvas renderer.");
  });
}

/** A dedicated trusted window renders only the validated snapshot, never the visible owner window. */
export async function renderWebCanvas(
  input: WebCanvasRenderInput,
  expected: string,
) {
  if (expected !== libraryId())
    throw new WebRequestError(
      "The active Library changed. Reload before exporting.",
    );
  if (jobs.size)
    throw new WebRequestError("Wait for the current Canvas export to finish.");
  register();
  const parsed = WebCanvasRenderSchema.parse(input);
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    useContentSize: true,
    webPreferences: {
      preload: resolvePreload("canvas-render.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  const senderId = window.webContents.id;
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const image = new Promise<ReturnType<typeof CanvasRenderImageSchema.parse>>(
      (resolve, reject) => {
        jobs.set(window.webContents.id, {
          window,
          libraryId: expected,
          input: parsed,
          complete: resolve,
          fail: reject,
        });
        timeout = setTimeout(
          () =>
            reject(
              new Error(
                "The Canvas render timed out. Try a smaller selection.",
              ),
            ),
          120000,
        );
        window.webContents.once("render-process-gone", () =>
          reject(new Error("The Canvas renderer stopped.")),
        );
        window.once("closed", () =>
          reject(new Error("The Canvas renderer closed.")),
        );
      },
    );
    // Observe loading and rendering together so neither rejection becomes an unhandled promise.
    const [result] = await Promise.all([
      image,
      window.loadFile(resolveMainOut("../renderer/canvas-render.html")),
    ]);
    if (expected !== libraryId())
      throw new WebRequestError(
        "The active Library changed. Reload before exporting.",
      );
    return result;
  } finally {
    clearTimeout(timeout);
    jobs.delete(senderId);
    if (!window.isDestroyed()) window.destroy();
  }
}
