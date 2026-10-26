import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { connectWebHost } from "./web-smoke-client.mjs";

const host = await connectWebHost();
if (process.argv.includes("--after-restart")) {
  const proof = JSON.parse(
    await readFile(join(host.sandbox, "directory-verification.json"), "utf8"),
  );
  const memberships = await host.query("folders.memberships");
  const folders = await host.query("folders.list");
  for (const file of proof.files) {
    const save = await host.query("saves.get", { id: file.id });
    assert.equal(save.sourceId, file.sourceId);
    assert.ok(folders.some((folder) => folder.id === file.folderId));
    assert.ok(
      memberships.some(
        (row) => row.saveId === file.id && row.folderId === file.folderId,
      ),
    );
  }
  console.log(
    "WEB_DIRECTORY_RESTART_PASSED",
    JSON.stringify({ files: proof.files.length }),
  );
  process.exit(0);
}

const page = await host.query("saves.listPage", { limit: 100 });
const originals = ["900000000000000001", "900000000000000002"].map((sourceId) =>
  page.rows.find((save) => save.sourceId === sourceId),
);
assert.ok(
  originals.every(Boolean),
  "Ingest the quote and image fixtures first.",
);
const parent = await host.query("folders.create", {
  name: `Device import ${Date.now().toString(36)}`,
});
const staged = [];
for (const [index, save] of originals.entries()) {
  const file =
    save.files.find((file) => file.kind === "card-light") ??
    save.files.find((file) => file.mimeType === "image/png");
  assert.ok(file);
  const media = await fetch(
    `${host.origin}/web/media/${save.id}/${file.path}`,
    { headers: host.headers },
  );
  assert.equal(media.status, 200);
  const bytes = Buffer.from(await media.arrayBuffer());
  const relativePath = `Iris folder fixture/${index === 0 ? "Quotes" : "Images"}/same.png`;
  const localFile = join(host.sandbox, "visiting-device", relativePath);
  await mkdir(dirname(localFile), { recursive: true });
  await writeFile(localFile, bytes);
  const response = await host.request("upload", undefined, {
    method: "PUT",
    headers: {
      ...host.headers,
      "content-type": "application/octet-stream",
      "x-iris-filename": "same.png",
    },
    body: bytes,
  });
  assert.equal(response.status, 200);
  const ticket = await response.json();
  staged.push({
    ...ticket,
    relativePath,
    hash: createHash("sha256").update(bytes).digest("hex"),
  });
}
const input = {
  name: "saves.importFiles",
  params: {
    paths: staged.map((file) => file.token),
    folderIds: [parent.id],
    relativePaths: Object.fromEntries(
      staged.map((file) => [file.token, file.relativePath]),
    ),
  },
};
const imported = await host.call("files", input);
assert.equal(imported.ok, true);
assert.equal(imported.ids.length, 2);
const folders = await host.query("folders.list");
const picked = folders.find(
  (folder) =>
    folder.name === "Iris folder fixture" && folder.parentId === parent.id,
);
assert.ok(picked);
const memberships = await host.query("folders.memberships");
const proof = [];
for (const file of staged) {
  const sourceId = file.token.replace("iris-upload:", "web-upload:");
  const rows = await Promise.all(
    imported.ids.map((id) => host.query("saves.get", { id })),
  );
  const save = rows.find((save) => save.sourceId === sourceId);
  assert.ok(save);
  const folder = folders.find(
    (folder) =>
      folder.name === file.relativePath.split("/")[1] &&
      folder.parentId === picked.id,
  );
  assert.ok(folder);
  assert.ok(
    memberships.some(
      (row) => row.saveId === save.id && row.folderId === folder.id,
    ),
  );
  const media = await fetch(
    `${host.origin}/web/media/${save.id}/${save.files[0].path}`,
    { headers: host.headers },
  );
  assert.equal(media.status, 200);
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await media.arrayBuffer()))
      .digest("hex"),
    file.hash,
  );
  proof.push({ id: save.id, sourceId, folderId: folder.id });
}
const retry = await host.call("files", input);
assert.deepEqual(retry.ids, imported.ids);
assert.deepEqual(
  await host.query("folders.list"),
  folders,
  "A retry must not create another folder tree.",
);
assert.equal(
  (
    await host.request("files", {
      ...input,
      params: {
        ...input.params,
        relativePaths: { [staged[0].token]: "../../escape.png" },
      },
    })
  ).status,
  422,
);
await writeFile(
  join(host.sandbox, "directory-verification.json"),
  JSON.stringify({ files: proof }),
);
console.log(
  "WEB_DIRECTORY_IMPORT_PASSED",
  JSON.stringify({
    files: 2,
    hierarchy: true,
    originalBytes: true,
    retry: true,
    traversalDenied: true,
  }),
);
