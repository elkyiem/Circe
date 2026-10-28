import { useLayoutEffect } from "react";
import { appHotkeyBlockedByEditable } from "@/shared/lib/editable-target";

export function EditableHotkeyGuard() {
  useLayoutEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!appHotkeyBlockedByEditable(event)) return;
      event.stopPropagation();
    };
    /** Fields and document-level widgets handle keys before window-level app hotkeys. */
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
