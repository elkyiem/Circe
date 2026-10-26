import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
import { connectWebHost } from "./web-smoke-client.mjs";

const host = await connectWebHost();
const page = await host.query("saves.listPage", { limit: 100 });
const image = page.rows.find((save) => save.sourceId === "900000000000000002");
assert.ok(image);
const suffix = Date.now().toString(36);
const title = image.title;
const edit = (value) => ({
  kind: "update",
  model: "save",
  id: image.id,
  patch: { title: value },
  before: { title },
});
const edited = await host.request("transactions", {
  transactions: [edit(`${title} verification`)],
});
assert.equal(edited.status, 200);
const revision = Number(edited.headers.get("x-iris-history"));
assert.equal(
  (await host.query("saves.get", { id: image.id })).title,
  `${title} verification`,
);
assert.equal(
  (await host.request("transactions", { transactions: [edit("stale edit")] }))
    .status,
  409,
);
await host.call("history", { kind: "undo", revision });
assert.equal((await host.query("saves.get", { id: image.id })).title, title);
const history = await host.call("history");
const competing = await host.request("transactions", {
  transactions: [edit(`${title} another window`)],
});
assert.equal(competing.status, 200);
assert.equal(
  (await host.request("history", { kind: "undo", revision: history.revision }))
    .status,
  409,
);
await host.call("history", {
  kind: "undo",
  revision: Number(competing.headers.get("x-iris-history")),
});
const tag = `Web parity ${suffix}`;
assert.equal((await host.query("tags.create", { name: tag })).ok, true);
await host.query("tags.setForSave", {
  saveId: image.id,
  tags: [...image.tags, tag],
});
assert.ok((await host.query("saves.get", { id: image.id })).tags.includes(tag));
await host.query("tags.setForSave", { saveId: image.id, tags: image.tags });
await host.query("tags.delete", { name: tag });
const folder = await host.query("folders.create", {
  name: `Parity folder ${suffix}`,
});
const view = await host.query("savedViews.create", {
  name: `Parity view ${suffix}`,
  kind: "saved_view",
  query: { combinator: "and", rules: [] },
  layout: "grid",
});
assert.equal(view.ok, true);
assert.ok(
  (await host.query("savedViews.list")).some((row) => row.id === view.id),
);
const canvas = await host.query("canvases.create", {
  name: `Parity Canvas ${suffix}`,
  saveIds: [image.id],
});
await host.query("canvases.rename", {
  id: canvas.id,
  name: `Renamed Canvas ${suffix}`,
});
const content = {
  viewport: canvas.viewport,
  items: canvas.items,
  connectors: canvas.connectors,
};
const expectedContent = createHash("sha256")
  .update(JSON.stringify(content))
  .digest("hex");
