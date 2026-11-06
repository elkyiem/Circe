import type {
  EnrichmentFailure,
  MissingOriginal,
} from "@shared/enrichment-contracts";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export type {
  EnrichmentFailure,
  MissingOriginal,
} from "@shared/enrichment-contracts";

interface EnrichmentStatus {
  state?: "starting" | "ready" | "paused" | "failed";
  error?: string;
  inflight: number;
  activeKeys: ReadonlySet<string>;
  failedKeys: ReadonlySet<string>;
  failures: readonly EnrichmentFailure[];
  missingOriginals: readonly MissingOriginal[];
}

const store = new Store<EnrichmentStatus>({
  inflight: 0,
  activeKeys: new Set<string>(),
  failedKeys: new Set<string>(),
  failures: [],
  missingOriginals: [],
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
