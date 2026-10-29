const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { basename, join, relative, sep } = require("node:path");
const { setTimeout: pause } = require("node:timers/promises");
const sharp = require("sharp");

const quote = JSON.stringify;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const entries = (directory) =>
  existsSync(directory) ? readdirSync(directory).sort() : [];

function manifest(directory, root = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return manifest(path, root);
    assert(entry.isFile(), "The visiting-device fixture contains files only.");
    return [
      {
        path: relative(root, path).split(sep).join("/"),
        size: statSync(path).size,
        sha256: digest(readFileSync(path)),
      },
    ];
  });
}

async function makeLibrary(directory, prefix) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const parent = { id: `${prefix}-parent`, name: `${prefix} parent` };
  const child = { id: `${prefix}-child`, name: `${prefix} child` };
  writeFileSync(
    join(directory, "metadata.json"),
    JSON.stringify({
      folders: [
        {
          ...parent,
          color: "#135397",
          children: [{ ...child, iconColor: "#a45a31" }],
        },
      ],
      smartFolders: [],
      tagsGroups: [],
      quickAccess: [],
    }),
    { mode: 0o600 },
  );
  // This is ordinary Eagle input, deliberately unrelated to the host's work-owner marker.
  writeFileSync(
    join(directory, "owner.json"),
    JSON.stringify({ owner: `${prefix} visiting-device fixture` }),
    { mode: 0o600 },
  );
  writeFileSync(join(directory, "zero-byte.sidecar"), Buffer.alloc(0), {
    mode: 0o600,
  });
  const fixtures = [];
  for (const [index, color] of ["#cc3026", "#2f42c4"].entries()) {
    const itemId = `${prefix}-item-${index}`;
    const itemDirectory = join(directory, "images", `${itemId}.info`);
    mkdirSync(itemDirectory, { recursive: true, mode: 0o700 });
    const filename = `original ${index} # café 水.png`;
    const bytes = await sharp({
      create: {
        width: 96 + index * 16,
        height: 64,
        channels: 3,
        background: color,
      },
    })
      .png()
      .toBuffer();
    writeFileSync(join(itemDirectory, filename), bytes, { mode: 0o600 });
    const thumbnailName = `chosen ${index}_thumbnail.png`;
    const thumbnailBytes = await sharp({
      create: { width: 48, height: 32, channels: 3, background: "#28bd61" },
    })
      .png()
      .toBuffer();
    writeFileSync(join(itemDirectory, thumbnailName), thumbnailBytes, {
      mode: 0o600,
    });
    const metadata = {
      id: itemId,
      name: `${prefix}: original ${index}`,
      tags: [`${prefix} shared tag`, `${prefix} item ${index} tag`],
      folders: [index === 0 ? child.id : parent.id],
      url: `https://circe-eagle-fixture.invalid/${itemId}`,
      ext: "png",
      annotation: `${prefix} annotation ${index}`,
      comments: [
        { text: "Owned region comment", replies: [{ text: "Owned reply" }] },
      ],
      videoMarks: [{ timeSec: 65, text: "Owned timestamped note" }],
      width: 96 + index * 16,
      height: 64,
      star: 4 - index,
      palettes: [{ color: [19, 83, 151] }, "#cc3026"],
      modificationTime: Date.now() - 2000 + index,
      btime: Date.UTC(2024, 3, 5, 6, 7, index),
      isDeleted: false,
    };
    writeFileSync(
      join(itemDirectory, "metadata.json"),
      JSON.stringify(metadata),
      {
        mode: 0o600,
      },
    );
    fixtures.push({
      title: metadata.name,
      sourceId: `eagle:${itemId}`,
      metadata,
      filename,
      sha256: digest(bytes),
      thumbnailName,
      thumbnailSha256: digest(thumbnailBytes),
    });
  }
  return { parent, child, fixtures, manifest: manifest(directory) };
}

