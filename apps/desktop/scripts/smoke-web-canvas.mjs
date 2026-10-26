import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { connectWebHost } from "./web-smoke-client.mjs";

const host = await connectWebHost();
const prefs = await host.query("settings.getPrefs");
const saves = await host.query("saves.listPage", { limit: 100 });
const image = saves.rows.find((save) => save.sourceId === "900000000000000002");
assert.ok(image);
const canvas = await host.query("canvases.create", {
  name: "Canvas export fixture",
  saveIds: [image.id],
});
const content = {
  viewport: canvas.viewport,
  items: canvas.items,
  connectors: canvas.connectors,
};
const expectedContent = createHash("sha256")
  .update(JSON.stringify(content))
  .digest("hex");
const note = {
  id: "iris-note",
  kind: "note",
  x: 500,
  y: 40,
  width: 300,
  height: 180,
  color: "yellow",
  text: "Canvas export text fixture",
};
const figure = {
  id: "iris-figure",
  kind: "figure",
  x: 1500,
  y: 40,
  width: 200,
  height: 160,
  color: "blue",
  outline: "rectangle",
  text: "Second tile",
};
await host.query("canvases.update", {
  id: canvas.id,
  expectedContent,
  content: {
    ...content,
    items: [...content.items, note, figure],
    connectors: [
      {
        id: "iris-connector",
        from: note.id,
        to: figure.id,
        fromSide: "right",
        toSide: "left",
        label: "Preserved relationship",
      },
    ],
  },
});
const stored = await host.query("canvases.get", { id: canvas.id });
for (const format of ["png", "pdf"]) {
  const response = await host.request("files", {
    name: "canvases.render",
    params: {
      canvas: stored,
      format,
      preferences: prefs.preferences,
      viewer: prefs.viewer,
    },
  });
  assert.equal(response.status, 200, await response.clone().text());
  const artifact = await response.json();
  const download = await fetch(`${host.origin}${artifact.download}`, {
    headers: host.headers,
  });
  assert.equal(download.status, 200);
  const bytes = Buffer.from(await download.arrayBuffer());
  await writeFile(join(host.sandbox, `canvas-export.${format}`), bytes);
  if (format === "png") {
    const metadata = await sharp(bytes).metadata();
    assert.ok(
      metadata.width >= 1796 && metadata.height >= 316,
      JSON.stringify(metadata),
    );
    const statistics = await sharp(bytes).stats();
    assert.ok(
      statistics.channels.some((channel) => channel.stdev > 20),
      "The export must contain rendered content, not a flat/blank page.",
    );
    const scale = metadata.width / 1796;
    const rightBytes = await sharp(bytes)
      .extract({
        left: Math.round(1550 * scale),
        top: Math.round(100 * scale),
        width: Math.round(50 * scale),
        height: Math.round(50 * scale),
      })
      .toBuffer();
    const right = await sharp(rightBytes).stats();
    assert.ok(
      right.channels[2].mean > right.channels[0].mean,
      "The blue figure on the second tile must be captured.",
    );
  } else assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  assert.equal((await fetch(`${host.origin}${artifact.download}`)).status, 401);
  assert.deepEqual(
    await host.query("canvases.get", { id: canvas.id }),
    stored,
    "Rendering must not autosave the export window's viewport or board state.",
  );
}
console.log(
  "WEB_CANVAS_EXPORT_PASSED",
  JSON.stringify({
    canvasId: canvas.id,
    png: true,
    pdf: true,
    tiles: true,
    persistedCanvasUnchanged: true,
  }),
);
