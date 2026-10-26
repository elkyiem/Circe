import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { connectWebHost } from "./web-smoke-client.mjs";

const host = await connectWebHost();
const initial = await host.query("library.info");
assert.ok(initial.path.startsWith(host.sandbox), "Use the disposable Library.");
const evidence = resolve("../../.artifacts/web-verification");
await mkdir(evidence, { recursive: true });
const bytes = await sharp({
  create: { width: 320, height: 180, channels: 4, background: "#458d74" },
})
  .png()
  .toBuffer();
await writeFile(join(evidence, "library-logo-fixture.png"), bytes);
const upload = async (body, filename) => {
  const response = await host.request("upload", undefined, {
    method: "PUT",
    headers: {
      ...host.headers,
      "content-type": "application/octet-stream",
      "x-iris-filename": filename,
    },
    body,
  });
  assert.equal(response.status, 200);
  return (await response.json()).token;
};
const pick = (paths) =>
  host.call("files", { name: "library.identity.pickIcon", params: { paths } });
const chosen = await pick([await upload(bytes, "library-logo-fixture.png")]);
assert.equal(chosen.ok, true);
assert.ok(chosen.icon.startsWith("data:image/png;base64,"));
const decoded = await sharp(
  Buffer.from(chosen.icon.split(",")[1], "base64"),
).metadata();
assert.equal(decoded.width, 256);
assert.equal(decoded.height, 256);
assert.deepEqual(
  await pick([await upload(Buffer.from("not an image"), "invalid-logo.png")]),
  { ok: false, reason: "invalid_image" },
);
for (const paths of [["/host/private.png"], []]) {
  const response = await host.request(
    "files",
    JSON.stringify({ name: "library.identity.pickIcon", params: { paths } }),
  );
  assert.equal(response.status, 422);
}
const tooLarge = await upload(
  Buffer.alloc(8 * 1024 * 1024 + 1),
  "large-logo.png",
);
assert.equal(
  (
    await host.request(
      "files",
      JSON.stringify({
        name: "library.identity.pickIcon",
        params: { paths: [tooLarge] },
      }),
    )
  ).status,
  422,
);
try {
  assert.equal(
    (await host.query("library.identity.update", { icon: chosen.icon })).ok,
    true,
  );
  assert.equal((await host.query("library.info")).icon, chosen.icon);
  const metadata = JSON.parse(
    await readFile(join(initial.path, "metadata.json"), "utf8"),
  );
  assert.equal(metadata.icon, chosen.icon);
  assert.equal(metadata.name ?? initial.name, initial.name);
  assert.equal(metadata.id, host.libraryId);
  assert.equal(
    (await host.query("library.identity.update", { icon: null })).ok,
    true,
  );
  assert.equal((await host.query("library.info")).icon, null);
} finally {
  const current = await host.query("library.info");
  if (current.icon === chosen.icon || current.icon === null)
    await host.query("library.identity.update", {
      icon: initial.icon,
      mark: initial.mark,
    });
}
const html = await (await fetch(host.origin)).text();
const icon = /<link\b[^>]*rel="icon"[^>]*href="([^"]+)"/.exec(html)?.[1];
assert.ok(icon, "The browser document must declare a favicon.");
const response = await fetch(new URL(icon, host.origin));
assert.equal(response.status, 200);
assert.match(response.headers.get("content-type"), /^image\/png/);
assert.equal(
  (await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format,
  "png",
);
console.log(
  "WEB_IDENTITY_PASSED",
  JSON.stringify({
    logo: [256, 256],
    invalidImage: true,
    hostPathDenied: true,
    sizeLimit: true,
    persisted: true,
    reset: true,
    restored: true,
    favicon: true,
  }),
);