/** The caller owns the shared host and disposable browser; this module starts neither. */
exports.verifyBrowserEagle = async function verifyBrowserEagle({
  win,
  run,
  waitFor,
  snapshot,
  query,
  origin,
  evidence,
  sandbox,
}) {
  const startedAt = Date.now();
  const deadline = startedAt + 240000;
  assert.match(
    win.webContents.session.getStoragePath() ?? "",
    /iris-browser-smoke-/,
    "Eagle acceptance requires the harness's disposable browser profile.",
  );
  const prefix = `Circe Eagle ${randomUUID()}`;
  const directory = join(evidence, `eagle-${startedAt}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const source = join(directory, `${prefix}.library`);
  const fixture = await makeLibrary(source, prefix);
  const recordPath = join(directory, "ownership-and-results.json");
  const initial = await query("library.info");
  const libraryId = readJson(join(initial.path, "metadata.json")).id;
  const initialPrefs = await query("settings.getPrefs");
  const originalFolders = await query("folders.list");
  const originalTags = await query("tags.list");
  const originalMarker = await run("localStorage.getItem('pond:importedFrom')");
  const pointers = [
    join(sandbox, "app-data", "library-location.json"),
    join(sandbox, "library-location.json"),
  ]
    .filter(existsSync)
    .map((path) => ({ path, content: readFileSync(path, "utf8") }));
  const staging = join(sandbox, "app-data", "web-files");
  const uploadRoot = join(staging, "uploads");
  const importRoot = join(staging, "eagle-imports");
  const initialUploads = entries(uploadRoot);
  const initialImports = entries(importRoot);
  const record = {
    prefix,
    original: { path: initial.path, libraryId },
    fixtures: fixture.fixtures,
    folders: [],
    tags: [],
    sourceManifest: fixture.manifest,
    imports: [],
    uploads: [],
    uploadResponses: [],
    captureErrors: [],
    checks: [],
    cleanup: {
      completed: false,
      purged: [],
      folders: [],
      tags: [],
      errors: [],
    },
    nativeFolderPolicy:
      "The native importer creates a fresh folder tree on every import, even when Saves are skipped.",
  };
  const saveRecord = () => {
    writeFileSync(recordPath, JSON.stringify(record, null, 2), { mode: 0o600 });
    chmodSync(recordPath, 0o600);
  };
  saveRecord();
  const waitUntil = async (read, label, timeout = 20000) => {
    const end = Math.min(deadline, Date.now() + timeout);
    while (Date.now() < end) {
      const value = await read();
      if (value) return value;
      await pause(75);
    }
    throw new Error(`Eagle acceptance timed out: ${label}`);
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
  const request = async (path, options = {}) =>
    fetch(`${origin}${path}`, {
      ...options,
      headers: { ...(await headers()), ...options.headers },
      signal: AbortSignal.timeout(12000),
    });
  const ownSave = (save) =>
    record.fixtures.find(
      (value) =>
        value.sourceId === save.sourceId &&
        value.title === save.title &&
        save.source === "local",
    );
  const discover = async () => {
    let cursor = null;
    const ids = [];
    do {
      const page = await query("saves.listPage", { limit: 500, cursor });
      for (const save of page.rows) {
        ids.push(save.id);
        const owned = ownSave(save);
        if (owned) {
          assert(
            !owned.id || owned.id === save.id,
            "Duplicate fixture source identity.",
          );
          owned.id = save.id;
          saveRecord();
        }
      }
      cursor = page.nextCursor;
    } while (cursor);
    return ids.sort();
  };
  const originalSaveIds = await discover();
  const assertOwned = async (value) => {
    assert(
      value.id,
      "A fixture must have its exact ID recorded before mutation.",
    );
    const save = await query("saves.get", { id: value.id });
    assert.equal(save?.id, value.id);
    assert.equal(save.source, "local");
    assert.equal(save.sourceId, value.sourceId);
    assert.equal(save.title, value.title);
    return save;
  };
  const bytesFor = async (save, file) => {
    const path = `/web/media/${encodeURIComponent(save.id)}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
    const response = await request(path);
    assert.equal(
      response.status,
      200,
      "Read the imported native file through the authenticated media endpoint.",
    );
    return Buffer.from(await response.arrayBuffer());
  };
  const prove = (name, details = {}) => {
    record.checks.push({ name, passed: true, ...details });
    saveRecord();
  };
  const debuggerApi = win.webContents.debugger;
  assert.equal(
    debuggerApi.isAttached(),
    false,
    "Release the previous GUI probe first.",
  );
  debuggerApi.attach("1.3");
  const requests = new Map();
  const removals = new Map();
  const pending = new Set();
  const replies = [];
  const network = (_event, method, params) => {
    if (method === "Network.requestWillBeSent") {
      const url = new URL(params.request.url);
      if (url.origin !== new URL(origin).origin) return;
      if (url.pathname === "/web/upload" && params.request.method === "PUT") {
        requests.set(params.requestId, { kind: "upload" });
      } else if (
        url.pathname.startsWith("/web/upload/") &&
        params.request.method === "DELETE"
      ) {
        requests.set(params.requestId, {
          kind: "remove",
          token: decodeURIComponent(url.pathname.slice("/web/upload/".length)),
        });
      } else if (url.pathname === "/web/files" && params.request.postData) {
        const input = JSON.parse(params.request.postData);
        if (input.name === "saves.importEagleLibrary") {
          requests.set(params.requestId, { kind: "import", input });
          try {
            for (const file of input.params.files) {
              const expected = fixture.manifest.find(
                (value) => `${basename(source)}/${value.path}` === file.path,
              );
              assert(
                expected,
                "Only an exact visiting-device fixture path can authorize staging reads.",
              );
              assert.match(file.token, /^iris-upload:[a-f0-9-]{36}$/);
              const tokenDirectory = join(
                uploadRoot,
                file.token.slice("iris-upload:".length),
              );
              const metadata = readJson(join(tokenDirectory, "upload.json"));
              assert.equal(metadata.libraryId, libraryId);
              assert.equal(metadata.filename, basename(expected.path));
              assert.equal(metadata.size, expected.size);
              assert.equal(
                digest(readFileSync(join(tokenDirectory, metadata.filename))),
                expected.sha256,
              );
              record.uploads.push({
                token: file.token,
                name: metadata.filename,
                size: metadata.size,
                sha256: expected.sha256,
                removedStatus: removals.get(file.token),
              });
            }
            saveRecord();
          } catch (error) {
            record.captureErrors.push(error.message);
            saveRecord();
          }
        }
      }
    } else if (
      method === "Network.responseReceived" &&
      requests.has(params.requestId)
    ) {
      const value = requests.get(params.requestId);
      value.status = params.response.status;
      if (value.kind === "upload") {
        record.uploadResponses.push({ status: params.response.status });
        saveRecord();
      } else if (value.kind === "remove") {
        removals.set(value.token, params.response.status);
        const uploaded = record.uploads.find(
          (upload) => upload.token === value.token,
        );
        if (uploaded) uploaded.removedStatus = params.response.status;
        saveRecord();
      }
    } else if (
      method === "Network.loadingFinished" &&
      requests.has(params.requestId)
    ) {
      const value = requests.get(params.requestId);
      requests.delete(params.requestId);
      if (value.kind === "upload") return;
      if (value.kind === "remove") {
        removals.set(value.token, value.status);
        const uploaded = record.uploads.find(
          (upload) => upload.token === value.token,
        );
        if (uploaded) uploaded.removedStatus = value.status;
        saveRecord();
        return;
      }
      const capture = debuggerApi
        .sendCommand("Network.getResponseBody", { requestId: params.requestId })
        .then(({ body, base64Encoded }) => {
          const result = JSON.parse(
            base64Encoded ? Buffer.from(body, "base64").toString() : body,
          );
          replies.push({ ...value, result });
          saveRecord();
        })
        .catch((error) =>
          replies.push({ ...value, captureError: error.message }),
        )
        .finally(() => pending.delete(capture));
      pending.add(capture);
    }
  };
  debuggerApi.on("message", network);
  const click = async (selector, clickCount = 1) => {
    win.focus();
    win.webContents.focus();
    await waitFor("document.hasFocus()");
    await waitFor(`(() => {
      const node=document.querySelector(${quote(selector)});
      if(!node)return false;
      node.scrollIntoView({block:'nearest',inline:'nearest'});
      const rect=node.getBoundingClientRect();
      const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return rect.width>0&&rect.height>0&&hit&&node.contains(hit);
    })()`);
    const point = await run(`(() => {
      const rect=document.querySelector(${quote(selector)}).getBoundingClientRect();
      return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)};
    })()`);
    // CDP dispatches trusted pointer input in the same CSS coordinate space as the hit test.
    await debuggerApi.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...point,
    });
    await debuggerApi.sendCommand("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      buttons: 1,
      clickCount,
      ...point,
    });
    await debuggerApi.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      buttons: 0,
      clickCount,
      ...point,
    });
  };
  const openAction = async () => {
    win.focus();
    win.webContents.focus();
    await waitFor("document.hasFocus()");
    if (!(await run("Boolean(document.querySelector('[aria-label=\"New\"]'))")))
      await click('[aria-label="Toggle Sidebar"]');
    await click('[aria-label="New"]');
    await click('[aria-label="Search Actions"]');
    await win.webContents.insertText("Import Eagle Library");
    await waitFor(
      `Array.from(document.querySelectorAll('[role="menuitem"]')).some(node=>node.textContent.trim().endsWith('Import Eagle Library'))`,
    );
    await run(
      `Array.from(document.querySelectorAll('[role="menuitem"]')).find(node=>node.textContent.trim().endsWith('Import Eagle Library')).setAttribute('data-eagle-test-action','true')`,
    );
    await click('[data-eagle-test-action="true"]');
    record.lastAction = await run(
      `({active:document.activeElement?.outerHTML.slice(0,500),inputs:Array.from(document.querySelectorAll('input[type="file"]')).map(node=>node.outerHTML),clicks:window.__eagleAcceptance.clicks})`,
    );
    saveRecord();
  };
  const pickFolder = async (path) => {
    let listener;
    let timer;
    const opened = new Promise((resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(new Error("The real Eagle directory chooser did not open.")),
        15000,
      );
      listener = (_event, method, params) => {
        if (method === "Page.fileChooserOpened") resolve(params);
      };
      debuggerApi.on("message", listener);
    });
    try {
      const [, chooser] = await Promise.all([openAction(), opened]);
      const node = await debuggerApi.sendCommand("DOM.describeNode", {
        backendNodeId: chooser.backendNodeId,
      });
      assert(
        node.node.attributes.includes("webkitdirectory"),
        "The UI must open a directory picker, not a plain-file picker.",
      );
      assert(node.node.attributes.includes("Upload folder from this device"));
      await debuggerApi.sendCommand("DOM.setFileInputFiles", {
        backendNodeId: chooser.backendNodeId,
        files: path ? [path] : [],
      });
      if (!path)
        await run(
          "document.querySelector('input[webkitdirectory]')?.dispatchEvent(new Event('cancel',{bubbles:true}))",
        );
    } finally {
      clearTimeout(timer);
      debuggerApi.removeListener("message", listener);
    }
  };
  const retired = async (start, expected) => {
    await waitUntil(
      () =>
        record.uploads.slice(start).length === expected &&
        record.uploads
          .slice(start)
          .every((upload) => upload.removedStatus === 200),
      "all visiting-device upload tickets retired",
    );
    for (const upload of record.uploads.slice(start)) {
      assert.match(upload.token, /^iris-upload:[a-f0-9-]{36}$/);
      assert.equal(
        existsSync(join(uploadRoot, upload.token.slice("iris-upload:".length))),
        false,
      );
    }
    assert.deepEqual(
      entries(importRoot),
      initialImports,
      "No assembled Eagle work tree remains.",
    );
    assert.deepEqual(
      entries(uploadRoot),
      initialUploads,
      "No new staged upload remains.",
    );
  };
  const performImport = async (index) => {
    const before = record.uploads.length;
    const responseCursor = record.uploadResponses.length;
    const cursor = replies.length;
    await run(
      "window.__eagleAcceptance.progress=[];window.__eagleAcceptance.toasts=[];window.__eagleAcceptance.choices=[]",
    );
    await pickFolder(source);
    const reply = await waitUntil(
      () => replies.slice(cursor).find((value) => value.kind === "import"),
      "native Eagle result",
      60000,
    );
    assert.equal(reply.captureError, undefined);
    assert.equal(reply.status, 200);
    assert.equal(reply.result.ok, true);
    assert.equal(reply.result.imported, index === 0 ? 2 : 0);
    assert.equal(reply.result.skipped, index === 0 ? 0 : 2);
    assert.equal(reply.result.failed, 0);
    assert.equal(reply.result.deletedSkipped, 0);
    assert.deepEqual(reply.result.lockedFolders, []);
    assert.deepEqual(reply.result.droppedFields, []);
    assert.deepEqual(reply.result.approximatedRules, []);
    assert.equal(reply.result.shortcuts.imported, 0);
    assert.deepEqual(record.captureErrors, []);
    assert.equal(reply.input.params.importShortcuts, undefined);
    assert.equal(reply.input.params.dryRun, undefined);
    const expected = fixture.manifest
      .map((file) => `${basename(source)}/${file.path}`)
      .sort();
    assert.deepEqual(
      reply.input.params.files.map((file) => file.path).sort(),
      expected,
    );
    assert.equal(
      new Set(reply.input.params.files.map((file) => file.token)).size,
      expected.length,
    );
    await retired(before, expected.length);
    assert.equal(
      record.uploadResponses.slice(responseCursor).length,
      expected.length,
    );
    assert(
      record.uploadResponses
        .slice(responseCursor)
        .every((value) => value.status === 200),
    );
    assert(
      record.uploads
        .slice(before)
        .some(
          (upload) => upload.name === "zero-byte.sidecar" && upload.size === 0,
        ),
    );
    const observation = await run(
      "({progress:window.__eagleAcceptance.progress,toasts:window.__eagleAcceptance.toasts,choices:window.__eagleAcceptance.choices})",
    );
    assert.deepEqual(
      observation.choices
        .at(-1)
        .map((file) => file.path)
        .sort(),
      expected,
    );
    const progress = observation.progress.filter(
      (value) => value.id === reply.input.params.progressId,
    );
    const uploading = progress.filter((value) => value.stage === "uploading");
    assert(
      uploading.some(
        (value) => value.processed === 0 && value.total === expected.length,
      ),
    );
    assert(
      uploading.some(
        (value) =>
          value.processed === expected.length &&
          value.total === expected.length,
      ),
    );
    assert(
      progress.some(
        (value) =>
          value.stage !== "uploading" &&
          value.processed === 2 &&
          value.total === 2 &&
          value.imported === reply.result.imported &&
          value.skipped === reply.result.skipped,
      ),
    );
    await waitFor(
      `document.body.textContent.includes(${quote(index === 0 ? "Imported 2 items" : "Nothing new to import")})`,
    );
    assert(
      observation.toasts.some((text) =>
        text.includes("Importing Eagle library"),
      ),
      "The actual notification exposed progress while importing.",
    );
    assert(
      observation.toasts.some((text) =>
        text.includes("Copying from this device to your host"),
      ),
      "The UI exposed visiting-device upload progress.",
    );
    record.imports.push({
      result: reply.result,
      files: reply.input.params.files,
      observation,
    });
    saveRecord();
    await snapshot(`eagle-import-${index + 1}-result`);
    await discover();
    return reply;
  };
  const ownFolders = async () => {
    const folders = (await query("folders.list")).filter((folder) =>
      [fixture.parent.name, fixture.child.name].includes(folder.name),
    );
    for (const folder of folders) {
      assert(!originalFolders.some((original) => original.id === folder.id));
      if (!record.folders.some((value) => value.id === folder.id))
        record.folders.push(folder);
    }
    saveRecord();
    return folders;
  };
  let failure;
  try {
    await debuggerApi.sendCommand("Network.enable");
    await debuggerApi.sendCommand("Page.enable");
    await debuggerApi.sendCommand("Page.setInterceptFileChooserDialog", {
      enabled: true,
    });
    await win.loadURL(origin);
    await waitFor(
      "Boolean(window.pond) && Boolean(document.querySelector('[data-library-search]'))",
    );
    record.browserZoom = win.webContents.getZoomFactor();
    saveRecord();
    await run(`(() => {
      const state=window.__eagleAcceptance={progress:[],toasts:[],choices:[]};
      state.clicks=[];
      state.clicked=event=>state.clicks.push({trusted:event.isTrusted,text:event.target.closest('[role="menuitem"]')?.textContent,tag:event.target.tagName,active:navigator.userActivation.isActive});
      document.addEventListener('click',state.clicked,true);
      state.off=window.pond.onEagleImportProgress(value=>state.progress.push(value));
      state.changed=event=>{if(event.target.matches('input[webkitdirectory]'))state.choices.push(Array.from(event.target.files).map(file=>({path:file.webkitRelativePath,size:file.size})));};
      document.addEventListener('change',state.changed,true);
      state.observer=new MutationObserver(()=>{
        const text=Array.from(document.querySelectorAll('[data-slot="toasts"]')).map(node=>node.textContent).join('\\n');
        if(text && state.toasts.at(-1)!==text)state.toasts.push(text);
      });
      state.observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    })()`);
    const beforeCancel = record.uploads.length;
    await pickFolder(null);
    await pause(250);
    assert.equal(record.uploads.length, beforeCancel);
    assert.equal(replies.length, 0);
    prove("physical-directory-picker-cancel-does-not-import");
    await performImport(0);
    prove("real-folder-upload-nested-paths-owner-json-zero-byte-and-progress", {
      fileCount: fixture.manifest.length,
    });
    const firstFolders = await ownFolders();
    assert.equal(firstFolders.length, 2);
    const parent = firstFolders.find(
      (folder) => folder.name === fixture.parent.name,
    );
    const child = firstFolders.find(
      (folder) => folder.name === fixture.child.name,
    );
    assert.equal(parent.parentId, null);
    assert.equal(parent.color, "#135397");
    assert.equal(child.parentId, parent.id);
    assert.equal(child.color, "#a45a31");
    const memberships = await query("folders.memberships");
    for (const [index, value] of record.fixtures.entries()) {
      const save = await assertOwned(value);
      assert.equal(save.status, "complete");
      assert.equal(save.mediaType, "image");
      assert.equal(save.url, value.metadata.url);
      assert.equal(
        save.notes,
        `${value.metadata.annotation}\n\nOwned region comment\nOwned reply\n1:05 Owned timestamped note`,
      );
      assert.deepEqual([...save.tags].sort(), [...value.metadata.tags].sort());
      assert.equal(save.width, value.metadata.width);
      assert.equal(save.height, value.metadata.height);
      assert.equal(save.rating, value.metadata.star);
      assert.deepEqual(save.dominantColors, ["#135397", "#cc3026"]);
      assert.equal(save.savedAt, value.metadata.modificationTime);
      assert.equal(save.createdAt, value.metadata.btime);
      const original = save.files.find((file) => file.kind !== "thumbnail");
      const thumbnail = save.files.find(
        (file) => file.kind === "thumbnail" && file.custom,
      );
      assert(original && thumbnail);
      assert.equal(
        save.files.filter((file) => file.kind !== "thumbnail").length,
        1,
      );
      assert.equal(original.path, value.filename);
      assert.equal(thumbnail.path, value.thumbnailName);
      assert.equal(digest(await bytesFor(save, original)), value.sha256);
      assert.equal(
        digest(await bytesFor(save, thumbnail)),
        value.thumbnailSha256,
      );
      const pixel = await sharp(await bytesFor(save, thumbnail))
        .resize(1, 1)
        .removeAlpha()
        .raw()
        .toBuffer();
      assert(pixel[1] > 150 && pixel[0] < 100 && pixel[2] < 150);
      assert.deepEqual(
        memberships
          .filter((membership) => membership.saveId === value.id)
          .map((membership) => membership.folderId),
        [index === 0 ? child.id : parent.id],
      );
    }
    const importedIds = record.fixtures.map((value) => value.id).sort();
    prove(
      "native-save-fields-file-bytes-thumbnails-and-nested-folder-memberships",
    );
    await performImport(1);
    const secondFolders = await ownFolders();
    // Assert current native semantics explicitly; browser-specific merging would conceal divergence.
    assert.equal(secondFolders.length, 4);
    assert.deepEqual(
      record.fixtures.map((value) => value.id).sort(),
      importedIds,
    );
    assert.equal((await discover()).length, originalSaveIds.length + 2);
    const tags = (await query("tags.list")).filter((tag) =>
      tag.name.startsWith(prefix),
    );
    record.tags = tags;
    saveRecord();
    assert.equal(tags.length, 3);
    assert.equal(new Set(tags.map((tag) => tag.name)).size, 3);
    prove(
      "repeat-import-skips-two-existing-saves-native-folder-policy-and-tags",
      { foldersAfterFirst: 2, foldersAfterSecond: 4, duplicateSaves: 0 },
    );
    assert.deepEqual(await query("settings.getPrefs"), initialPrefs);
    assert.deepEqual(manifest(source), fixture.manifest);
    prove("host-preferences-and-visiting-device-source-tree-unchanged");
  } catch (error) {
    failure = error;
    record.failure = error.message ?? String(error);
    await snapshot("eagle-failure").catch(() => {});
  } finally {
    await Promise.allSettled(pending);
    try {
      await discover();
    } catch (error) {
      record.cleanup.errors.push(`Discover owned Saves: ${error.message}`);
    }
    for (const value of record.fixtures) {
      try {
        if (!value.id) continue;
        await assertOwned(value);
        const result = await query("saves.bulkEdit", {
          ids: [value.id],
          operation: { kind: "purge" },
          actorReason: "test:web-eagle-cleanup",
        });
        assert.equal(result.changed, 1);
        assert.equal(await query("saves.get", { id: value.id }), null);
        record.cleanup.purged.push(value.id);
      } catch (error) {
        record.cleanup.errors.push(`Owned Save: ${error.message}`);
      }
    }
    try {
      const folders = await ownFolders();
      for (const folder of folders.sort(
        (a, b) => Number(Boolean(b.parentId)) - Number(Boolean(a.parentId)),
      )) {
        assert(!originalFolders.some((original) => original.id === folder.id));
        const memberships = await query("folders.memberships");
        assert(
          !memberships.some((membership) => membership.folderId === folder.id),
        );
        const result = await query("folders.delete", {
          id: folder.id,
          trashContainedSaves: false,
        });
        assert.equal(result.ok, true);
        record.cleanup.folders.push(folder.id);
      }
      for (const tag of (await query("tags.list")).filter((tag) =>
        tag.name.startsWith(prefix),
      )) {
        assert(!originalTags.some((original) => original.name === tag.name));
        assert(
          record.fixtures.some((value) =>
            value.metadata.tags.includes(tag.name),
          ),
        );
        if (!record.tags.some((value) => value.name === tag.name)) {
          record.tags.push(tag);
          saveRecord();
        }
        const result = await query("tags.delete", { name: tag.name });
        assert.equal(result.ok, true);
        assert.equal(result.affected, 1);
        record.cleanup.tags.push(tag.name);
      }
    } catch (error) {
      record.cleanup.errors.push(`Owned folders/tags: ${error.message}`);
    }
    for (const upload of record.uploads) {
      try {
        const id = upload.token.replace(/^iris-upload:/, "");
        assert.match(id, /^[a-f0-9-]{36}$/);
        if (!existsSync(join(uploadRoot, id))) continue;
        const metadata = readJson(join(uploadRoot, id, "upload.json"));
        assert.equal(metadata.libraryId, libraryId);
        assert(
          fixture.manifest.some(
            (file) =>
              basename(file.path) === metadata.filename &&
              file.size === metadata.size,
          ),
        );
        const response = await request(
          `/web/upload/${encodeURIComponent(upload.token)}`,
          { method: "DELETE" },
        );
        await response.arrayBuffer();
        assert.equal(response.status, 200);
        upload.cleanupRemoved = true;
      } catch (error) {
        record.cleanup.errors.push(`Owned upload: ${error.message}`);
      }
    }
    try {
      const active = await query("library.info");
      assert.deepEqual(active, initial);
      assert.equal(readJson(join(active.path, "metadata.json")).id, libraryId);
      for (const pointer of pointers)
        assert.equal(readFileSync(pointer.path, "utf8"), pointer.content);
      assert.deepEqual(await discover(), originalSaveIds);
      assert.deepEqual(await query("settings.getPrefs"), initialPrefs);
      assert.deepEqual(await query("folders.list"), originalFolders);
      assert.deepEqual(await query("tags.list"), originalTags);
      assert.deepEqual(entries(uploadRoot), initialUploads);
      assert.deepEqual(entries(importRoot), initialImports);
      assert.deepEqual(manifest(source), fixture.manifest);
    } catch (error) {
      record.cleanup.errors.push(`Original state: ${error.message}`);
    }
    await run(`(() => {
      const state=window.__eagleAcceptance;
      state?.off();state?.observer.disconnect();
      if(state){document.removeEventListener('change',state.changed,true);document.removeEventListener('click',state.clicked,true);}
      delete window.__eagleAcceptance;
      const marker=${quote(originalMarker)};
      if(marker===null)localStorage.removeItem('pond:importedFrom');
      else localStorage.setItem('pond:importedFrom',marker);
    })()`).catch((error) =>
      record.cleanup.errors.push(`Browser observer: ${error.message}`),
    );
    await debuggerApi
      .sendCommand("Page.setInterceptFileChooserDialog", { enabled: false })
      .catch(() => {});
    debuggerApi.removeListener("message", network);
    if (debuggerApi.isAttached()) debuggerApi.detach();
    record.elapsedMs = Date.now() - startedAt;
    record.cleanup.completed = record.cleanup.errors.length === 0;
    saveRecord();
  }
  assert.equal(
    record.cleanup.completed,
    true,
    record.cleanup.errors.join("\n"),
  );
  if (failure) throw failure;
  console.log(
    "WEB_EAGLE_PASSED",
    JSON.stringify({ checks: record.checks.length, record: recordPath }),
  );
  return record;
};
