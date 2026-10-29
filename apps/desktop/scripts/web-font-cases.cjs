const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  writeFileSync,
} = require("node:fs");
const { homedir } = require("node:os");
const { basename, join } = require("node:path");
const { setTimeout: pause } = require("node:timers/promises");
const { promisify } = require("node:util");

const execute = promisify(execFile);
const quote = JSON.stringify;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const activateLabel = "Activate Font on your Mac host";
const deactivateLabel = "Deactivate Font on your Mac host";

const fontBuilder = `import hashlib, json, pathlib, sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

destination, family, postscript = sys.argv[1:]
glyph_order = [".notdef"] + ["g" + str(value) for value in range(32, 127)]
glyphs = {}
metrics = {}
for index, name in enumerate(glyph_order):
    pen = TTGlyphPen(None)
    if name != "g32":
        width = 420 + index % 5 * 20
        pen.moveTo((80, 0))
        pen.lineTo((80, 680))
        pen.lineTo((width, 680))
        pen.lineTo((width, 0))
        pen.closePath()
    glyphs[name] = pen.glyph()
    metrics[name] = (600, 80)
font = FontBuilder(1000, isTTF=True)
font.setupGlyphOrder(glyph_order)
font.setupCharacterMap({value: "g" + str(value) for value in range(32, 127)})
font.setupGlyf(glyphs)
font.setupHorizontalMetrics(metrics)
font.setupHorizontalHeader(ascent=800, descent=-200)
font.setupNameTable({"familyName": family, "styleName": "Regular", "uniqueFontIdentifier": postscript, "fullName": family + " Regular", "psName": postscript, "version": "Version 1.000"})
font.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200, usWeightClass=400, fsType=0)
font.setupPost()
font.setupMaxp()
font.save(destination)
verified = TTFont(destination)
assert verified["name"].getDebugName(1) == family
assert verified["name"].getDebugName(6) == postscript
assert verified.getBestCmap()[65] == "g65"
verified.close()
path = pathlib.Path(destination)
path.chmod(0o600)
print(json.dumps({"family": family, "postscript": postscript, "size": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}))
`;

const fontProbe = `import Foundation
import CoreText

guard CommandLine.arguments.count == 2 else { exit(64) }
let requested = CommandLine.arguments[1]
guard requested.range(of: "^CirceParity[0-9a-f]{32}-Regular$", options: .regularExpression) != nil else { exit(64) }
let font = CTFontCreateWithName(requested as CFString, 12, nil)
let actual = CTFontCopyPostScriptName(font) as String
print(actual == requested ? "true" : "false")
`;

/** Builds owned bytes and a read-only exact-name probe; neither step registers a font. */
async function prepareFontFixture(directory, nonce) {
  assert.match(nonce, /^[a-f0-9]{32}$/);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const family = `Circe Parity ${nonce}`;
  const postscript = `CirceParity${nonce}-Regular`;
  const path = join(directory, `${postscript}.ttf`);
  const builderPath = join(directory, "build-font.py");
  const probeSource = join(directory, "font-present.swift");
  const probe = join(directory, "font-present");
  writeFileSync(builderPath, fontBuilder, { mode: 0o600 });
  writeFileSync(probeSource, fontProbe, { mode: 0o600 });
  const built = await execute(
    "/opt/homebrew/bin/uv",
    [
      "run",
      "--no-project",
      "--with",
      "fonttools==4.60.2",
      "python",
      builderPath,
      path,
      family,
      postscript,
    ],
    {
      timeout: 60000,
      maxBuffer: 16384,
      env: {
        ...process.env,
        UV_CACHE_DIR: join(directory, "uv-cache"),
        UV_NO_PROGRESS: "1",
      },
    },
  );
  const metadata = JSON.parse(built.stdout.trim());
  assert.equal(metadata.family, family);
  assert.equal(metadata.postscript, postscript);
  assert.equal(metadata.sha256, digest(readFileSync(path)));
  await execute(
    "/usr/bin/swiftc",
    [
      "-module-cache-path",
      join(directory, "swift-cache"),
      "-o",
      probe,
      probeSource,
    ],
    { timeout: 60000, maxBuffer: 16384 },
  );
  const present = async () => {
    const result = await execute(probe, [postscript], {
      timeout: 10000,
      maxBuffer: 64,
    });
    assert(["true", "false"].includes(result.stdout.trim()));
    return result.stdout.trim() === "true";
  };
  assert.equal(
    await present(),
    false,
    "The new nonce PostScript name must be absent before activation.",
  );
  return { ...metadata, path, probe, present };
}

