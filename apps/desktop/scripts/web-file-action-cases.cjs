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
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");
const { setTimeout: pause } = require("node:timers/promises");
const JSZip = require("jszip");
const sharp = require("sharp");

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const thumbnail = (save) =>
  save.files.find((file) => file.kind === "thumbnail" && file.custom);
const mediaUrl = (origin, id, file) =>
  `${origin}/web/media/${encodeURIComponent(id)}/${file.path.split("/").map(encodeURIComponent).join("/")}`;

async function fixtureFiles(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const image = async (name, background) => {
    const path = join(directory, name);
    writeFileSync(
      path,
      await sharp({
        create: { width: 96, height: 64, channels: 3, background },
      })
        .png()
        .toBuffer(),
      { mode: 0o600 },
    );
    return path;
  };
  const original = await image("original image.png", "#d23c32");
  const custom = await image("chosen thumbnail.png", "#2cb46c");
  const replacement = await image("replacement chosen 水.png", "#a85ad0");
  const corrupt = join(directory, "corrupt thumbnail.png");
  writeFileSync(corrupt, "This is deliberately not an image.", { mode: 0o600 });
  const gif = join(directory, "second animation # 水.gif");
  const pixels = Buffer.alloc(32 * 32 * 2 * 3);
  for (let pixel = 0; pixel < 32 * 32 * 2; pixel++) {
    pixels[pixel * 3 + (pixel < 32 * 32 ? 0 : 2)] = 255;
  }
  writeFileSync(
    gif,
    await sharp(pixels, {
      raw: { width: 32, height: 64, channels: 3, pageHeight: 32 },
    })
      .gif({ delay: [2000, 2000], loop: 0 })
      .toBuffer(),
    { mode: 0o600 },
  );
  const lottie = join(directory, "animation.json");
  const animation = {
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 30,
    w: 32,
    h: 32,
    nm: "Circé file action fixture",
    layers: [],
  };
  writeFileSync(lottie, JSON.stringify(animation), { mode: 0o600 });
  const invalidJson = join(directory, "invalid animation.json");
  writeFileSync(invalidJson, "{ this is invalid JSON", { mode: 0o600 });
  const subtitles = join(directory, "chosen captions.srt");
  writeFileSync(
    subtitles,
    "1\r\n00:00:00,000 --> 00:00:03,500\r\nCircé real subtitle cue 水\r\n",
    { mode: 0o600 },
  );
  const video = resolve(__dirname, "../test/fixtures/web/video.mp4");
  assert.ok(
    existsSync(video),
    "The committed offline video fixture is required.",
  );
  return {
    original,
    custom,
    replacement,
    corrupt,
    gif,
    lottie,
    invalidJson,
    subtitles,
    video,
    animation,
  };
}

