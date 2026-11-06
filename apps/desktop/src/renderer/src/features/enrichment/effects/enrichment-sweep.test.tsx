import type { EnrichmentStatus } from "@shared/enrichment-contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { enrichmentMonitor } from "../state/enrichment-monitor";
import { EnrichmentSweep } from "./enrichment-sweep";

it("preserves named failures and missing originals from host status updates", async () => {
  const initial = enrichmentMonitor.snapshot();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const detach = vi.fn();
  let receive: ((status: EnrichmentStatus) => void) | undefined;
  const status: EnrichmentStatus = {
    state: "ready",
    inflight: 0,
    activeKeys: [],
    failedKeys: ["ocr:save-a"],
    failures: [
      {
        key: "ocr:save-a",
        saveId: "save-a",
        title: "Example",
        task: "ocr",
        reason: "Decode failed",
      },
    ],
    missingOriginals: [{ id: "save-b", title: "Missing photo" }],
  };
  Object.assign(window, {
    pond: {
      query: async () => status,
      onEnrichmentStatus: (listener: typeof receive) => {
        receive = listener;
        return detach;
      },
    },
  });
  try {
    await act(async () => root.render(<EnrichmentSweep />));
    expect(enrichmentMonitor.snapshot()).toMatchObject({
      failures: status.failures,
      missingOriginals: status.missingOriginals,
      failedKeys: new Set(["ocr:save-a"]),
    });
    await act(async () =>
      receive?.({ ...status, failures: [], missingOriginals: [] }),
    );
    expect(enrichmentMonitor.snapshot().missingOriginals).toEqual([]);
    await act(async () => root.unmount());
    expect(detach).toHaveBeenCalledOnce();
    receive?.(status);
    expect(enrichmentMonitor.snapshot().failures).toEqual([]);
  } finally {
    host.remove();
    enrichmentMonitor.set(initial);
  }
});
