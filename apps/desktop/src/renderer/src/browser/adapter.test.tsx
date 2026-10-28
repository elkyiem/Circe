import { DEFAULT_PREFS } from "@pond/schema";
import { afterEach, expect, it, vi } from "vitest";
import { version } from "../../../../package.json";
import { readPromptSignals } from "../app/components/prompts/signals";
import { installBrowserAdapter } from "./adapter";

class BrowserEvents extends EventTarget {
  close(): void {}
}

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.runtime;
});

it("keeps native client detection and unavailable thermal telemetry on the visiting device", async () => {
  const queries: string[] = [];
  vi.stubGlobal("EventSource", BrowserEvents);
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (path === "/web/history")
      return Response.json({ revision: 0, canUndo: false, canRedo: false });
    if (path !== "/web/query" || !init?.body)
      throw new Error(`Unexpected browser request: ${path}`);
    const { name } = JSON.parse(String(init.body));
    queries.push(name);
    switch (name) {
      case "settings.getPrefs":
        return Response.json(DEFAULT_PREFS);
      case "saves.sidebarCounts":
        return Response.json({ library: 4 });
      case "accounts.list":
        return Response.json({ accounts: [] });
      case "sources.extensionLastSeen":
        return Response.json({ at: null });
      default:
        throw new Error(`Unexpected host query: ${name}`);
    }
  });
  await installBrowserAdapter("browser-capability-test");
  await expect(window.pond.machinePace()).resolves.toEqual({
    thermal: "unknown",
    onBattery: false,
  });
  const changed = vi.fn();
  const detach = window.pond.onMachinePace(changed);
  detach();
  expect(changed).not.toHaveBeenCalled();
  await expect(window.pond.query("agent.mcpClients", {})).resolves.toEqual({
    clients: [],
  });
  const signals = await readPromptSignals(Date.now());
  expect(signals.saves).toBe(4);
  expect(signals.mcp).toEqual([]);
  expect(queries).not.toContain("agent.mcpClients");
  expect((await window.pond.appInfo()).version).toBe(`${version}-web`);
});
