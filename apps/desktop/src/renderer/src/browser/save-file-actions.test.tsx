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
    throw new Error("Missing visiting-device picker");
  return input;
}

it.each([
  "saves.setCustomThumbnail",
  "saves.replaceFile",
  "saves.loadSubtitles",
] as const)(
  "%s chooses on this device and sends only a Library-bound upload ticket",
  async (name) => {
    const token = "iris-upload:11111111-1111-4111-8111-111111111111";
    const file = new File(
      ["chosen bytes"],
      name === "saves.loadSubtitles" ? "captions.srt" : "chosen.png",
    );
    const upload = vi.fn(async () =>
      Response.json({ token, name: file.name, size: file.size }),
    );
    vi.stubGlobal("fetch", upload);
    const request = vi.fn(async (_path: string, _body?: string) => ({
      ok: true,
    }));
    const adapter = createBrowserFiles({
      request,
      headers: () => ({ "x-iris-library": "active-library" }),
    });
    const pending = adapter.query(name, { id: "save" });
    const input = picker();
    expect(input.multiple).toBe(false);
    if (name === "saves.loadSubtitles") expect(input.accept).toBe(".vtt,.srt");
    Object.defineProperty(input, "files", { value: [file] });
    input.dispatchEvent(new Event("change"));
    expect(await pending).toEqual({ ok: true });
    expect(input.isConnected).toBe(false);
    expect(
      WebFileQuerySchema.parse(JSON.parse(request.mock.calls[0]?.[1] ?? "{}")),
    ).toEqual({ name, params: { id: "save", paths: [token] } });
    expect(upload.mock.calls).toHaveLength(1);
  },
);

it.each([
  "saves.setCustomThumbnail",
  "saves.replaceFile",
  "saves.loadSubtitles",
] as const)("cancelling %s never uploads or changes the host", async (name) => {
  const request = vi.fn(async () => ({ ok: true }));
  const upload = vi.fn();
  vi.stubGlobal("fetch", upload);
  const adapter = createBrowserFiles({ request, headers: () => ({}) });
  const pending = adapter.query(name, { id: "save" });
  picker().dispatchEvent(new Event("cancel"));
  expect(await pending).toEqual({ ok: false, reason: "cancelled" });
  expect(request).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});

it("reads the visiting clipboard instead of the Mac clipboard for a thumbnail", async () => {
  const token = "iris-upload:22222222-2222-4222-8222-222222222222";
  const image = new Blob(["clipboard image"], { type: "image/png" });
  const read = vi.fn(async () => [
    { types: ["text/plain", "image/png"], getType: async () => image },
  ]);
  vi.stubGlobal("navigator", { clipboard: { read } });
  vi.stubGlobal("fetch", async () =>
    Response.json({ token, name: "Clipboard image", size: image.size }),
  );
  const request = vi.fn(async (_path: string, _body?: string) => ({
    ok: true,
  }));
  const adapter = createBrowserFiles({ request, headers: () => ({}) });
  await expect(
    adapter.query("saves.setThumbnailFromClipboard", { id: "save" }),
  ).resolves.toEqual({ ok: true });
  expect(read).toHaveBeenCalledOnce();
  expect(
    WebFileQuerySchema.parse(JSON.parse(request.mock.calls[0]?.[1] ?? "{}")),
  ).toEqual({
    name: "saves.setThumbnailFromClipboard",
    params: { id: "save", paths: [token] },
  });
});

it("retains clipboard denial and empty-clipboard outcomes without a native fallback", async () => {
  const read = vi.fn(async () => []);
  vi.stubGlobal("navigator", { clipboard: { read } });
  const request = vi.fn(async () => ({ ok: true }));
  const adapter = createBrowserFiles({ request, headers: () => ({}) });
  await expect(
    adapter.query("saves.setThumbnailFromClipboard", { id: "save" }),
  ).resolves.toEqual({ ok: false, error: "clipboard_empty" });
  read.mockRejectedValueOnce(
    new DOMException("Clipboard permission denied", "NotAllowedError"),
  );
  await expect(
    adapter.query("saves.setThumbnailFromClipboard", { id: "save" }),
  ).resolves.toMatchObject({
    ok: false,
    error: expect.stringContaining("Allow clipboard access"),
  });
  expect(request).not.toHaveBeenCalled();
});
