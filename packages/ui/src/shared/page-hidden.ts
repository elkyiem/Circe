/** Throttled windows pause animation frames, so motion started while hidden can stall partway. */
export function pageHidden() {
  return globalThis.document?.visibilityState === "hidden";
}
