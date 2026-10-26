import { afterEach, expect, it, vi } from "vitest";
import { createBrowserFiles } from "./files";

afterEach(() => vi.unstubAllGlobals());

it("picks a Data Export on the visiting device and sends an opaque upload ticket", async () => {
  const token = "iris-upload:11111111-1111-4111-8111-111111111111";
  vi.stubGlobal("fetch", async () =>
    Response.json({ token, name: "archive.zip", size: 7 }),
  );
  const request = vi.fn(async (_path: string, _body?: string) => ({
    ok: true,
    imported: 1,
    skipped: 0,
    failed: 0,
    platforms: ["X"],
    connect: [],
  }));
  const adapter = createBrowserFiles({ request, headers: () => ({}) });
  const importing = adapter.query("saves.importDataExport", {});
  const picker = document.querySelector('input[type="file"]');
  expect(picker).toBeInstanceOf(HTMLInputElement);
  if (!(picker instanceof HTMLInputElement))
    throw new Error("No Data Export picker.");
  expect(picker.accept).toContain(".zip");
  Object.defineProperty(picker, "files", {
    value: [new File(["archive"], "archive.zip")],
  });
  picker.dispatchEvent(new Event("change"));
  await expect(importing).resolves.toMatchObject({ ok: true, imported: 1 });
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "files",
    JSON.stringify({
      name: "saves.importDataExport",
      params: { paths: [token] },
    }),
  );
  expect(document.querySelector('input[type="file"]')).toBeNull();
});
