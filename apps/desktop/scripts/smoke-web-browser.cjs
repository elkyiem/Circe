const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve, join } = require("node:path");

const origin = process.env.IRIS_WEB_ORIGIN ?? "http://127.0.0.1:4789";
const sandbox = resolve(
  process.env.POND_SANDBOX ?? "../../.artifacts/iris-web-sandbox",
);
const evidence = resolve("../../.artifacts/web-verification");
const profile = mkdtempSync(join(tmpdir(), "iris-browser-smoke-"));
mkdirSync(evidence, { recursive: true });
app.setPath("userData", profile);
app.commandLine.appendSwitch("use-mock-keychain");
process.once("exit", () => rmSync(profile, { recursive: true, force: true }));
const timer = setTimeout(() => {
  console.error("WEB_BROWSER_FAILED: timed out");
  app.exit(1);
}, 120000);

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1280,
      height: 900,
      show: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.webContents.on("console-message", (event) => {
      if (event.level === "error")
        console.error("BROWSER_ERROR", event.message);
    });
    const run = (code) => win.webContents.executeJavaScript(code, true);
    const snapshot = async (name) => {
      await run(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      writeFileSync(
        join(evidence, `${name}.png`),
        (await win.webContents.capturePage()).toPNG(),
      );
      const text = await run("document.body.innerText");
      writeFileSync(join(evidence, `${name}.txt`), text);
      return text;
    };
    const waitFor = (expression) =>
      run(`new Promise((resolve, reject) => {
    const started = Date.now(); const check = () => {
      if (${expression}) resolve(true);
      else if (Date.now() - started > 20000) reject(new Error("Browser condition timed out: " + ${JSON.stringify(expression)}));
      else setTimeout(check, 100);
    }; check();
  })`);
    const click = async (selector, clickCount = 1) => {
      app.focus({ steal: true });
      win.focus();
      const point = await run(`new Promise((resolve,reject) => {
        let previous = ''; let stable = 0; const started = Date.now();
        const check = () => {
          const target = document.querySelector(${JSON.stringify(selector)});
          if (target) {
            target.scrollIntoView({block:'nearest',inline:'nearest'});
            const rect = target.getBoundingClientRect();
            const point = {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)};
            const hit = document.elementFromPoint(point.x,point.y);
            const current = JSON.stringify(point);
            stable = current === previous ? stable+1 : 0; previous = current;
            if (rect.width && rect.height && hit && target.contains(hit) && stable >= 3) {resolve(point);return;}
          }
          if (Date.now()-started>10000) {reject(new Error('Control is not clickable: ' + ${JSON.stringify(selector)}));return;}
          requestAnimationFrame(check);
        }; check();
      })`);
      win.webContents.sendInputEvent({ type: "mouseMove", ...point });
      win.webContents.sendInputEvent({
        type: "mouseDown",
        button: "left",
        clickCount,
        ...point,
      });
      win.webContents.sendInputEvent({
        type: "mouseUp",
        button: "left",
        clickCount,
        ...point,
      });
    };
    const openSave = async (id) => {
      const selector = `[data-save-id="${id}"] [role="option"]`;
      await click(selector);
      await click(selector, 2);
    };
    const closePopover = async () => {
      if (
        await run("Boolean(document.querySelector('[data-type=\"popover\"]'))")
      )
        await click('[aria-label="Add Folder"]');
      await waitFor("!document.querySelector('[data-type=\"popover\"]')");
    };
    try {
      await win.loadURL(origin);
      await waitFor('document.querySelector("#host-key-file")');
      assert.equal(
        await run(
          `['host-key','host-key-file'].every(id => { const el=document.getElementById(id), r=el.getBoundingClientRect(); return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2) === el; })`,
        ),
        true,
        "Sign-in controls must receive pointer input",
      );
      await snapshot("login");
      const key = readFileSync(join(sandbox, "web-access-key"), "utf8").trim();
      const login = await fetch(`${origin}/web/session`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ key }),
      });
      assert.equal(login.status, 200);
      const { libraryId } = await login.json();
      const cookieHeader = login.headers.get("set-cookie").split(";")[0];
      const cookie = cookieHeader.split("=")[1];
      const query = async (name, params = {}) => {
        const response = await fetch(`${origin}/web/query`, {
          method: "POST",
          headers: {
            cookie: cookieHeader,
            origin,
            "content-type": "application/json",
            "x-iris-library": libraryId,
          },
          body: JSON.stringify({ name, params }),
        });
        assert.equal(response.status, 200);
        return response.json();
      };
      const page = await query("saves.listPage", { limit: 100 });
      const image = page.rows.find(
        (save) => save.sourceId === "900000000000000002",
      );
      const video = page.rows.find(
        (save) => save.sourceId === "900000000000000003",
      );
      assert.ok(
        image && video,
        "Run smoke-web.mjs first to ingest media fixtures",
      );
      await win.webContents.session.cookies.set({
        url: origin,
        name: "iris_session",
        value: cookie,
        httpOnly: true,
        sameSite: "strict",
      });
      await win.loadURL(origin);
      await waitFor(
        'document.querySelector("#fixture-kind") && document.body.innerText.includes("Iris fixture: image")',
      );
      await run("document.querySelector('[data-library-search]').focus()");
      await win.webContents.insertText("image");
      await waitFor('document.querySelectorAll("[data-save-id]").length === 1');
      await snapshot("search-results");
      await click('[aria-label="Clear Search"]');
      await waitFor('document.querySelectorAll("[data-save-id]").length >= 3');
      if (process.argv.includes("--disconnect")) {
        console.log("WEB_BROWSER_READY_FOR_DISCONNECT");
        await waitFor('document.body.innerText.includes("Host disconnected")');
        await snapshot("host-disconnected");
        console.log("WEB_DISCONNECTION_PASSED");
        clearTimeout(timer);
        app.exit(0);
        return;
      }
      const initial = await snapshot("desktop-library");
      assert.ok(
        !initial.includes("This action requires the Electron host"),
        "Startup must not invoke unsupported operations",
      );
      await run(
        `document.querySelector('#fixture-kind').value='quote'; Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes('Enqueue fixture')).click()`,
      );
      await waitFor(
        'document.body.innerText.includes("Save enqueued") || document.body.innerText.includes("Fixture already")',
      );
      await snapshot("desktop-enqueued");
      await waitFor('document.body.innerText.includes("Iris fixture: quote")');
      const all = await query("saves.listPage", { limit: 100 });
      const library = await query("library.info");
      assert.ok(library.path.startsWith(sandbox));
      for (const sourceId of [
        "900000000000000001",
        "900000000000000002",
        "900000000000000003",
      ]) {
        const save = all.rows.find((row) => row.sourceId === sourceId);
        assert.ok(save);
        const { rawJson } = await query("saves.rawJson", { id: save.id });
        const stored = JSON.parse(
          readFileSync(
            join(library.path, "items", `${save.id}.info`, "source.json"),
            "utf8",
          ),
        );
        assert.equal(rawJson.capture.id, sourceId);
        assert.deepEqual(stored.capture, rawJson.capture);
        const light = save.files.find(
          (file) => file.kind === "tweet_screenshot_light",
        );
        const dark = save.files.find(
          (file) => file.kind === "tweet_screenshot_dark",
        );
        assert.ok(light && dark && light.sha256 !== dark.sha256);
        if (sourceId === "900000000000000001") {
          assert.equal(stored.capture.quoted.id, "900000000000000004");
          assert.equal(stored.capture.author.handle, "iris_fixture");
          assert.equal(stored.capture.quoted.author.handle, "quoted_fixture");
        }
      }

      await click('[aria-label="New Folder"]');
      await waitFor("document.querySelector('[aria-label=\"Folder name\"]')");
      const folderName = `Browser workflow ${Date.now().toString(36)}`;
      await run(
        `(() => { const input=document.querySelector('[aria-label="Folder name"]'); input.value=${JSON.stringify(folderName)}; input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', bubbles:true })); })()`,
      );
      await waitFor(
        `document.body.innerText.includes(${JSON.stringify(folderName)}) && !document.querySelector('[aria-label="Folder name"]')`,
      );
      const folder = (await query("folders.list")).find(
        (row) => row.name === folderName,
      );
      assert.ok(folder);
      await snapshot("folder-created");
      await openSave(image.id);
      await waitFor(
        `Array.from(document.querySelectorAll('img')).some(img => img.src.includes('${image.id}/media-1.png') && img.complete && img.naturalWidth > 0)`,
      );
      await snapshot("image-viewer");
      if (
        !(await run(
          "Boolean(document.querySelector('[aria-label=\"Add Folder\"]'))",
        ))
      )
        await click('[aria-label="Toggle Details"]');
      await waitFor("document.querySelector('[aria-label=\"Add Folder\"]')");
      await click('[aria-label="Add Folder"]');
      await waitFor(
        `document.querySelector('[data-type="popover"] [aria-label="${folderName}"]')`,
      );
      await click(`[data-type="popover"] [aria-label="${folderName}"]`);
      await closePopover();
      await waitFor(
        `document.querySelector('[aria-label="Remove folder ${folderName}"]')`,
      );
      await snapshot("folder-assigned");
      await click(`[aria-label="Remove folder ${folderName}"]`);
      await waitFor(
        `!document.querySelector('[aria-label="Remove folder ${folderName}"]')`,
      );
      assert.ok(
        !(await query("folders.memberships")).some(
          (row) => row.saveId === image.id && row.folderId === folder.id,
        ),
      );
      await click('[aria-label="Add Folder"]');
      await waitFor(
        `document.querySelector('[data-type="popover"] [aria-label="${folderName}"]')`,
      );
      await click(`[data-type="popover"] [aria-label="${folderName}"]`);
      await closePopover();
      await waitFor(
        `document.querySelector('[aria-label="Remove folder ${folderName}"]')`,
      );
      writeFileSync(
        join(sandbox, "ui-verification-state.json"),
        JSON.stringify({ folderId: folder.id, saveId: image.id }),
      );
      await click('[aria-label="Back"]');
      await waitFor(`document.querySelector('[data-save-id="${video.id}"]')`);
      await openSave(video.id);
      await waitFor(
        'Array.from(document.querySelectorAll("video")).some(video => video.readyState >= 1 && video.duration >= 4)',
      );
      await run(
        `(() => { const video=Array.from(document.querySelectorAll('video')).find(video => video.readyState>=1); video.muted=true; video.currentTime=2; return video.play(); })()`,
      );
      await waitFor(
        'Array.from(document.querySelectorAll("video")).some(video => video.currentTime >= 2 && !video.paused)',
      );
      await run(
        `new Promise(resolve => { const video=Array.from(document.querySelectorAll('video')).find(video => video.readyState>=2); if (!video) throw new Error('No decoded video'); video.requestVideoFrameCallback(() => resolve()); })`,
      );
      assert.equal(
        await run(
          `Array.from(document.querySelectorAll('video')).some(video => video.videoWidth === 640 && video.currentSrc.includes('${video.id}/video'))`,
        ),
        true,
      );
      writeFileSync(
        join(evidence, "video-state.json"),
        JSON.stringify(
          await run(
            `Array.from(document.querySelectorAll('video')).map(video => ({ source:video.currentSrc, time:video.currentTime, width:video.videoWidth, height:video.videoHeight, paused:video.paused, frames:video.getVideoPlaybackQuality().totalVideoFrames }))`,
          ),
        ),
      );
      await snapshot("video-seeking");
      assert.equal(
        new URL(win.webContents.getURL()).pathname,
        `/save/${video.id}`,
      );
      const reloaded = new Promise((resolve) =>
        win.webContents.once("did-finish-load", resolve),
      );
      win.reload();
      await reloaded;
      await waitFor(
        'Array.from(document.querySelectorAll("video")).some(video => video.readyState >= 1)',
      );
      await snapshot("reload-viewer");
      win.setSize(390, 844);
      await waitFor("window.innerWidth === 390");
      if (
        await run(
          `document.querySelector('[data-slot="right"]').hasAttribute("data-open")`,
        )
      )
        await click('[aria-label="Toggle Details"]');
      if (
        await run(
          `document.querySelector('[data-slot="window"]').hasAttribute("data-left-open")`,
        )
      )
        await click('[aria-label="Toggle Sidebar"]');
      await waitFor(
        `!document.querySelector('[data-slot="left"]').hasAttribute("data-open") && !document.querySelector('[data-slot="right"]').hasAttribute("data-open")`,
      );
      await snapshot("mobile-viewer");
      // A separate mobile page starts with the sidebar closed and the shared Library.
      await run(
        `for (const key of Object.keys(localStorage)) if (key.startsWith('pond:lastPath:')) localStorage.removeItem(key)`,
      );
      await win.loadURL(origin);
      await waitFor(
        'document.body.innerText.includes("Search your library") && document.querySelector("#fixture-kind")',
      );
      await waitFor(
        '!document.querySelector(\'[data-slot="left"]\').hasAttribute("data-open")',
      );
      await waitFor('document.querySelectorAll("[data-save-id]").length >= 3');
      await snapshot("mobile-library");
      assert.ok(
        !(await run("document.body.innerText")).includes(
          "This action requires the Electron host",
        ),
      );
      console.log(
        "WEB_BROWSER_PASSED",
        JSON.stringify({
          desktop: [1280, 900],
          mobile: [390, 844],
          folderId: folder.id,
          image: true,
          videoSeeking: true,
          reload: true,
          evidence,
        }),
      );
      clearTimeout(timer);
      app.exit(0);
    } catch (error) {
      await snapshot("failed");
      console.error("WEB_BROWSER_FAILED", error.message);
      clearTimeout(timer);
      app.exit(1);
    }
  })
  .catch((error) => {
    console.error("WEB_BROWSER_FAILED", error.message);
    clearTimeout(timer);
    app.exit(1);
  });
