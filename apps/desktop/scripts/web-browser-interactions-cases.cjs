const assert = require("node:assert/strict");
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");
const { setTimeout: pause } = require("node:timers/promises");
const sharp = require("sharp");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const saveDragType = "application/x-pond-save";

/** Fixture setup/inspection uses HTTP; drag, deletion and Undo use real input only. */
exports.verifyBrowserInteractions = async function verifyBrowserInteractions({
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
  assert.match(
    win.webContents.session.getStoragePath() ?? "",
    /iris-browser-smoke-/,
    "Interaction cases require the harness's disposable browser profile.",
  );
  const original = await query("library.info");
  const originalPrefs = await query("settings.getPrefs");
  const libraryId = readJson(join(original.path, "metadata.json")).id;
  const initialFolders = await query("folders.list");
  const initialFolderIds = new Set(initialFolders.map((folder) => folder.id));
  const prefix = `Circé browser interactions ${randomUUID()}`;
  const directory = join(evidence, `browser-interactions-${Date.now()}`);
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
    original: { ...original, libraryId },
    pointers,
    save: { title: `${prefix}: file Save` },
    folder: { name: `${prefix}: drop target`, parentId: null },
    checks: [],
    observations: [],
    cleanup: { completed: false, errors: [] },
  };
  const saveRecord = () => {
    writeFileSync(recordPath, JSON.stringify(record, null, 2), { mode: 0o600 });
    chmodSync(recordPath, 0o600);
  };
  saveRecord();
  const deadline = Date.now() + 180000;
  const waitUntil = async (read, label, timeout = 20000) => {
    const end = Math.min(deadline, Date.now() + timeout);
    let cause;
    while (Date.now() < end) {
      try {
        const result = await read();
        if (result) return result;
      } catch (error) {
        cause = error;
      }
      await pause(100);
    }
    throw new Error(`Browser interactions timed out: ${label}`, { cause });
  };
  const headers = async () => {
    const cookies = await win.webContents.session.cookies.get({
      url: origin,
      name: "iris_session",
    });
    assert.equal(cookies.length, 1, "Use the actual browser's host session.");
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
    assert.equal(response.status, 200, `Fixture request failed: ${path}`);
    return response;
  };
  const assertOriginal = async () => {
    assert.deepEqual(await query("library.info"), original);
    assert.equal(readJson(join(original.path, "metadata.json")).id, libraryId);
    for (const pointer of pointers)
      assert.equal(readFileSync(pointer.path, "utf8"), pointer.content);
  };
  const assertOwnedSave = async () => {
    await assertOriginal();
    const save = await query("saves.get", { id: record.save.id });
    assert.equal(save?.id, record.save.id);
    assert.equal(save.title, record.save.title);
    assert.equal(save.source, "local");
    assert.equal(save.sourceId, record.save.sourceId);
    return save;
  };
  const assertOwnedFolder = async () => {
    await assertOriginal();
    assert.equal(initialFolderIds.has(record.folder.id), false);
    const folder = (await query("folders.list")).find(
      (entry) => entry.id === record.folder.id,
    );
    assert.equal(folder?.name, record.folder.name);
    assert.equal(folder.parentId, null);
    return folder;
  };
  const members = async () =>
    (await query("folders.memberships")).filter(
      (membership) => membership.folderId === record.folder.id,
    );
  const key = (keyCode, modifiers = []) => {
    for (const type of ["keyDown", "keyUp"])
      win.webContents.sendInputEvent({ type, keyCode, modifiers });
  };
  const reload = () =>
    new Promise((resolveReload, reject) => {
      const loaded = () => {
        clearTimeout(timer);
        resolveReload();
      };
      const timer = setTimeout(() => {
        win.webContents.removeListener("did-finish-load", loaded);
        reject(new Error("The browser did not finish reloading."));
      }, 20000);
      win.webContents.once("did-finish-load", loaded);
      win.reload();
    });
  const markText = async (selector, label) => {
    const find = `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(node => node.getBoundingClientRect().width > 0 && (node.textContent.trim() === ${JSON.stringify(label)} || Array.from(node.querySelectorAll('span')).some(span => span.textContent.trim() === ${JSON.stringify(label)})))`;
    await waitFor(`Boolean(${find})`);
    await run(`(() => {
      document.querySelectorAll('[data-browser-interaction-target]').forEach(node => node.removeAttribute('data-browser-interaction-target'));
      (${find}).setAttribute('data-browser-interaction-target', 'true');
    })()`);
    return '[data-browser-interaction-target="true"]';
  };
  const clickText = async (selector, label) =>
    click(await markText(selector, label));
  const probeKey = `__circeInteractionProbe${randomUUID().replaceAll("-", "")}`;
  const installProbe = () =>
    run(`(() => {
      const events = [], errors = [];
      const observe = event => {
        events.push({
          type:event.type, trusted:event.isTrusted,
          types:Array.from(event.dataTransfer?.types ?? []),
          saveIds:event.dataTransfer?.getData(${JSON.stringify(saveDragType)}) ?? '',
          folderId:event.target instanceof Element ? event.target.closest('[data-folder-sortable]')?.getAttribute('data-folder-sortable') ?? null : null,
          effectAllowed:event.dataTransfer?.effectAllowed,
          defaultPrevented:event.defaultPrevented,
        });
      };
      const error = event => errors.push(String(event.detail));
      // Bubble sees the MIME set by the real React dragstart handler; capture sees
      // the trusted drop's payload before the real folder handler consumes it.
      document.addEventListener('dragstart', observe);
      document.addEventListener('drop', observe, true);
      document.addEventListener('dragend', observe);
      window.addEventListener('iris-error', error);
      window[${JSON.stringify(probeKey)}] = {
        events, errors,
        dispose() {
          document.removeEventListener('dragstart', observe);
          document.removeEventListener('drop', observe, true);
          document.removeEventListener('dragend', observe);
          window.removeEventListener('iris-error', error);
        },
      };
    })()`);
  const readProbe = async (label) => {
    const observation = await run(`(() => {
      const probe=window[${JSON.stringify(probeKey)}];
      const banner=document.querySelector('#host-error');
      return {
        events:probe.events, errors:probe.errors,
        banner:{visible:Boolean(banner && !banner.hidden),text:banner?.textContent?.trim() ?? ''},
      };
    })()`);
    record.observations.push({ label, ...observation });
    saveRecord();
    assert.deepEqual(observation.errors, [], `${label}: no false host error`);
    assert.equal(observation.banner.visible, false, `${label}: no host banner`);
    return observation;
  };
  const prove = async (name) => {
    record.checks.push(name);
    saveRecord();
    const label = `interactions-${directory.split("-").at(-1)}-${name}`;
    await snapshot(label);
    for (const extension of ["png", "txt"])
      chmodSync(join(evidence, `${label}.${extension}`), 0o600);
  };
  const pointFor = async (selector) => {
    await run(
      `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest'})`,
    );
    await waitFor(`(() => {
      const node=document.querySelector(${JSON.stringify(selector)});
      if (!node) return false;
      const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return r.width>0 && r.height>0 && hit && node.contains(hit);
    })()`);
    const zoom = win.webContents.getZoomFactor();
    return run(`(() => {
      const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return {x:Math.round((r.x+r.width/2)*${zoom}),y:Math.round((r.y+r.height/2)*${zoom})};
    })()`);
  };
  const debuggerApi = win.webContents.debugger;
  assert.equal(
    debuggerApi.isAttached(),
    false,
    "Release the previous UI probe.",
  );
  debuggerApi.attach("1.3");
  let interceptedDrag;
  const interceptDrag = (_event, method, params) => {
    if (method === "Input.dragIntercepted") interceptedDrag = params.data;
  };
  debuggerApi.on("message", interceptDrag);
  const automaticPrompt = `Array.from(document.querySelectorAll('[role="dialog"]')).some(dialog =>
    Array.from(dialog.querySelectorAll('button')).some(button => button.textContent.trim() === 'Not Now') ||
    /^(Meet Your Fish|What's New)/.test(dialog.querySelector('h2,[role="heading"]')?.textContent?.trim() ?? ''))`;
  let failure;
  try {
    await assertOriginal();
    assert.equal(
      initialFolders.some((folder) => folder.name === record.folder.name),
      false,
    );
    const png = await sharp(randomBytes(80 * 64 * 3), {
      raw: { width: 80, height: 64, channels: 3 },
    })
      .png()
      .toBuffer();
    record.save.sha256 = digest(png);
    const uploaded = await (
      await request("/web/upload", {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          "x-iris-filename": encodeURIComponent(`${prefix}.png`),
        },
        body: png,
      })
    ).json();
    assert.match(uploaded.token, /^iris-upload:/);
    record.save.token = uploaded.token;
    record.save.sourceId = `web-upload:${uploaded.token.slice("iris-upload:".length)}`;
    saveRecord();
    const created = await (
      await request("/web/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "saves.createManual",
          params: { title: record.save.title, filePaths: [uploaded.token] },
        }),
      })
    ).json();
    assert.equal(created.ok, true);
    assert.ok(created.id);
    record.save.id = created.id;
    saveRecord();
    const save = await assertOwnedSave();
    const originalFile = save.files.find(
      (file) => file.sha256 === record.save.sha256,
    );
    assert.ok(originalFile, "The dragged Save must own an actual file.");
    record.save.file = originalFile.path;
    const folder = await query("folders.create", {
      name: record.folder.name,
      parentId: null,
    });
    record.folder.id = folder.id;
    saveRecord();
    await assertOwnedFolder();
    assert.deepEqual(await members(), []);

    await win.loadURL(origin);
    if (
      await run(
        "Array.from(document.querySelectorAll('button')).some(node => node.textContent.trim() === 'Exit settings')",
      )
    )
      await clickText("button", "Exit settings");
    await waitFor("document.querySelector('[data-library-search]')");
    const folderSelector = `[data-folder-sortable="${folder.id}"] [role="treeitem"]`;
    if (
      !(await run(
        `Boolean(document.querySelector(${JSON.stringify(folderSelector)}))`,
      ))
    ) {
      const sidebarOpen = await run(
        "Boolean(document.querySelector('[data-slot=left][data-open]'))",
      );
      if (!sidebarOpen) await click('[aria-label="Toggle Sidebar"]');
      if (
        !(await run(
          `Boolean(document.querySelector(${JSON.stringify(folderSelector)}))`,
        ))
      )
        await clickText('button[aria-expanded="false"]', "Folders");
    }
    await waitFor(`document.querySelector(${JSON.stringify(folderSelector)})`);
    await click("[data-library-search]");
    await win.webContents.insertText(record.save.title);
    const saveSelector = `[data-save-id="${save.id}"] [role="option"]`;
    await waitFor(`document.querySelector(${JSON.stringify(saveSelector)})`);
    await click(saveSelector);
    await installProbe();
    await readProbe("before-drag");
    for (let attempt = 0; ; attempt++) {
      if (await run(automaticPrompt)) {
        key("Escape");
        await waitFor(`!(${automaticPrompt})`);
      }
      await click(saveSelector);
      const from = await pointFor(saveSelector);
      const to = await pointFor(folderSelector);
      const zoom = win.webContents.getZoomFactor();
      interceptedDrag = undefined;
      await debuggerApi.sendCommand("Input.setInterceptDrags", {
        enabled: true,
      });
      win.webContents.sendInputEvent({ type: "mouseMove", ...from });
      win.webContents.sendInputEvent({
        type: "mouseDown",
        button: "left",
        clickCount: 1,
        ...from,
      });
      let dropped = false;
      let blocked;
      try {
        // A real pointer gesture creates Chromium's actual drag payload. Intercept
        // the OS handoff, then deliver that unchanged payload as trusted browser
        // input. Never create a DOM DragEvent or fabricate a DataTransfer.
        for (let step = 1; step <= 24 && !interceptedDrag; step++) {
          win.webContents.sendInputEvent({
            type: "mouseMove",
            button: "left",
            x: Math.round(from.x + ((to.x - from.x) * step) / 24),
            y: Math.round(from.y + ((to.y - from.y) * step) / 24),
          });
          await pause(25);
        }
        const data = await waitUntil(
          () => interceptedDrag,
          "Chromium's real intercepted drag",
          4000,
        );
        assert.equal(
          data.items.find((item) => item.mimeType === saveDragType)?.data,
          save.id,
          "Use the real Save ID from the pointer-started HTML drag.",
        );
        assert.equal(data.files?.length ?? 0, 0);
        for (const type of ["dragEnter", "dragOver"])
          await debuggerApi.sendCommand("Input.dispatchDragEvent", {
            type,
            x: to.x / zoom,
            y: to.y / zoom,
            data,
          });
        await waitFor(
          `document.querySelector('[data-folder-sortable="${folder.id}"]')?.getAttribute('data-save-drop') === 'true'`,
        );
        await debuggerApi.sendCommand("Input.dispatchDragEvent", {
          type: "drop",
          x: to.x / zoom,
          y: to.y / zoom,
          data,
        });
        dropped = true;
      } catch (error) {
        blocked = error;
      } finally {
        if (!dropped && interceptedDrag)
          await debuggerApi.sendCommand("Input.dispatchDragEvent", {
            type: "dragCancel",
            x: to.x / zoom,
            y: to.y / zoom,
            data: interceptedDrag,
          });
        win.webContents.sendInputEvent({
          type: "mouseUp",
          button: "left",
          clickCount: 1,
          ...to,
        });
        await debuggerApi.sendCommand("Input.setInterceptDrags", {
          enabled: false,
        });
      }
      if (!blocked) break;
      if (attempt >= 2 || !(await run(automaticPrompt))) throw blocked;
      assert.deepEqual(await members(), []);
      record.observations.push({
        label: "automatic-prompt-blocked-drag",
        attempt,
      });
      saveRecord();
    }
    await waitUntil(async () => (await members()).length === 1, "folder drop");
    assert.deepEqual(await members(), [
      { saveId: save.id, folderId: folder.id },
    ]);
    const drag = await readProbe("physical-file-save-drop");
    const start = drag.events.find((event) => event.type === "dragstart");
    const drop = drag.events.find((event) => event.type === "drop");
    assert.equal(start?.trusted, true);
    assert.equal(start.defaultPrevented, false);
    assert.equal(start.effectAllowed, "copy");
    assert.ok(start.types.includes(saveDragType));
    assert.equal(drop?.trusted, true);
    assert.equal(drop.saveIds, save.id);
    assert.equal(drop.folderId, folder.id);
    await click(folderSelector);
    await reload();
    await waitFor(`document.querySelector(${JSON.stringify(saveSelector)})`);
    assert.deepEqual(await members(), [
      { saveId: save.id, folderId: folder.id },
    ]);
    await prove("physical-drag-membership-reload");

    await win.loadURL(`${origin}/save/${encodeURIComponent(save.id)}`);
    await waitFor(
      `document.querySelector('[data-save-details]')?.getAttribute('aria-label') === ${JSON.stringify(record.save.title)}`,
    );
    await installProbe();
    await readProbe("before-delete");
    await click('[aria-label="Save Actions"]');
    await click('[aria-label="Search save operations"]');
    await win.webContents.insertText("Move to Trash");
    await clickText('[role="menuitem"]', "Move to Trash");
    await waitUntil(
      async () => (await assertOwnedSave()).deletedAt != null,
      "physical Move to Trash",
    );
    await pause(250);
    await readProbe("physical-delete");
    await prove("delete-without-false-host-error");
    // Focus a real non-editable product surface before sending the user's Undo key.
    await click('[data-slot="center"]');
    assert.equal(
      await run(
        "document.activeElement?.matches('input,textarea,[contenteditable=true]')",
      ),
      false,
    );
    const mac = await run("/mac/i.test(navigator.platform)");
    key("Z", mac ? ["meta"] : ["control"]);
    await waitUntil(
      async () => (await assertOwnedSave()).deletedAt == null,
      "physical keyboard Undo",
    );
    await pause(250);
    await readProbe("physical-undo");
    assert.deepEqual(await members(), [
      { saveId: save.id, folderId: folder.id },
    ]);
    await prove("keyboard-undo-retains-folder-membership");
    await reload();
    await waitFor(
      `document.querySelector('[data-save-details]')?.getAttribute('aria-label') === ${JSON.stringify(record.save.title)}`,
    );
    assert.equal((await assertOwnedSave()).deletedAt, null);
    const encodedFile = originalFile.path
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    assert.equal(
      digest(
        Buffer.from(
          await (
            await request(`/web/media/${save.id}/${encodedFile}`)
          ).arrayBuffer(),
        ),
      ),
      record.save.sha256,
      "Drag, deletion and Undo must retain the original image bytes.",
    );
    await prove("undo-reload-original-bytes");
  } catch (error) {
    failure = error;
    record.failure = { message: error.message, stack: error.stack };
    await readProbe("failed-interaction").catch(() => {});
    await snapshot("browser-interactions-failed").catch(() => {});
    for (const extension of ["png", "txt"]) {
      const path = join(evidence, `browser-interactions-failed.${extension}`);
      if (existsSync(path)) chmodSync(path, 0o600);
    }
  } finally {
    await debuggerApi
      .sendCommand("Input.setInterceptDrags", { enabled: false })
      .catch(() => {});
    debuggerApi.removeListener("message", interceptDrag);
    if (debuggerApi.isAttached()) debuggerApi.detach();
    await run(`(() => {
      window[${JSON.stringify(probeKey)}]?.dispose();
      delete window[${JSON.stringify(probeKey)}];
      document.querySelectorAll('[data-browser-interaction-target]').forEach(node => node.removeAttribute('data-browser-interaction-target'));
    })()`).catch(() => {});
    key("Escape");
    try {
      await assertOriginal();
      if (!record.save.id && record.save.sourceId) {
        const page = await query("saves.listPage", { limit: 500 });
        const matches = page.rows.filter(
          (save) =>
            save.title === record.save.title &&
            save.source === "local" &&
            save.sourceId === record.save.sourceId,
        );
        assert.ok(matches.length <= 1);
        record.save.id = matches[0]?.id;
        saveRecord();
      }
      if (record.save.id) {
        await assertOwnedSave();
        const purged = await query("saves.bulkEdit", {
          ids: [record.save.id],
          operation: { kind: "purge" },
          actorReason: "test:web-browser-interactions-cleanup",
        });
        assert.equal(purged.changed, 1);
        assert.equal(await query("saves.get", { id: record.save.id }), null);
        record.cleanup.purgedSave = record.save.id;
      }
    } catch (error) {
      record.cleanup.errors.push(`Save cleanup: ${error.message}`);
    }
    try {
      if (!record.folder.id) {
        const matches = (await query("folders.list")).filter(
          (folder) =>
            folder.name === record.folder.name &&
            folder.parentId === null &&
            !initialFolderIds.has(folder.id),
        );
        assert.ok(matches.length <= 1);
        record.folder.id = matches[0]?.id;
        saveRecord();
      }
      if (record.folder.id) {
        await assertOwnedFolder();
        assert.equal(
          (await query("folders.list")).some(
            (folder) => folder.parentId === record.folder.id,
          ),
          false,
          "Never delete an owned folder containing an unowned child folder.",
        );
        assert.deepEqual(
          await members(),
          [],
          "Never delete a folder containing unowned Saves.",
        );
        const removed = await query("folders.delete", {
          id: record.folder.id,
          trashContainedSaves: false,
        });
        assert.equal(removed.ok, true);
        assert.equal(
          (await query("folders.list")).some(
            (folder) => folder.id === record.folder.id,
          ),
          false,
        );
        record.cleanup.deletedFolder = record.folder.id;
      }
    } catch (error) {
      record.cleanup.errors.push(`Folder cleanup: ${error.message}`);
    }
    try {
      if (record.save.token)
        await request(`/web/upload/${encodeURIComponent(record.save.token)}`, {
          method: "DELETE",
        });
      await assertOriginal();
      assert.deepEqual(await query("settings.getPrefs"), originalPrefs);
    } catch (error) {
      record.cleanup.errors.push(
        `Original state/upload cleanup: ${error.message}`,
      );
    }
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
    "WEB_BROWSER_INTERACTIONS_PASSED",
    JSON.stringify({ record: recordPath, checks: record.checks }),
  );
};
