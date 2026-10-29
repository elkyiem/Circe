import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface EnrichmentStatus {
  state?: "starting" | "ready" | "paused" | "failed";
  error?: string;
  inflight: number;
  activeKeys: ReadonlySet<string>;
  failedKeys: ReadonlySet<string>;
}

const store = new Store<EnrichmentStatus>({
  inflight: 0,
  activeKeys: new Set<string>(),
  failedKeys: new Set<string>(),
});

export const enrichmentMonitor = {
  snapshot: () => store.state,
  subscribe: (listener: () => void) => store.subscribe(listener),
  set(patch: Partial<EnrichmentStatus>): void {
    store.setState((s) => ({ ...s, ...patch }));
  },
};

export function useEnrichmentStatus() {
  return useSelector(store, (state) => state);
}
