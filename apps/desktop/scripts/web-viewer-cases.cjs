const assert = require("node:assert/strict");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

exports.verifyBrowserViewers = async function verifyBrowserViewers({
  win,
  run,
  waitFor,
  click,
  snapshot,
  fixtures,
  origin,
  evidence,
}) {
  const conditions = {
    media: `Array.from(document.querySelectorAll('[data-save-details] [aria-label="Image"] img')).some(image => image.src.includes('preview=2048') && image.complete && image.naturalWidth > 0 && !image.hasAttribute('data-pending'))`,
    pdf: `Array.from(document.querySelectorAll('[data-pdf-page="1"] canvas')).some(canvas => canvas.width > 0 && canvas.getContext('2d').getImageData(0,0,1,1).data[3] > 0)`,
    audio: `Array.from(document.querySelectorAll('[data-save-details] audio')).some(audio => audio.readyState >= 1 && audio.duration >= 1.9)`,
    font: `Array.from(document.fonts).some(font => font.family.startsWith('pond-preview-') && font.status === 'loaded') && document.body.innerText.includes('Sphinx of black quartz')`,
    text: `document.querySelector('[data-save-details]')?.innerText.includes('Offline text with Unicode: café, 水, 🎨.')`,
    epub: `Array.from(document.querySelectorAll('[data-save-details] iframe')).some(frame => {try{return frame.contentDocument?.body?.innerText.includes('Iris EPUB fixture chapter')}catch{return false}})`,
    model: `document.querySelector('canvas[aria-label^="3D model"]') && !document.body.innerText.includes('Loading 3D model')`,
    archive: `document.querySelector('[data-save-details]')?.innerText.includes('nested/readme.txt')`,
    "live-photo": `Array.from(document.querySelectorAll('[data-save-details] img')).some(image => image.src.startsWith('blob:') && image.complete && image.naturalWidth === 320)`,
    "safe-web": `document.querySelector('iframe[title="Offline HTML preview"]')?.srcdoc.includes('Iris offline HTML fixture')`,
    "native-preview": `Array.from(document.querySelectorAll('[data-save-details] [aria-label="Image"] img')).some(image => image.src.includes('preview=2048') && image.complete && image.naturalWidth > 0 && !image.hasAttribute('data-pending'))`,
    generic: `document.querySelector('[data-save-details]')?.innerText.includes('viewer-generic.iris-fixture') && document.querySelector('[aria-label="Download Original"]')`,
  };
  const results = [];
  const wakeControls = async () => {
    const point = await run(
      `(() => {const bounds=document.querySelector('[data-save-details]').getBoundingClientRect();return {x:Math.round(bounds.x+bounds.width/2),y:Math.round(bounds.y+bounds.height/2)}})()`,
    );
    win.webContents.sendInputEvent({ type: "mouseMove", ...point });
  };
  for (const width of [1280, 390]) {
    win.setSize(width, width === 390 ? 844 : 900);
    for (const fixture of fixtures) {
      let failure = null;
      try {
        await win.loadURL(`${origin}/save/${encodeURIComponent(fixture.id)}`);
        await waitFor("document.querySelector('[data-save-details]')");
        if (width === 390) {
          if (
            await run(
              `document.querySelector('[data-slot="right"]')?.hasAttribute('data-open')`,
            )
          )
            await click('[aria-label="Toggle Details"]');
          if (
            await run(
              `document.querySelector('[data-slot="window"]')?.hasAttribute('data-left-open')`,
            )
          )
            await click('[aria-label="Toggle Sidebar"]');
        }
        const ready = conditions[fixture.kind];
        assert.ok(ready, fixture.kind);
        await waitFor(
          `(${ready}) || document.querySelector('[data-viewer-fallback]')`,
        );
        assert.equal(
          await run(`Boolean(${ready})`),
          true,
          `${fixture.kind} must render its real viewer, not a fallback.`,
        );
        await wakeControls();
        if (fixture.kind === "audio") {
          await run("document.querySelector('audio').muted=true");
          await click('[aria-label="Audio playback"] [aria-label="Play"]');
          await waitFor(
            "document.querySelector('audio').currentTime > 0.1 && !document.querySelector('audio').paused",
          );
          await click('[aria-label="Audio playback"] [aria-label="Pause"]');
        }
        if (fixture.kind === "pdf") {
          await click('[aria-label="Search Document"]');
          await waitFor(
            "document.querySelector('[aria-label=\"Search PDF\"]')",
          );
          await win.webContents.insertText("Iris");
          win.webContents.sendInputEvent({
            type: "keyDown",
            keyCode: "Return",
          });
          win.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
          win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Return" });
          await waitFor(
            "document.querySelector('[data-save-details]')?.innerText.includes('1 / 1')",
          );
          await click('[aria-label="Rotate Clockwise"]');
          await waitFor(
            "Array.from(document.querySelectorAll('[data-pdf-page=\"1\"] canvas')).some(canvas => canvas.height > canvas.width)",
          );
        }
        if (fixture.kind === "model") {
          await click('canvas[aria-label^="3D model"]');
          win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Right" });
          win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Right" });
        }
        if (fixture.kind === "live-photo") {
          await click('[aria-label="Motion"]');
          await waitFor(
            "document.querySelector('video[aria-label=\"Live Photo motion\"]')?.readyState >= 1",
          );
          await run(
            "document.querySelector('video').muted=true;document.querySelector('video').currentTime=1;document.querySelector('video').play()",
          );
          await waitFor(
            "document.querySelector('video').videoWidth > 0 && document.querySelector('video').currentTime >= 1",
          );
        }
        if (fixture.kind === "safe-web") {
          assert.equal(
            await run(
              "document.querySelector('iframe[title=\"Offline HTML preview\"]').getAttribute('sandbox')",
            ),
            "",
          );
          assert.equal(
            await run("Boolean(window.irisUntrustedExecuted)"),
            false,
          );
          assert.equal(
            await run(
              "new DOMParser().parseFromString(document.querySelector('iframe[title=\"Offline HTML preview\"]').srcdoc,'text/html').querySelectorAll('script,form').length",
            ),
            0,
          );
        }
        if (fixture.kind === "generic") {
          const destination = join(
            evidence,
            `generic-original-${width}.iris-fixture`,
          );
          const downloaded = new Promise((resolveDownload, reject) =>
            win.webContents.session.once("will-download", (_event, item) => {
              item.setSavePath(destination);
              item.once("done", (_event, state) =>
                state === "completed"
                  ? resolveDownload()
                  : reject(new Error(`Download ${state}`)),
              );
            }),
          );
          await click('[aria-label="Download Original"]');
          await downloaded;
          assert.equal(
            readFileSync(destination, "utf8"),
            "Iris original file download fixture",
          );
        }
      } catch (error) {
        failure = error.message;
      }
      await snapshot(
        `viewer-${fixture.kind}-${width}${failure ? "-failed" : ""}`,
      );
      results.push({ kind: fixture.kind, width, working: !failure, failure });
      console.log("WEB_VIEWER_RESULT", JSON.stringify(results.at(-1)));
    }
  }
  writeFileSync(
    join(evidence, "viewer-results.json"),
    JSON.stringify(results, null, 2),
  );
  assert.ok(
    results.every((result) => result.working),
    "Every viewer must pass. See viewer-results.json for individual failures.",
  );
  console.log(
    "WEB_VIEWERS_PASSED",
    JSON.stringify({ fixtures: fixtures.length, widths: [1280, 390] }),
  );
};
