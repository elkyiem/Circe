import type { MenuActionSource } from "../../shared/constants";

export function menuActionSourceFromClick(event?: {
  triggeredByAccelerator?: boolean;
}): MenuActionSource {
  return event?.triggeredByAccelerator ? "accelerator" : "menu";
}

/** Accelerator keypresses must stay on the focused window so a connect or source window is not buried. */
export function shouldOpenLibraryForMenuAction(
  source: MenuActionSource,
): boolean {
  return source !== "accelerator";
}