/** The caller owns the existing browser/runtime; this module never starts either. */
exports.verifyBrowserFileActions = async function verifyBrowserFileActions({
  win,
  run,
  click: harnessClick,
  waitFor,
  snapshot,
  query,
  origin,
  evidence,
  sandbox,
}) {
  const startedAt = Date.now();
  const deadline = startedAt + 240000;
  const initial = await query("library.info");
  const libraryId = JSON.parse(
    readFileSync(join(initial.path, "metadata.json"), "utf8"),
  ).id;
  const prefix = `Circé file actions ${randomUUID()}`;
  assert.match(
    win.webContents.session.getStoragePath() ?? "",
    /iris-browser-smoke-/,
    "File action smoke requires the harness's disposable browser profile.",
  );
  const directory = join(evidence, `file-actions-${Date.now()}`);
  const recordPath = join(directory, "ownership-and-results.json");
  const pointers = [
    join(sandbox, "app-data", "library-location.json"),
    join(sandbox, "library-location.json"),
  ]
    .filter(existsSync)
    .map((path) => ({ path, content: readFileSync(path, "utf8") }));
  const record = {
    prefix,
    original: { path: initial.path, libraryId },
    pointers,
    fixtures: [],
    checks: [],
    cleanup: { completed: false, purged: [], errors: [] },
    clipboard:
      "Injected visiting-browser provider; OS clipboard never accessed.",
  };
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const saveRecord = () => {
    writeFileSync(recordPath, JSON.stringify(record, null, 2), { mode: 0o600 });
    chmodSync(recordPath, 0o600);
  };
  saveRecord();
  assert.equal(statSync(recordPath).mode & 0o777, 0o600);
  const fixtures = await fixtureFiles(join(directory, "inputs"));
  const checkBudget = () => {
    assert.ok(
      Date.now() < deadline,
      "The finite file-action UI budget expired.",
    );
  };
  const waitUntil = async (read, label, timeout = 20000) => {
    const end = Math.min(deadline, Date.now() + timeout);
    let lastError;
    while (Date.now() < end) {
      try {
        const result = await read();
        if (result) return result;
      } catch (error) {
        lastError = error;
      }
      await pause(100);
    }
    throw new Error(`File action timed out: ${label}`, { cause: lastError });
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
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(
      response.status,
      200,
      `${path}: ${await response.clone().text()}`,
    );
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
  const bytesFor = async (save, file) =>
    Buffer.from(
      await (
        await request(new URL(mediaUrl(origin, save.id, file)).pathname)
      ).arrayBuffer(),
    );
  const assertOwned = async (fixture) => {
    const current = await query("saves.get", { id: fixture.id });
    assert.equal(current?.id, fixture.id);
    assert.equal(current.title, fixture.title);
    assert.equal(current.source, "local");
    assert.equal(current.sourceId, fixture.sourceId);
    return current;
  };
  const createFixture = async (label, paths) => {
    checkBudget();
    const fixture = {
      label,
      title: `${prefix}: ${label}`,
      tokens: [],
      removedTokens: [],
    };
    record.fixtures.push(fixture);
    saveRecord();
    for (const path of paths) {
      const name = path.split(/[\\/]/).at(-1);
      const uploaded = await (
        await request("/web/upload", {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            "x-iris-filename": encodeURIComponent(name),
          },
          body: readFileSync(path),
        })
      ).json();
      fixture.tokens.push(uploaded.token);
      fixture.sourceId = `web-upload:${fixture.tokens[0].slice("iris-upload:".length)}`;
      saveRecord();
    }
    const created = await filesRequest("saves.createManual", {
      title: fixture.title,
      filePaths: fixture.tokens,
    });
    assert.equal(created.ok, true);
    assert.ok(created.id);
    fixture.id = created.id;
    // Record the exact ID before any action under test can modify this Save.
    saveRecord();
    await assertOwned(fixture);
    for (const token of fixture.tokens) {
      await request(`/web/upload/${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      fixture.removedTokens.push(token);
      saveRecord();
    }
    return fixture;
  };
  const debuggerApi = win.webContents.debugger;
  assert.equal(
    debuggerApi.isAttached(),
    false,
    "Release the previous UI probe first.",
  );
  debuggerApi.attach("1.3");
  const requests = new Map();
  const replies = [];
  const network = (_event, method, params) => {
    if (method === "Network.requestWillBeSent") {
      const url = new URL(params.request.url);
      if (
        url.origin === new URL(origin).origin &&
        ["/web/files", "/web/video"].includes(url.pathname) &&
        params.request.postData
      ) {
        const input = JSON.parse(params.request.postData);
        requests.set(params.requestId, input);
      }
    }
    if (
      method === "Network.loadingFinished" &&
      requests.has(params.requestId)
    ) {
      const input = requests.get(params.requestId);
      requests.delete(params.requestId);
      void debuggerApi
        .sendCommand("Network.getResponseBody", { requestId: params.requestId })
        .then(({ body, base64Encoded }) => {
          replies.push({
            input,
            result: JSON.parse(
              base64Encoded ? Buffer.from(body, "base64").toString() : body,
            ),
          });
        })
        .catch((error) => replies.push({ input, captureError: error.message }));
    }
  };
  debuggerApi.on("message", network);
  const physicalClick = async (selector, clickCount = 1) => {
    const zoom = win.webContents.getZoomFactor();
    if (zoom === 1) return harnessClick(selector, clickCount);
    win.focus();
    win.webContents.focus();
    await waitFor("document.hasFocus()");
    await waitFor(`(() => {
      const node=document.querySelector(${JSON.stringify(selector)});
      if (!node) return false;
      const r=node.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.width>0 && r.height>0 && hit && node.contains(hit);
    })()`);
    const point = await run(`(() => {
      const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return {x:Math.round((r.x+r.width/2)*${zoom}),y:Math.round((r.y+r.height/2)*${zoom})};
    })()`);
    // Electron input uses window DIPs; DOM geometry uses zoomed CSS pixels.
    win.webContents.sendInputEvent({ type: "mouseMove", ...point });
    for (const type of ["mouseDown", "mouseUp"])
      win.webContents.sendInputEvent({
        type,
        button: "left",
        clickCount,
        ...point,
      });
  };
  const click = async (...args) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await physicalClick(...args);
      } catch (error) {
        const automatic = await run(
          `Array.from(document.querySelectorAll('[role="dialog"]')).some(dialog => /^(Meet Your Fish|What's New)/.test(dialog.querySelector('h2,[role="heading"]')?.textContent?.trim() ?? '') || Array.from(dialog.querySelectorAll('button')).some(button => button.textContent.trim() === 'Not Now'))`,
        );
        if (!automatic || attempt >= 2) {
          record.blockedControl = await run(`(() => {
            const node = document.querySelector(${JSON.stringify(args[0])});
            if (!node) return {selector:${JSON.stringify(args[0])}, missing:true};
            const rect=node.getBoundingClientRect();
            const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
            return {
              selector:${JSON.stringify(args[0])},
              viewport:{width:innerWidth,height:innerHeight,direction:document.documentElement.dir,dpr:devicePixelRatio},
              bounds:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height},
              target:node.outerHTML.slice(0,1200),
              pointerEvents:getComputedStyle(node).pointerEvents,
              hit:hit?.outerHTML.slice(0,1200),
              receivesPointer:hit ? node.contains(hit) : false,
              ancestors:Array.from((function*(){for(let parent=node.parentElement;parent;parent=parent.parentElement)yield parent})()).slice(0,7).map(parent=>({tag:parent.tagName,className:parent.className,pointerEvents:getComputedStyle(parent).pointerEvents})),
            };
          })()`);
          saveRecord();
          throw error;
        }
        // Welcome and scheduled asks can each arrive after the common click
        // helper checks prompts but before its pointer target stabilizes.
        record.startupDismissals = (record.startupDismissals ?? 0) + 1;
        saveRecord();
        for (const type of ["keyDown", "keyUp"])
          win.webContents.sendInputEvent({ type, keyCode: "Escape" });
        await waitFor("!document.querySelector('[role=dialog]')");
      }
    }
  };
  const mark = async (selector, predicate) => {
    const find = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(node => node.getBoundingClientRect().width > 0 && (${predicate}))`;
    await waitFor(`Boolean(${find})`);
    await run(`(() => {
      document.querySelectorAll('[data-file-action-control]').forEach(node => node.removeAttribute('data-file-action-control'));
      (${find}).setAttribute('data-file-action-control', 'target');
    })()`);
    return '[data-file-action-control="target"]';
  };
  const clickText = async (selector, label) =>
    click(
      await mark(
        selector,
        `node.textContent.includes(${JSON.stringify(label)})`,
      ),
    );
  const rightClick = async (selector, corner = false) => {
    win.focus();
    win.webContents.focus();
    await waitFor("document.hasFocus()");
    const point = await run(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) throw new Error('Missing context target');
      node.scrollIntoView({block:'nearest'});
      const rect = node.getBoundingClientRect();
      return {x: Math.round(rect.x + ${corner ? "8" : "rect.width / 2"}), y: Math.round(rect.y + ${corner ? "8" : "rect.height / 2"})};
    })()`);
    for (const type of ["mouseDown", "mouseUp"])
      win.webContents.sendInputEvent({
        type,
        button: "right",
        clickCount: 1,
        ...point,
      });
  };
  const openSave = async (fixture) => {
    checkBudget();
    await assertOwned(fixture);
    await win.loadURL(`${origin}/save/${encodeURIComponent(fixture.id)}`);
    await waitFor(
      `document.querySelector('[data-save-details]')?.getAttribute('aria-label') === ${JSON.stringify(fixture.title)}`,
    );
    const point = await run(
      `(() => {const r=document.querySelector('[data-save-details]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,
    );
    win.webContents.sendInputEvent({ type: "mouseMove", ...point });
  };
  const saveAction = async (label) => {
    checkBudget();
    await rightClick("[data-save-details]", true);
    const search = '[aria-label="Search save operations"]';
    await click(search);
    await win.webContents.insertText(label);
    return clickText('[role="menuitem"]', label);
  };
  const pickFile = async (activate, path) => {
    let listener;
    let timer;
    const opened = new Promise((resolveChooser, reject) => {
      timer = setTimeout(
        () => reject(new Error("File action chooser did not open.")),
        15000,
      );
      listener = (_event, method, params) => {
        if (method === "Page.fileChooserOpened") resolveChooser(params);
      };
      debuggerApi.on("message", listener);
    });
    try {
      const [, chosen] = await Promise.all([activate(), opened]);
      assert.equal(chosen.mode, "selectSingle");
      await debuggerApi.sendCommand("DOM.setFileInputFiles", {
        backendNodeId: chosen.backendNodeId,
        files: path ? [path] : [],
      });
      if (!path)
        await run(
          "document.querySelector('input[type=file]:not(#host-key-file)')?.dispatchEvent(new Event('cancel', {bubbles:true}))",
        );
    } finally {
      clearTimeout(timer);
      debuggerApi.removeListener("message", listener);
    }
  };
  const replyAfter = async (name, cursor) => {
    const reply = await waitUntil(
      () => replies.slice(cursor).find((reply) => reply.input.name === name),
      name,
    );
    assert.equal(reply.captureError, undefined);
    return reply;
  };
  const chooseAction = async (label, name, path) => {
    const cursor = replies.length;
    await pickFile(() => saveAction(label), path);
    return path ? replyAfter(name, cursor) : null;
  };
  const verifyThumbnail = async (fixture, channel) => {
    const current = await waitUntil(async () => {
      const save = await assertOwned(fixture);
      const file = thumbnail(save);
      if (!file) return null;
      const pixel = await sharp(await bytesFor(save, file))
        .resize(1, 1)
        .removeAlpha()
        .raw()
        .toBuffer();
      return (
        pixel[channel] > 180 &&
        pixel[(channel + 1) % 3] < 100 &&
        pixel[(channel + 2) % 3] < 100 &&
        save
      );
    }, `persisted thumbnail channel ${channel}`);
    assert.ok(thumbnail(current).custom);
    return current;
  };
  const prove = async (name, details = {}) => {
    record.checks.push({ name, passed: true, ...details });
    saveRecord();
    await snapshot(`file-actions-${name}`);
  };
  const download = async (activate, filename) => {
    checkBudget();
    const destination = join(directory, filename);
    let listener;
    let item;
    let timer;
    let completed = false;
    const complete = new Promise((resolveDownload, reject) => {
      timer = setTimeout(() => {
        item?.cancel();
        reject(new Error(`File action download timed out: ${filename}`));
      }, 30000);
      listener = (_event, candidate) => {
        if (!candidate.getURL().startsWith(`${origin}/web/download/`)) return;
        item = candidate;
        win.webContents.session.removeListener("will-download", listener);
        item.setSavePath(destination);
        item.once("done", (_event, state) =>
          state === "completed"
            ? resolveDownload()
            : reject(new Error(`Download ${state}`)),
        );
      };
      win.webContents.session.on("will-download", listener);
    });
    try {
      await Promise.all([activate(), complete]);
      assert.ok(statSync(destination).size > 0);
      completed = true;
      return readFileSync(destination);
    } finally {
      clearTimeout(timer);
      win.webContents.session.removeListener("will-download", listener);
      if (!completed) item?.cancel();
    }
  };
  let failure;
  try {
    await debuggerApi.sendCommand("Page.enable");
    await debuggerApi.sendCommand("Network.enable");
    await debuggerApi.sendCommand("Page.setInterceptFileChooserDialog", {
      enabled: true,
    });
    win.setSize(1280, 900);
    // A fresh profile schedules the Fish introduction after three seconds. Let it
    // appear before rapid fixture navigation can postpone it into a control click.
    await pause(3300);
    if (
      await run(
        `Array.from(document.querySelectorAll('[role="dialog"]')).some(dialog => /^(Meet Your Fish|What's New)/.test(dialog.querySelector('h2,[role="heading"]')?.textContent?.trim() ?? ''))`,
      )
    ) {
      win.focus();
      win.webContents.focus();
      await waitFor("document.hasFocus()");
      for (const type of ["keyDown", "keyUp"])
        win.webContents.sendInputEvent({ type, keyCode: "Escape" });
      await waitFor("!document.querySelector('[role=dialog]')");
    }
    const image = await createFixture("image", [fixtures.original]);
    const gif = await createFixture("two-file GIF", [
      fixtures.original,
      fixtures.gif,
    ]);
    const video = await createFixture("video captions", [fixtures.video]);
    // A standalone text import is a Note; a mixed Save exposes its stored JSON
    // file viewer and the actual dotLottie export control.
    const animation = await createFixture("dotLottie", [
      fixtures.original,
      fixtures.lottie,
    ]);
    const invalid = await createFixture("invalid JSON", [
      fixtures.original,
      fixtures.invalidJson,
    ]);

    await openSave(image);
    const before = JSON.stringify((await assertOwned(image)).files);
    const cancelCursor = replies.length;
    await chooseAction(
      "Set Thumbnail from File",
      "saves.setCustomThumbnail",
      null,
    );
    await waitFor(
      "!document.querySelector('input[type=file]:not(#host-key-file)')",
    );
    assert.equal(JSON.stringify((await assertOwned(image)).files), before);
    assert.equal(replies.slice(cancelCursor).length, 0);
    const corrupt = await chooseAction(
      "Set Thumbnail from File",
      "saves.setCustomThumbnail",
      fixtures.corrupt,
    );
    assert.equal(corrupt.result.ok, false);
    assert.equal(corrupt.result.error, "not_an_image");
    await waitFor(
      "document.body.innerText.includes(\"Couldn't set the thumbnail\") && document.body.innerText.includes('Choose a valid image file.')",
    );
    assert.equal(JSON.stringify((await assertOwned(image)).files), before);
    const custom = await chooseAction(
      "Set Thumbnail from File",
      "saves.setCustomThumbnail",
      fixtures.custom,
    );
    assert.equal(custom.result.ok, true);
    const customSave = await waitUntil(async () => {
      const save = await assertOwned(image);
      return thumbnail(save) && save;
    }, "custom thumbnail");
    const customPixel = await sharp(
      await bytesFor(customSave, thumbnail(customSave)),
    )
      .resize(1, 1)
      .removeAlpha()
      .raw()
      .toBuffer();
    assert.ok(
      customPixel[1] > customPixel[0] * 2 && customPixel[1] > customPixel[2],
    );
    await prove("custom-thumbnail-cancel-corrupt-success");

    await run(
      `Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{read:async()=>{throw new DOMException('Fixture permission denied','NotAllowedError')}}})`,
    );
    await saveAction("Set Thumbnail from Clipboard");
    await waitFor(
      "document.body.innerText.includes(\"Couldn't set the thumbnail\") && document.body.innerText.includes('Allow clipboard access in your browser')",
    );
    await prove("clipboard-denial-menu-feedback", {
      provider: "test browser only",
    });
    await run(
      `Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{read:async()=>[]}})`,
    );
    await saveAction("Set Thumbnail from Clipboard");
    await waitFor(
      "document.body.innerText.includes(\"Couldn't set the thumbnail\") && document.body.innerText.includes('No image found on the clipboard.')",
    );
    await prove("clipboard-empty-menu-feedback");

    const changed = await chooseAction(
      "Replace File",
      "saves.replaceFile",
      fixtures.replacement,
    );
    assert.equal(changed.result.ok, true);
    const replaced = await assertOwned(image);
    const replacement = replaced.files.find(
      (file) => file.path === "replacement chosen 水.png",
    );
    assert.ok(
      replacement,
      "The chosen visiting filename must survive replacement.",
    );
    assert.equal(
      digest(await bytesFor(replaced, replacement)),
      digest(readFileSync(fixtures.replacement)),
    );
    await prove("replace-chosen-bytes-name");

    const gifSave = await assertOwned(gif);
    const gifIndex = gifSave.files.findIndex((file) =>
      /\.gif$/i.test(file.path),
    );
    assert.ok(
      gifIndex > 0,
      "The GIF fixture must exercise a nonzero file index.",
    );
    const secondFrame = async ({ compact = false, direction = "ltr" } = {}) => {
      await openSave(gif);
      await run(`document.documentElement.dir = ${JSON.stringify(direction)}`);
      if (compact) {
        if (
          await run(
            "document.querySelector('[data-slot=right]')?.hasAttribute('data-open')",
          )
        )
          await click('[aria-label="Toggle Details"]');
        if (
          await run(
            "document.querySelector('[data-slot=window]')?.hasAttribute('data-left-open')",
          )
        )
          await click('[aria-label="Toggle Sidebar"]');
      }
      for (let next = 0; next < 4; next++) {
        if (
          await run(
            "Boolean(document.querySelector('[data-gif-player] canvas[data-frame]'))",
          )
        )
          break;
        await click('[aria-label="Next Slide"]');
        await pause(150);
      }
      await waitFor(
        "document.querySelector('[data-gif-player] canvas[data-frame]')",
      );
      await click('[aria-label="GIF Frames"]');
      await waitFor("document.querySelector('[aria-label=\"GIF Controls\"]')");
      if (
        await run(
          "Boolean(document.querySelector('[aria-label=\"Pause GIF\"]'))",
        )
      )
        await click('[aria-label="Pause GIF"]');
      if (
        await run(
          "document.querySelector('[data-gif-player] canvas').dataset.frame !== '0'",
        )
      )
        await click('[aria-label="Previous Frame"]');
      await waitFor(
        "document.querySelector('[data-gif-player] canvas').dataset.frame === '0'",
      );
      await click('[aria-label="Next Frame"]');
      await waitFor(
        "document.querySelector('[data-gif-player] canvas').dataset.frame === '1' && document.querySelector('[data-gif-player] canvas').getContext('2d').getImageData(0,0,1,1).data[2] > 200",
      );
    };
    await secondFrame();
    let cursor = replies.length;
    await saveAction("Set Current Frame as Thumbnail");
    const menuGif = await replyAfter("saves.setGifThumbnail", cursor);
    assert.equal(menuGif.result.ok, true);
    assert.equal(menuGif.input.params.frameIndex, 1);
    assert.match(menuGif.input.params.src, /%23/);
    await verifyThumbnail(gif, 2);
    await prove("gif-second-frame-save-menu", { fileIndex: gifIndex });
    await query("saves.removeCustomThumbnail", { id: gif.id });
    await secondFrame();
    cursor = replies.length;
    await rightClick("[data-gif-player] canvas[data-frame]");
    await clickText('[role="menuitem"]', "Set Current Frame as Thumbnail");
    const inspectorGif = await replyAfter("saves.setGifThumbnail", cursor);
    assert.equal(inspectorGif.result.ok, true);
    assert.equal(inspectorGif.input.params.frameIndex, 1);
    await verifyThumbnail(gif, 2);
    assert.equal(
      digest(await bytesFor(await assertOwned(gif), gifSave.files[gifIndex])),
      digest(readFileSync(fixtures.gif)),
      "Setting the GIF thumbnail must retain the original animation bytes.",
    );
    await prove("gif-second-frame-inspector", { fileIndex: gifIndex });

    await openSave(video);
    const subtitleReply = await chooseAction(
      "Load Subtitles",
      "saves.loadSubtitles",
      fixtures.subtitles,
    );
    assert.equal(subtitleReply.result.ok, true);
    await win.loadURL(`${origin}/save/${encodeURIComponent(video.id)}`);
    await waitFor("document.querySelector('video track[kind=subtitles]')");
    await waitFor(
      "document.querySelector('video').readyState >= 2 && document.querySelector('video').duration > 1",
    );
    // This configures playback only; the subtitle still has to load through the real track URL.
    await run(
      "(() => {const video=document.querySelector('video');video.muted=true;video.pause();video.currentTime=1;for(const track of video.textTracks) if(track.kind==='subtitles') track.mode='showing';})()",
    );
    await waitFor(
      "document.querySelector('video').currentTime >= 0.9 && document.querySelector('video').paused",
    );
    await waitFor(
      "Array.from(document.querySelector('video').textTracks).some(track => track.kind === 'subtitles' && track.cues?.length === 1 && track.activeCues?.[0]?.text === 'Circé real subtitle cue 水')",
    );
    const captionSave = await assertOwned(video);
    const caption = captionSave.files.find((file) => file.kind === "subtitle");
    const vtt = (await bytesFor(captionSave, caption)).toString();
    assert.match(vtt, /^WEBVTT/);
    assert.match(vtt, /00:00:00\.000 --> 00:00:03\.500/);
    await prove("srt-real-video-track");

    await openSave(animation);
    await click('[aria-label="Next Slide"]');
    await waitFor(
      "document.querySelector('[aria-label=\"Export dotLottie\"]')",
    );
    const lottie = await download(
      () => click('[aria-label="Export dotLottie"]'),
      "animation.lottie",
    );
    const archive = await JSZip.loadAsync(lottie);
    assert.deepEqual(
      JSON.parse(
        await archive.file("animations/animation.json").async("string"),
      ),
      fixtures.animation,
    );
    assert.equal(
      JSON.parse(await archive.file("manifest.json").async("string"))
        .animations[0].id,
      "animation",
    );
    await prove("dotlottie-real-download");
    await openSave(invalid);
    await click('[aria-label="Next Slide"]');
    await waitFor(
      "document.querySelector('[aria-label=\"Export dotLottie\"]')",
    );
    await click('[aria-label="Export dotLottie"]');
    await waitFor(
      "document.body.innerText.includes('This file does not contain valid JSON.')",
    );
    await prove("dotlottie-invalid-useful-message");

    await openSave(image);
    const webp = await download(
      () => saveAction("Export as WebP"),
      "images.zip",
    );
    const images = await JSZip.loadAsync(webp);
    const webpEntries = Object.values(images.files).filter((file) => !file.dir);
    assert.equal(webpEntries.length, 1);
    assert.equal(
      (await sharp(await webpEntries[0].async("nodebuffer")).metadata()).format,
      "webp",
    );
    await prove("webp-download-decodes");
    await win.loadURL(origin);
    await waitFor("document.querySelector('[aria-label=\"New\"]')");
    const debug = await download(async () => {
      await click('[aria-label="New"]');
      await click('[aria-label="Search Actions"]');
      await win.webContents.insertText("Export Debug Report");
      await clickText('[role="menuitem"]', "Export Debug Report");
    }, "debug-report.zip");
    const debugZip = await JSZip.loadAsync(debug);
    assert.deepEqual(Object.keys(debugZip.files).sort(), [
      "README.txt",
      "report.json",
    ]);
    const report = await debugZip.file("report.json").async("string");
    assert.ok(JSON.parse(report).app.version);
    for (const secret of [
      homedir(),
      initial.path,
      prefix,
      "iris_session",
      "web-access-key",
    ])
      assert.equal(
        report.includes(secret),
        false,
        `Debug report must omit ${secret}.`,
      );
    await prove("debug-report-redacted-download");

    const touch = async (label) => {
      const selector = `[aria-label="GIF Controls"] [aria-label="${label}"]`;
      const point = await run(
        `(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
      );
      await debuggerApi.sendCommand("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...point, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
      });
      await debuggerApi.sendCommand("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    const layouts = [
      ...[320, 390, 768, 1280].map((width) => ({
        name: `${width}-coarse`,
        width,
        zoom: 1,
        coarse: true,
        direction: "ltr",
      })),
      {
        name: "1280-zoom2",
        width: 1280,
        zoom: 2,
        coarse: false,
        direction: "ltr",
      },
      {
        name: "390-coarse-rtl",
        width: 390,
        zoom: 1,
        coarse: true,
        direction: "rtl",
      },
    ];
    for (const layout of layouts) {
      record.activeLayout = layout;
      saveRecord();
      win.webContents.setZoomFactor(layout.zoom);
      win.setSize(layout.width, 900);
      const touchOptions = { enabled: layout.coarse };
      if (layout.coarse) touchOptions.maxTouchPoints = 1;
      await debuggerApi.sendCommand(
        "Emulation.setTouchEmulationEnabled",
        touchOptions,
      );
      const cssWidth = layout.width / layout.zoom;
      await waitFor(
        `window.innerWidth === ${cssWidth} && matchMedia('(pointer: coarse)').matches === ${layout.coarse}`,
      );
      await secondFrame({ compact: true, direction: layout.direction });
      const geometry = await run(`(() => {
        const toolbar=document.querySelector('[aria-label="GIF Controls"]');
        const bounds=toolbar.getBoundingClientRect();
        const describe=button=>{
          const r=button.getBoundingClientRect();
          const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
          return {label:button.getAttribute('aria-label'),disabled:button.disabled,
            width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom,
            hit:Boolean(hit && button.contains(hit)),hitLabel:hit?.closest('[aria-label]')?.getAttribute('aria-label'),
            pointerEvents:getComputedStyle(button).pointerEvents};
        };
        return {
          width:innerWidth,height:innerHeight,coarse:matchMedia('(pointer: coarse)').matches,
          touchPoints:navigator.maxTouchPoints,direction:document.documentElement.dir,
          toolbar:{left:bounds.left,right:bounds.right,top:bounds.top,bottom:bounds.bottom,width:bounds.width},
          buttons:Array.from(toolbar.querySelectorAll('button')).map(describe),
          topButtons:Array.from(document.querySelectorAll('[data-save-details] [data-slot="top"] button')).filter(button=>button.getBoundingClientRect().width>0).map(describe),
        };
      })()`);
      record.layoutGeometry ??= [];
      record.layoutGeometry.push({ name: layout.name, ...geometry });
      saveRecord();
      assert.equal(geometry.coarse, layout.coarse);
      assert.equal(geometry.width, cssWidth);
      assert.equal(geometry.direction, layout.direction);
      if (layout.coarse) assert.ok(geometry.touchPoints >= 1);
      assert.ok(
        geometry.toolbar.left >= 0 && geometry.toolbar.right <= cssWidth,
      );
      assert.ok(geometry.buttons.length >= 6);
      for (const button of [...geometry.buttons, ...geometry.topButtons]) {
        if (layout.coarse)
          assert.ok(
            button.width >= 44 && button.height >= 44,
            `${layout.name}: ${button.label} target`,
          );
        assert.ok(
          button.left >= 0 && button.right <= cssWidth,
          `${layout.name}: ${button.label} horizontal fit`,
        );
        assert.ok(
          button.top >= 0 && button.bottom <= geometry.height,
          `${layout.name}: ${button.label} vertical fit`,
        );
        if (!button.disabled)
          assert.equal(
            button.hit,
            true,
            `${layout.name}: ${button.label} hit by ${button.hitLabel}`,
          );
      }
      for (const [label, frame] of [
        ["Previous Frame", "0"],
        ["Next Frame", "1"],
      ]) {
        if (layout.coarse) await touch(label);
        else await click(`[aria-label="GIF Controls"] [aria-label="${label}"]`);
        await waitFor(
          `document.querySelector('[data-gif-player] canvas').dataset.frame === '${frame}'`,
        );
      }
      await waitFor(
        "document.querySelector('[data-gif-player] canvas').getContext('2d').getImageData(0,0,1,1).data[2] > 200",
      );
      await prove(
        `gif-${layout.name}-fit-hit-${layout.coarse ? "touch" : "mouse"}`,
        geometry,
      );
    }
  } catch (error) {
    failure = error;
    record.failure = error.message;
    record.mediaState = await run(
      `Array.from(document.querySelectorAll('[data-save-details] video')).map(video=>({currentTime:video.currentTime,readyState:video.readyState,paused:video.paused,duration:video.duration,tracks:Array.from(video.textTracks).map(track=>({kind:track.kind,mode:track.mode,cues:track.cues?.length,active:Array.from(track.activeCues??[]).map(cue=>cue.text)}))}))`,
    ).catch(() => []);
    await snapshot("file-actions-failed").catch(() => {});
  } finally {
    // The saved ownership tuple, never a search result alone, authorizes fixture cleanup.
    for (const fixture of record.fixtures) {
      try {
        if (!fixture.id && fixture.sourceId) {
          const page = await query("saves.listPage", { limit: 500 });
          const matches = page.rows.filter(
            (save) =>
              save.sourceId === fixture.sourceId &&
              save.title === fixture.title,
          );
          assert.ok(matches.length <= 1);
          fixture.id = matches[0]?.id;
          saveRecord();
        }
        if (fixture.id) {
          await assertOwned(fixture);
          const result = await query("saves.bulkEdit", {
            ids: [fixture.id],
            operation: { kind: "purge" },
            actorReason: "test:web-file-actions-cleanup",
          });
          assert.equal(result.changed, 1);
          assert.equal(await query("saves.get", { id: fixture.id }), null);
          record.cleanup.purged.push(fixture.id);
        }
        for (const token of fixture.tokens) {
          if (fixture.removedTokens.includes(token)) continue;
          const response = await fetch(
            `${origin}/web/upload/${encodeURIComponent(token)}`,
            {
              method: "DELETE",
              headers: await headers(),
              signal: AbortSignal.timeout(5000),
            },
          );
          if (response.status === 200) fixture.removedTokens.push(token);
          else
            record.cleanup.errors.push(
              `Upload cleanup returned ${response.status}`,
            );
        }
      } catch (error) {
        record.cleanup.errors.push(`${fixture.label}: ${error.message}`);
      }
    }
    try {
      const active = await query("library.info");
      assert.equal(active.path, initial.path);
      assert.equal(
        JSON.parse(readFileSync(join(active.path, "metadata.json"), "utf8")).id,
        libraryId,
      );
      for (const pointer of pointers)
        assert.equal(readFileSync(pointer.path, "utf8"), pointer.content);
    } catch (error) {
      record.cleanup.errors.push(
        `Original Library verification: ${error.message}`,
      );
    }
    await run("delete navigator.clipboard").catch(() => {});
    await debuggerApi
      .sendCommand("Emulation.setTouchEmulationEnabled", { enabled: false })
      .catch(() => {});
    debuggerApi.removeListener("message", network);
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
    "WEB_FILE_ACTIONS_PASSED",
    JSON.stringify({ checks: record.checks.length, record: recordPath }),
  );
  return record;
};
