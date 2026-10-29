import {
  SHORTCUT_PLATFORM,
  type shortcutPlatformFromName,
} from "@shared/shortcuts";
import { eventFromEditable } from "@/shared/lib/editable-target";

/** Browser Edit shortcuts feed the same surface/history owner as the native Edit menu. */
export function onBrowserEditRequest(
  kind: "undo" | "redo",
  callback: () => void,
  platform: ReturnType<typeof shortcutPlatformFromName> = SHORTCUT_PLATFORM,
) {
  const mac = platform === "mac";
  const keydown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      eventFromEditable(event)
    )
      return;
    const modifier = mac
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey && !event.metaKey;
    if (!modifier) return;
    const key = event.key.toLowerCase();
    const requested =
      key === "z"
        ? event.shiftKey
          ? "redo"
          : "undo"
        : !mac && key === "y" && !event.shiftKey
          ? "redo"
          : null;
    if (requested !== kind) return;
    event.preventDefault();
    callback();
  };
  window.addEventListener("keydown", keydown);
  return () => window.removeEventListener("keydown", keydown);
}
