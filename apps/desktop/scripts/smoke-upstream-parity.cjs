const assert = require("node:assert/strict");
const { app, BrowserWindow } = require("electron");
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const JSZip = require("jszip");
const { verifyUpstreamParity } = require("./upstream-parity-cases.cjs");
const sandbox = mkdtempSync(join(tmpdir(), "pond-upstream-parity-"));
const evidence = resolve("../../.artifacts/web-verification/upstream-222");
mkdirSync(evidence, { recursive: true, mode: 0o700 });
// This finite smoke test owns one temporary app and its HTTP transport, with no watch process.
process.env.POND_SANDBOX = sandbox;
process.env.CIRCE_WEB = "1";
process.env.CIRCE_WEB_PORT = "4793";
process.env.CIRCE_WEB_ORIGIN = "http://127.0.0.1:4793";
process.env.CIRCE_LOCAL_API_PORT = "4794";
const origin = "http://127.0.0.1:4793";
let running = false;
const timer = setTimeout(() => {
  console.error("UPSTREAM_PARITY_TIMEOUT");
  app.exit(1);
}, 240000);
process.once("exit", () => rmSync(sandbox, { recursive: true, force: true }));
function driver(win) {
  const contents = win.webContents;
  const run = (expression) => contents.executeJavaScript(expression, true);
  const waitFor = async (expression, timeout = 20000) => {
    const start = Date.now();
    while (!(await run(expression))) {
      if (Date.now() - start > timeout)
        throw new Error(`Timed out: ${expression}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  const click = async (selector, clickCount = 1, button = "left") => {
    await waitFor(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    );
    await run(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
    );
    await waitFor(
      `(() => { const node=document.querySelector(${JSON.stringify(selector)});const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`,
    );
    await run(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
    const point = await run(
      `(() => { const node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center'});const r=node.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`,
    );
    win.show();
    win.focus();
    contents.focus();
    await waitFor("document.hasFocus()");
    contents.sendInputEvent({ type: "mouseMove", ...point });
    contents.sendInputEvent({
      type: "mouseDown",
      ...point,
      button,
      clickCount,
    });
    contents.sendInputEvent({
      type: "mouseUp",
      ...point,
      button,
      clickCount,
    });
  };
  const snapshot = async (name) => {
    writeFileSync(
      join(evidence, `${name}.png`),
      (await contents.capturePage()).toPNG(),
    );
    writeFileSync(
      join(evidence, `${name}.txt`),
      await run("document.body.innerText"),
    );
  };

  const press = async (keyCode) => {
    contents.sendInputEvent({ type: "keyDown", keyCode });
    contents.sendInputEvent({ type: "keyUp", keyCode });
  };
  return {
    run,
    waitFor,
    click,
    snapshot,
    press,
    type: (text) => contents.insertText(text),
  };
}
async function seedNative(run, path, fixture) {
  const zip = await JSZip.loadAsync(readFileSync(path));
  const query = (name, params = {}) =>
    run(`window.pond.query(${JSON.stringify(name)},${JSON.stringify(params)})`);
  const folder = await query("folders.create", {
    name: fixture.folders[0].name,
  });
  for (const row of fixture.saves) {
    const filePaths = [];
    const staging = join(sandbox, row.id);
    mkdirSync(staging, { recursive: true });
    for (const file of row.files) {
      const entry = fixture.exportedFiles.find(
        (entry) => entry.saveId === row.id && entry.sourcePath === file.path,
      );
      const destination = join(staging, file.path);
      writeFileSync(
        destination,
        await zip.file(entry.path).async("nodebuffer"),
      );
      filePaths.push(destination);
    }
    const created = await query("saves.createManual", {
      title: row.title,
      note: row.notes ?? undefined,
      filePaths,
    });
    if (!created.ok) throw new Error(JSON.stringify(created));
    const before = await query("saves.get", { id: created.id });
    const patch = {
      source: row.source,
      sourceId: row.sourceId,
      url: row.url,
      rawJson: row.rawJson,
      status: "complete",
    };
    const previous = Object.fromEntries(
      Object.keys(patch).map((key) => [key, before[key]]),
    );
    await run(
      `window.pond.tx(${JSON.stringify({ kind: "update", model: "save", id: created.id, patch, before: previous })})`,
    );
    await query("tags.setForSave", {
      saveId: created.id,
      tags: row.tags,
    });
    if (row.folderIds.length)
      await query("folders.addSaves", {
        folderId: folder.id,
        saveIds: [created.id],
      });
  }
  return { ok: true };
}
async function verifyBrowser() {
  const browser = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      partition: "upstream-parity-browser",
    },
  });
  const key = readFileSync(join(sandbox, "web-access-key"), "utf8").trim();
  const login = await fetch(`${origin}/web/session`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  assert.equal(login.status, 200);
  const { libraryId } = await login.json();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  await browser.webContents.session.cookies.set({
    url: origin,
    name: "iris_session",
    value: cookie.slice(cookie.indexOf("=") + 1),
    httpOnly: true,
    sameSite: "strict",
  });
  const headers = {
    origin,
    cookie,
    "content-type": "application/json",
    "x-iris-library": libraryId,
  };
  await browser.loadURL(origin);
  const controls = driver(browser);
  await controls.waitFor(
    "Boolean(window.pond && document.querySelector('[data-slot=window]'))",
  );
  assert.equal(
    (await controls.run("window.pond.appInfo()")).platform,
    "browser",
  );
  try {
    return await verifyUpstreamParity({
      ...controls,
      directory: evidence,
      mode: "web",
      importPackage: async (path) => {
        const uploaded = await fetch(`${origin}/web/upload`, {
          method: "PUT",
          headers: {
            ...headers,
            "content-type": "application/octet-stream",
            "x-iris-filename": encodeURIComponent("parity.pondpack.zip"),
          },
          body: readFileSync(path),
        });
        assert.equal(uploaded.status, 200);
        const { token } = await uploaded.json();
        const imported = await fetch(`${origin}/web/files`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: "saves.importPackage",
            params: { paths: [token] },
          }),
        });
        assert.equal(imported.status, 200, await imported.clone().text());
        return imported.json();
      },
    });
  } catch (error) {
    await controls.snapshot("web-failed");
    throw error;
  }
}
app.on("web-contents-created", (_, contents) => {
  contents.on("did-finish-load", async () => {
    if (running || !contents.getURL().endsWith("index.html")) return;
    running = true;
    const controls = driver(BrowserWindow.fromWebContents(contents));
    try {
      await controls.waitFor(
        "Boolean(document.querySelector('[data-slot=window]'))",
      );
      await controls.run(
        "window.pond.query('settings.setPrefs',{setup:{version:1},notices:{seen:['fish-intro','arena-links-web-pages','split-carousels','instagram-collections']}})",
      );
      await controls.run("window.pond.query('settings.setOnboarded',{})");
      const reloaded = new Promise((resolve) =>
        contents.once("did-finish-load", resolve),
      );
      contents.reload();
      await reloaded;
      await controls.waitFor(
        "Boolean(document.querySelector('[data-slot=window]')) && !document.querySelector('[role=dialog]')",
      );
      const desktop = await verifyUpstreamParity({
        ...controls,
        directory: evidence,
        mode: "desktop",
        importPackage: (path, fixture) =>
          seedNative(controls.run, path, fixture),
      });
      const web = await verifyBrowser();
      assert.deepEqual(web, desktop);
      console.log(
        "DESKTOP_WEB_PARITY_PASSED",
        JSON.stringify({ desktop, web }),
      );
      clearTimeout(timer);
      app.quit();
    } catch (error) {
      await controls.snapshot("desktop-failed");
      console.error("UPSTREAM_PARITY_FAILED", error);
      clearTimeout(timer);
      app.exit(1);
    }
  });
});
import("../out/main/index.js").catch((error) => {
  console.error(error);
  app.exit(1);
});
