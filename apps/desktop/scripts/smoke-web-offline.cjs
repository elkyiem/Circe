const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const {
  readFileSync,
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve, extname } = require("node:path");
const { setTimeout: pause } = require("node:timers/promises");
const { app, BrowserWindow } = require("electron");

const built = resolve("out/browser");
const worker = readFileSync(join(built, "app-sw.js"), "utf8");
const match = worker.match(/const ASSETS=(\[[^;]+\]);/);
assert.ok(match, "Build the browser before checking its offline UI.");
const assets = JSON.parse(match[1]);
const allowed = new Set([...assets, "/app-sw.js"]);
const profile = mkdtempSync(join(tmpdir(), "circe-offline-smoke-"));
const evidence = resolve("../../.artifacts/web-verification/offline-ui");
mkdirSync(evidence, { recursive: true, mode: 0o700 });
app.setPath("userData", profile);
app.commandLine.appendSwitch("use-mock-keychain");
let win;
let server;
const timer = setTimeout(() => {
  console.error("OFFLINE_UI_FAILED: finite check timed out");
  app.exit(1);
}, 60000);

function serve(port = 0) {
  server = createServer((request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    response.setHeader("cache-control", "no-store");
    if (path === "/") {
      response.setHeader("content-type", "text/html");
      response.end(
        "<!doctype html><html lang=en><title>Online</title><h1>Online</h1></html>",
      );
    } else if (allowed.has(path)) {
      response.setHeader(
        "content-type",
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".png": "image/png",
        }[extname(path)],
      );
      response.end(readFileSync(join(built, path)));
    } else {
      response.statusCode = 404;
      response.end();
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () =>
      resolveServer(server.address().port),
    );
  });
}

async function stopServer() {
  if (!server?.listening) return;
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(resolveClose));
}

app.whenReady().then(async () => {
  try {
    const port = await serve();
    const origin = `http://127.0.0.1:${port}`;
    win = new BrowserWindow({
      width: 390,
      height: 844,
      show: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    const run = (code) => win.webContents.executeJavaScript(code, true);
    const waitFor = async (code) => {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        if (await run(code)) return;
        await pause(50);
      }
      throw new Error(`Offline UI condition timed out: ${code}`);
    };
    await win.loadURL(origin);
    await run(
      "navigator.serviceWorker.register('/app-sw.js').then(()=>navigator.serviceWorker.ready).then(()=>true)",
    );
    await waitFor("Boolean(navigator.serviceWorker.controller)");
    const cached = await run(
      "caches.keys().then(async names=>{const cache=await caches.open(names[0]);return (await cache.keys()).map(request=>new URL(request.url).pathname).sort()})",
    );
    assert.deepEqual(cached, assets);
    assert.ok(
      assets.every((path) =>
        /^\/(offline\.html|app-icon-192\.png|assets\/[\w-]+\.(js|css))$/.test(
          path,
        ),
      ),
    );
    await win.webContents.session.clearCache();
    await stopServer();
    await win.loadURL(origin);
    await waitFor(
      "document.querySelector('h2')?.textContent==='Reconnect to your Library' && document.querySelector('img')?.naturalWidth>0",
    );
    assert.equal(
      await run(
        "fetch('/web/session',{cache:'no-store'}).then(()=>false,()=>true)",
      ),
      true,
    );
    const layouts = [];
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [768, 1024],
      [1280, 900],
    ]) {
      win.setContentSize(width, height);
      await pause(100);
      const state = await run(
        "(()=>{const button=document.querySelector('button'),rect=button.getBoundingClientRect(),style=getComputedStyle(button);return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,button:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,variant:button.dataset.variant,background:style.backgroundColor,color:style.color},icon:document.querySelector('img').src.startsWith('data:')}})()",
      );
      assert.equal(state.overflow, false);
      assert.equal(state.button.variant, "primary");
      assert.ok(state.button.height >= 44 && state.button.width >= 88);
      assert.ok(
        state.button.x >= 0 && state.button.x + state.button.width <= width,
      );
      assert.equal(state.icon, true);
      layouts.push(state);
      writeFileSync(
        join(evidence, `${width}.png`),
        (await win.webContents.capturePage()).toPNG(),
        { mode: 0o600 },
      );
    }
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
    await waitFor("document.activeElement?.tagName==='BUTTON'");
    await serve(port);
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Space" });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Space" });
    await waitFor("document.querySelector('h1')?.textContent==='Online'");
    writeFileSync(
      join(evidence, "results.json"),
      JSON.stringify(
        {
          offlineNetwork: "server closed; HTTP cache cleared",
          cachedFiles: assets.length,
          privateSessionUnavailable: true,
          layouts,
          keyboardRetryReturnedOnline: true,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "OFFLINE_UI_PASSED",
      JSON.stringify({
        layouts: layouts.length,
        offlineIcon: true,
        sharedButton: true,
        keyboardReconnect: true,
        privateDataUncached: true,
      }),
    );
    process.exitCode = 0;
  } catch (error) {
    console.error("OFFLINE_UI_FAILED", error);
    process.exitCode = 1;
  } finally {
    await stopServer();
    win?.destroy();
    clearTimeout(timer);
    app.quit();
  }
});

app.on("will-quit", () =>
  rmSync(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  }),
);
