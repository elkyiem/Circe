import { LibraryMarkSourceSchema } from "@shared/library-mark";
import type { HostLocationsRequest } from "@shared/web-host-locations";
import {
  HostLocationEntrySchema,
  HostLocationListingSchema,
  type HostLocationPurpose,
  HostRecentLibrariesSchema,
} from "@shared/web-host-locations";
import type { WebLibraryRequest } from "@shared/web-library-contracts";
import { WebLibraryRequestSchema } from "@shared/web-library-contracts";
import { WebLibraryCopySchema } from "@shared/web-library-copy-contracts";
import type { WebValue } from "@shared/web-serialization";
import { z } from "zod";
import { pickHostLocation } from "./host-locations";
import { waitForHostRestart } from "./host-restart";

const Info = z.object({ path: z.string(), name: z.string() });
export const LibraryClientParamsSchema = z.object({
  path: z.string().optional(),
  name: z.string().optional(),
  icon: z.string().nullable().optional(),
  mark: LibraryMarkSourceSchema.nullable().optional(),
  accent: z.string().nullable().optional(),
  source: z.string().optional(),
  destination: z.string().optional(),
  ids: z.array(z.string()).optional(),
});
type LibraryClientParams = z.infer<typeof LibraryClientParamsSchema>;
const Reply = z.object({
  ok: z.boolean(),
  restarting: z.boolean(),
  reloading: z.boolean().optional(),
});
const names = new Set([
  "library.pickFolder",
  "library.pickExisting",
  "library.createAt",
  "library.switchTo",
  "library.rename",
  "library.move",
  "library.backupTo",
  "library.restoreBackup",
  "library.mergeFrom",
  "library.recent",
  "library.openInFinder",
  "saves.copyToLibrary",
]);
export function createBrowserLibrary(
  request: (path: string, body?: string) => Promise<WebValue>,
) {
  const sources = new Map<string, string>();
  const parents = new Map<string, string>();
  const sendLocation = (input: HostLocationsRequest) =>
    request("locations", JSON.stringify(input));
  const pick = (
    purpose: HostLocationPurpose,
    title: string,
    name?: string,
    initial?: string,
  ) =>
    pickHostLocation({
      purpose,
      title,
      name,
      initial,
      list: async (input) =>
        HostLocationListingSchema.parse(await sendLocation(input)),
      mkdir: async (input) =>
        HostLocationEntrySchema.parse(await sendLocation(input)),
    });
  const info = async () =>
    Info.parse(
      await request(
        "query",
        JSON.stringify({ name: "library.info", params: {} }),
      ),
    );
  async function readInstance(remainingMs = 5000) {
    const response = await fetch("/web/ready", {
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(1, Math.min(5000, remainingMs))),
    });
    if (!response.ok) throw new Error("The host is restarting.");
    return z
      .object({ instance: z.string().min(1) })
      .parse(await response.json()).instance;
  }
  async function transition(input: WebLibraryRequest) {
    const previous = await readInstance();
    const result = await request(
      "library",
      JSON.stringify(WebLibraryRequestSchema.parse(input)),
    );
    const state = Reply.parse(result);
    if (state.ok && (state.restarting || state.reloading)) {
      window.dispatchEvent(
        new CustomEvent("iris-connection", {
          detail: "Opening the Library · reconnecting to the host…",
        }),
      );
      if (state.restarting)
        await waitForHostRestart({
          previous,
          readInstance,
          pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          attempts: 120,
          timeoutMs: 60000,
        });
      location.reload();
    }
    return result;
  }
  async function destination(
    purpose: HostLocationPurpose,
    title: string,
    name: string,
  ) {
    const selection = await pick(purpose, title, name);
    if (!selection) return null;
    if (!selection.name) throw new Error("Enter a Library name.");
    return { parent: selection.entry.handle, name: selection.name };
  }
  return {
    handles: (name: string) => names.has(name),
    async query(name: string, raw: LibraryClientParams): Promise<WebValue> {
      if (name === "library.recent") {
        const rows = HostRecentLibrariesSchema.parse(
          await sendLocation({ action: "recent" }),
        );
        for (const row of rows)
          if (row.source) sources.set(row.entry.path, row.source);
        return rows.map((row) => row.entry);
      }
      if (name === "library.openInFinder") {
        const entry = HostLocationEntrySchema.parse(
          await sendLocation({ action: "inspect" }),
        );
        await pick(
          "inspect",
          "Browse host Library folder",
          undefined,
          entry.handle,
        );
        return { ok: true };
      }
      if (name === "library.pickFolder" || name === "library.pickExisting") {
        const purpose = name === "library.pickFolder" ? "parent" : "open";
        const selected = await pick(
          purpose,
          purpose === "parent"
            ? "Choose where to save the Library"
            : "Open a Library on the host",
        );
        if (!selected) return { ok: false, reason: "cancelled" };
        (purpose === "parent" ? parents : sources).set(
          selected.entry.path,
          selected.entry.handle,
        );
        return { ok: true, path: selected.entry.path };
      }
      if (name === "saves.copyToLibrary") {
        const selected = await pick(
          "copy",
          "Copy Saves to a Library on the host",
        );
        if (!selected) return { ok: false, reason: "cancelled" };
        return request(
          "copy-library",
          JSON.stringify(
            WebLibraryCopySchema.parse({
              ids: raw.ids,
              destination: selected.entry.handle,
            }),
          ),
        );
      }
      if (name === "library.rename")
        return transition(WebLibraryRequestSchema.parse({ name, params: raw }));
      const params = raw;
      if (name === "library.createAt") {
        const parent = params.path ? parents.get(params.path) : undefined;
        if (!parent || !params.name)
          throw new Error(
            "Choose the parent folder again before creating a Library.",
          );
        return transition({ name, params: { parent, name: params.name } });
      }
      if (name === "library.switchTo") {
        const source = params.path ? sources.get(params.path) : undefined;
        if (!source)
          throw new Error("Choose this Library again before opening it.");
        return transition({ name, params: { source } });
      }
      if (name === "library.mergeFrom") {
        const selected = await pick("merge", "Merge Saves from a host Library");
        return selected
          ? transition({ name, params: { source: selected.entry.handle } })
          : { ok: false, reason: "cancelled" };
      }
      const current = await info();
      if (name === "library.move" || name === "library.backupTo") {
        const purpose = name === "library.move" ? "move" : "backup";
        const file =
          purpose === "move"
            ? (current.path.split(/[\\/]/).at(-1) ?? `${current.name}.pond`)
            : `${current.name} Backup ${new Date().toISOString().slice(0, 10)}.pond`;
        const target = await destination(
          purpose,
          purpose === "move"
            ? "Move Library on the host"
            : "Back up Library on the host",
          file,
        );
        return target
          ? transition({ name, params: { destination: target } })
          : { ok: false, reason: "cancelled" };
      }
      if (name === "library.restoreBackup") {
        const source = await pick(
          "restore-source",
          "Choose a Library backup on the host",
        );
        if (!source) return { ok: false, reason: "cancelled" };
        const target = await destination(
          "restore-destination",
          "Restore backup on the host",
          `${source.entry.name.replace(/\.pond$/i, "")} Restored.pond`,
        );
        return target
          ? transition({
              name,
              params: { source: source.entry.handle, destination: target },
            })
          : { ok: false, reason: "cancelled" };
      }
      throw new Error("Unknown Library action.");
    },
  };
}
