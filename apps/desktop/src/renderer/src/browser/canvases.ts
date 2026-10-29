import { createCanvasClient } from "@shared/canvas-client";
import type { WebValue } from "@shared/web-serialization";

export function createBrowserCanvases(
  request: (path: string, body: string) => Promise<WebValue>,
) {
  return createCanvasClient((name, params) =>
    request("query", JSON.stringify({ name, params })),
  );
}
