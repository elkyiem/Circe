import {
  WebFileQuerySchema,
  WebImportRelativePathsSchema,
} from "@shared/web-files-contracts";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserFiles } from "./files";

afterEach(() => vi.unstubAllGlobals());

it("uploads a large selection within host admission limits and retains directory names", async () => {
  let active = 0;
  let peak = 0;
  let completed = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    active++;
    peak = Math.max(peak, active);
    if (active > 8)
      return Response.json({ error: "Too many uploads" }, { status: 422 });
    await new Promise((resolve) => setTimeout(resolve, 1));
    active--;
    completed++;
    return Response.json({
      token: `iris-upload:${String(completed).padStart(8, "0")}-1111-4111-8111-111111111111`,
      name: "same.png",
      size: init.body instanceof File ? init.body.size : 0,
    });
  });
  const request = vi.fn(async (_path: string, _body?: string) => ({
    ok: true,
    ids: [],
  }));
  const adapter = createBrowserFiles({ request, headers: () => ({}) });
  const paths = Array.from({ length: 12 }, (_, index) => {
    const file = new File(["original bytes"], "same.png", {
      type: "image/png",
    });
    Object.defineProperty(file, "webkitRelativePath", {
      value: `Picked/Subfolder ${index}/same.png`,
    });
    return adapter.pathForFile(file);
  });
  await adapter.query("saves.importFiles", { paths });
  expect(completed).toBe(12);
  expect(peak).toBeLessThanOrEqual(8);
  const prepared = WebFileQuerySchema.parse(
    JSON.parse(request.mock.calls[0]?.[1] ?? "{}"),
  );
  expect(prepared.params.paths).toHaveLength(12);
  expect(
    Object.values(
      WebImportRelativePathsSchema.parse(prepared.params.relativePaths),
    ),
  ).toEqual(
    Array.from(
      { length: 12 },
      (_, index) => `Picked/Subfolder ${index}/same.png`,
    ),
  );
  await adapter.query("saves.importFiles", { paths });
  expect(completed).toBe(12);
});
