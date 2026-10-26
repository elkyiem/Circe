import { type Prefs, PrefsSchema } from "@pond/schema";
import { z } from "zod";

const DEVICE_SECTIONS = new Set([
  "preferences",
  "viewer",
  "sidebar",
  "folderViews",
  "savedViewViews",
  "tagPicker",
  "allTags",
  "sourcesView",
  "saveRecents",
  "search",
  "shortcuts",
]);
const Patch = z.record(z.string(), z.record(z.string(), z.json()));

/** Device presentation overrides never replace host provider, storage, or processing settings. */
export function createBrowserPreferences(input: {
  initial: Prefs;
  readDevice(): string | null;
  writeDevice(value: string): void;
  saveHost(patch: z.infer<typeof Patch>): Promise<Prefs>;
}) {
  let host = input.initial;
  const listeners = new Set<(prefs: Prefs) => void>();
  const read = () =>
    PrefsSchema.parse({
      ...host,
      ...Object.fromEntries(
        Object.entries(
          z
            .record(z.string(), z.json())
            .parse(JSON.parse(input.readDevice() ?? "{}")),
        ).filter(([section]) => DEVICE_SECTIONS.has(section)),
      ),
      setup: { version: 1 },
    });
  const publish = () => {
    const resolved = read();
    for (const listener of listeners) listener(resolved);
    return resolved;
  };
  return {
    read,
    subscribe(listener: (prefs: Prefs) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    receiveHost(prefs: Prefs) {
      host = prefs;
      publish();
    },
    async write(raw: z.infer<typeof Patch>) {
      const patch = Patch.parse(raw);
      const devicePatch = Object.fromEntries(
        Object.entries(patch).filter(([section]) =>
          DEVICE_SECTIONS.has(section),
        ),
      );
      const hostPatch = Object.fromEntries(
        Object.entries(patch).filter(
          ([section]) => !DEVICE_SECTIONS.has(section),
        ),
      );
      if (Object.keys(hostPatch).length) host = await input.saveHost(hostPatch);
      const next = PrefsSchema.parse(
        Object.fromEntries(
          Object.entries(read()).map(([section, value]) => [
            section,
            { ...value, ...devicePatch[section] },
          ]),
        ),
      );
      input.writeDevice(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(next).filter(([section]) =>
              DEVICE_SECTIONS.has(section),
            ),
          ),
        ),
      );
      return publish();
    },
  };
}
