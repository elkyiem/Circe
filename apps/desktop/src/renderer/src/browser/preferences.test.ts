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
