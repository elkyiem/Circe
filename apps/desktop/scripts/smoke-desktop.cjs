const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const sandbox = mkdtempSync(join(tmpdir(), "pond-cleanup-smoke-"));
const imagePath = join(sandbox, "preview.png");
writeFileSync(
  imagePath,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  ),
);
process.env.POND_SANDBOX = sandbox;
process.once("exit", () => {
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    // Windows keeps the Library's open files locked until this process ends.
    // Throwing here would raise a modal error dialog that blocks exit, so the
    // temporary sandbox is left for the OS to clean up instead.
  }
});
let complete = false;
let inferenceReadyCount = 0;
const checkEnrichment = process.argv.includes("--enrichment-owner");
let resolvePreview;
const previewReady = new Promise((resolve) => {
  resolvePreview = resolve;
});
const timer = setTimeout(
  () => {
    console.error("SMOKE_FAILED: renderer did not become ready");
    app.exit(1);
  },
  checkEnrichment ? 60000 : 30000,
);
app.on("web-contents-created", (_, contents) => {
  contents.on("console-message", (event) => {
    if (event.message === "[inference] worker ready") inferenceReadyCount++;
  });
  contents.on("did-fail-load", (_, code, description) =>
    console.error("LOAD_FAILED", code, description),
  );
  contents.on("did-finish-load", async () => {
    if (contents.getURL().includes("preview.html")) {
      try {
        await contents.executeJavaScript(`new Promise((resolve, reject) => {
          const started = Date.now();
          const poll = () => {
            const image = document.querySelector("#image");
            if (image?.complete && image.currentSrc) resolve();
            else if (Date.now() - started > 10000) reject(new Error("Preview image did not load"));
            else setTimeout(poll, 50);
          };
          poll();
        })`);
        resolvePreview();
      } catch (error) {
        clearTimeout(timer);
        console.error("SMOKE_FAILED", error);
        app.exit(1);
      }
      return;
    }
    if (!contents.getURL().includes("index.html") || complete) return;
    try {
      const state = await contents.executeJavaScript(`(async () => {
        await new Promise((resolve, reject) => {
          const started = Date.now();
          const poll = () => {
            if (document.querySelector('[data-slot="window"]') && document.body.innerText.trim()) resolve();
            else if (Date.now() - started > 15000) reject(new Error("React did not render visible content"));
            else setTimeout(poll, 50);
          };
          poll();
        });
        const info = await window.pond.query("library.info");
        const page = await window.pond.query("saves.listPage", { limit: 1 });
        const tags = await window.pond.query("tags.list");
        const created = await window.pond.query("saves.createManual", {
          title: "Preview smoke",
          filePaths: [${JSON.stringify(imagePath)}],
        });
        if (!created.ok || !created.id) throw new Error("Preview fixture was not created");
        const preview = await window.pond.openPreviewWindow({
          saveId: created.id,
          fileIndex: 0,
          kind: "detached",
        });
        return { info, page, tags, preview, root: Boolean(document.getElementById("root")), text: document.body.innerText.slice(0, 160) };
      })()`);
      assert.equal(state.root, true);
      assert.ok(state.text.trim());
      assert.ok(state.info.path.startsWith(sandbox));
      assert.ok(Array.isArray(state.page.rows));
      assert.ok(Array.isArray(state.tags));
      assert.ok(state.preview.windowId > 0);
      await Promise.race([
        previewReady,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Preview window did not become ready")),
            10000,
          ),
        ),
      ]);
      await contents.executeJavaScript(
        `window.pond.closePreviewWindow(${state.preview.windowId})`,
      );
      if (checkEnrichment) {
        // Empty batches exercise the real worker without downloading a model.
        const infer = () =>
          contents.executeJavaScript(
            'window.pond.query("enrichment.infer", { op: "embedTexts", texts: [] })',
          );
        assert.deepEqual(await infer(), []);
        assert.equal(inferenceReadyCount, 1);
        await new Promise((resolve) => setTimeout(resolve, 17000));
        assert.deepEqual(await infer(), []);
        assert.equal(
          inferenceReadyCount,
          2,
          "Idle release must allow a fresh inference worker.",
        );

        const audioPath = join(sandbox, "bounded-audio.wav");
        const wav = Buffer.alloc(44 + 32000);
        wav.write("RIFF");
        wav.writeUInt32LE(wav.length - 8, 4);
        wav.write("WAVEfmt ", 8);
        wav.writeUInt32LE(16, 16);
        wav.writeUInt16LE(1, 20);
        wav.writeUInt16LE(1, 22);
        wav.writeUInt32LE(16000, 24);
        wav.writeUInt32LE(32000, 28);
        wav.writeUInt16LE(2, 32);
        wav.writeUInt16LE(16, 34);
        wav.write("data", 36);
        wav.writeUInt32LE(32000, 40);
        writeFileSync(audioPath, wav);
        const src = await contents.executeJavaScript(`(async () => {
          const result = await window.pond.query("saves.createManual", { filePaths: [${JSON.stringify(audioPath)}] });
          if (!result.ok) throw new Error("Audio fixture import failed");
          const save = await window.pond.query("saves.get", { id: result.id });
          return "pond://" + result.id + "/" + encodeURIComponent(save.files[0].path);
        })()`);
        const owner = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes("enrichment.html"),
        );
        assert.ok(owner, "The resident enrichment owner must exist.");
        const decoded =
          await owner.webContents.executeJavaScript(`(async () => {
          const result = await window.pond.query("media.decodeAudio", { src: ${JSON.stringify(src)}, maxSamples: 8000 });
          return { samples: result.audio.length, finite: result.audio.every(Number.isFinite), hasMore: result.hasMore };
        })()`);
        assert.deepEqual(decoded, {
          samples: 8000,
          finite: true,
          hasMore: true,
        });
        console.log(
          "ENRICHMENT_OWNER_PASSED",
          JSON.stringify({
            workerStarts: inferenceReadyCount,
            boundedAudio: decoded,
          }),
        );
      }
      complete = true;
      clearTimeout(timer);
      console.log(
        "SMOKE_PASSED",
        JSON.stringify({
          render: state.text,
          saves: state.page.rows.length,
          tags: state.tags.length,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      app.exit(0);
    } catch (error) {
      clearTimeout(timer);
      console.error("SMOKE_FAILED", error);
      app.exit(1);
    }
  });
});
import("../out/main/index.js").catch((error) => {
  clearTimeout(timer);
  console.error("SMOKE_FAILED", error);
  app.exit(1);
});
