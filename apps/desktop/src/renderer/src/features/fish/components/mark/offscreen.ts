const targets = new Map<Element, (offscreen: boolean) => void>();
let observer: IntersectionObserver | null = null;

/** Offscreen marks keep interpolating yaw, which recalculates every lobe on the main thread. */
export function watchOffscreen(
  element: Element,
  onChange: (offscreen: boolean) => void,
): () => void {
  if (!("IntersectionObserver" in globalThis)) return () => {};
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        targets.get(entry.target)?.(!entry.isIntersecting);
      }
    },
    { rootMargin: "80px" },
  );
  targets.set(element, onChange);
  observer.observe(element);
  return () => {
    targets.delete(element);
    observer?.unobserve(element);
    if (targets.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}