exports.prepareFontFixture = prepareFontFixture;

/** Opt-in real-OS acceptance: root must explicitly grant activation before this can run. */
exports.verifyBrowserFonts = async function verifyBrowserFonts({
  win,
  run,
  waitFor,
  snapshot,
  query,
  origin,
  evidence,
  sandbox,
}) {
  assert.equal(
    process.env.CIRCE_FONT_ACTIVATION_GRANTED,
    "1",
    "Real host font activation requires the runtime owner's explicit grant.",
  );
  assert.equal(process.platform, "darwin");
  assert.match(
    win.webContents.session.getStoragePath() ?? "",
    /iris-browser-smoke-/,
  );
  const startedAt = Date.now();
  const deadline = startedAt + 180000;
  const nonce = randomUUID().replaceAll("-", "");
  const directory = join(evidence, `fonts-${startedAt}`);
  const fixture = await prepareFontFixture(directory, nonce);
  const initial = await query("library.info");
  const libraryId = readJson(join(initial.path, "metadata.json")).id;
  const initialPrefs = await query("settings.getPrefs");
  const pointers = [
    join(sandbox, "app-data", "library-location.json"),
    join(sandbox, "library-location.json"),
  ]
    .filter(existsSync)
    .map((path) => ({ path, bytes: readFileSync(path, "utf8") }));
  const fontsRoot = join(homedir(), "Library", "Fonts");
  const fontsDirectory = join(fontsRoot, "Pond");
  const directoryStates = [fontsRoot, fontsDirectory].map((path) => ({
    path,
    existed: existsSync(path),
  }));
  for (const state of directoryStates)
    if (state.existed) {
      const stat = lstatSync(state.path);
      assert(
        stat.isDirectory() && !stat.isSymbolicLink(),
        "Refuse a redirected real font destination.",
      );
      assert.equal(realpathSync(state.path), state.path);
      state.existingIdentity = { device: stat.dev, inode: stat.ino };
    }
  const recordPath = join(directory, "ownership-and-results.json");
  const record = {
    nonce,
    original: { ...initial, libraryId },
    font: {
      family: fixture.family,
      postscript: fixture.postscript,
      path: fixture.path,
      sha256: fixture.sha256,
    },
    save: { title: `Circe font ${nonce}`, sourceId: null, id: null },
    directoryStates,
    osChecks: [{ phase: "before", present: false }],
    checks: [],
    cleanup: { purged: false, originalRestored: false, errors: [] },
  };
  const ownCookies = await win.webContents.session.cookies.get({
    url: origin,
    name: "iris_session",
  });
  assert.equal(ownCookies.length, 1);
  const ownSessionCookie = `iris_session=${ownCookies[0].value}`;
  record.sessionHash = digest(ownCookies[0].value);
  const saveRecord = () => {
    writeFileSync(recordPath, JSON.stringify(record, null, 2), { mode: 0o600 });
    chmodSync(recordPath, 0o600);
  };
  saveRecord();
  let cleaning = false;
  const waitUntil = async (read, label, timeout = 20000) => {
    const end = cleaning
      ? Date.now() + timeout
      : Math.min(deadline, Date.now() + timeout);
    while (Date.now() < end) {
      const value = await read();
      if (value) return value;
      await pause(100);
    }
    throw new Error(`Font acceptance timed out: ${label}`);
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
  const request = async (route, options = {}) => {
    const response = await fetch(`${origin}/web/${route}`, {
      ...options,
      headers: { ...(await headers()), ...options.headers },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(
      response.status,
      200,
      "An owned font fixture request must succeed.",
    );
    return response;
  };
  const files = async (name, params) =>
    (
      await request("files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, params }),
      })
    ).json();
  const assertOwned = async () => {
    assert(record.save.id);
    assert.equal((await query("library.info")).path, initial.path);
    assert.equal(readJson(join(initial.path, "metadata.json")).id, libraryId);
    const save = await query("saves.get", { id: record.save.id });
    assert.equal(save?.id, record.save.id);
    assert.equal(save.source, "local");
    assert.equal(save.sourceId, record.save.sourceId);
    assert.equal(save.title, record.save.title);
    assert.equal(save.mediaType, "font");
    return save;
  };
  const sidecar = () =>
    join(
      initial.path,
      "items",
      `${record.save.id}.info`,
      "font-activation.json",
    );
  const assertInstallation = () => {
    assert(record.installedPath);
    assert.equal(
      record.installedPath,
      join(fontsDirectory, `${record.save.id}.ttf`),
    );
    const installed = lstatSync(record.installedPath);
    assert(installed.isFile() && !installed.isSymbolicLink());
    assert.equal(digest(readFileSync(record.installedPath)), fixture.sha256);
    if (record.installedIdentity) {
      assert.equal(installed.dev, record.installedIdentity.device);
      assert.equal(installed.ino, record.installedIdentity.inode);
    } else
      record.installedIdentity = {
        device: installed.dev,
        inode: installed.ino,
      };
    for (const state of directoryStates) {
      const stat = lstatSync(state.path);
      assert(stat.isDirectory() && !stat.isSymbolicLink());
      assert.equal(realpathSync(state.path), state.path);
      const expected = state.existingIdentity ?? state.createdIdentity;
      if (expected) {
        assert.equal(stat.dev, expected.device);
        assert.equal(stat.ino, expected.inode);
      } else state.createdIdentity = { device: stat.dev, inode: stat.ino };
    }
    saveRecord();
  };
  const checkOS = async (phase, expected) => {
    await waitUntil(
      async () => (await fixture.present()) === expected,
      `fresh-process CoreText ${phase}`,
      25000,
    );
    record.osChecks.push({ phase, present: expected });
    saveRecord();
  };
  const debuggerApi = win.webContents.debugger;
  assert.equal(debuggerApi.isAttached(), false);
  debuggerApi.attach("1.3");
  const click = async (selector) => {
    win.focus();
    win.webContents.focus();
    await waitFor("document.hasFocus()");
    const startupPrompt = `Array.from(document.querySelectorAll('[role="dialog"]')).some(dialog=>/^(Meet Your Fish|What's New)/.test(dialog.querySelector('h2,[role="heading"]')?.textContent?.trim()??''))`;
    if (await run(startupPrompt)) {
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
      await waitFor(`!(${startupPrompt})`);
    }
    await waitFor(
      `(() => {const node=document.querySelector(${quote(selector)});if(!node)return false;node.scrollIntoView({block:'nearest',inline:'nearest'});const rect=node.getBoundingClientRect();const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return rect.width>0&&rect.height>0&&hit&&node.contains(hit);})()`,
    );
    const point = await run(
      `(() => {const rect=document.querySelector(${quote(selector)}).getBoundingClientRect();return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)};})()`,
    );
    await debuggerApi.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...point,
    });
    await debuggerApi.sendCommand("Input.dispatchMouseEvent", {
      type: "mousePressed",
      button: "left",
      buttons: 1,
      clickCount: 1,
      ...point,
    });
    await debuggerApi.sendCommand("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      button: "left",
      buttons: 0,
      clickCount: 1,
      ...point,
    });
  };
  const load = async (url) => {
    let timer;
    try {
      await Promise.race([
        win.loadURL(url),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => {
            win.webContents.stop();
            reject(new Error("Finite font navigation timed out."));
          }, 10000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const ready = async (activated) => {
    const label = activated ? deactivateLabel : activateLabel;
    await waitFor(
      `document.querySelector('[data-save-details]')?.getAttribute('aria-label')===${quote(record.save.title)}&&Boolean(document.querySelector('[aria-label="Font specimen text"]'))&&Boolean(document.querySelector('[aria-label="${label}"]'))`,
    );
    await waitFor(
      `Array.from(document.fonts).some(font=>font.family===${quote(`pond-preview-${record.save.id}`)}&&font.status==='loaded')`,
    );
    await waitFor(
      activated
        ? `document.querySelector('[aria-label="${label}"]')?.getAttribute('aria-pressed')==='true'`
        : `document.querySelector('[aria-label="${label}"]')?.getAttribute('aria-pressed')!=='true'`,
    );
  };
  const reload = async (activated) => {
    await run("window.__ownedFontReloadMarker=true");
    win.reload();
    await waitFor(
      "!window.__ownedFontReloadMarker&&document.readyState==='complete'",
    );
    await ready(activated);
  };
  const prove = async (name) => {
    record.checks.push({ name, passed: true });
    saveRecord();
    await snapshot(`fonts-${nonce}-${name}`);
  };
  let download;
  let downloadItem;
  let downloadListener;
  let downloadCompleted = false;
  let failure;
  try {
    await debuggerApi.sendCommand("Page.enable");
    const uploaded = await (
      await request("upload", {
        method: "PUT",
        headers: {
          "content-type": "application/octet-stream",
          "x-iris-filename": encodeURIComponent(basename(fixture.path)),
        },
        body: readFileSync(fixture.path),
      })
    ).json();
    record.upload = { token: uploaded.token, removed: false };
    record.save.sourceId = `web-upload:${uploaded.token.replace(/^iris-upload:/, "")}`;
    saveRecord();
    const created = await files("saves.createManual", {
      title: record.save.title,
      filePaths: [uploaded.token],
    });
    assert.equal(created.ok, true);
    record.save.id = created.id;
    record.installedPath = join(fontsDirectory, `${created.id}.ttf`);
    saveRecord();
    const save = await assertOwned();
    const original = save.files.find((file) => file.kind !== "thumbnail");
    assert.equal(original.sha256, fixture.sha256);
    assert.equal(original.family, fixture.family);
    assert.equal(original.subfamily, "Regular");
    assert.equal(original.fontWeight, 400);
    assert.equal(
      existsSync(record.installedPath),
      false,
      "Never overwrite a preexisting font file.",
    );
    assert.equal(existsSync(sidecar()), false);
    assert.equal(
      (await query("saves.fontStatus", { id: created.id })).activated,
      false,
    );
    const retired = await request(
      `upload/${encodeURIComponent(uploaded.token)}`,
      {
        method: "DELETE",
      },
    );
    await retired.arrayBuffer();
    record.upload.removed = true;
    saveRecord();
    await load(`${origin}/save/${encodeURIComponent(created.id)}`);
    await ready(false);
    assert.equal(
      await run("document.documentElement.dataset.hostPlatform"),
      "darwin",
    );
    await click('[aria-label="Font specimen text"]');
    await debuggerApi.sendCommand("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "a",
      code: "KeyA",
      modifiers: 4,
      commands: ["selectAll"],
    });
    await debuggerApi.sendCommand("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "a",
      code: "KeyA",
      modifiers: 4,
    });
    await win.webContents.insertText("ABCD XYZ 0123");
    await waitFor(
      "document.querySelector('[aria-label=\"Font specimen text\"]').value==='ABCD XYZ 0123'",
    );
    await prove("native-font-metadata-and-live-browser-specimen");
    record.activationRequested = true;
    saveRecord();
    await click(`[aria-label="${activateLabel}"]`);
    await waitUntil(() => {
      if (!existsSync(record.installedPath)) return false;
      assertInstallation();
      return true;
    }, "owned host font copy");
    await ready(true);
    const activated = await query("saves.fontStatus", { id: created.id });
    assert.deepEqual(activated, {
      activated: true,
      path: record.installedPath,
    });
    assert.equal(readJson(sidecar()).data.path, record.installedPath);
    assert.equal((await assertOwned()).fontActivated, true);
    assertInstallation();
    await checkOS("after-activate", true);
    await reload(true);
    await checkOS("after-activated-reload", true);
    await prove(
      "host-labeled-activation-sidecar-reload-and-real-coretext-registration",
    );
    const mediaPath = original.path
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    const mediaUrl = `${origin}/web/media/${encodeURIComponent(created.id)}/${mediaPath}`;
    const destination = join(directory, "visiting-font.ttf");
    let timer;
    const completed = new Promise((resolveDownload, reject) => {
      timer = setTimeout(() => {
        downloadItem?.cancel();
        reject(new Error("Visiting-device font download timed out."));
      }, 20000);
      downloadListener = (_event, item) => {
        if (new URL(item.getURL()).pathname !== new URL(mediaUrl).pathname)
          return;
        downloadItem = item;
        assert.equal(existsSync(destination), false);
        item.setSavePath(destination);
        item.once("done", (_done, state) => {
          downloadCompleted = state === "completed";
          if (downloadCompleted) resolveDownload();
          else reject(new Error(`Font download ${state}`));
        });
      };
      win.webContents.session.on("will-download", downloadListener);
    });
    try {
      await Promise.all([click('[aria-label="Download Original"]'), completed]);
      assert.equal(digest(readFileSync(destination)), fixture.sha256);
      download = destination;
      record.download = { path: destination, sha256: fixture.sha256 };
      saveRecord();
    } finally {
      clearTimeout(timer);
      win.webContents.session.removeListener("will-download", downloadListener);
    }
    await prove("visiting-device-original-download-sha");
    assertInstallation();
    assert.equal(readJson(sidecar()).data.path, record.installedPath);
    await click(`[aria-label="${deactivateLabel}"]`);
    await ready(false);
    await waitUntil(
      async () =>
        !(await query("saves.fontStatus", { id: created.id })).activated,
      "native deactivation status",
    );
    assert.equal(existsSync(record.installedPath), false);
    assert.equal(existsSync(sidecar()), false);
    assert.equal((await assertOwned()).fontActivated, false);
    await checkOS("after-deactivate", false);
    await reload(false);
    await prove(
      "deactivation-removes-only-owned-font-sidecar-and-coretext-name",
    );
  } catch (error) {
    failure = error;
    record.failure = {
      message: error.message ?? String(error),
      stack: error.stack,
    };
    await snapshot(`fonts-${nonce}-failure`).catch(() => {});
  } finally {
    cleaning = true;
    try {
      if (!downloadCompleted) downloadItem?.cancel();
    } catch (error) {
      record.cleanup.errors.push(`Browser download cleanup: ${error.message}`);
    }
    if (downloadListener)
      win.webContents.session.removeListener("will-download", downloadListener);
    try {
      if (record.save.id) {
        await assertOwned();
        const status = await query("saves.fontStatus", { id: record.save.id });
        if (status.activated || existsSync(sidecar())) {
          const sidecarIdentity = lstatSync(sidecar());
          assert(sidecarIdentity.isFile() && !sidecarIdentity.isSymbolicLink());
          assert.equal(readJson(sidecar()).data.path, record.installedPath);
          if (existsSync(record.installedPath)) assertInstallation();
          const result = await query("saves.deactivateFont", {
            id: record.save.id,
          });
          assert.equal(result.ok, true);
        }
        assert.equal(
          existsSync(record.installedPath),
          false,
          "Keep the owned Save for recovery if native font removal fails.",
        );
        assert.equal(existsSync(sidecar()), false);
        await checkOS("cleanup", false);
        const result = await query("saves.bulkEdit", {
          ids: [record.save.id],
          operation: { kind: "purge" },
          actorReason: "test:web-font-cleanup",
        });
        assert.equal(result.changed, 1);
        assert.equal(await query("saves.get", { id: record.save.id }), null);
        record.cleanup.purged = true;
      }
      if (record.upload && !record.upload.removed) {
        const retired = await request(
          `upload/${encodeURIComponent(record.upload.token)}`,
          {
            method: "DELETE",
          },
        );
        await retired.arrayBuffer();
        record.upload.removed = true;
      }
      // rmdir never enumerates or removes anyone else's font; it succeeds only for our newly created empty directory.
      for (const state of [...directoryStates].reverse())
        if (!state.existed && state.createdIdentity && existsSync(state.path)) {
          const stat = lstatSync(state.path);
          assert.equal(stat.dev, state.createdIdentity.device);
          assert.equal(stat.ino, state.createdIdentity.inode);
          assert(stat.isDirectory() && !stat.isSymbolicLink());
          rmdirSync(state.path);
          state.removed = true;
        }
      assert.deepEqual(await query("library.info"), initial);
      assert.equal(readJson(join(initial.path, "metadata.json")).id, libraryId);
      assert.deepEqual(await query("settings.getPrefs"), initialPrefs);
      for (const pointer of pointers)
        assert.equal(readFileSync(pointer.path, "utf8"), pointer.bytes);
      assert.equal(digest(readFileSync(fixture.path)), fixture.sha256);
      if (download)
        assert.equal(digest(readFileSync(download)), fixture.sha256);
      record.cleanup.originalRestored = true;
    } catch (error) {
      record.cleanup.errors.push(error.message);
    } finally {
      try {
        const revoked = await fetch(`${origin}/web/session`, {
          method: "DELETE",
          headers: { cookie: ownSessionCookie, origin },
          signal: AbortSignal.timeout(10000),
        });
        await revoked.arrayBuffer();
        assert.equal(revoked.status, 200);
        const denied = await fetch(`${origin}/web/session`, {
          headers: { cookie: ownSessionCookie },
          signal: AbortSignal.timeout(10000),
        });
        await denied.arrayBuffer();
        assert.equal(denied.status, 401);
        record.cleanup.sessionRevoked = true;
      } catch (error) {
        record.cleanup.errors.push(`Own session revocation: ${error.message}`);
      }
      if (debuggerApi.isAttached()) debuggerApi.detach();
      record.elapsedMs = Date.now() - startedAt;
      saveRecord();
    }
  }
  assert.equal(
    record.cleanup.errors.length,
    0,
    record.cleanup.errors.join("\n"),
  );
  assert.equal(record.cleanup.purged && record.cleanup.originalRestored, true);
  if (failure) throw failure;
  console.log(
    "WEB_FONTS_PASSED",
    JSON.stringify({ checks: record.checks.length, record: recordPath }),
  );
  return record;
};
