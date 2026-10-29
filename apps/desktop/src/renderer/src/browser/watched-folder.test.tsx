import { HostLocationEntrySchema } from "@shared/web-host-locations";
import { afterEach, expect, it, vi } from "vitest";
import { finishHostLocation, hostLocationPickerStore } from "./host-locations";
import { createBrowserWatchedFolder } from "./watched-folder";

afterEach(() => finishHostLocation(null));

it("cancels choosing a watched folder without enabling or changing the native watcher", async () => {
  const request = vi.fn(async () => ({ ok: true }));
  const client = createBrowserWatchedFolder(request);
  const selection = client.query("autoImport.pickFolder", {});
  expect(hostLocationPickerStore.state?.purpose).toBe("watch");
  finishHostLocation(null);
  await expect(selection).resolves.toEqual({ ok: false, reason: "cancelled" });
  expect(request).not.toHaveBeenCalled();
});

it("sends the operation-scoped handle instead of the displayed Mac path", async () => {
  const entry = HostLocationEntrySchema.parse({
    handle: crypto.randomUUID(),
    path: "/Users/owner/Incoming",
    name: "Incoming",
    kind: "directory",
  });
  const request = vi.fn(async (_path: string, _body?: string) => ({
    ok: true,
    path: entry.path,
  }));
  const client = createBrowserWatchedFolder(request);
  const selected = client.query("autoImport.pickFolder", {});
  finishHostLocation({ entry });
  await expect(selected).resolves.toEqual({ ok: true, path: entry.path });
  expect(request).toHaveBeenCalledWith(
    "watched-folder",
    JSON.stringify({
      name: "autoImport.pickFolder",
      params: { folder: entry.handle },
    }),
  );
  await expect(
    client.query("autoImport.set", { path: entry.path, enabled: true }),
  ).rejects.toThrow();
  expect(request).toHaveBeenCalledOnce();
});
