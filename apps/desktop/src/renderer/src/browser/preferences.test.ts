import { DEFAULT_PREFS, PrefsSchema } from "@pond/schema";
import { expect, it } from "vitest";
import { createBrowserPreferences } from "./preferences";

it("publishes the saved host model without reverting it to the pre-write snapshot", async () => {
  let stored: string | null = null;
  let host = PrefsSchema.parse(DEFAULT_PREFS);
  const preferences = createBrowserPreferences({
    initial: host,
    readDevice: () => stored,
    writeDevice: (value) => {
      stored = value;
    },
    saveHost: async (patch) => {
      host = PrefsSchema.parse({
        ...host,
        agent: { ...host.agent, ...patch.agent },
      });
      return host;
    },
  });
  const published: string[] = [];
  preferences.subscribe((prefs) =>
    published.push(prefs.agent.modelIds.codex ?? ""),
  );
  const saved = await preferences.write({
    agent: { languageModel: "codex", modelIds: { codex: "default" } },
  });
  expect(saved.agent.modelIds.codex).toBe("default");
  expect(published).toEqual(["default"]);
  expect(JSON.parse(stored ?? "{}")).not.toHaveProperty("agent");
  await preferences.write({ viewer: { muted: true } });
  expect(preferences.read().agent.modelIds.codex).toBe("default");
  preferences.receiveHost(
    PrefsSchema.parse({
      ...host,
      agent: { ...host.agent, modelIds: { codex: "updated" } },
    }),
  );
  expect(preferences.read().agent.modelIds.codex).toBe("updated");
});

it("keeps browser zoom local while applying the other window settings to the host", async () => {
  let stored: string | null = null;
  let host = PrefsSchema.parse(DEFAULT_PREFS);
  let writes = 0;
  const preferences = createBrowserPreferences({
    initial: host,
    readDevice: () => stored,
    writeDevice: (value) => {
      stored = value;
    },
    saveHost: async (patch) => {
      writes++;
      expect(patch.window).not.toHaveProperty("interfaceZoom");
      host = PrefsSchema.parse({
        ...host,
        window: { ...host.window, ...patch.window },
      });
      return host;
    },
  });
  await preferences.write({
    window: { interfaceZoom: 150, restorePosition: false },
  });
  expect(host.window.interfaceZoom).toBe(DEFAULT_PREFS.window.interfaceZoom);
  expect(host.window.restorePosition).toBe(false);
  expect(preferences.read().window.interfaceZoom).toBe(150);
  expect(JSON.parse(stored ?? "{}").window).toEqual({ interfaceZoom: 150 });
  await preferences.write({ window: { interfaceZoom: 125 } });
  expect(writes).toBe(1);
  preferences.receiveHost(
    PrefsSchema.parse({
      ...host,
      window: { ...host.window, interfaceZoom: 80, closeToTray: false },
    }),
  );
  expect(preferences.read().window).toMatchObject({
    interfaceZoom: 125,
    closeToTray: false,
  });
});
