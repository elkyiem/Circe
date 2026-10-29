import { DEFAULT_PREFS } from "@pond/schema";
import { WebInferenceSchema } from "@shared/enrichment-contracts";
import { expect, it, vi } from "vitest";
import { installBrowserAdapter } from "@/browser/adapter";
import { inferEmbedTexts } from "./inference-client";

it("batches a large browser vocabulary on the host and preserves result order", async () => {
  const original = window.pond;
  const batches: string[][] = [];
  class BrowserEvents extends EventTarget {
    close(): void {}
  }
  try {
    vi.stubGlobal("EventSource", BrowserEvents);
    vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
      if (path === "/web/capabilities")
        return Response.json({ host: { platform: "darwin" } });
      if (path === "/web/history")
        return Response.json({ revision: 0, canUndo: false, canRedo: false });
      const request = JSON.parse(String(init?.body));
      if (request.name === "settings.getPrefs")
        return Response.json(DEFAULT_PREFS);
      if (path !== "/web/inference") throw new Error("Unexpected query");
      const input = WebInferenceSchema.parse(request);
      if (input.op !== "embedTexts") throw new Error("Unexpected inference");
      batches.push(input.texts);
      return Response.json(input.texts.map((text) => [Number(text)]));
    });
    await installBrowserAdapter("vocabulary-test");
    const result = await inferEmbedTexts(
      Array.from({ length: 137 }, (_, i) => String(i)),
    );
    expect(batches.map((batch) => batch.length)).toEqual([64, 64, 9]);
    expect(result.map((vector) => vector[0])).toEqual(
      Array.from({ length: 137 }, (_, i) => i),
    );
  } finally {
    window.dispatchEvent(new Event("pagehide"));
    vi.unstubAllGlobals();
    window.pond = original;
    delete document.documentElement.dataset.runtime;
    delete document.documentElement.dataset.hostPlatform;
  }
});
