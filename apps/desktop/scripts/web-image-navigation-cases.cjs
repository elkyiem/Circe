const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { setTimeout: pause } = require("node:timers/promises");
const sharp = require("sharp");

exports.verifyBrowserImageNavigation =
  async function verifyBrowserImageNavigation({
    win,
    run,
    click,
    waitFor,
    query,
    origin,
    evidence,
  }) {
    assert.match(
      win.webContents.session.getStoragePath(),
      /iris-browser-smoke-/,
    );
    const original = await query("library.info");
    const hostViewer = (await query("settings.getPrefs")).viewer;
    const originalStorage = await run(
      "Object.fromEntries(Object.entries(localStorage))",
    );
    const session = await run(
      "fetch('/web/session').then(response=>response.json())",
    );
    const libraryId = session.libraryId;
    const prefix = `circe-mouse-${randomUUID()}`;
    const directory = join(evidence, prefix);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const record = {
      prefix,
      original,
      libraryId,
      checks: [],
      events: [],
      cleanup: false,
    };
    const save = () =>
      writeFileSync(
        join(directory, "results.json"),
        JSON.stringify(record, null, 2),
        { mode: 0o600 },
      );
    const cookies = await win.webContents.session.cookies.get({
      url: origin,
      name: "iris_session",
    });
    assert.equal(cookies.length, 1);
    const headers = {
      cookie: `iris_session=${cookies[0].value}`,
      origin,
      "x-iris-library": libraryId,
    };
    const request = async (path, options = {}) => {
      const response = await fetch(`${origin}${path}`, {
        ...options,
        headers: { ...headers, ...options.headers },
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, 200);
      return response;
    };
    const pose = () =>
      run(
        "(()=>{const frame=document.querySelector('[role=application][aria-label=Image][data-mode]');const position=frame.firstElementChild;const matrix=new DOMMatrix(getComputedStyle(position).transform);return{x:matrix.e,y:matrix.f,zoom:matrix.a,cursor:getComputedStyle(frame).cursor}})()",
      );
    const point = () =>
      run(
        "(()=>{const r=document.querySelector('[role=application][aria-label=Image][data-mode]').getBoundingClientRect();return{x:Math.round(r.x+r.width*.45),y:Math.round(r.y+r.height*.45)}})()",
      );
    const fit = async () => {
      await click('[aria-label="Fit to Window"]');
      await pause(250);
    };
    const prove = (name) => {
      record.checks.push(name);
      save();
    };
    const drag = async (button, dx, dy) => {
      const from = await point();
      win.webContents.sendInputEvent({ type: "mouseMove", ...from });
      win.webContents.sendInputEvent({
        type: "mouseDown",
        button,
        clickCount: 1,
        ...from,
      });
      await pause(20);
      for (let step = 1; step <= 8; step++) {
        win.webContents.sendInputEvent({
          type: "mouseMove",
          button,
          modifiers: [
            button === "left" ? "leftButtonDown" : "middleButtonDown",
          ],
          x: from.x + (dx * step) / 8,
          y: from.y + (dy * step) / 8,
        });
        await pause(16);
      }
      win.webContents.sendInputEvent({
        type: "mouseUp",
        button,
        clickCount: 1,
        x: from.x + dx,
        y: from.y + dy,
      });
      await pause(80);
    };
    win.webContents.debugger.attach("1.3");
    try {
      const bytes = await sharp({
        create: {
          width: 1200,
          height: 800,
          channels: 4,
          background: "#b04cf2",
        },
      })
        .png()
        .toBuffer();
      const upload = await (
        await request("/web/upload", {
          method: "PUT",
          headers: {
            "x-iris-filename": `${prefix}.png`,
            "content-type": "application/octet-stream",
          },
          body: bytes,
        })
      ).json();
      record.token = upload.token;
      record.sourceId = `web-upload:${upload.token.slice("iris-upload:".length)}`;
      save();
      const created = await (
        await request("/web/files", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "saves.createManual",
            params: { title: prefix, filePaths: [upload.token] },
          }),
        })
      ).json();
      assert.equal(created.ok, true);
      record.id = created.id;
      save();
      const key = `iris:device-prefs:${libraryId}`;
      await win.webContents.debugger.sendCommand(
        "Emulation.setUserAgentOverride",
        {
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
          platform: "Win32",
        },
      );
      await run(
        `localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify({ viewer: { ...hostViewer, wheelBehavior: "scroll" } }))})`,
      );
      await win.loadURL(`${origin}/save/${created.id}`);
      await waitFor(
        "document.querySelector('[role=application][aria-label=Image][data-mode] img')?.naturalWidth>0",
      );
      await pause(3500);
      await fit();
      record.environment = await run(
        "({runtime:document.documentElement.dataset.runtime,platform:navigator.platform,scripts:Array.from(document.scripts).map(script=>script.src),frames:Array.from(document.querySelectorAll('[role=application][aria-label=Image][data-mode]')).map(frame=>({pan:frame.dataset.pan,mode:frame.dataset.mode,active:frame.parentElement.dataset.active,html:frame.outerHTML.slice(0,500)}))})",
      );
      save();
      assert.equal(await run("navigator.platform"), "Win32");
      assert.equal(
        await run(
          "window.pond.query('settings.getPrefs',{}).then(prefs=>prefs.viewer.wheelBehavior)",
        ),
        "zoom",
      );
      await run(
        "window.__mouseEvents=[];for(const type of ['pointerdown','pointermove','pointerup','dragstart','auxclick'])document.addEventListener(type,event=>window.__mouseEvents.push({type,trusted:event.isTrusted,button:event.button}),true)",
      );
      for (const button of ["left", "middle"]) {
        for (const zoom of ["fit", "below", "above"]) {
          await fit();
          if (zoom !== "fit")
            await click(
              `[aria-label="Zoom ${zoom === "below" ? "Out" : "In"}"]`,
            );
          await pause(250);
          const before = await pose();
          await drag(button, 96, -64);
          const after = await pose();
          assert.ok(
            Math.abs(after.x - before.x - 96) < 1 &&
              Math.abs(after.y - before.y + 64) < 1,
            JSON.stringify({ button, zoom, before, after }),
          );
          assert.equal(after.zoom, before.zoom);
          const from = await point();
          win.webContents.sendInputEvent({
            type: "mouseMove",
            x: from.x + 50,
            y: from.y + 30,
          });
          await pause(40);
          assert.deepEqual(await pose(), after, "Release must stop panning.");
          prove(`${button}-pan-${zoom}-release`);
        }
      }
      await fit();
      const beforeWheel = await pose();
      win.webContents.sendInputEvent({
        type: "mouseWheel",
        ...(await point()),
        deltaY: 120,
      });
      await pause(300);
      const afterWheel = await pose();
      assert.notEqual(afterWheel.zoom, beforeWheel.zoom);
      prove("windows-wheel-zooms");
      await run(
        "window.pond.query('settings.setPrefs',{window:{interfaceZoom:150}})",
      );
      await fit();
      const beforeScaled = await pose();
      await drag("left", 96, -64);
      const afterScaled = await pose();
      assert.ok(
        Math.abs(afterScaled.x - beforeScaled.x - 64) < 1 &&
          Math.abs(afterScaled.y - beforeScaled.y + 64 / 1.5) < 1,
      );
      prove("150-percent-interface-pan-follows-pointer");
      record.events = await run("window.__mouseEvents");
      for (const button of [0, 1]) {
        assert.ok(
          record.events.some(
            (event) =>
              event.type === "pointerdown" &&
              event.button === button &&
              event.trusted,
          ),
        );
        assert.ok(
          record.events.some(
            (event) =>
              event.type === "pointerup" &&
              event.button === button &&
              event.trusted,
          ),
        );
      }
      assert.equal(
        record.events.some((event) => event.type === "dragstart"),
        false,
        "Panning must not start HTML file dragging.",
      );
      save();
      await run(
        "window.pond.query('settings.setPrefs',{window:{interfaceZoom:100},viewer:{wheelBehavior:'scroll'}})",
      );
      await fit();
      await win.loadURL(`${origin}/save/${created.id}`);
      await waitFor(
        "document.querySelector('[role=application][aria-label=Image][data-mode] img')?.naturalWidth>0",
      );
      await fit();
      assert.equal(
        await run(
          "window.pond.query('settings.getPrefs',{}).then(prefs=>prefs.viewer.wheelBehavior)",
        ),
        "scroll",
      );
      const beforeScroll = await pose();
      win.webContents.sendInputEvent({
        type: "mouseWheel",
        ...(await point()),
        deltaX: 24,
        deltaY: -48,
      });
      await pause(100);
      const afterScroll = await pose();
      assert.equal(afterScroll.zoom, beforeScroll.zoom);
      assert.ok(
        Math.abs(afterScroll.x - beforeScroll.x) > 0 &&
          Math.abs(afterScroll.y - beforeScroll.y) > 0,
      );
      prove("explicit-pan-preference-survives-reload");
      await win.webContents.debugger.sendCommand(
        "Emulation.setUserAgentOverride",
        {
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36",
          platform: "MacIntel",
        },
      );
      await run(`localStorage.removeItem(${JSON.stringify(key)})`);
      await win.loadURL(`${origin}/save/${created.id}`);
      await waitFor(
        "document.querySelector('[role=application][aria-label=Image][data-mode] img')?.naturalWidth>0",
      );
      await fit();
      const beforeMac = await pose();
      win.webContents.sendInputEvent({
        type: "mouseWheel",
        ...(await point()),
        deltaX: 24,
        deltaY: -48,
      });
      await pause(100);
      const afterMac = await pose();
      assert.equal(afterMac.zoom, beforeMac.zoom);
      assert.ok(afterMac.x !== beforeMac.x && afterMac.y !== beforeMac.y);
      win.webContents.sendInputEvent({
        type: "mouseWheel",
        ...(await point()),
        deltaY: 20,
        modifiers: ["control"],
      });
      await pause(100);
      assert.notEqual((await pose()).zoom, afterMac.zoom);
      prove("mac-trackpad-pan-and-pinch-retained");
      writeFileSync(
        join(directory, "image-pan.png"),
        (await win.webContents.capturePage()).toPNG(),
        { mode: 0o600 },
      );
    } finally {
      if (record.id) {
        const owned = await query("saves.get", { id: record.id });
        assert.equal(owned.title, prefix);
        assert.equal(owned.sourceId, record.sourceId);
        await query("saves.bulkEdit", {
          ids: [record.id],
          operation: { kind: "purge" },
          actorReason: "test:image-mouse-navigation",
        });
        assert.equal(await query("saves.get", { id: record.id }), null);
      }
      if (record.token)
        await request(`/web/upload/${encodeURIComponent(record.token)}`, {
          method: "DELETE",
        });
      await run(
        `localStorage.clear();for(const [key,value] of Object.entries(${JSON.stringify(originalStorage)}))localStorage.setItem(key,value)`,
      );
      assert.deepEqual(await query("library.info"), original);
      assert.deepEqual((await query("settings.getPrefs")).viewer, hostViewer);
      await request("/web/session", { method: "DELETE" });
      assert.equal(
        (await fetch(`${origin}/web/session`, { headers })).status,
        401,
      );
      win.webContents.debugger.detach();
      record.cleanup = true;
      save();
    }
    console.log(
      "IMAGE_MOUSE_NAVIGATION_PASSED",
      JSON.stringify({
        checks: record.checks.length,
        cleanup: record.cleanup,
        device: "Windows/Mac input emulation on macOS Chromium",
      }),
    );
  };
