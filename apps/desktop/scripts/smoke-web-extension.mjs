import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { connectWebHost } from "./web-smoke-client.mjs";

const host = await connectWebHost();
const statePath = join(host.sandbox, "extension-http-verification.json");
const manifest = JSON.parse(
  await readFile(
    resolve("../extension/.output-iris/chrome-mv3/manifest.json"),
    "utf8",
  ),
);
const extensionId = createHash("sha256")
  .update(Buffer.from(manifest.key, "base64"))
  .digest("hex")
  .slice(0, 32)
  .replace(/[0-9a-f]/g, (digit) =>
    String.fromCharCode(97 + Number.parseInt(digit, 16)),
  );
const extension = `chrome-extension://${extensionId}`;
const afterRestart = process.argv.includes("--after-restart");
if (!afterRestart) {
  const connections = await (await host.request("extensions")).json();
  if (connections.connections.length === 0)
    assert.deepEqual(
      await host.call("command", { name: "connectSource", source: "twitter" }),
      { ok: false, mode: "extension" },
    );
}
let state;
if (afterRestart) state = JSON.parse(await readFile(statePath, "utf8"));
else {
  const key = (
    await readFile(join(host.sandbox, "web-access-key"), "utf8")
  ).trim();
  const paired = await fetch(`${host.origin}/extension/pair`, {
    method: "POST",
    headers: {
      origin: extension,
      "x-iris-extension": extension,
      "content-type": "application/json",
    },
    body: JSON.stringify({ key, name: "Disposable HTTP verification" }),
  });
  assert.equal(paired.status, 200);
  const connection = await paired.json();
  state = {
    token: connection.token,
    libraryId: connection.libraryId,
    captureId: randomUUID(),
    saveId: null,
  };
}
assert.equal(state.libraryId, host.libraryId);
const headers = {
  origin: extension,
  "x-iris-extension": extension,
  "x-iris-library": state.libraryId,
  authorization: `Bearer ${state.token}`,
  "content-type": "application/json",
};
const call = async (input) => {
  const response = await fetch(`${host.origin}/extension/request`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 200);
  return response.json();
};
const info = await call({ type: "library.info" });
assert.equal(info.ok, true);
assert.equal(info.data.libraryId, host.libraryId);
assert.equal("path" in info.data, false);
if (!afterRestart) {
  assert.deepEqual(
    await call({ type: "session.import", source: "twitter", cookies: [] }),
    { ok: false, error: "source_connection_not_requested" },
  );
  const bytes = await sharp({
    create: { width: 160, height: 120, channels: 4, background: "#458d74" },
  })
    .png()
    .toBuffer();
  const accepted = await call({
    type: "capture.accept",
    draft: {
      id: state.captureId,
      trigger: "extension-fixture",
      metadata: {
        title: `Extension fixture ${state.captureId}`,
        tags: [],
        folderIds: [],
      },
      items: [
        {
          kind: "image",
          dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
        },
      ],
    },
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.data.library, host.libraryId);
  let receipt;
  for (let attempt = 0; attempt < 120; attempt++) {
    receipt = await call({ type: "capture.status", id: state.captureId });
    if (receipt.data.state === "complete" || receipt.data.state === "failed")
      break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(receipt.data.state, "complete");
  state.saveId = receipt.data.saveIds[0];
  assert.ok(state.saveId);
  const pending = await host.call("command", {
    name: "connectSource",
    source: "twitter",
  });
  assert.deepEqual(pending, { ok: true, mode: "extension" });
  assert.equal(
    (await call({ type: "session.pending" })).data.source,
    "twitter",
  );
  await host.call("command", {
    name: "clearPendingSession",
    source: "twitter",
  });
  assert.equal((await call({ type: "session.pending" })).data, null);
  await writeFile(statePath, JSON.stringify(state), { mode: 0o600 });
  console.log(
    "WEB_EXTENSION_PASSED",
    JSON.stringify({
      authenticated: true,
      queueCapture: true,
      hostPathsHidden: true,
      unsolicitedSessionDenied: true,
      browserSourceMode: true,
      restartPending: true,
    }),
  );
} else {
  assert.equal(
    (await call({ type: "capture.status", id: state.captureId })).data.state,
    "complete",
  );
  assert.ok(await host.query("saves.get", { id: state.saveId }));
  assert.equal(
    (
      await fetch(`${host.origin}/extension/pair`, {
        method: "DELETE",
        headers,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${host.origin}/extension/request`, {
        method: "POST",
        headers,
        body: JSON.stringify({ type: "hello" }),
      })
    ).status,
    401,
  );
  await rm(statePath);
  console.log(
    "WEB_EXTENSION_RESTART_PASSED",
    JSON.stringify({
      pairingPersisted: true,
      capturePersisted: true,
      revocation: true,
    }),
  );
}
