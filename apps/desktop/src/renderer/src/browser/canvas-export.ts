import type { Canvas } from "@shared/canvas-contracts";
import { WebCanvasRenderSchema } from "@shared/web-canvas-contracts";
import { z } from "zod";
import { webRequest } from "./adapter";
import { downloadInBrowser } from "./files";

export async function exportBrowserCanvas(input: {
  canvas: Canvas;
  format: "png" | "pdf";
}) {
  const prefs = await window.pond.query("settings.getPrefs", {});
  const params = WebCanvasRenderSchema.parse({
    ...input,
    preferences: {
      ...prefs.preferences,
      appearance:
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    },
    viewer: prefs.viewer,
  });
  const result = z
    .object({ download: z.string(), filename: z.string() })
    .parse(
      await webRequest(
        "files",
        JSON.stringify({ name: "canvases.render", params }),
      ),
    );
  downloadInBrowser(result.download, result.filename);
}
