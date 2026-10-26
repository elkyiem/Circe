import { WebFileQuerySchema } from "@shared/web-files-contracts";
import { afterEach, expect, it, vi } from "vitest";
import { createBrowserFiles } from "./files";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

function picker() {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement))
    throw new Error("Missing device picker");
  return input;
}

it("chooses one visiting-device logo and sends only its upload ticket to the host", async () => {
  const token = "iris-upload:11111111-1111-4111-8111-111111111111";
  const file = new File(["image bytes"], "personal logo.png", {
    type: "image/png",
  });
  const upload = vi.fn(async () =>
    Response.json({ token, name: file.name, size: file.size }),
  );
  vi.stubGlobal("fetch", upload);
  const icon = "data:image/png;base64,aWNvbg==";
  const request = vi.fn(async (_path: string, _body?: string) => ({
    ok: true,
    icon,
  }));
  const adapter = createBrowserFiles({
    request,
    headers: () => ({ "x-iris-library": "test-library" }),
  });
  expect(adapter.handles("library.identity.pickIcon")).toBe(true);
  const pending = adapter.query("library.identity.pickIcon", {});
  const input = picker();
  expect(input.multiple).toBe(false);
  expect(input.accept).toContain(".png");
  Object.defineProperty(input, "files", { value: [file] });
  input.dispatchEvent(new Event("change"));
  expect(await pending).toEqual({ ok: true, icon });
  expect(input.isConnected).toBe(false);
  expect(upload).toHaveBeenCalledOnce();
  const operation = WebFileQuerySchema.parse(
    JSON.parse(request.mock.calls[0]?.[1] ?? "{}"),
  );
  expect(operation).toEqual({
    name: "library.identity.pickIcon",
    params: { paths: [token] },
  });
});

it("cancels the logo picker without uploading or changing identity", async () => {
  const request = vi.fn(async () => ({ ok: true }));
  const adapter = createBrowserFiles({ request, headers: () => ({}) });
  const pending = adapter.query("library.identity.pickIcon", {});
  const input = picker();
  input.dispatchEvent(new Event("cancel"));
  expect(await pending).toEqual({ ok: false, reason: "cancelled" });
  expect(input.isConnected).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

it("rejects an oversized logo before uploading it", async () => {
  const request = vi.fn(async () => ({ ok: true }));
  const upload = vi.fn();
  vi.stubGlobal("fetch", upload);
  const adapter = createBrowserFiles({ request, headers: () => ({}) });
  const pending = adapter.query("library.identity.pickIcon", {});
  const file = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "large.png", {
    type: "image/png",
  });
  Object.defineProperty(picker(), "files", { value: [file] });
  picker().dispatchEvent(new Event("change"));
  await expect(pending).rejects.toThrow("smaller than 8 MB");
  expect(upload).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
