const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { createServer } = require("node:http");
const { join } = require("node:path");
const JSZip = require("jszip");
const sharp = require("sharp");

/** The same fixture package and renderer actions exercise native preload and HTTP. */
exports.verifyUpstreamParity = async function verifyUpstreamParity({
  run,
  click,
  press,
  type,
  snapshot,
  importPackage,
  directory,
  mode,
}) {
  const query = (name, params = {}) =>
    run(
      `window.pond.query(${JSON.stringify(name)}, ${JSON.stringify(params)})`,
    );
  const waitFor = async (expression, timeout = 20000) => {
    const start = Date.now();
    while (!(await run(expression))) {
      if (Date.now() - start > timeout)
        throw new Error(`Timed out: ${expression}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
  const nonce = randomUUID();
  const title = `Parity carousel ${nonce}`;
  const batchTitle = `Parity batch ${nonce}`;
  const tags = ["日本語", "café", "Ελληνικά"];
  const notes = "Preserve notes and folders on each slide.";
  const originalPrefs = await query("settings.getPrefs");
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><title>Linked page ${nonce}</title><article><h1>Linked page ${nonce}</h1><p>Offline Are.na Link conversion verification.</p></article>`,
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const linked = `http://127.0.0.1:${server.address().port}/article`;
  const zip = new JSZip();
  const stamp = "2026-10-01T12:00:00.000Z";
  const saves = [];
  const exportedFiles = [];
  const folderId = `folder-${nonce}`;
  for (const [index, name] of [title, batchTitle].entries()) {
    const sourceId = `parity-${nonce}-${index}`;
    const files = [];
    for (let slide = 0; slide < 3; slide++) {
      const filename = `slide ${slide} #100% ?.png`;
      const bytes = await sharp({
        create: {
          width: 320,
          height: 240,
          channels: 3,
          background: ["#789a8a", "#d5b480", "#7893ad"][slide],
        },
      })
        .png()
        .toBuffer();
      const path = `files/${sourceId}/${filename}`;
      zip.file(path, bytes);
      files.push({
        path: filename,
        kind: "image",
        size: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        mimeType: "image/png",
        width: 320,
        height: 240,
        sourceUrl: `https://example.invalid/${sourceId}/${slide}.png`,
      });
      exportedFiles.push({ saveId: sourceId, sourcePath: filename, path });
    }
    saves.push({
      id: sourceId,
      source: "instagram",
      sourceId,
      url: `https://www.instagram.com/p/${sourceId}/`,
      title: name,
      notes,
      tags,
      folderIds: [folderId],
      files,
      mediaType: "image",
      savedAt: stamp,
      createdAt: stamp,
      rawJson: {
        capture: {
          id: sourceId,
          source: "instagram",
          url: `https://www.instagram.com/p/${sourceId}/`,
          title: name,
          media: files.map((file) => ({
            url: file.sourceUrl,
            type: "image",
            width: 320,
            height: 240,
          })),
        },
        extractorId: "parity-fixture",
        extractedAt: stamp,
      },
    });
  }
  const arenaSourceId = `arena-${nonce}`;
  saves.push({
    id: arenaSourceId,
    source: "arena",
    sourceId: arenaSourceId,
    url: `https://www.are.na/block/${arenaSourceId}`,
    title: `Are.na parity ${nonce}`,
    notes: null,
    tags: [],
    folderIds: [],
    files: [],
    mediaType: "link",
    savedAt: stamp,
    createdAt: stamp,
    rawJson: {
      capture: {
        id: arenaSourceId,
        source: "arena",
        url: linked,
        title: `Are.na parity ${nonce}`,
        media: [],
        extras: { blockClass: "Link" },
      },
      extractorId: "arena",
      extractedAt: stamp,
    },
  });
  const videoSourceId = `video-${nonce}`;
  const videoBytes = readFileSync(
    join(__dirname, "../test/fixtures/web/video.mp4"),
  );
  const videoFilename = "clip #100% ?.mp4";
  const videoPath = `files/${videoSourceId}/${videoFilename}`;
  zip.file(videoPath, videoBytes);
  exportedFiles.push({
    saveId: videoSourceId,
    sourcePath: videoFilename,
    path: videoPath,
  });
  saves.push({
    id: videoSourceId,
    source: "local",
    sourceId: videoSourceId,
    url: `pond:local/${videoSourceId}`,
    title: `Parity video ${nonce}`,
    notes: null,
    tags: [],
    folderIds: [],
    rawJson: null,
    mediaType: "video",
    savedAt: stamp,
    createdAt: stamp,
    files: [
      {
        path: videoFilename,
        kind: "video",
        size: videoBytes.length,
        sha256: createHash("sha256").update(videoBytes).digest("hex"),
        mimeType: "video/mp4",
        width: 640,
        height: 360,
      },
    ],
  });
  zip.file(
    "pond-export.json",
    JSON.stringify({
      version: 1,
      saves,
      folders: [
        { id: folderId, name: `Parity folder ${nonce}`, parentId: null },
      ],
      exportedFiles,
    }),
  );
  const archive = join(directory, `parity-${nonce}.pondpack.zip`);
  writeFileSync(archive, await zip.generateAsync({ type: "nodebuffer" }));
  const mark = async (selector, predicate) => {
    await waitFor(
      `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(node => ${predicate})`,
    );
    await run(
      `(() => { document.querySelectorAll('[data-upstream-target]').forEach(node => node.removeAttribute('data-upstream-target')); const node=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(node => ${predicate}); node.scrollIntoView({block:'center',behavior:'instant'}); node.setAttribute('data-upstream-target','true'); })()`,
    );
    return '[data-upstream-target="true"]';
  };
  const textControl = (selector, label) =>
    mark(
      selector,
      `node.textContent.trim() === ${JSON.stringify(label)} || Array.from(node.querySelectorAll('span')).some(span=>span.textContent.trim()===${JSON.stringify(label)})`,
    );
  const nav = async (label) =>
    click(
      await textControl(
        '[role=navigation][aria-label="Settings"] button',
        label,
      ),
    );
  let result;
  try {
    await query("settings.setPrefs", {
      notices: {
        seen: [
          "fish-intro",
          "arena-links-web-pages",
          "split-carousels",
          "instagram-collections",
        ],
      },
      storage: { autoArchive: false },
      enrichment: { enabled: false },
    });
    const imported = await importPackage(archive, {
      saves,
      folders: [{ id: folderId, name: `Parity folder ${nonce}` }],
      exportedFiles,
    });
    assert.equal(imported.ok, true, JSON.stringify(imported));
    const rows = await query("saves.list", { limit: 10000 });
    const original = rows.find((row) => row.sourceId === saves[0].sourceId);
    const batch = rows.find((row) => row.sourceId === saves[1].sourceId);
    const arena = rows.find((row) => row.sourceId === arenaSourceId);
    assert.ok(original && batch && arena);
    assert.equal((await query("saves.splittableCount")).count, 2);
    await click("[data-library-search]");
    await run("document.querySelector('[data-library-search]').focus()");
    await waitFor(
      "document.activeElement===document.querySelector('[data-library-search]')",
    );
    await type(title);
    await waitFor(
      `document.querySelector('[data-save-id="${original.id}"]') && !document.querySelector('[data-save-id="${batch.id}"]')`,
    );
    await click(`[data-save-id="${original.id}"]`, 1, "right");
    await click(await textControl('[role="menuitem"]', "Split Into Saves"));
    await waitFor(
      `document.body.innerText.includes('Split') && !document.querySelector('[role="menu"]')`,
    );
    const waitSplit = async (name) => {
      await waitFor(
        `window.pond.query('saves.list', {limit:10000}).then(rows => rows.filter(row => row.title===${JSON.stringify(name)}).length===3)`,
      );
      const slides = (await query("saves.list", { limit: 10000 })).filter(
        (row) => row.title === name,
      );
      assert.equal(slides.length, 3);
      for (const save of slides) {
        assert.equal(
          save.files.filter((file) => file.kind === "image").length,
          1,
        );
        assert.equal(save.status, "complete");
        assert.deepEqual(save.tags.toSorted(), tags.toSorted());
        assert.equal(save.notes, notes);
      }
      return slides;
    };
    const slides = await waitSplit(title);
    const memberships = await query("folders.memberships");
    assert.ok(
      slides.every((save) => memberships.some((row) => row.saveId === save.id)),
    );
    await query("saves.split", { ids: [original.id] });
    assert.equal(
      (await query("saves.list", { limit: 10000 })).filter(
        (row) => row.title === title,
      ).length,
      3,
    );
    await query("saves.patchDerived", {
      id: original.id,
      patch: { sensitiveScore: 0.95, sensitiveModel: "fixture-classifier" },
    });
    await click(`[data-save-id="${original.id}"]`, 1, "right");
    await click(
      await textControl('[role="menuitemcheckbox"]', "Sensitive Content"),
    );
    await waitFor(
      `window.pond.query('saves.get',{id:${JSON.stringify(original.id)}}).then(save=>save.sensitiveModel==='manual:not-sensitive')`,
    );
    await query("saves.patchDerived", {
      id: original.id,
      patch: { sensitiveScore: 0.99, sensitiveModel: "late-classifier" },
    });
    assert.equal(
      (await query("saves.get", { id: original.id })).sensitiveScore,
      0,
    );
    await press("Escape");
    await waitFor("!document.querySelector('[role=menu]')");
    await snapshot(`${mode}-split-library`);
    await click(`[data-save-id="${original.id}"]`, 2);
    await waitFor(
      `Array.from(document.querySelectorAll('[data-save-details] img')).some(img => img.complete && img.naturalWidth===320)`,
    );
    await snapshot(`${mode}-encoded-image`);
    await click('[aria-label="Back"]');
    const video = rows.find((row) => row.sourceId === videoSourceId);
    assert.ok(video);
    await click("[data-library-search]");
    await run("document.querySelector('[data-library-search]').focus()");
    await waitFor(
      "document.activeElement===document.querySelector('[data-library-search]')",
    );
    await run(
      "(() => {const range=document.createRange();range.selectNodeContents(document.querySelector('[data-library-search]'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);})()",
    );
    await type(`Parity video ${nonce}`);
    await waitFor(
      `document.querySelector('[data-save-id="${video.id}"]') && !document.querySelector('[data-save-id="${original.id}"]')`,
    );
    await click(`[data-save-id="${video.id}"]`, 2);
    await waitFor(
      "Array.from(document.querySelectorAll('video')).some(video=>video.readyState>=1 && video.duration>=4)",
    );
    await waitFor(
      "Boolean(document.querySelector('[aria-label=Playback] [aria-label=Play], [aria-label=Playback] [aria-label=Pause]'))",
    );
    if (
      await run(
        "Boolean(document.querySelector('[aria-label=Playback] [aria-label=Pause]'))",
      )
    )
      await click("[aria-label=Playback] [aria-label=Pause]");
    await waitFor(
      "Boolean(document.querySelector('[aria-label=Playback] [aria-label=Play]'))",
    );
    await click('[aria-label="Seek"]');
    await waitFor(
      "document.querySelector('[data-save-details] video').currentTime>1 && document.querySelector('[data-save-details] video').currentTime<3",
    );
    await waitFor(
      "!document.querySelector('[aria-label=Seek]').contains(document.activeElement)",
    );
    await press("Space");
    await waitFor(
      "Boolean(document.querySelector('[aria-label=Playback] [aria-label=Pause]'))",
    );
    assert.ok(
      await run(
        "Array.from(document.querySelectorAll('video')).some(video=>!video.paused && video.currentTime>1)",
      ),
    );
    await snapshot(`${mode}-video-seeking`);
    await click('[aria-label="Back"]');
    await click('[aria-label="Library Menu"]');
    await click(await textControl('[role="menuitem"]', "Settings"));
    await nav("Images");
    await waitFor("document.body.innerText.includes('Split Existing Saves')");
    await click(await textControl("button", "Split"));
    await waitFor(
      "document.querySelector('[role=alertdialog]') || document.querySelector('[role=dialog]')",
    );
    await click(
      await textControl(
        "[role=alertdialog] button, [role=dialog] button",
        "Split",
      ),
    );
    await waitSplit(batchTitle);
    await waitFor(
      "window.pond.query('saves.splitAllStatus',{}).then(status => !status.running)",
    );
    const status = await query("saves.splitAllStatus");
    assert.equal(status.split, 1);
    assert.equal(status.created, 2);
    assert.equal(status.failed, 0);
    const splitSwitch = await mark(
      '[role="switch"]',
      "document.getElementById(node.getAttribute('aria-labelledby'))?.textContent === 'Split Into Saves'",
    );
    // The setting is also read through the shared host query after the UI changes it.
    const beforeSplit = (await query("settings.get")).imageDownload.splitPosts;
    await click(splitSwitch);
    await waitFor(
      `window.pond.query('settings.get',{}).then(value=>value.imageDownload.splitPosts===${!beforeSplit})`,
    );
    await snapshot(`${mode}-images-settings`);
    await nav("Storage");
    await waitFor(
      "document.body.innerText.includes('Archive Web Pages Automatically')",
    );
    const archiveSwitch = await mark(
      '[role="switch"]',
      "document.getElementById(node.getAttribute('aria-labelledby'))?.textContent === 'Archive Web Pages Automatically'",
    );
    await click(archiveSwitch);
    await waitFor(
      "window.pond.query('settings.getPrefs',{}).then(value=>value.storage.autoArchive===true)",
    );
    await click(archiveSwitch);
    await waitFor(
      "window.pond.query('settings.getPrefs',{}).then(value=>value.storage.autoArchive===false)",
    );
    const pending = await query("arenaLinks.status");
    assert.equal(pending.pending, 1);
    await run(
      "window.__upstreamProgress=[]; void(window.__stopUpstreamProgress=window.pond.onArenaLinkProgress(value=>window.__upstreamProgress.push(value)))",
    );
    await click(await textControl("button", "Convert"));
    await waitFor(
      `window.pond.query('saves.get',{id:${JSON.stringify(arena.id)}}).then(save=>save.url===${JSON.stringify(linked)} && save.status==='complete')`,
      60000,
    );
    await waitFor(
      "window.pond.query('arenaLinks.status',{}).then(value=>value.pending===0 && !value.running)",
      60000,
    );
    const progress = await run("window.__upstreamProgress");
    assert.ok(
      progress.some(
        (value) =>
          value.total === 1 && value.processed === 1 && value.converted === 1,
      ),
    );
    await run("void window.__stopUpstreamProgress()");
    const converted = await query("saves.get", { id: arena.id });
    assert.equal(converted.source, "arena");
    assert.equal(converted.sourceId, arenaSourceId);
    assert.ok(!converted.files.some((file) => file.kind === "archive"));
    await snapshot(`${mode}-storage-settings`);
    result = {
      singleSplit: true,
      batchSplit: true,
      inheritedTagsNotesFolders: true,
      encodedMedia: true,
      splitPreference: true,
      archivePreference: true,
      arenaConversion: true,
      conversionProgress: true,
      manualSensitiveDecision: true,
      videoSeekAndSpace: true,
    };
    writeFileSync(
      join(directory, `${mode}-upstream-parity.json`),
      JSON.stringify(result, null, 2),
    );
    console.log("UPSTREAM_PARITY_PASSED", mode, JSON.stringify(result));
  } finally {
    await query("settings.setPrefs", {
      storage: originalPrefs.storage,
      enrichment: originalPrefs.enrichment,
    });
    await new Promise((resolve) => server.close(resolve));
  }
  return result;
};
