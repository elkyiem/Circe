import { useLayoutEffect } from "react";
import { appHotkeyBlockedByEditable } from "@/shared/lib/editable-target";

/** Base UI popups close on a document Escape listener, even from their own fields. */
function dismissesOpenPopup(event: KeyboardEvent): boolean {
  if (event.key !== "Escape") return false;
  const target = event.target instanceof Element ? event.target : null;
  return target?.closest("[data-open]") != null;
}

export function EditableHotkeyGuard() {
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!appHotkeyBlockedByEditable(event)) return;
      if (dismissesOpenPopup(event)) return;
      event.stopPropagation();
    };
    /** The root element bubbles after React's field handlers and before TanStack hotkeys on document. */
    const root = document.documentElement;
    root.addEventListener("keydown", onKey);
    return () => root.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
