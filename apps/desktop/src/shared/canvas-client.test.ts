import { expect, it, vi } from "vitest";
import { type CanvasClientParams, createCanvasClient } from "./canvas-client";

const content = {
  viewport: { x: 0, y: 0, zoom: 1 },
  items: [],
  connectors: [],
};
const snapshot = (version = "a".repeat(64)) => ({
  id: "board",
  name: "Board",
  createdAt: 1,
  updatedAt: 1,
  ...content,
  contentVersion: version,
});

it("serializes reads and writes against acknowledged versions in both UI transports", async () => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const request = vi.fn(async (name: string, params: CanvasClientParams) => {
    if (name === "canvases.get") return snapshot();
    if (
      request.mock.calls.filter(([name]) => name === "canvases.update")
        .length === 1
    )
      await held;
    return {
      ok: true,
      updatedAt: 2,
      contentVersion:
        params.expectedContent === "a".repeat(64)
          ? "b".repeat(64)
          : "c".repeat(64),
    };
  });
  const client = createCanvasClient(request);
  await client.query("canvases.get", { id: "board" });
  const first = client.query("canvases.update", { id: "board", content });
  const second = client.query("canvases.update", { id: "board", content });
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  release();
  await Promise.all([first, second]);
  expect(request.mock.calls[1]?.[1].expectedContent).toBe("a".repeat(64));
  expect(request.mock.calls[2]?.[1].expectedContent).toBe("b".repeat(64));
});

it("requires a fresh read after an uncertain write and recovers its queue", async () => {
  const request = vi.fn(async (name: string) => {
    if (name === "canvases.get") return snapshot();
    throw new Error("Connection lost");
  });
  const client = createCanvasClient(request);
  await client.query("canvases.get", { id: "board" });
  await expect(
    client.query("canvases.update", { id: "board", content }),
  ).rejects.toThrow("Connection lost");
  await expect(
    client.query("canvases.update", { id: "board", content }),
  ).rejects.toThrow("Reload");
  expect(request).toHaveBeenCalledTimes(2);
  await client.query("canvases.get", { id: "board" });
  await expect(
    client.query("canvases.update", { id: "board", content }),
  ).rejects.toThrow("Connection lost");
  expect(request).toHaveBeenCalledTimes(4);
});
