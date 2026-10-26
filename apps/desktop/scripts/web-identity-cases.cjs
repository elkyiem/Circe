const assert = require("node:assert/strict");
const { join } = require("node:path");

exports.verifyBrowserIdentity = async function verifyBrowserIdentity({
  win,
  run,
  click,
  waitFor,
  snapshot,
  query,
  origin,
  evidence,
}) {
  const initial = await query("library.info");
  let testIcon;
  const debuggerApi = win.webContents.debugger;
  debuggerApi.attach("1.3");
  await debuggerApi.sendCommand("Page.enable");
  await debuggerApi.sendCommand("Page.setInterceptFileChooserDialog", {
    enabled: true,
  });
  try {
    await win.loadURL(`${origin}/settings/library`);
    const choose = '[aria-label="Choose Logo"], [aria-label="Change Logo"]';
    await waitFor(`document.querySelector(${JSON.stringify(choose)})`);
    assert.ok(await run("document.querySelector('link[rel=\"icon\"]')?.href"));
    const chooser = new Promise((resolve) => {
      const listener = (_event, method, params) => {
        if (method !== "Page.fileChooserOpened") return;
        debuggerApi.removeListener("message", listener);
        resolve(params);
      };
      debuggerApi.on("message", listener);
    });
    await click(choose);
    const opened = await chooser;
    assert.equal(opened.mode, "selectSingle");
    await debuggerApi.sendCommand("DOM.setFileInputFiles", {
      backendNodeId: opened.backendNodeId,
      files: [join(evidence, "library-logo-fixture.png")],
    });
    await waitFor(
      "document.querySelector('[aria-label=\"Change Logo\"] img')?.naturalWidth === 256 && document.querySelector('link[rel=\"icon\"]').href.startsWith('data:image/png;base64,')",
    );
    testIcon = (await query("library.info")).icon;
    assert.ok(testIcon);
    assert.equal(
      await run("document.querySelector('link[rel=\"icon\"]').href"),
      testIcon,
    );
    await snapshot("library-logo-changed");
    const reloaded = new Promise((resolve) =>
      win.webContents.once("did-finish-load", resolve),
    );
    win.reload();
    await reloaded;
    await waitFor(
      `document.querySelector('[aria-label="Change Logo"] img')?.src === ${JSON.stringify(testIcon)} && document.querySelector('link[rel="icon"]').href === ${JSON.stringify(testIcon)}`,
    );
    await snapshot("library-logo-reloaded");
    await click("#setting-library-logo button:not([aria-label])");
    await waitFor(
      "document.querySelector('[aria-label=\"Choose Logo\"] img')?.naturalWidth > 0 && !document.querySelector('link[rel=\"icon\"]').href.startsWith('data:')",
    );
    assert.equal((await query("library.info")).icon, null);
    await snapshot("library-logo-reset");
    console.log(
      "WEB_IDENTITY_BROWSER_PASSED",
      JSON.stringify({
        devicePicker: true,
        customFavicon: true,
        reload: true,
        reset: true,
      }),
    );
  } finally {
    if (debuggerApi.isAttached()) debuggerApi.detach();
    const current = await query("library.info");
    if (testIcon && (current.icon === testIcon || current.icon === null))
      await query("library.identity.update", {
        icon: initial.icon,
        mark: initial.mark,
      });
  }
};
