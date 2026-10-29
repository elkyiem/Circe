import type { Prefs } from "@pond/schema";

/** CSS zoom changes only this browser; host desktop windows keep their own zoom. */
export function followBrowserInterfaceZoom(input: {
  read(): Prefs;
  subscribe(listener: (prefs: Prefs) => void): () => void;
}) {
  let previous: number | null = null;
  let frame: number | null = null;
  const apply = (prefs: Prefs) => {
    if (previous === prefs.window.interfaceZoom) return;
    previous = prefs.window.interfaceZoom;
    document.documentElement.style.setProperty(
      "--browser-interface-zoom",
      String(previous / 100),
    );
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = null;
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body) {
        // Base UI's focused range input is visually hidden; its thumb owns the visible position.
        const control =
          focused instanceof HTMLInputElement && focused.type === "range"
            ? (focused.parentElement ?? focused)
            : focused;
        control.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
      }
    });
  };
  apply(input.read());
  const unsubscribe = input.subscribe(apply);
  return () => {
    unsubscribe();
    if (frame !== null) cancelAnimationFrame(frame);
  };
}
