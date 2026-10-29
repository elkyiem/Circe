import {
  type EnrichmentStatus,
  EnrichmentStatusSchema,
} from "@shared/enrichment-contracts";
import { useEffect } from "react";
import { enrichmentMonitor } from "../state/enrichment-monitor";

/** UI windows observe the resident host owner; closing a client never cancels processing. */
export function EnrichmentSweep() {
  useEffect(() => {
    let disposed = false;
    const receive = (raw: EnrichmentStatus) => {
      if (disposed) return;
      const status = EnrichmentStatusSchema.parse(raw);
      enrichmentMonitor.set({
        ...status,
        activeKeys: new Set(status.activeKeys),
        failedKeys: new Set(status.failedKeys),
      });
    };
    const detach = window.pond.onEnrichmentStatus(receive);
    void window.pond
      .query("enrichment.status", {})
      .then(receive)
      .catch((error) =>
        console.error("[enrichment] status unavailable", error),
      );
    return () => {
      disposed = true;
      detach();
    };
  }, []);
  return null;
}
