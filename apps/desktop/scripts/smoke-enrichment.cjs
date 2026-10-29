// Opt-in live-model integration check. No production Library or shared runtime is used.
const { app, BrowserWindow } = require("electron");
app.commandLine.appendSwitch("use-mock-keychain");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const sharp = require("sharp");
const sandbox = process.env.POND_SANDBOX;
if (!sandbox) throw new Error("Run this check through pnpm smoke:enrichment.");
const clients = [];
let started = false;
let finished = false;
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
const errors = [];
const timer = setTimeout(
  () => fail(new Error("Enrichment integration exceeded300seconds.")),
  300000,
);
function fail(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  console.error("ENRICHMENT_SMOKE_FAILED", error);
  app.exit(1);
}
async function waitFor(read, predicate, label, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}`);
}
const owners = () =>
  BrowserWindow.getAllWindows().filter(
    (win) =>
      !win.isDestroyed() &&
      win.webContents.getURL().includes("enrichment.html"),
  );
const query = (contents, name, params = {}) =>
  contents.executeJavaScript(
    `window.pond.query(${JSON.stringify(name)},${JSON.stringify(params)})`,
  );
app.on("web-contents-created", (_, contents) => {
  contents.on("console-message", (event) => {
    if (event.level === "error") {
      errors.push(event.message);
      console.error("ENRICHMENT_RENDERER_ERROR", event.message);
    }
  });
  contents.on("did-finish-load", () => {
    if (!contents.getURL().includes("index.html")) return;
    clients.push(contents);
    if (started) return;
    started = true;
    void run(contents).catch(fail);
  });
});
async function run(contents) {
  await waitFor(
    () => contents.executeJavaScript("Boolean(window.pond)"),
    Boolean,
    "native preload",
  );
  await query(contents, "settings.setPrefs", {
    ai: {
      semanticSearch: false,
      enableCaption: false,
      enableOcr: false,
      enableTranscript: false,
      enableClip: false,
      enableSensitiveContent: true,
      enableAesthetic: false,
      enableAutoTitle: false,
      enableSuggestedTags: false,
    },
  });
  await waitFor(
    () => query(contents, "enrichment.status"),
    (status) => status.state === "ready",
    "resident owner",
  );
  const info = await query(contents, "library.info");
  const ids = [];
  for (let index = 0; index < 3; index++) {
    const path = join(sandbox, `sample-${index}.png`);
    await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: { r: 80 + index * 20, g: 130, b: 170 },
      },
    })
      .png()
      .toFile(path);
    const created = await query(contents, "saves.createManual", {
      title: `Enrichment fixture ${index}`,
      filePaths: [path],
    });
    assert.equal(created.ok, true);
    assert.ok(created.id);
    ids.push(created.id);
  }
  await waitFor(
    () => query(contents, "enrichment.status"),
    (status) => status.inflight > 0,
    "active resident processing",
  );
  BrowserWindow.fromWebContents(contents).destroy();
  await waitFor(
    async () => contents.isDestroyed(),
    Boolean,
    "client closure",
    10000,
  );
  const owner = await waitFor(
    async () => owners()[0],
    Boolean,
    "owner survives client close",
  );
  const rows = await waitFor(
    () => query(owner.webContents, "saves.getMany", { ids }),
    (rows) =>
      rows.length === ids.length &&
      rows.every(
        (row) => row.sensitiveModel && Number.isFinite(row.sensitiveScore),
      ),
    "closed-client completion",
  );
  for (const row of rows) {
    assert.ok(row.sensitiveScore >= 0 && row.sensitiveScore <= 1);
    const sidecar = JSON.parse(
      readFileSync(
        join(info.path, "items", `${row.id}.info`, "enrichment.json"),
        "utf8",
      ),
    );
    assert.equal(sidecar.data.sensitiveModel, row.sensitiveModel);
    assert.equal(sidecar.data.sensitiveScore, row.sensitiveScore);
  }
  app.emit("activate");
  const reopened = await waitFor(
    async () => clients.find((client) => !client.isDestroyed()),
    Boolean,
    "reopened desktop client",
  );
  const accepted = await query(reopened, "enrichment.run", {
    kind: "sensitiveContent",
    ids: [ids[0]],
  });
  assert.equal(accepted.ok, true);
  const invalidated = await query(reopened, "saves.getMany", { ids: [ids[0]] });
  assert.equal(invalidated[0].sensitiveModel, null);
  const oldOwner = owners()[0];
  oldOwner.webContents.forcefullyCrashRenderer();
  await waitFor(
    () => query(reopened, "enrichment.status"),
    (status) => status.state === "failed",
    "visible crash status",
  );
  const retried = await query(reopened, "enrichment.run", { kind: "scan" });
  assert.equal(retried.ok, true);
  await waitFor(
    () => query(reopened, "saves.getMany", { ids: [ids[0]] }),
    (rows) => Boolean(rows[0]?.sensitiveModel),
    "durable retry after owner crash",
  );
  assert.equal(owners().length, 1);
  assert.ok(oldOwner.isDestroyed());
  const workerErrors = errors.filter((message) =>
    message.includes("[inference] worker crashed"),
  );
  assert.deepEqual(workerErrors, []);
  finished = true;
  clearTimeout(timer);
  console.log(
    "ENRICHMENT_SMOKE_PASSED",
    JSON.stringify({
      realModel: true,
      closedClient: true,
      sidecarAgreement: true,
      durableRetry: true,
      crashRecovery: true,
      oneOwner: true,
    }),
  );
  app.quit();
}
import("../out/main/index.js").catch(fail);
