import { DEFAULT_PREFS } from "@pond/schema";
import { expect, it } from "vitest";
import {
  CanvasRenderImageSchema,
  WebCanvasRenderSchema,
} from "./web-canvas-contracts";

const canvas = {
  id: "export-fixture",
  name: "Export fixture",
  createdAt: 1,
  updatedAt: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  items: [
    {
      id: "note",
      kind: "note",
      text: "Exported content",
      color: "yellow",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    },
  ],
  connectors: [],
};
const request = {
  canvas,
  format: "png",
  preferences: DEFAULT_PREFS.preferences,
  viewer: DEFAULT_PREFS.viewer,
};
it("accepts a bounded snapshot and rejects empty exports or host settings", () => {
  expect(WebCanvasRenderSchema.parse(request).canvas.name).toBe(
    "Export fixture",
  );
  expect(
    WebCanvasRenderSchema.safeParse({
      ...request,
      canvas: { ...canvas, items: [] },
    }).success,
  ).toBe(false);
  expect(
    WebCanvasRenderSchema.safeParse({
      ...request,
      agent: { languageModel: "codex" },
    }).success,
  ).toBe(false);
  expect(
    WebCanvasRenderSchema.safeParse({
      ...request,
      outputPath: "/host/file.png",
    }).success,
  ).toBe(false);
});
it("rejects empty or non-PNG render replies before creating a download", () => {
  expect(
    CanvasRenderImageSchema.safeParse({
      png: new Uint8Array(),
      width: 1,
      height: 1,
    }).success,
  ).toBe(false);
  expect(
    CanvasRenderImageSchema.safeParse({
      png: new TextEncoder().encode("not a PNG"),
      width: 1,
      height: 1,
    }).success,
  ).toBe(false);
  expect(
    CanvasRenderImageSchema.safeParse({
      png: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      width: 6001,
      height: 1,
    }).success,
  ).toBe(false);
});
