import type { Viewport } from "@xyflow/react";
import { isBrowserRuntime } from "@/shared/lib/platform";
import { usePrefs } from "@/shared/state/prefs";

/** React Flow owns a physical-pixel surface; its camera absorbs browser UI zoom. */
export function useCanvasInterfaceScale() {
  const [prefs] = usePrefs("window");
  return isBrowserRuntime() ? prefs.interfaceZoom / 100 : 1;
}

export function scaleCanvasViewport(
  viewport: Viewport,
  scale: number,
): Viewport {
  return {
    x: viewport.x * scale,
    y: viewport.y * scale,
    zoom: viewport.zoom * scale,
  };
}
