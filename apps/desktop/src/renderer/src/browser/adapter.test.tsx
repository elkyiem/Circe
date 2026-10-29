import { DEFAULT_PREFS } from "@pond/schema";
import { afterEach, expect, it, vi } from "vitest";
import { version } from "../../../../package.json";
import { readPromptSignals } from "../app/components/prompts/signals";
import { installBrowserAdapter } from "./adapter";

class BrowserEvents extends EventTarget {
  static latest: BrowserEvents | null = null;
  constructor() {
    super();
    BrowserEvents.latest = this;
  }
  close(): void {}
}

afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.runtime;
  delete document.documentElement.dataset.hostPlatform;
  BrowserEvents.latest = null;
});

it("receives background repair history and serializes browser Undo with the acknowledged revision", async () => {
  const firstBegan = Promise.withResolvers<void>();
  const releaseFirst = Promise.withResolvers<void>();
  const requests: Array<{ kind: string; revision: number }> = [];
  vi.stubGlobal("EventSource", BrowserEvents);
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (path === "/web/capabilities")
      return Response.json({ host: { platform: "darwin" } });
    if (path === "/web/query") {
      const input = JSON.parse(String(init?.body));
      if (input.name === "settings.getPrefs")
        return Response.json(DEFAULT_PREFS);
      if (input.name === "library.info")
        return Response.json(
          { path: "/library", icon: null },
          { headers: { "x-iris-history": "6" } },
        );
    }
    if (path === "/web/history") {
      if (!init?.body)
        return Response.json({ revision: 0, canUndo: false, canRedo: false });
      const input = JSON.parse(String(init.body));
      requests.push(input);
      if (requests.length === 1) {
        firstBegan.resolve();
        await releaseFirst.promise;
      }
      return Response.json({
        revision: input.revision + 1,
        canUndo: requests.length < 2,
        canRedo: true,
      });
    }
    throw new Error(`Unexpected host request: ${path}`);
  });
  await installBrowserAdapter("repair-history-test");
  await expect(window.pond.undo()).resolves.toMatchObject({
    ok: false,
    canUndo: false,
  });
  expect(requests).toEqual([]);
  const events = BrowserEvents.latest;
  if (!events) throw new Error("Missing host event connection");
  events.dispatchEvent(
    new MessageEvent("history", {
      data: JSON.stringify({ revision: 7, canUndo: true, canRedo: false }),
    }),
  );
  events.dispatchEvent(
    new MessageEvent("history", {
      data: JSON.stringify({ revision: 6, canUndo: false, canRedo: false }),
    }),
  );
  await window.pond.query("library.info", {});
  const first = window.pond.undo();
  await firstBegan.promise;
  const second = window.pond.undo();
  expect(requests).toEqual([{ kind: "undo", revision: 7 }]);
  releaseFirst.resolve();
  await Promise.all([first, second]);
  expect(requests).toEqual([
    { kind: "undo", revision: 7 },
    { kind: "undo", revision: 8 },
  ]);
  await expect(window.pond.undo()).resolves.toMatchObject({
    ok: false,
    canUndo: false,
  });
  expect(requests).toHaveLength(2);
});

it("keeps native client detection and unavailable thermal telemetry on the visiting device", async () => {
  const queries: string[] = [];
  vi.stubGlobal("EventSource", BrowserEvents);
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (path === "/web/capabilities")
      return Response.json({ host: { platform: "darwin" } });
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

it("delivers deletion feedback on the visiting device without a host query or false connection error", async () => {
  const notifications: string[] = [];
  const errors: string[] = [];
  class VisitingNotification {
    static permission: NotificationPermission = "granted";
    constructor(title: string) {
      notifications.push(title);
    }
  }
  vi.stubGlobal("Notification", VisitingNotification);
  vi.stubGlobal("EventSource", BrowserEvents);
  const prefs = {
    ...DEFAULT_PREFS,
    feedback: {
      ...DEFAULT_PREFS.feedback,
      notifications: {
        ...DEFAULT_PREFS.feedback.notifications,
        saveDeletion: true,
        folderDeletion: false,
      },
    },
  };
  vi.stubGlobal("fetch", async (path: string, init?: RequestInit) => {
    if (path === "/web/capabilities")
      return Response.json({ host: { platform: "darwin" } });
    if (path === "/web/history")
      return Response.json({ revision: 0, canUndo: false, canRedo: false });
    if (
      path === "/web/query" &&
      JSON.parse(String(init?.body)).name === "settings.getPrefs"
    )
      return Response.json(prefs);
    throw new Error(`Unexpected host feedback request: ${path}`);
  });
  const receive = (event: Event) => {
    if (event instanceof CustomEvent) errors.push(String(event.detail));
  };
  window.addEventListener("iris-error", receive);
  try {
    await installBrowserAdapter("feedback-test");
    await expect(
      window.pond.query("feedback.emit", { event: "saveDeletion" }),
    ).resolves.toEqual({ ok: true });
    expect(notifications).toEqual(["Save Removed"]);
    await window.pond.query("feedback.emit", { event: "folderDeletion" });
    VisitingNotification.permission = "denied";
    await window.pond.query("feedback.emit", { event: "saveDeletion" });
    expect(notifications).toEqual(["Save Removed"]);
    expect(errors).toEqual([]);
  } finally {
    window.removeEventListener("iris-error", receive);
  }
});
