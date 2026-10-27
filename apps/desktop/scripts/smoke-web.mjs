import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const sandbox = resolve(
  process.env.POND_SANDBOX ?? "../../.artifacts/iris-web-sandbox",
);
const origin = process.env.CIRCE_WEB_ORIGIN ?? "http://127.0.0.1:4789";
const key = (await readFile(join(sandbox, "web-access-key"), "utf8")).trim();
const login = await fetch(`${origin}/web/session`, {
  method: "POST",
  headers: { origin, "content-type": "application/json" },
  body: JSON.stringify({ key }),
});
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie").split(";")[0];
const { libraryId } = await login.json();
const call = async (path, body) => {
  const response = await fetch(`${origin}/web/${path}`, {
    method: "POST",
    headers: {
      cookie,
      origin,
      "content-type": "application/json",
      "x-iris-library": libraryId,
    },
    body: JSON.stringify(body),
  });
  assert.equal(
    response.status,
    200,
    `${path}: ${await response.clone().text()}`,
  );
  return response.json();
};
const query = (name, params = {}) => call("query", { name, params });
const statePath = join(sandbox, "verification-state.json");
if (process.argv.includes("--after-restart")) {
  const state = JSON.parse(await readFile(statePath, "utf8"));
  const folders = await query("folders.list");
  assert.ok(folders.some((folder) => folder.id === state.folderId));
  const memberships = await query("folders.memberships");
  assert.ok(
    memberships.some(
      (row) => row.folderId === state.folderId && row.saveId === state.saveId,
    ),
  );
  for (const id of state.ids)
    assert.equal((await query("saves.get", { id })).status, "complete");
  try {
    await access(join(sandbox, "ui-verification-state.json"));
    const ui = JSON.parse(
      await readFile(join(sandbox, "ui-verification-state.json"), "utf8"),
    );
    assert.ok(
      memberships.some(
        (row) => row.folderId === ui.folderId && row.saveId === ui.saveId,
      ),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  console.log(
    "WEB_RESTART_PASSED",
    JSON.stringify({ folderId: state.folderId, saves: state.ids.length }),
  );
} else {
  const ids = [];
  for (const kind of ["image", "video"]) {
    const result = await call("fixtures", { kind });
    ids.push(result.id);
    const deadline = Date.now() + 120_000;
    let save;
    do {
      save = await query("saves.get", { id: result.id });
      if (save.status === "complete" || save.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    } while (Date.now() < deadline);
    assert.equal(
      save.status,
      "complete",
      `${kind}: ${JSON.stringify(save.tasks)}`,
    );
    const { rawJson } = await query("saves.rawJson", { id: save.id });
    assert.equal(rawJson.capture.id, save.sourceId);
    // Stored fixture Captures keep their original title across the Circé rename.
    assert.ok(
      [`Circé fixture: ${kind}`, `Iris fixture: ${kind}`].includes(
        rawJson.capture.title,
      ),
    );
    assert.ok(
      save.files.some((file) => file.kind === "tweet_screenshot_light"),
    );
    assert.ok(save.files.some((file) => file.kind === "tweet_screenshot_dark"));
    const original = save.files.find(
      (file) => file.kind === (kind === "video" ? "video" : "image"),
    );
    assert.ok(original, `No original ${kind}: ${JSON.stringify(save.files)}`);
    assert.equal(original.sourceUrl, rawJson.capture.media[0].url);
    const media = `${origin}/web/media/${save.id}/${encodeURIComponent(original.path)}`;
    assert.equal((await fetch(media)).status, 401);
    const response = await fetch(media, {
      headers: { cookie, range: "bytes=32-127" },
    });
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 96);
    assert.match(response.headers.get("content-range"), /^bytes 32-127\//);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const suffix = await fetch(media, {
      headers: { cookie, range: "bytes=-64" },
    });
    assert.equal(suffix.status, 206);
    assert.equal((await suffix.arrayBuffer()).byteLength, 64);
    const head = await fetch(media, { method: "HEAD", headers: { cookie } });
    assert.equal(head.status, 200);
    assert.ok(Number(head.headers.get("content-length")) > 0);
    const invalid = await fetch(media, {
      headers: { cookie, range: "bytes=999999999-" },
    });
    assert.equal(invalid.status, 416);
    assert.equal(
      (
        await fetch(`${origin}/web/media/${save.id}/metadata.json`, {
          headers: { cookie },
        })
      ).status,
      404,
    );
    console.log(
      "WEB_MEDIA_PASSED",
      JSON.stringify({ kind, files: save.files.length, saveId: save.id }),
    );
  }
  const list = await query("folders.list");
  const folder =
    list.find((folder) => folder.name === "Web verification") ??
    (await query("folders.create", { name: "Web verification" }));
  await query("folders.assign", {
    saveIds: [ids[0]],
    addIds: [folder.id],
    removeIds: [],
  });
  assert.ok(
    (await query("folders.memberships")).some(
      (row) => row.folderId === folder.id && row.saveId === ids[0],
    ),
  );
  await query("folders.assign", {
    saveIds: [ids[0]],
    addIds: [],
    removeIds: [folder.id],
  });
  assert.ok(
    !(await query("folders.memberships")).some(
      (row) => row.folderId === folder.id && row.saveId === ids[0],
    ),
  );
  await query("folders.assign", {
    saveIds: [ids[0]],
    addIds: [folder.id],
    removeIds: [],
  });
  const first = await query("saves.listPage", { limit: 1 });
  assert.equal(first.rows.length, 1);
  assert.ok(first.nextCursor);
  const second = await query("saves.listPage", {
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.equal(second.rows.length, 1);
  assert.notEqual(first.rows[0].id, second.rows[0].id);
  assert.ok(
    (
      await query("saves.searchFts", {
        q: "fixture",
        limit: 100,
        deletedOnly: false,
        mode: "all",
      })
    ).ids.length >= 2,
  );
  await writeFile(
    statePath,
    JSON.stringify({ folderId: folder.id, saveId: ids[0], ids }),
  );
  console.log(
    "WEB_WORKFLOW_PASSED",
    JSON.stringify({ pagination: true, search: true, folderId: folder.id }),
  );
}