const moved = {
  ...content,
  viewport: { ...content.viewport, x: content.viewport.x + 10 },
};
await host.query("canvases.update", {
  id: canvas.id,
  content: moved,
  expectedContent,
});
assert.equal(
  (
    await host.request("query", {
      name: "canvases.update",
      params: { id: canvas.id, content, expectedContent },
    })
  ).status,
  409,
);
assert.equal(
  (await host.query("canvases.get", { id: canvas.id })).name,
  `Renamed Canvas ${suffix}`,
);
const file = image.files.find((file) => file.kind === "image");
assert.ok(file);
const media = await fetch(`${host.origin}/web/media/${image.id}/${file.path}`, {
  headers: host.headers,
});
assert.equal(media.status, 200);
const bytes = await media.arrayBuffer();
const upload = async (name, data) => {
  const response = await host.request("upload", undefined, {
    method: "PUT",
    headers: {
      ...host.headers,
      "content-type": "application/octet-stream",
      "x-iris-filename": encodeURIComponent(name),
    },
    body: data,
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
};
const ticket = await upload("phone-proof.png", bytes);
const attachment = await host.call("files", {
  name: "agent.pickAttachments",
  params: { paths: [ticket.token] },
});
assert.equal(attachment.ok, true);
assert.equal(attachment.files[0].name, "phone-proof.png");
assert.ok(!("path" in attachment.files[0]));
const imported = await host.call("files", {
  name: "saves.importFiles",
  params: { paths: [ticket.token], folderIds: [folder.id] },
});
assert.equal(imported.ok, true);
assert.equal(imported.ids.length, 1);
const repeated = await host.call("files", {
  name: "saves.importFiles",
  params: { paths: [ticket.token], folderIds: [folder.id] },
});
assert.deepEqual(
  repeated.ids,
  imported.ids,
  "Replaying a staged import must retain the same Save.",
);
assert.ok(
  (await host.query("folders.memberships")).some(
    (row) => row.folderId === folder.id && row.saveId === imported.ids[0],
  ),
);
const exported = await host.call("files", {
  name: "saves.exportPackage",
  params: { ids: [image.id, imported.ids[0]] },
});
const download = await fetch(`${host.origin}${exported.download}`, {
  headers: host.headers,
});
assert.equal(download.status, 200);
const archive = await download.arrayBuffer();
const zip = await JSZip.loadAsync(archive);
assert.ok(zip.file("pond-export.json"));
const manifest = JSON.parse(await zip.file("pond-export.json").async("string"));
const packagedImage = manifest.saves.find((save) => save.id === image.id);
assert.deepEqual(
  packagedImage.rawJson.capture,
  (await host.query("saves.rawJson", { id: image.id })).rawJson.capture,
  "The package must retain structured Capture data.",
);
assert.deepEqual(
  packagedImage.files.map((file) => file.path),
  image.files.map((file) => file.path),
);
assert.ok(
  manifest.exportedFiles
    .filter((file) => file.saveId === image.id)
    .every((file) => zip.file(file.path)),
  "Every selected media file must be present.",
);
const restored = await upload("Saves.pondpack.zip", archive);
const roundTrip = await host.call("files", {
  name: "saves.importPackage",
  params: { paths: [restored.token] },
});
assert.equal(roundTrip.ok, true);
assert.equal(
  (await host.query("saves.rawJson", { id: image.id })).rawJson.capture.id,
  image.sourceId,
);
assert.equal((await fetch(`${host.origin}${exported.download}`)).status, 401);
const range = await fetch(`${host.origin}${exported.download}`, {
  headers: { ...host.headers, range: "bytes=0-15" },
});
assert.equal(range.status, 206);
assert.equal((await range.arrayBuffer()).byteLength, 16);
const csv = await host.call("files", {
  name: "saves.exportCsv",
  params: { ids: [image.id] },
});
const csvResponse = await fetch(`${host.origin}${csv.download}`, {
  headers: host.headers,
});
assert.ok((await csvResponse.text()).includes("Iris fixture: image"));
const conversion = await host.call("files", {
  name: "conversion.start",
  params: {
    ids: [image.id],
    fileIndex: image.files.findIndex((file) => file.kind === "image"),
    preset: { id: "web-proof", name: "Web proof", format: "png" },
  },
});
let converted;
for (let attempt = 0; attempt < 100; attempt++) {
  converted = await host.call("files", {
    name: "conversion.status",
    params: { id: conversion.id },
  });
  if (converted.status !== "running") break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.equal(converted.status, "complete", converted.error);
assert.ok(converted.download);
assert.equal(
  (
    await fetch(`${host.origin}${converted.download}`, {
      headers: host.headers,
    })
  ).status,
  200,
);
const video = page.rows.find((save) => save.sourceId === "900000000000000003");
const originalVideo = video.files.find((file) => file.kind === "video");
assert.ok(originalVideo);
const src = `/web/media/${video.id}/${encodeURIComponent(originalVideo.path)}`;
const frame = await host.call("video", {
  name: "video.frame",
  params: { src, timeSec: 2 },
});
assert.ok(frame.bytes.$pondBytes.length > 1000);
const sampled = await host.call("video", {
  name: "video.sampleFrames",
  params: { src, maxFrames: 3 },
});
assert.equal(sampled.ok, true);
assert.ok(
  sampled.frames.length > 0 && sampled.frames[0].bytes.$pondBytes.length > 1000,
);
assert.equal(
  (
    await host.request("video", {
      name: "video.setThumbnail",
      params: { src, saveId: image.id, timeSec: 2 },
    })
  ).status,
  422,
);
const preview = await host.call("video", {
  name: "video.preparePreview",
  params: { src },
});
assert.equal(preview.ok, true, preview.error);
assert.equal(
  (
    await fetch(`${host.origin}${preview.url}`, {
      headers: { ...host.headers, range: "bytes=0-15" },
    })
  ).status,
  206,
);
assert.equal((await fetch(`${host.origin}${preview.url}`)).status, 401);
await host.query("savedViews.delete", { id: view.id });
await host.query("canvases.delete", { id: canvas.id });
await host.query("saves.bulkEdit", {
  ids: [imported.ids[0]],
  operation: { kind: "trash" },
});
await host.query("saves.bulkEdit", {
  ids: [imported.ids[0]],
  operation: { kind: "untrash" },
});
assert.equal(
  (await host.query("saves.get", { id: imported.ids[0] })).deletedAt,
  null,
);
await host.call("command", { name: "pipelinePause", paused: true });
assert.equal((await host.query("pipeline.status")).paused, true);
await host.call("command", { name: "pipelinePause", paused: false });
await writeFile(
  join(host.sandbox, "parity-verification.json"),
  JSON.stringify({
    folderId: folder.id,
    importedIds: imported.ids,
    sourceId: image.sourceId,
    transactions: true,
    conflict: true,
    history: true,
    tags: true,
    savedViews: true,
    canvas: true,
    upload: true,
    package: true,
    csv: true,
    ranges: true,
    queueControls: true,
  }),
);
console.log(
  "WEB_PARITY_SMOKE_PASSED",
  JSON.stringify({
    imported: imported.ids.length,
    transactions: true,
    conflicts: true,
    history: true,
    canvas: true,
    upload: true,
    packages: true,
    queueControls: true,
  }),
);
