import type { ToolbarAction } from "@/utils/types";

/** An empty popup makes the browser fire `action.onClicked`, which saves in one click. */
export async function applyToolbarAction(action: ToolbarAction): Promise<void> {
  if (!browser.action) return;
  await browser.action
    .setPopup({ popup: action === "popup" ? "popup.html" : "" })
    .catch(() => {});
  await browser.action
    .setTitle({
      title:
        action === "popup"
          ? browser.runtime.getManifest().name
          : `Save to ${browser.runtime.getManifest().name}`,
    })
    .catch(() => {});
}
