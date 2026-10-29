const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { basename, join, resolve } = require("node:path");
const { setTimeout: pause } = require("node:timers/promises");
const { app } = require("electron");
const sharp = require("sharp");

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const frameSelector = 'dialog[aria-label="Media preview"] iframe';

/** Real visiting-device windows and controls, with the existing host untouched. */
exports.verifyBrowserPreviews = async function verifyBrowserPreviews({
  win,
  run,
  click,
  waitFor,
  snapshot,
  query,
  origin,
  evidence,
  sandbox,
}) {
  const startedAt = Date.now();
  const deadline = startedAt + 250000;
  const initial = await query("library.info");
  const originalViewer = (await query("settings.getPrefs")).viewer;
  const libraryId = readJson(join(initial.path, "metadata.json")).id;
  const prefix = `circepreview${randomUUID().replaceAll("-", "")}`;
  const directory = join(evidence, `previews-${Date.now()}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const recordPath = join(directory, "ownership-and-results.json");
  const pointers = [
    join(sandbox, "app-data", "library-location.json"),
    join(sandbox, "library-location.json"),
  ]
    .filter(existsSync)
    .map((path) => ({ path, content: readFileSync(path, "utf8") }));
  const record = {
    prefix,
    original: { path: initial.path, libraryId, viewer: originalViewer },
    pointers,
    fixtures: [],
    checks: [],
    popupAttempts: [],
    browserErrors: [],
    cleanup: { completed: false, purged: [], errors: [] },
  };
  const saveRecord = () => {
    writeFileSync(recordPath, JSON.stringify(record, null, 2), { mode: 0o600 });
    chmodSync(recordPath, 0o600);
  };
  saveRecord();
  assert.match(
    win.webContents.session.getStoragePath() ?? "",
    /iris-browser-smoke-/,
    "Preview acceptance requires the disposable browser profile.",
  );
  const checkBudget = () =>
    assert.ok(Date.now() < deadline, "The finite preview UI budget expired.");
  const waitUntil = async (read, label, timeout = 20000) => {
    const end = Math.min(deadline, Date.now() + timeout);
    let lastError;
    while (Date.now() < end) {
      try {
        const value = await read();
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      await pause(100);
    }
    throw new Error(`Preview acceptance timed out: ${label}`, {
      cause: lastError,
    });
  };
  const headers = async () => {
    const cookies = await win.webContents.session.cookies.get({
      url: origin,
      name: "iris_session",
    });
    assert.equal(cookies.length, 1);
    return {
      cookie: `iris_session=${cookies[0].value}`,
      origin,
      "x-iris-library": libraryId,
    };
  };
  const request = async (path, options = {}) => {
    const response = await fetch(`${origin}${path}`, {
      ...options,
      headers: { ...(await headers()), ...options.headers },
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200, `Preview fixture ${path} must succeed.`);
    return response;
  };
  const filesRequest = async (name, params) =>
    (
      await request("/web/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, params }),
      })
    ).json();
  const assertOwned = async (fixture) => {
    const save = await query("saves.get", { id: fixture.id });
    assert.equal(save?.id, fixture.id);
    assert.equal(save.title, fixture.title);
    assert.equal(save.source, "local");
    assert.equal(save.sourceId, fixture.sourceId);
    return save;
  };
  const fixture = async (label, filename, bytes, mediaType) => {
    const entry = {
      label,
      title: `${prefix} ${label}`,
      filename,
      mediaType,
      sha256: digest(bytes),
      bytes: bytes.length,
      removedToken: false,
    };
    record.fixtures.push(entry);
    saveRecord();
    writeFileSync(join(directory, filename), bytes, { mode: 0o600 });
    const upload = await (
      await request("/web/upload", {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          "x-iris-filename": encodeURIComponent(filename),
        },
        body: bytes,
      })
    ).json();
    entry.token = upload.token;
    assert.ok(entry.token.startsWith("iris-upload:"));
    entry.sourceId = `web-upload:${entry.token.slice("iris-upload:".length)}`;
    saveRecord();
    const created = await filesRequest("saves.createManual", {
      title: entry.title,
      filePaths: [entry.token],
    });
    assert.equal(created.ok, true);
    entry.id = created.id;
    saveRecord();
    const save = await waitUntil(async () => {
      const current = await assertOwned(entry);
      return current.status === "complete" &&
        current.files.some((file) => file.kind === mediaType)
        ? current
        : false;
    }, `durable ${label} original`);
    const original = save.files.find((file) => file.kind === mediaType);
    assert.equal(original.sha256, entry.sha256);
    entry.path = original.path;
    await request(`/web/upload/${encodeURIComponent(entry.token)}`, {
      method: "DELETE",
    });
    entry.removedToken = true;
    saveRecord();
    return entry;
  };

  const popups = [];
  let denyPopups = false;
  const createdWindow = (child, details) => {
    assert.ok(details.url.startsWith(`${origin}/browser-preview.html#`));
    popups.push(child);
    child.webContents.on("console-message", (event) => {
      if (event.level === "error") {
        record.browserErrors.push(event.message);
        saveRecord();
      }
    });
  };
  win.webContents.on("did-create-window", createdWindow);
  win.webContents.setWindowOpenHandler(({ url }) => {
    const isPreview = url.startsWith(`${origin}/browser-preview.html#`);
    record.popupAttempts.push({ url: url.split("#")[0], denied: denyPopups });
    saveRecord();
    if (!isPreview || denyPopups) return { action: "deny" };
    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        show: true,
        webPreferences: {
          session: win.webContents.session,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
    };
  });
  const debuggerApi = win.webContents.debugger;
  assert.equal(debuggerApi.isAttached(), false);
  debuggerApi.attach("1.3");
  await debuggerApi.sendCommand("Page.enable");

  const surface = (child = null) => {
    const owner = child ?? win;
    const evaluate = child
      ? (code) => child.webContents.executeJavaScript(code, true)
      : async (code) => {
          const frame = win.webContents.mainFrame.frames.find((candidate) =>
            candidate.url.startsWith(`${origin}/browser-preview.html#`),
          );
          assert.ok(frame, "The actual fallback iframe must be loaded.");
          return frame.executeJavaScript(code, true);
        };
    const wait = (expression, label = expression, timeout) =>
      waitUntil(() => evaluate(expression), label, timeout);
    const pointFor = async (selector, nativePlay = false) => {
      await wait(`(() => {
        const node=document.querySelector(${JSON.stringify(selector)});
        if (!node) return false;
        const r=node.getBoundingClientRect();
        const hit=document.elementFromPoint(r.x+${nativePlay ? "24" : "r.width/2"},r.y+${nativePlay ? "r.height-48" : "r.height/2"});
        return r.width>0 && r.height>0 && hit && node.contains(hit);
      })()`);
      const point = await evaluate(`(() => {
        const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
        return {x:r.x+${nativePlay ? "24" : "r.width/2"},y:r.y+${nativePlay ? "r.height-48" : "r.height/2"}};
      })()`);
      if (!child) {
        const offset = await run(`(() => {
          const frame=document.querySelector(${JSON.stringify(frameSelector)});
          const r=frame.getBoundingClientRect();
          const hit=document.elementFromPoint(r.x+${point.x},r.y+${point.y});
          return {x:r.x,y:r.y,hit:hit===frame};
        })()`);
        assert.equal(offset.hit, true, "The modal iframe must receive input.");
        point.x += offset.x;
        point.y += offset.y;
      }
      return {
        x: Math.round(point.x * owner.webContents.getZoomFactor()),
        y: Math.round(point.y * owner.webContents.getZoomFactor()),
      };
    };
    const activate = async (selector, touch = false, nativePlay = false) => {
      checkBudget();
      app.focus({ steal: true });
      owner.focus();
      owner.webContents.focus();
      const point = await pointFor(selector, nativePlay);
      if (touch) {
        assert.equal(
          child,
          null,
          "Coarse tests use the real embedded fallback.",
        );
        await debuggerApi.sendCommand("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
        });
        await debuggerApi.sendCommand("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
      } else {
        owner.webContents.sendInputEvent({ type: "mouseMove", ...point });
        for (const type of ["mouseDown", "mouseUp"])
          owner.webContents.sendInputEvent({
            type,
            button: "left",
            clickCount: 1,
            ...point,
          });
      }
    };
    const capture = async (name) => {
      await evaluate(
        "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
      );
      writeFileSync(
        join(directory, `${name}.png`),
        (await owner.webContents.capturePage()).toPNG(),
        { mode: 0o600 },
      );
      writeFileSync(
        join(directory, `${name}.txt`),
        await evaluate("document.body.innerText"),
        { mode: 0o600 },
      );
    };
    return { child, evaluate, wait, activate, capture };
  };
  const prove = async (name, target, details = {}) => {
    record.checks.push({ name, passed: true, ...details });
    saveRecord();
    if (target) await target.capture(name);
    else await snapshot(`previews-${name}`);
  };
  const mark = async (selector, label) => {
    await waitFor(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(node=>node.getBoundingClientRect().width>0 && node.textContent.includes(${JSON.stringify(label)}))`,
    );
    await run(`(() => {
      document.querySelectorAll('[data-preview-control]').forEach(node=>node.removeAttribute('data-preview-control'));
      Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(node=>node.getBoundingClientRect().width>0 && node.textContent.includes(${JSON.stringify(label)})).setAttribute('data-preview-control','target');
    })()`);
    return '[data-preview-control="target"]';
  };
  const gallery = async () => {
    win.setSize(1280, 900);
    win.webContents.setZoomFactor(1);
    await debuggerApi.sendCommand("Emulation.setTouchEmulationEnabled", {
      enabled: false,
    });
    await win.loadURL(`${origin}/?q=${encodeURIComponent(prefix)}`);
    await waitFor('document.querySelector("[data-library-search]")');
    const search = "[data-library-search]";
    await click(search);
    win.webContents.selectAll();
    await win.webContents.insertText(prefix);
    await waitFor(
      `document.querySelector(${JSON.stringify(search)})?.textContent.trim() === ${JSON.stringify(prefix)}`,
    );
    const ids = record.fixtures.map((entry) => entry.id);
    await waitFor(`(() => {
      const ids=[...new Set(Array.from(document.querySelectorAll('[data-save-id]')).map(node=>node.dataset.saveId))];
      return ids.length===${ids.length} && ${JSON.stringify(ids)}.every(id=>ids.includes(id));
    })()`);
    return run(
      "[...new Set(Array.from(document.querySelectorAll('[data-save-id]')).map(node=>node.dataset.saveId))]",
    );
  };
  const openMenu = async (entry) => {
    await assertOwned(entry);
    const selector = `[data-save-id="${entry.id}"] [role="option"]`;
    await click(selector);
    const point = await run(`(() => {
      const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return {x:Math.round(r.x+8),y:Math.round(r.y+8)};
    })()`);
    for (const type of ["mouseDown", "mouseUp"])
      win.webContents.sendInputEvent({
        type,
        button: "right",
        clickCount: 1,
        ...point,
      });
    await click('[aria-label="Search save operations"]');
    await win.webContents.insertText("Open in New Window");
    await click(await mark('[role="menuitem"]', "Open in New Window"));
  };
  const open = async (entry, kind = "detached", embedded = false) => {
    const cursor = popups.length;
    const attemptCursor = record.popupAttempts.length;
    denyPopups = embedded;
    if (kind === "presentation") {
      await click(`[data-save-id="${entry.id}"] [role="option"]`);
      for (const type of ["keyDown", "keyUp"])
        win.webContents.sendInputEvent({ type, keyCode: "Space" });
    } else await openMenu(entry);
    let target;
    if (embedded) {
      await waitFor(
        `document.querySelector(${JSON.stringify(frameSelector)})?.closest('dialog')?.open`,
      );
      assert.equal(
        record.popupAttempts.slice(attemptCursor).some((entry) => entry.denied),
        true,
        "The real browser popup request must have been denied.",
      );
      assert.equal(
        popups.length,
        cursor,
        "Deny must not create a second window.",
      );
      target = surface();
    } else {
      const child = await waitUntil(
        () =>
          popups.slice(cursor).find((candidate) => !candidate.isDestroyed()),
        "actual visiting-browser preview popup",
      );
      target = surface(child);
    }
    await target.wait(
      "document.documentElement.dataset.runtime==='browser' && Boolean(document.querySelector('[aria-label=\"Close Preview\"]'))",
      "shared preview controls mounted",
    );
    await rendered(target, entry);
    return target;
  };
  const rendered = async (target, entry) => {
    const idPath = `/web/media/${encodeURIComponent(entry.id)}/`;
    await target.wait(
      `(() => {
      const node=document.querySelector(${JSON.stringify(entry.mediaType === "video" ? "#video" : "#image")});
      if(!node || node.hidden || !document.querySelector('#media-error')?.hidden) return false;
      const r=node.getBoundingClientRect();
      return r.width>0 && r.height>0 && new URL(node.currentSrc || node.src).pathname.startsWith(${JSON.stringify(idPath)}) && ${entry.mediaType === "video" ? "node.readyState>=2 && node.videoWidth>0 && node.controls && node.playsInline" : `node.complete && node.naturalWidth>0 && node.alt===${JSON.stringify(entry.title)}`};
    })()`,
      `rendered useful ${entry.label}`,
    );
    assert.equal(
      await target.evaluate("document.title"),
      `${entry.title} · Circé`,
    );
  };
  const close = async (target, touch = false) => {
    await target.activate('[aria-label="Close Preview"]', touch);
    await waitUntil(
      () =>
        target.child
          ? target.child.isDestroyed()
          : run(`!document.querySelector(${JSON.stringify(frameSelector)})`),
      "Close Preview removes its actual popup or modal",
    );
  };
  const download = async (target, entry, name) => {
    const destination = join(directory, name);
    let listener;
    let item;
    let timer;
    let completed = false;
    const finished = new Promise((resolveDownload, reject) => {
      timer = setTimeout(() => {
        item?.cancel();
        reject(new Error(`Preview download timed out: ${name}`));
      }, 20000);
      listener = (_event, candidate) => {
        if (new URL(candidate.getURL()).origin !== new URL(origin).origin)
          return;
        item = candidate;
        win.webContents.session.removeListener("will-download", listener);
        item.setSavePath(destination);
        item.once("done", (_event, state) =>
          state === "completed"
            ? resolveDownload()
            : reject(new Error(`Preview download ${state}`)),
        );
      };
      win.webContents.session.on("will-download", listener);
    });
    try {
      await Promise.all([
        target.activate('[aria-label="Download Original"]'),
        finished,
      ]);
      assert.equal(statSync(destination).size, entry.bytes);
      assert.equal(digest(readFileSync(destination)), entry.sha256);
      assert.equal(basename(item.getFilename()), basename(entry.path));
      completed = true;
    } finally {
      clearTimeout(timer);
      win.webContents.session.removeListener("will-download", listener);
      if (!completed) item?.cancel();
    }
  };

  let failure;
  let current;
  try {
    const videoPath = resolve(__dirname, "../test/fixtures/web/video.mp4");
    assert.ok(existsSync(videoPath));
    const video = await fixture(
      "video",
      "preview video.mp4",
      readFileSync(videoPath),
      "video",
    );
    for (const [label, width, height, background] of [
      ["portrait", 1280, 1920, "#1cba64"],
      ["landscape", 1920, 1280, "#d23c32"],
    ])
      await fixture(
        label,
        `preview ${label}.png`,
        await sharp({ create: { width, height, channels: 3, background } })
          .png()
          .toBuffer(),
        "image",
      );
    const order = await gallery();
    record.resultOrder = order;
    const byId = new Map(record.fixtures.map((entry) => [entry.id, entry]));
    const images = order
      .map((id) => byId.get(id))
      .filter((entry) => entry.mediaType === "image");
    assert.equal(images.length, 2);
    const first = images[0];
    const second = images[1];

    current = await open(first);
    assert.equal(await current.evaluate("window.opener === null"), true);
    assert.equal(
      await current.evaluate(
        "Boolean(document.querySelector('[aria-label=\"Play Slideshow\"]'))",
      ),
      false,
    );
    await current.activate('[aria-label="Rotate"]');
    await current.wait(
      "document.querySelector('#image').style.transform.includes('rotate(90deg)')",
    );
    await current.activate('[aria-label="Mirror"]');
    await current.wait(
      "document.querySelector('[aria-label=Mirror]').getAttribute('aria-pressed')==='true' && document.querySelector('#image').style.transform.includes('scaleX(-1)')",
    );
    await current.activate('[aria-label="Grayscale"]');
    await current.wait(
      "document.querySelector('[aria-label=Grayscale]').getAttribute('aria-pressed')==='true' && document.querySelector('#image').style.filter==='grayscale(1)'",
    );
    await prove("image-rotated-mirrored-grayscale", current);
    for (const rotation of [180, 270, 0]) {
      await current.activate('[aria-label="Rotate"]');
      await current.wait(
        `document.querySelector('#image').style.transform.includes('rotate(${rotation}deg)')`,
      );
    }
    await current.activate('[aria-label="Actual Size"]');
    await current.wait(
      "document.querySelector('#image').dataset.size==='actual' && document.querySelector('[aria-label=Fit]') && (()=>{const r=document.querySelector('#image').getBoundingClientRect();return r.width>innerWidth || r.height>innerHeight})()",
    );
    await current.activate('[aria-label="Fit"]');
    await current.wait(
      "document.querySelector('#image').dataset.size==='fit' && document.querySelector('[aria-label=\"Actual Size\"]') && (()=>{const r=document.querySelector('#image').getBoundingClientRect();return r.width<=innerWidth+1 && r.height<=innerHeight+1})()",
    );
    await download(current, first, "detached-original.png");
    await prove("detached-image-controls-download", current);
    const start = order.indexOf(first.id);
    const end = order.indexOf(second.id);
    for (let index = start + 1; index <= end; index++) {
      await current.activate('[aria-label="Next"]');
      await rendered(current, byId.get(order[index]));
    }
    for (let index = end - 1; index >= start; index--) {
      await current.activate('[aria-label="Previous"]');
      await rendered(current, byId.get(order[index]));
    }
    await prove("detached-real-neighbor-controls", current, { order });
    await close(current);
    current = await open(first);
    await current.wait(
      "document.querySelector('#image').style.transform==='rotate(0deg) scaleX(1)' && document.querySelector('#image').style.filter===''",
    );
    await prove("close-reopen-fresh-image-state", current);
    await close(current);

    // Presentation is the existing shared Space preference, not a direct preview API call.
    await query("settings.setPrefs", {
      viewer: { spaceAction: "presentation", spaceBehavior: "toggle" },
    });
    await gallery();
    current = await open(first, "presentation");
    await current.wait(
      "Boolean(document.querySelector('[aria-label=\"Play Slideshow\"]'))",
    );
    await current.activate('[aria-label="Next"]');
    await rendered(current, second);
    await current.activate('[aria-label="Previous"]');
    await rendered(current, first);
    await current.activate('[aria-label="Play Slideshow"]');
    await rendered(current, second);
    await current.activate('[aria-label="Pause Slideshow"]');
    await current.activate('[aria-label="Previous"]');
    await rendered(current, first);
    await pause(5500);
    await rendered(current, first);
    await prove("presentation-neighbors-slideshow-pause", current);
    await close(current);
    await query("settings.setPrefs", { viewer: originalViewer });

    current = await open(first, "detached", true);
    await current.activate('[aria-label="Rotate"]');
    await current.wait(
      "document.querySelector('#image').style.transform.includes('rotate(90deg)')",
    );
    await prove("popup-denied-real-iframe-render-controls", current);
    await close(current);

    for (const width of [320, 390]) {
      await gallery();
      current = await open(video, "detached", true);
      win.setSize(width, 900);
      await debuggerApi.sendCommand("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 1,
      });
      await current.wait(
        `innerWidth===${width} && matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints>=1`,
      );
      const geometry = await current.evaluate(`(() => {
        const toolbar=document.querySelector('[aria-label="Preview Controls"]');
        const bounds=toolbar.getBoundingClientRect();
        const describe=node=>{
          const r=node.getBoundingClientRect();
          const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return {label:node.getAttribute('aria-label'),left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,hit:Boolean(hit && node.contains(hit))};
        };
        return {width:innerWidth,height:innerHeight,toolbar:describe(toolbar),buttons:Array.from(document.querySelectorAll('#preview-ui button')).map(describe),video:{width:document.querySelector('#video').videoWidth,height:document.querySelector('#video').videoHeight},coarse:matchMedia('(pointer: coarse)').matches};
      })()`);
      assert.equal(geometry.width, width);
      assert.equal(geometry.coarse, true);
      assert.ok(geometry.video.width > 0 && geometry.video.height > 0);
      assert.ok(geometry.toolbar.left >= 0 && geometry.toolbar.right <= width);
      assert.ok(
        geometry.buttons.some((button) => button.label === "Close Preview"),
      );
      assert.ok(geometry.buttons.length >= 6);
      for (const button of geometry.buttons) {
        assert.ok(
          button.width >= 44 && button.height >= 44,
          `${width}: ${button.label} touch target`,
        );
        assert.ok(
          button.left >= 0 && button.right <= width,
          `${width}: ${button.label} horizontal fit`,
        );
        assert.ok(
          button.top >= 0 && button.bottom <= geometry.height,
          `${width}: ${button.label} vertical fit`,
        );
        assert.equal(
          button.hit,
          true,
          `${width}: ${button.label} receives input`,
        );
      }
      // Chromium's native Play/Pause button is in the video controls at bottom left.
      await current.activate("#video", true, true);
      await current.wait(
        "!document.querySelector('#video').paused && document.querySelector('#video').currentTime>=0.3",
        "actual native Play advances the video clock",
        10000,
      );
      const playback = await current.evaluate(`(() => {
        const video=document.querySelector('#video');
        const canvas=document.createElement('canvas');
        canvas.width=64;canvas.height=36;
        const context=canvas.getContext('2d');
        context.drawImage(video,0,0,64,36);
        const pixels=context.getImageData(0,0,64,36).data;
        let nonBlack=0;const colors=new Set();
        for(let index=0;index<pixels.length;index+=4){
          if(pixels[index]+pixels[index+1]+pixels[index+2]>40)nonBlack++;
          colors.add([pixels[index]>>5,pixels[index+1]>>5,pixels[index+2]>>5].join(','));
        }
        return {currentTime:video.currentTime,readyState:video.readyState,paused:video.paused,nonBlack,colors:colors.size};
      })()`);
      assert.ok(
        playback.currentTime >= 0.3 &&
          playback.nonBlack > 1000 &&
          playback.colors > 4,
        "A useful decoded frame must accompany real playback progress.",
      );
      await current.activate("#video", true, true);
      await current.wait(
        "document.querySelector('#video').paused",
        "actual native Pause",
      );
      const pausedAt = await current.evaluate(
        "document.querySelector('#video').currentTime",
      );
      await pause(400);
      assert.ok(
        Math.abs(
          (await current.evaluate(
            "document.querySelector('#video').currentTime",
          )) - pausedAt,
        ) < 0.05,
        "Paused playback must keep its clock stable.",
      );
      geometry.playback = playback;
      await current.activate('[aria-label="Fill"]', true);
      await current.wait(
        "document.querySelector('#video').dataset.size==='fill' && getComputedStyle(document.querySelector('#video')).objectFit==='cover'",
      );
      await current.activate('[aria-label="Fit"]', true);
      await current.wait(
        "document.querySelector('#video').dataset.size==='fit' && getComputedStyle(document.querySelector('#video')).objectFit==='contain'",
      );
      if (width === 390)
        await download(current, video, "preview-downloaded-video.mp4");
      await prove(
        `video-${width}-coarse-play-pause-fit-hit-touch${width === 390 ? "-download" : ""}`,
        current,
        geometry,
      );
      await close(current, true);
    }
  } catch (error) {
    failure = error;
    record.failure = { message: error.message, stack: error.stack };
    saveRecord();
    await current?.capture("preview-failed").catch(() => {});
    await snapshot("previews-failed").catch(() => {});
  } finally {
    // Popups and fixture Saves belong to this run; unrelated data never authorizes cleanup.
    for (const child of popups) if (!child.isDestroyed()) child.destroy();
    win.webContents.removeListener("did-create-window", createdWindow);
    try {
      await debuggerApi.sendCommand("Emulation.setTouchEmulationEnabled", {
        enabled: false,
      });
      win.webContents.setZoomFactor(1);
      win.setSize(1280, 900);
      await win.loadURL(origin);
      await query("settings.setPrefs", { viewer: originalViewer });
      assert.deepEqual(
        (await query("settings.getPrefs")).viewer,
        originalViewer,
      );
    } catch (error) {
      record.cleanup.errors.push(`Preview preferences: ${error.message}`);
    }
    for (const entry of record.fixtures) {
      try {
        if (!entry.id && entry.sourceId) {
          const found = await query("saves.searchFts", {
            q: prefix,
            limit: 100,
            deletedOnly: false,
            mode: "all",
          });
          const candidates = await query("saves.getMany", { ids: found.ids });
          const owned = candidates.filter(
            (save) =>
              save.title === entry.title &&
              save.source === "local" &&
              save.sourceId === entry.sourceId,
          );
          assert.ok(owned.length <= 1);
          entry.id = owned[0]?.id;
          saveRecord();
        }
        if (entry.id) {
          await assertOwned(entry);
          const removed = await query("saves.bulkEdit", {
            ids: [entry.id],
            operation: { kind: "purge" },
            actorReason: "test:web-preview-cleanup",
          });
          assert.equal(removed.changed, 1);
          assert.equal(await query("saves.get", { id: entry.id }), null);
          record.cleanup.purged.push(entry.id);
        }
        if (entry.token && !entry.removedToken) {
          await request(`/web/upload/${encodeURIComponent(entry.token)}`, {
            method: "DELETE",
          });
          entry.removedToken = true;
        }
      } catch (error) {
        record.cleanup.errors.push(`${entry.label}: ${error.message}`);
      }
    }
    try {
      const final = await query("library.info");
      assert.equal(final.path, initial.path);
      assert.equal(readJson(join(final.path, "metadata.json")).id, libraryId);
      for (const field of ["name", "icon", "mark", "accent"])
        assert.deepEqual(final[field], initial[field]);
      for (const pointer of pointers)
        assert.equal(readFileSync(pointer.path, "utf8"), pointer.content);
    } catch (error) {
      record.cleanup.errors.push(`Original Library: ${error.message}`);
    }
    if (debuggerApi.isAttached()) debuggerApi.detach();
    record.cleanup.completed = record.cleanup.errors.length === 0;
    record.elapsedMs = Date.now() - startedAt;
    saveRecord();
  }
  assert.equal(
    record.cleanup.completed,
    true,
    record.cleanup.errors.join("\n"),
  );
  if (failure) throw failure;
  console.log(
    "WEB_PREVIEWS_PASSED",
    JSON.stringify({ checks: record.checks.length, record: recordPath }),
  );
  return record;
};
