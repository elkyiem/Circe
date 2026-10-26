import { useCallback, useRef } from "react";

const READER_INPUTS = ["wheel", "touchmove", "pointerdown", "keydown"] as const;

/** History and media load after a chat opens, so hold it at the latest message until the reader scrolls. */
export function useOpenAtBottom() {
  const release = useRef<(() => void) | null>(null);
  return useCallback((node: HTMLDivElement | null) => {
    release.current?.();
    release.current = null;
    if (!node) return;
    const pin = () => {
      node.scrollTop = node.scrollHeight;
    };
    const mutations = new MutationObserver(pin);
    const resize = new ResizeObserver(pin);
    const stop = () => {
      mutations.disconnect();
      resize.disconnect();
      node.removeEventListener("load", pin, true);
      for (const type of READER_INPUTS) node.removeEventListener(type, onInput);
      release.current = null;
    };
    function onInput(event: Event) {
      if (event.type === "wheel" || event.type === "touchmove") stop();
      else if (event.target === node) stop();
    }
    pin();
    mutations.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    resize.observe(node);
    node.addEventListener("load", pin, true);
    for (const type of READER_INPUTS)
      node.addEventListener(type, onInput, { passive: true });
    release.current = stop;
  }, []);
}
